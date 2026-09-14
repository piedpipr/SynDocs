// ═══════════════════════════════════════════════════════════════════════════════
// Data injected by server
const DATA = JSON.parse(document.getElementById('syndocs-data').textContent);

// ─── Global State ─────────────────────────────────────────────────────────────
let currentDocId = null;
let currentSidebarTab = 'docs';
let currentGraphView = 'canvas';
let isEditingNotes = false;
let authToken = localStorage.getItem('syndocs_auth_token') || null;
let threadMode = localStorage.getItem('syndocs_thread_mode') || 'hover'; // 'always' | 'hover' | 'off'
let highlightKeywords = true;
let currentTheme = localStorage.getItem('syndocs_theme') || 'midnight';
let linkDirection = localStorage.getItem('syndocs_link_direction') || 'all'; // 'all' | 'incoming' | 'outgoing'

// D3 simulation variables
let simulation = null;
let svgG = null;
let graphNodes = null;

// Graph state hoisted so onPhysicsChange can update forces without rebuilding
let graphW = 400;
let graphH = 500;
let graphEdgeCount = new Map();
let graphLinkForce = null;

// Thread rAF loop state
let threadRafId = null;
let activeThreadSpan = null;          // span element being hovered (hover mode)
let activeThreadTarget = null;        // target file id for hover mode
let allThreadSpans = [];              // [ {span, targetId} ] for always mode

// Microdoc registry: label -> { notes, elementKind, elementName }
let currentMicrodocs = {};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initFont();
  initLinkDirection();
  initSplitMode();
  setupMarkdown();
  renderStats();
  renderSidebar();
  buildGraph();
  setupSearch();
  setupSSE();
  checkAuthStatus();
  setupAuthModal();
  setupWindowResize();
  setupGlobalClickClose();

  const lastDoc = localStorage.getItem('syndocs_last_doc');
  if (lastDoc && DATA.docs[lastDoc]) {
    openDoc(lastDoc);
  } else {
    const firstDoc = DATA.nodes.find(n => n.type === 'doc');
    if (firstDoc && DATA.docs[firstDoc.id]) {
      openDoc(firstDoc.id);
    } else if (DATA.docs['guides/internal/quickstart.md']) {
      openDoc('guides/internal/quickstart.md');
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Split (Side-by-Side) Focus Mode ──────────────────────────────────────────
// Moves docs/notes to a right-hand pane next to the code (instead of stacked
// below it) and turns the doc tree + graph panel into auto-hiding overlays
// that peek in when the mouse nears the left/right screen edge.

let splitMode = localStorage.getItem('syndocs_split_mode') === '1';
let edgeHoverHandler = null;
const SPLIT_EDGE_PEEK_PX = 24;

function initSplitMode() {
  applySplitMode(splitMode, true);
}

function toggleSplitMode() {
  applySplitMode(!splitMode);
}

function applySplitMode(on, silent = false) {
  splitMode = on;
  localStorage.setItem('syndocs_split_mode', on ? '1' : '0');

  const app = document.getElementById('app');
  const btn = document.getElementById('toggle-split-mode');
  app.classList.toggle('split-mode', on);
  if (btn) btn.classList.toggle('active', on);
  document.getElementById('edge-hint-left').classList.toggle('split-active', on);
  document.getElementById('edge-hint-right').classList.toggle('split-active', on);

  if (on) {
    setupEdgeHover();
  } else {
    teardownEdgeHover();
    document.getElementById('sidebar').classList.remove('peek');
    document.getElementById('graph-panel').classList.remove('peek');
  }

  // The graph canvas is sized from its container's bounding box, which
  // changes once the grid columns collapse/expand — rebuild after the
  // 0.2s layout transition settles.
  setTimeout(() => {
    if (currentGraphView === 'canvas') buildGraph();
    if (threadMode === 'always' && threadRafId) {
      stopThreadLoop();
      startThreadLoop();
    }
  }, 250);

  if (!silent) {
    // no-op placeholder for symmetry with other apply* functions
  }
}

function setupEdgeHover() {
  if (edgeHoverHandler) return;
  const sidebar = document.getElementById('sidebar');
  const graphPanel = document.getElementById('graph-panel');
  // Hysteresis: the show-threshold (24px) is smaller than the hide-threshold
  // (56px), so once a panel peeks open, small mouse jitter near the edge
  // doesn't flicker it open/closed on every pixel of movement.
  const SHOW_PX = SPLIT_EDGE_PEEK_PX;
  const HIDE_PX = SPLIT_EDGE_PEEK_PX + 32;

  // Coalesce mousemove events to at most one DOM update per animation frame
  // instead of running class-toggle logic on every raw pointer event (mouse
  // move events can fire far faster than the display refreshes).
  let pendingEvent = null;
  let rafScheduled = false;

  function applyEdgeHover(e) {
    if (!splitMode) return;
    const sidebarPeeked = sidebar.classList.contains('peek');
    const sidebarShow = e.clientX <= SHOW_PX || sidebar.contains(e.target);
    const sidebarHide = e.clientX > HIDE_PX && !sidebar.contains(e.target);
    if (!sidebarPeeked && sidebarShow) sidebar.classList.add('peek');
    else if (sidebarPeeked && sidebarHide) sidebar.classList.remove('peek');

    const graphPeeked = graphPanel.classList.contains('peek');
    const graphShow = e.clientX >= window.innerWidth - SHOW_PX || graphPanel.contains(e.target);
    const graphHide = e.clientX < window.innerWidth - HIDE_PX && !graphPanel.contains(e.target);
    if (!graphPeeked && graphShow) graphPanel.classList.add('peek');
    else if (graphPeeked && graphHide) graphPanel.classList.remove('peek');
  }

  edgeHoverHandler = (e) => {
    pendingEvent = e;
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      if (pendingEvent) applyEdgeHover(pendingEvent);
      pendingEvent = null;
    });
  };
  document.addEventListener('mousemove', edgeHoverHandler, { passive: true });
}

function teardownEdgeHover() {
  if (edgeHoverHandler) {
    document.removeEventListener('mousemove', edgeHoverHandler);
    edgeHoverHandler = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Theme & Font Systems ────────────────────────────────────────────────────

const THEME_META = {
  midnight:      { mode: 'dark',  hljs: 'atom-one-dark' },
  obsidian:      { mode: 'dark',  hljs: 'monokai-sublime' },
  nord:          { mode: 'dark',  hljs: 'nord' },
  solarized:     { mode: 'dark',  hljs: 'solarized-dark' },
  catppuccin:    { mode: 'dark',  hljs: 'dracula' },
  light:         { mode: 'light', hljs: 'atom-one-light' },
  claude:        { mode: 'light', hljs: 'stackoverflow-light' },
  vscode:        { mode: 'dark',  hljs: 'vs2015' },
  'visual-studio': { mode: 'light', hljs: 'vs' },
  sublime:       { mode: 'dark',  hljs: 'monokai' },
  dracula:       { mode: 'dark',  hljs: 'dracula' },
  atom:          { mode: 'dark',  hljs: 'atom-one-dark' },
  'github-dark': { mode: 'dark',  hljs: 'github-dark' },
  'github-light': { mode: 'light', hljs: 'github' },
};
const THEMES = Object.keys(THEME_META);

function initTheme() {
  applyTheme(currentTheme, true);
}

function applyTheme(name, silent = false) {
  if (!THEMES.includes(name)) name = 'midnight';
  currentTheme = name;
  const meta = THEME_META[name] || THEME_META.midnight;
  document.documentElement.setAttribute('data-theme', name);
  document.documentElement.setAttribute('data-mode', meta.mode);
  localStorage.setItem('syndocs_theme', name);

  // Swap the highlight.js syntax theme so code stays legible in both
  // light and dark UI themes (light themes need a darker-text hljs style).
  const hljsLink = document.getElementById('hljs-theme-link');
  if (hljsLink) {
    hljsLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/' + meta.hljs + '.min.css';
  }

  // Update active state in dropdown
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === name);
  });

  if (!silent) {
    document.getElementById('theme-dropdown').classList.remove('open');
  }
}

function toggleThemePicker() {
  document.getElementById('theme-dropdown').classList.toggle('open');
  const fd = document.getElementById('font-dropdown');
  if (fd) fd.classList.remove('open');
}

const FONTS = ['modern', 'apple', 'nerd', 'geist', 'editorial'];
let currentFont = localStorage.getItem('syndocs_font') || 'modern';

function initFont() {
  applyFont(currentFont, true);
}

function applyFont(name, silent = false) {
  if (!FONTS.includes(name)) name = 'modern';
  currentFont = name;
  document.documentElement.setAttribute('data-font', name);
  localStorage.setItem('syndocs_font', name);

  const labels = {
    modern: 'Modern',
    apple: 'Apple',
    nerd: 'Nerd NF',
    geist: 'Geist',
    editorial: 'Editorial',
  };
  const labelEl = document.getElementById('current-font-label');
  if (labelEl) labelEl.textContent = labels[name] || name;

  document.querySelectorAll('.font-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.font === name);
  });

  if (!silent) {
    const fd = document.getElementById('font-dropdown');
    if (fd) fd.classList.remove('open');
  }
}

function toggleFontPicker() {
  const fd = document.getElementById('font-dropdown');
  if (fd) fd.classList.toggle('open');
  const td = document.getElementById('theme-dropdown');
  if (td) td.classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Markdown Setup ───────────────────────────────────────────────────────────

function setupMarkdown() {
  const renderer = new marked.Renderer();

  // Code blocks with hljs
  renderer.code = (code, lang) => {
    const validLang = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    let highlighted;
    try {
      highlighted = hljs.highlight(code, { language: validLang }).value;
    } catch {
      highlighted = escapeHtml(code);
    }
    return `<pre class="mc-code hljs"><code class="language-${escapeHtml(validLang)}">${highlighted}</code></pre>`;
  };

  // Inline code
  renderer.codespan = (code) => `<code>${code}</code>`;

  // Links open in new tab
  renderer.link = (href, title, text) =>
    `<a href="${href}" title="${title || ''}" target="_blank" rel="noopener">${text}</a>`;

  marked.setOptions({ renderer, breaks: true, gfm: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Authentication ────────────────────────────────────────────────────────────

function checkAuthStatus() {
  const icon = document.getElementById('auth-status-icon');
  const text = document.getElementById('auth-status-text');
  if (authToken) {
    fetch('/api/auth/status', { headers: { 'Authorization': 'Bearer ' + authToken } })
      .then(r => r.json())
      .then(res => {
        if (res.authenticated) {
          icon.innerHTML = '<i class="fa-solid fa-lock-open"></i>'; text.textContent = 'Edit Mode';
        } else {
          authToken = null;
          localStorage.removeItem('syndocs_auth_token');
          icon.innerHTML = '<i class="fa-solid fa-lock"></i>'; text.textContent = 'Read Only';
        }
      }).catch(() => {});
  } else {
    icon.innerHTML = '<i class="fa-solid fa-lock"></i>'; text.textContent = 'Read Only';
  }
}

function setupAuthModal() {
  const modal = document.getElementById('auth-modal');
  const btn = document.getElementById('auth-toggle-btn');
  const cancelBtn = document.getElementById('auth-cancel-btn');
  const submitBtn = document.getElementById('auth-submit-btn');
  const input = document.getElementById('auth-code-input');

  btn.addEventListener('click', () => {
    if (authToken) {
      if (confirm('Lock editor and switch to read-only mode?')) {
        authToken = null;
        localStorage.removeItem('syndocs_auth_token');
        checkAuthStatus();
        if (isEditingNotes) toggleEditNotes();
      }
    } else {
      modal.style.display = 'flex';
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }
  });
  cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  submitBtn.addEventListener('click', doLogin);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  function doLogin() {
    const code = input.value.trim();
    if (!code) return;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
    .then(r => r.json())
    .then(res => {
      if (res.ok && res.token) {
        authToken = res.token;
        localStorage.setItem('syndocs_auth_token', res.token);
        modal.style.display = 'none';
        checkAuthStatus();
      } else {
        input.style.borderColor = 'var(--missing)';
        setTimeout(() => input.style.borderColor = '', 1200);
      }
    }).catch(err => alert('Login error: ' + err.message));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Stats Bar ────────────────────────────────────────────────────────────────

function renderStats() {
  const ok = DATA.nodes.filter(n => n.status === 'ok').length;
  const stale = DATA.nodes.filter(n => n.status === 'stale').length;
  const missing = DATA.nodes.filter(n => n.status === 'missing').length;
  const el = document.getElementById('stats');
  el.innerHTML = [
    `<span class="stat-pill ok"><i class="fa-solid fa-check"></i> ${ok}</span>`,
    stale ? `<span class="stat-pill stale"><i class="fa-solid fa-wave-square"></i> ${stale}</span>` : '',
    missing ? `<span class="stat-pill missing"><i class="fa-solid fa-triangle-exclamation"></i> ${missing}</span>` : ''
  ].join('');
  document.getElementById('graph-cg-badge').innerHTML = DATA.hasCodeGraph ? '<i class="fa-solid fa-bolt"></i> CodeGraph' : 'Fallback';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Sidebar ──────────────────────────────────────────────────────────────────

function switchSidebarTab(tab) {
  currentSidebarTab = tab;
  document.getElementById('tab-docs').classList.toggle('active', tab === 'docs');
  document.getElementById('tab-codebase').classList.toggle('active', tab === 'codebase');
  renderSidebar();
}

function renderSidebar(filter = '') {
  const container = document.getElementById('tree-view');
  container.innerHTML = '';
  const treeData = currentSidebarTab === 'docs' ? DATA.docsTree : DATA.codebaseTree;
  if (!treeData) return;
  const totalCount = countLeaves(treeData);
  document.getElementById('tree-counter').textContent =
    `${totalCount} ${currentSidebarTab === 'docs' ? 'docs' : 'files'}`;
  container.appendChild(buildDomTree(treeData, filter));
}

function countLeaves(node) {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((a, c) => a + countLeaves(c), 0);
}

// Children DOM for a collapsed directory is only built the first time it's
// expanded, instead of eagerly recursing through the entire tree up front —
// on a large real-world codebase (thousands of files) eagerly building every
// descendant, including branches that start collapsed and are never looked
// at, is the actual cause of the sidebar taking several seconds to render.
// lazyChildData maps a not-yet-built .tree-children container to what it
// needs to build itself on first expand.
const lazyChildData = new WeakMap();
const CHEVRON_DOWN = '<i class="fa-solid fa-chevron-down"></i>';
const CHEVRON_RIGHT = '<i class="fa-solid fa-chevron-right"></i>';

function ensureChildrenBuilt(childrenContainer) {
  const data = lazyChildData.get(childrenContainer);
  if (!data || data.built) return;
  data.built = true;
  for (const child of data.node.children) {
    childrenContainer.appendChild(buildDomTree(child, data.filter, data.depth + 1));
  }
}

function buildDomTree(node, filter = '', depth = 0) {
  const el = document.createElement('div');
  el.className = 'tree-node';
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const row = document.createElement('div');
  row.className = 'tree-row' + (currentDocId === node.path ? ' active' : '');
  row.setAttribute('role', 'treeitem');

  if (filter && !nodeMatchesFilter(node, filter)) el.style.display = 'none';

  // Root-level entries (depth 0) start expanded for immediate usability;
  // everything nested deeper starts collapsed. A search filter forces
  // everything open (and therefore built) so matches at any depth are
  // reachable — lazy building only applies when browsing unfiltered.
  const startCollapsed = hasChildren && depth > 0 && !filter;

  let childrenContainer = null;
  if (hasChildren) {
    childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children' + (startCollapsed ? ' collapsed' : '');
    lazyChildData.set(childrenContainer, { node, filter, depth, built: false });
  }

  if (hasChildren) {
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.innerHTML = startCollapsed ? CHEVRON_RIGHT : CHEVRON_DOWN;
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      if (childrenContainer) {
        ensureChildrenBuilt(childrenContainer);
        const collapsed = childrenContainer.classList.toggle('collapsed');
        toggle.innerHTML = collapsed ? CHEVRON_RIGHT : CHEVRON_DOWN;
      }
    });
    row.appendChild(toggle);
  } else {
    const sp = document.createElement('span');
    sp.style.width = '14px';
    sp.style.display = 'inline-block';
    row.appendChild(sp);
  }

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  const iconMap = {
    microdoc: '<i class="fa-solid fa-tag"></i>',
    guide: '<i class="fa-solid fa-book-open"></i>',
    doc: '<i class="fa-solid fa-file-lines"></i>',
    file: '<i class="fa-solid fa-file-lines"></i>',
    dir: '<i class="fa-solid fa-folder"></i>',
  };
  icon.innerHTML = iconMap[node.type] || '<i class="fa-solid fa-file-lines"></i>';
  row.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.targetLabel ? '#' + node.targetLabel : node.name;
  label.title = node.path || node.name;
  row.appendChild(label);

  if (node.status && node.status !== 'none') {
    const badge = document.createElement('span');
    badge.className = 'tree-badge ' + node.status;
    badge.innerHTML = node.status === 'ok' ? '<i class="fa-solid fa-check"></i>' : node.status === 'stale' ? '<i class="fa-solid fa-wave-square"></i>' : '<i class="fa-solid fa-triangle-exclamation"></i>';
    badge.title = node.status;
    row.appendChild(badge);
  } else if (node.type === 'file' && (!node.status || node.status === 'none')) {
    const badge = document.createElement('span');
    badge.className = 'tree-badge dim';
    badge.title = 'No documentation yet — click to view and add docs';
    badge.innerHTML = '<i class="fa-solid fa-circle-dot"></i>';
    row.appendChild(badge);
  }

  if (node.type === 'dir') {
    row.addEventListener('click', e => {
      e.stopPropagation();
      if (childrenContainer) {
        ensureChildrenBuilt(childrenContainer);
        const collapsed = childrenContainer.classList.toggle('collapsed');
        const tog = row.querySelector('.tree-toggle');
        if (tog) tog.innerHTML = collapsed ? CHEVRON_RIGHT : CHEVRON_DOWN;
      }
    });
  } else {
    row.addEventListener('click', () => openDoc(node.path));
  }

  el.appendChild(row);
  if (hasChildren && childrenContainer) {
    if (!startCollapsed) ensureChildrenBuilt(childrenContainer);
    el.appendChild(childrenContainer);
  }
  return el;
}

function nodeMatchesFilter(node, filter) {
  const term = filter.toLowerCase();
  if (node.name.toLowerCase().includes(term) || (node.path && node.path.toLowerCase().includes(term))) return true;
  if (node.children) return node.children.some(c => nodeMatchesFilter(c, filter));
  return false;
}

function expandAllTree() {
  // Lazily-built branches need their DOM constructed before they can be
  // shown, so walk container-by-container (building each one right before
  // expanding it) rather than just toggling classes on whatever already
  // happens to exist in the DOM.
  function walk(container) {
    ensureChildrenBuilt(container);
    container.classList.remove('collapsed');
    const toggle = container.previousSibling && container.previousSibling.querySelector
      ? container.previousSibling.querySelector('.tree-toggle') : null;
    if (toggle) toggle.innerHTML = CHEVRON_DOWN;
    for (const child of container.children) {
      const childContainer = child.querySelector(':scope > .tree-children');
      if (childContainer) walk(childContainer);
    }
  }
  document.querySelectorAll('#tree-view > .tree-node > .tree-children').forEach(walk);
}

function collapseAllTree() {
  document.querySelectorAll('.tree-children').forEach(c => c.classList.add('collapsed'));
  document.querySelectorAll('.tree-toggle').forEach(t => t.innerHTML = '<i class="fa-solid fa-chevron-right"></i>');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Document Viewing ─────────────────────────────────────────────────────────

function openDoc(id) {
  currentDocId = id;
  if (id) localStorage.setItem('syndocs_last_doc', id);
  const doc = DATA.docs[id];

  document.querySelectorAll('.tree-row').forEach(r => {
    const lbl = r.querySelector('.tree-label');
    r.classList.toggle('active', lbl && lbl.title === id);
  });

  highlightGraphNode(id);
  updateConnectedList(id);

  if (!doc) {
    // No mirror doc for this id yet. If it's a real file in the codebase
    // (browsing the "Code" tab, or a graph node with status:'none'), show
    // its raw source with an inline "add documentation" prompt instead of
    // just an empty state — this is what lets undocumented files actually
    // be opened and annotated from the Web UI.
    if (id) {
      openUndocumentedFile(id);
    } else {
      showEmptyState();
    }
    return;
  }

  showEmptyState(false);
  document.getElementById('doc-path').textContent = doc.sourceFile;
  document.getElementById('doc-title-text').textContent = doc.title;

  const badge = document.getElementById('doc-status-badge');
  badge.className = 'tree-badge ' + (doc.status || 'dim');
  badge.innerHTML = doc.status === 'ok' ? '<i class="fa-solid fa-check"></i> in sync' : doc.status === 'stale' ? '<i class="fa-solid fa-wave-square"></i> stale' : doc.status || '';

  renderDocContent(doc, id);
}

function showEmptyState(show = true) {
  document.getElementById('empty-state').style.display = show ? 'flex' : 'none';
  document.getElementById('doc-header').style.display = show ? 'none' : 'flex';
  if (show) {
    document.getElementById('doc-content').classList.remove('visible');
    stopThreadLoop();
  } else {
    document.getElementById('doc-content').classList.add('visible');
  }
}

// Guards against out-of-order responses: if the user clicks through several
// undocumented files quickly, only the most recently requested one is
// allowed to render once its fetch resolves.
let undocFetchToken = 0;

function openUndocumentedFile(id) {
  const myToken = ++undocFetchToken;
  fetch('/api/file/raw?path=' + encodeURIComponent(id))
    .then(r => r.json())
    .then(res => {
      if (myToken !== undocFetchToken) return;
      if (!res.ok) { showEmptyState(); return; }
      renderUndocumentedFile(id, res);
    })
    .catch(() => { if (myToken === undocFetchToken) showEmptyState(); });
}

function renderUndocumentedFile(id, fileData) {
  showEmptyState(false);

  const parts = id.split('/');
  document.getElementById('doc-path').textContent = id;
  document.getElementById('doc-title-text').textContent = parts[parts.length - 1];

  const badge = document.getElementById('doc-status-badge');
  badge.className = 'tree-badge dim';
  badge.innerHTML = '<i class="fa-solid fa-circle-dot"></i> undocumented';

  const codePane = document.getElementById('doc-code-pane');
  const docsPane = document.getElementById('doc-docs-pane');
  codePane.innerHTML = '';
  docsPane.innerHTML = '';
  currentMicrodocs = {};
  allThreadSpans = [];
  stopThreadLoop();

  const codeHeader = document.createElement('div');
  codeHeader.className = 'code-section-header';
  codeHeader.innerHTML = '<div class="code-section-title">Source Code (' + escapeHtml(fileData.language || 'code') + ')</div>';
  codePane.appendChild(codeHeader);

  const viewerBox = document.createElement('div');
  viewerBox.className = 'code-viewer-container';
  const langBadge = document.createElement('div');
  langBadge.className = 'code-lang-badge';
  langBadge.textContent = (fileData.language || 'code').toUpperCase();
  viewerBox.appendChild(langBadge);

  const pre = document.createElement('pre');
  pre.className = 'code-viewer';
  const codeEl = document.createElement('code');
  const validLang = fileData.language && hljs.getLanguage(fileData.language) ? fileData.language : 'plaintext';
  let hl;
  try {
    hl = hljs.highlight(fileData.content, { language: validLang }).value;
  } catch {
    hl = escapeHtml(fileData.content);
  }
  codeEl.innerHTML = hl.split('\n').map((l, i) =>
    '<div class="code-line" id="code-line-' + (i + 1) + '"><span class="line-num">' + (i + 1) + '</span><span class="line-content">' + (l || ' ') + '</span></div>'
  ).join('');
  pre.appendChild(codeEl);
  viewerBox.appendChild(pre);
  codePane.appendChild(viewerBox);

  const cta = document.createElement('div');
  cta.className = 'undoc-cta';
  cta.innerHTML =
    '<div class="undoc-cta-icon"><i class="fa-solid fa-file-circle-plus"></i></div>' +
    '<div class="undoc-cta-title">No documentation yet</div>' +
    '<div class="undoc-cta-desc">This file hasn\u2019t been documented. Write notes below and save to create its first doc \u2014 it\u2019ll then show up in the Docs tab and the graph like any other documented file.</div>';
  docsPane.appendChild(cta);

  const editorBox = document.createElement('div');
  editorBox.id = 'notes-editor-box';
  editorBox.className = 'editor-box';
  editorBox.style.display = 'flex';
  editorBox.innerHTML =
    '<textarea id="notes-textarea" class="editor-textarea" placeholder="Write documentation notes in Markdown..."></textarea>' +
    '<div class="editor-buttons">' +
      '<button class="action-btn primary" onclick="saveUndocumentedNotes(' + JSON.stringify(id) + ')"><i class="fa-solid fa-floppy-disk"></i> Save &amp; Create Doc</button>' +
      '<span class="save-indicator" id="save-indicator"></span>' +
    '</div>';
  docsPane.appendChild(editorBox);
}

function saveUndocumentedNotes(id) {
  if (!authToken) {
    document.getElementById('auth-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('auth-code-input').focus(), 50);
    return;
  }
  const textarea = document.getElementById('notes-textarea');
  const notes = textarea ? textarea.value : '';
  const ind = document.getElementById('save-indicator');
  if (ind) ind.textContent = 'Saving\u2026';

  fetch('/api/doc/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ id, type: 'doc', notes })
  })
  .then(r => r.json())
  .then(res => {
    if (res.ok) {
      if (ind) ind.innerHTML = 'Saved <i class="fa-solid fa-check"></i> \u2014 reloading\u2026';
      // The server already rebuilt its data and will broadcast an SSE
      // reload; opening the doc again picks up the freshly created mirror.
      setTimeout(() => { if (currentDocId === id) openDoc(id); }, 400);
    } else if (ind) {
      ind.textContent = 'Error: ' + (res.error || 'unknown');
    }
  })
  .catch(() => { if (ind) ind.textContent = 'Save failed'; });
}

function renderDocContent(doc, id) {
  const codePane = document.getElementById('doc-code-pane');
  const docsPane = document.getElementById('doc-docs-pane');
  codePane.innerHTML = '';
  docsPane.innerHTML = '';
  currentMicrodocs = {};

  stopThreadLoop();
  allThreadSpans = [];

  // Populate microdocs for this source file FIRST so buildHighlightedCodeHtml has full registry
  const microEntries = [];
  for (const [dId, dEntry] of Object.entries(DATA.docs)) {
    if (dEntry.type === 'microdoc' && dEntry.sourceFile === (doc.sourceFile || id)) {
      const label = dId.includes('#') ? dId.split('#').slice(1).join('#') : dId;
      microEntries.push({ id: dId, label, entry: dEntry });
      currentMicrodocs[label] = {
        notes: dEntry.notes,
        codeCopy: dEntry.codeCopy,
        codeLanguage: dEntry.codeLanguage || doc.codeLanguage || 'ts',
        elementKind: dEntry.elementKind || '',
        elementName: dEntry.elementName || label,
        scopeStartLine: dEntry.scopeStartLine,
        scopeEndLine: dEntry.scopeEndLine,
      };
    }
  }

  // ── 1. Code Block ──────────────────────────────────────────────────────────
  if (doc.codeCopy) {
    const codeHeader = document.createElement('div');
    codeHeader.className = 'code-section-header';
    codeHeader.innerHTML =
      '<div class="code-section-title">Source Code (' + escapeHtml(doc.codeLanguage || 'code') + ')</div>' +
      '<div class="code-tools">' +
        '<span class="tool-pill ' + (threadMode !== 'off' ? 'active' : '') + '" id="thread-mode-pill" onclick="cycleThreadMode(this)"><i class="fa-solid fa-bolt"></i> Threads: ' + escapeHtml(threadMode) + '</span>' +
        '<span class="tool-pill ' + (highlightKeywords ? 'active' : '') + '" id="highlight-pill" onclick="toggleHighlightKeywords(this)"><i class="fa-solid fa-lightbulb"></i> Links</span>' +
      '</div>';
    codePane.appendChild(codeHeader);

    const viewerBox = document.createElement('div');
    viewerBox.className = 'code-viewer-container';

    const langBadge = document.createElement('div');
    langBadge.className = 'code-lang-badge';
    langBadge.textContent = (doc.codeLanguage || 'code').toUpperCase();
    viewerBox.appendChild(langBadge);

    const pre = document.createElement('pre');
    pre.className = 'code-viewer';
    const codeEl = document.createElement('code');

    // Build highlighted code with overlaid thread links AND highlighted microdoc annotations
    codeEl.innerHTML = buildHighlightedCodeHtml(doc.codeCopy, doc.tokens || [], doc.codeLanguage || 'ts', currentMicrodocs);
    pre.appendChild(codeEl);
    viewerBox.appendChild(pre);
    codePane.appendChild(viewerBox);

    // Collect thread spans
    allThreadSpans = [];
    codeEl.querySelectorAll('.code-link').forEach(span => {
      allThreadSpans.push({ span, targetId: span.dataset.target });
    });

    attachTokenListeners(codeEl, id);
    attachMicrodocListeners(codeEl);
  }

  // ── 2. Pending Diff ────────────────────────────────────────────────────────
  const diffMatch = doc.content && doc.content.match(/<!-- syndocs-pending-start -->([sS]*?)<!-- syndocs-pending-end -->/);
  if (diffMatch) {
    const diffBox = document.createElement('div');
    diffBox.className = 'diff-alert-box';
    diffBox.innerHTML =
      '<div class="diff-alert-title"><i class="fa-solid fa-triangle-exclamation"></i> Code drift detected (pending update)</div>' +
      '<pre class="diff-pre">' + formatDiffLines(diffMatch[1]) + '</pre>';
    codePane.appendChild(diffBox);
  }

  // ── 3. Notes & Editor (Full File Documentation Notes — shown alongside code) ──
  const notesContainer = document.createElement('div');
  notesContainer.className = 'notes-container';

  const notesHeader = document.createElement('div');
  notesHeader.className = 'notes-header';
  notesHeader.innerHTML =
    '<div class="notes-title"><i class="fa-solid fa-note-sticky"></i> Documentation Notes</div>' +
    '<button class="action-btn" id="edit-notes-toggle-btn" onclick="toggleEditNotes()"><i class="fa-solid fa-pen"></i> Edit Notes</button>';
  notesContainer.appendChild(notesHeader);

  const notesView = document.createElement('div');
  notesView.id = 'notes-view';
  notesView.className = 'markdown-rendered';
  const rawNotes = doc.notes && doc.notes.trim() ? doc.notes : '> _No custom notes added yet._';
  notesView.innerHTML = marked.parse(rawNotes);
  notesContainer.appendChild(notesView);

  const editorBox = document.createElement('div');
  editorBox.id = 'notes-editor-box';
  editorBox.className = 'editor-box';
  editorBox.innerHTML =
    '<textarea id="notes-textarea" class="editor-textarea" placeholder="Write documentation notes in Markdown...">' + escapeHtml(doc.notes || '') + '</textarea>' +
    '<div class="editor-buttons">' +
      '<button class="action-btn primary" onclick="saveNotes()"><i class="fa-solid fa-floppy-disk"></i> Save Notes</button>' +
      '<button class="action-btn" onclick="toggleEditNotes()">Cancel</button>' +
      '<span id="save-indicator" style="font-size:12px; color:var(--text-muted); margin-left:8px;"></span>' +
    '</div>';
  notesContainer.appendChild(editorBox);
  docsPane.appendChild(notesContainer);

  // ── 4. Connections Table ───────────────────────────────────────────────────
  const connections = extractConnections(doc.content || '');
  if (connections.length > 0) {
    const connSection = document.createElement('div');
    connSection.className = 'connections-section';
    connSection.innerHTML = renderConnectionTable(connections);
    docsPane.appendChild(connSection);
  }

  // ── 5. Microdoc Cards (Annotations) ────────────────────────────────────────
  if (microEntries.length > 0) {
    const microSection = document.createElement('div');
    microSection.className = 'microdocs-section';
    microSection.innerHTML = '<div class="microdocs-section-title"><i class="fa-solid fa-tag"></i> Annotations (' + microEntries.length + ')</div>';

    for (const { id: mId, label, entry } of microEntries) {
      const card = document.createElement('div');
      card.className = 'microdoc-card expanded';
      card.dataset.label = label;

      const header = document.createElement('div');
      header.className = 'microdoc-card-header';
      const kindBadge = entry.elementKind ? '<span class="mc-element-kind">' + escapeHtml(entry.elementKind) + '</span>' : '';
      let targetLine = entry.scopeStartLine;
      if (!targetLine && doc.codeCopy) {
        const cLines = doc.codeCopy.split('\n');
        for (let li = 0; li < cLines.length; li++) {
          if (cLines[li].includes('@synd') && cLines[li].includes(label)) {
            targetLine = li + 1;
            break;
          }
        }
      }

      const jumpBtn = targetLine ?
        '<button class="mc-jump-btn" title="Jump to line in source code" onclick="event.stopPropagation(); jumpToCodeLine(' + targetLine + ')"><i class="fa-solid fa-arrow-up"></i> Line ' + targetLine + '</button>' : '';

      header.innerHTML =
        '<span class="mc-glyph"><i class="fa-solid fa-tag"></i></span>' +
        '<span class="mc-label">#' + escapeHtml(label) + '</span>' +
        kindBadge +
        jumpBtn +
        '<button class="mc-edit-btn" title="Edit this annotation\'s notes" onclick="event.stopPropagation(); toggleMicrodocEdit(this)"><i class="fa-solid fa-pen"></i></button>' +
        '<span class="mc-toggle"><i class="fa-solid fa-chevron-right"></i></span>';
      header.addEventListener('click', () => {
        card.classList.toggle('expanded');
      });

      const body = document.createElement('div');
      body.className = 'microdoc-card-body';

      if (entry.codeCopy) {
        const mcPre = document.createElement('pre');
        mcPre.className = 'mc-code';
        const mcCode = document.createElement('code');
        const validLang = entry.codeLanguage && hljs.getLanguage(entry.codeLanguage) ? entry.codeLanguage : 'plaintext';
        let hl;
        try {
          hl = hljs.highlight(entry.codeCopy, { language: validLang }).value;
        } catch {
          hl = escapeHtml(entry.codeCopy);
        }
        const startLine = entry.scopeStartLine || 1;
        const mcLines = hl.split('\n').map((l, i) => {
          const lNum = startLine + i;
          return '<div class="code-line"><span class="line-num">' + lNum + '</span><span class="line-content">' + (l || ' ') + '</span></div>';
        }).join('');
        mcCode.innerHTML = mcLines;
        mcPre.appendChild(mcCode);
        body.appendChild(mcPre);
      }

      const notesDiv = document.createElement('div');
      notesDiv.className = 'mc-notes markdown-rendered';
      const rawNotes = entry.notes && entry.notes.trim() ? entry.notes : '_No notes added yet._';
      notesDiv.innerHTML = marked.parse(rawNotes);
      body.appendChild(notesDiv);

      const editorBox = document.createElement('div');
      editorBox.className = 'mc-editor-box';
      editorBox.dataset.microId = mId;
      editorBox.innerHTML =
        '<textarea class="editor-textarea mc-editor-textarea" placeholder="Write notes for this annotation in Markdown...">' + escapeHtml(entry.notes || '') + '</textarea>' +
        '<div class="editor-buttons">' +
          '<button class="action-btn primary" onclick="event.stopPropagation(); saveMicrodocNotes(this)"><i class="fa-solid fa-floppy-disk"></i> Save</button>' +
          '<button class="action-btn" onclick="event.stopPropagation(); toggleMicrodocEdit(this)"><i class="fa-solid fa-xmark"></i> Cancel</button>' +
          '<span class="save-indicator mc-save-indicator"></span>' +
        '</div>';
      body.appendChild(editorBox);

      card.appendChild(header);
      card.appendChild(body);
      microSection.appendChild(card);
    }

    docsPane.appendChild(microSection);
  }

  // Start thread loop if needed
  setTimeout(() => {
    if (threadMode === 'always') startThreadLoop();
  }, 80);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Code Rendering: hljs + Overlay ──────────────────────────────────────────

function buildHighlightedCodeHtml(code, tokens, language, microdocRegistry) {
  // Step 1: syntax highlight
  const validLang = language && hljs.getLanguage(language) ? language : 'plaintext';
  let highlighted;
  try {
    highlighted = hljs.highlight(code, { language: validLang }).value;
  } catch {
    highlighted = escapeHtml(code);
  }

  // Step 2: Overlay token links if tokens present and highlightKeywords enabled
  let overlaid = highlighted;
  if (highlightKeywords && tokens.length > 0) {
    const tokenMap = new Map();
    for (const t of tokens) {
      if (!tokenMap.has(t.line)) tokenMap.set(t.line, []);
      tokenMap.get(t.line).push(t);
    }

    const hlLines = highlighted.split('\n');
    const resultLines = hlLines.map((hlLine, idx) => {
      const lineNum = idx + 1;
      // CodeGraph stores 1-based line numbers (confirmed: threads worked at
      // d6f8b52 with this lineNum lookup; a later commit switched to idx
      // (0-based) under the incorrect assumption that CodeGraph was 0-based,
      // which made tokenMap.get() miss every key and silently produce zero
      // token highlights across all files).
      const lineTokens = tokenMap.get(lineNum) || [];
      if (lineTokens.length === 0) return hlLine;

      let result = hlLine;
      for (const tok of lineTokens) {
        result = overlayCodeLink(result, tok);
      }
      return result;
    });

    overlaid = resultLines.join('\n');
  }

  // Step 3: Highlight microdoc annotations inside comments
  const annotated = addMicrodocHighlights(overlaid, code, microdocRegistry);

  // Step 4: Line numbers for code viewer
  const lines = annotated.split('\n');
  return lines.map((lHtml, idx) => {
    const lNum = idx + 1;
    return '<div class="code-line" id="code-line-' + lNum + '"><span class="line-num">' + lNum + '</span><span class="line-content">' + (lHtml || ' ') + '</span></div>';
  }).join('');
}

function overlayCodeLink(hlLine, tok) {
  const escapedName = escapeHtml(tok.name);
  const kindClass = 'kind-' + (tok.kind || 'calls');
  const dataAttrs = 'data-target="' + escapeHtml(tok.targetFile) + '" data-name="' + escapedName + '" data-kind="' + escapeHtml(tok.kind) + '" data-line="' + tok.line + '"';
  const replacement = '<span class="code-link ' + kindClass + '" ' + dataAttrs + '>' + escapedName + '</span>';

  // Replace only text content occurrences — skip those inside <tag ...> attributes
  let result = '';
  let pos = 0;
  const str = hlLine;
  const nameLen = escapedName.length;

  while (pos < str.length) {
    if (str[pos] === '<') {
      const end = str.indexOf('>', pos);
      if (end === -1) { result += str.slice(pos); break; }
      result += str.slice(pos, end + 1);
      pos = end + 1;
    } else {
      const nextTag = str.indexOf('<', pos);
      const segment = nextTag === -1 ? str.slice(pos) : str.slice(pos, nextTag);
      const idx = segment.indexOf(escapedName);
      if (idx !== -1) {
        const before = idx > 0 ? segment[idx - 1] : ' ';
        const after = idx + nameLen < segment.length ? segment[idx + nameLen] : ' ';
        const isWordBound = !/[a-zA-Z0-9_$]/.test(before) && !/[a-zA-Z0-9_$]/.test(after);
        if (isWordBound) {
          result += segment.slice(0, idx) + replacement + segment.slice(idx + nameLen);
          pos = nextTag === -1 ? str.length : nextTag;
          continue;
        }
      }
      result += segment;
      pos = nextTag === -1 ? str.length : nextTag;
    }
  }
  return result;
}

function addMicrodocHighlights(highlightedHtml, rawCode, microdocRegistry) {
  if (!microdocRegistry || Object.keys(microdocRegistry).length === 0) return highlightedHtml;

  const lines = highlightedHtml.split('\n');
  const rawLines = rawCode.split('\n');

  return lines.map((line, idx) => {
    const rawLine = rawLines[idx] || '';
    const m = rawLine.match(/@(?:syndocs|synd)(?:\s*:\s*([a-zA-Z0-9_-]+))?/);
    if (!m) return line;

    let label = m[1];
    if (!label) {
      const lineNum = idx + 1;
      for (const [l, entry] of Object.entries(microdocRegistry)) {
        if (entry.scopeStartLine !== undefined && entry.scopeStartLine <= lineNum && lineNum <= (entry.scopeEndLine || lineNum)) {
          label = l;
          break;
        }
      }
      if (!label && Object.keys(microdocRegistry).length === 1) {
        label = Object.keys(microdocRegistry)[0];
      }
    }

    if (!label || !microdocRegistry[label]) return line;

    const escapedLabel = escapeHtml(label);
    const annotText = m[0];
    const escapedText = escapeHtml(annotText);

    const badgeHtml =
      '<span class="microdoc-link" data-microdoc="' + escapedLabel + '" title="Microdoc: #' + escapedLabel + '">' +
        '<span class="m-glyph"><i class="fa-solid fa-tag"></i></span>' + escapedText +
      '</span>';

    if (line.includes(escapedText)) {
      return line.replace(escapedText, badgeHtml);
    } else if (line.includes(annotText)) {
      return line.replace(annotText, badgeHtml);
    }
    return line + ' <span class="microdoc-link" data-microdoc="' + escapedLabel + '"><span class="m-glyph"><i class="fa-solid fa-tag"></i></span>#' + escapedLabel + '</span>';
  }).join('\n');
}

function jumpToCodeLine(lineNum) {
  const lineEl = document.getElementById('code-line-' + lineNum);
  if (lineEl) {
    lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    lineEl.classList.remove('line-highlight-flash');
    void lineEl.offsetWidth;
    lineEl.classList.add('line-highlight-flash');
  } else {
    const viewer = document.querySelector('.code-viewer-container');
    if (viewer) viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function attachTokenListeners(codeEl, currentId) {
  const hoverCard = document.getElementById('hover-card');

  codeEl.querySelectorAll('.code-link').forEach(span => {
    const targetFile = span.dataset.target;
    const symbolName = span.dataset.name;
    const kind = span.dataset.kind;
    const line = span.dataset.line;

    span.addEventListener('mouseenter', e => {
      hoverCard.style.display = 'block';
      positionHoverCard(e.clientX, e.clientY);
      hoverCard.innerHTML =
        '<div class="hc-title">' +
          '<span style="color:var(--' + escapeHtml(kind || 'calls') + ')">' + escapeHtml((kind || 'calls').toUpperCase()) + '</span> ' +
          escapeHtml(symbolName) +
        '</div>' +
        '<div class="hc-path">' + escapeHtml(targetFile) + ' · line ' + escapeHtml(String(line)) + '</div>' +
        '<div class="hc-why">Click to navigate to file documentation</div>';
      highlightGraphNode(targetFile);
      if (threadMode !== 'off') {
        activeThreadSpan = span;
        activeThreadTarget = targetFile;
        if (!threadRafId) startThreadLoop();
      }
    });

    span.addEventListener('mousemove', e => positionHoverCard(e.clientX, e.clientY));
    span.addEventListener('mouseleave', () => {
      hoverCard.style.display = 'none';
      if (threadMode === 'hover') {
        stopThreadLoop();
      }
    });
    span.addEventListener('click', () => {
      // A same-file reference (e.g. calling a sibling method) should scroll
      // to that line in the current view, not re-open the doc we're already
      // looking at — openDoc() fully clears and rebuilds doc-content, which
      // would discard scroll position and flash the whole viewer for no
      // reason. Same-file targets only started reaching this handler once
      // getFileTokens() stopped excluding them (see adapter.ts), so this
      // path was previously unreachable/untested.
      if (targetFile === currentId) {
        jumpToCodeLine(Number(line));
      } else {
        openDoc(targetFile);
      }
    });
  });
}

function attachMicrodocListeners(codeEl) {
  const popover = document.getElementById('microdoc-popover');
  const labelEl = document.getElementById('mp-label-text');
  const kindEl = document.getElementById('mp-kind-text');
  const bodyEl = document.getElementById('mp-body-text');
  const codeBox = document.getElementById('mp-code-box');
  const codeText = document.getElementById('mp-code-text');

  codeEl.querySelectorAll('.microdoc-link, .annotation-glyph').forEach(el => {
    const label = el.dataset.microdoc;
    el.addEventListener('mouseenter', e => {
      const micro = currentMicrodocs[label];
      if (!micro) return;

      labelEl.textContent = '#' + label;
      if (micro.elementKind) {
        kindEl.textContent = micro.elementKind;
        kindEl.style.display = 'inline-block';
      } else {
        kindEl.style.display = 'none';
      }

      if (micro.codeCopy && micro.codeCopy.trim()) {
        codeBox.style.display = 'block';
        const validLang = micro.codeLanguage && hljs.getLanguage(micro.codeLanguage) ? micro.codeLanguage : 'plaintext';
        try {
          codeText.innerHTML = hljs.highlight(micro.codeCopy, { language: validLang }).value;
        } catch {
          codeText.textContent = micro.codeCopy;
        }
      } else {
        codeBox.style.display = 'none';
      }

      const rawNotes = micro.notes && micro.notes.trim() ? micro.notes : '_No documentation notes added yet._';
      bodyEl.innerHTML = marked.parse(rawNotes);

      popover.style.display = 'block';
      positionPopover(e.clientX, e.clientY);
    });

    el.addEventListener('mousemove', e => positionPopover(e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => { popover.style.display = 'none'; });

    el.addEventListener('click', e => {
      e.stopPropagation();
      const card = document.querySelector('.microdoc-card[data-label="' + CSS.escape(label) + '"]');
      if (card) {
        card.classList.add('expanded');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        card.style.transition = 'box-shadow 0.25s';
        card.style.boxShadow = '0 0 0 2px var(--accent), 0 0 16px var(--accent-glow-strong)';
        setTimeout(() => { card.style.boxShadow = ''; }, 1600);
      }
    });
  });
}

function positionHoverCard(cx, cy) {
  const card = document.getElementById('hover-card');
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = cx + 16, y = cy + 14;
  if (x + 320 > vw) x = cx - 320 - 8;
  if (y + 120 > vh) y = cy - 120 - 8;
  card.style.left = x + 'px';
  card.style.top = y + 'px';
}

function positionPopover(cx, cy) {
  const pop = document.getElementById('microdoc-popover');
  const vw = window.innerWidth, vh = window.innerHeight;
  const pw = pop.offsetWidth || 400;
  const ph = pop.offsetHeight || 260;
  let x = cx + 18, y = cy + 14;
  if (x + pw > vw - 14) x = cx - pw - 14;
  if (y + ph > vh - 14) y = cy - ph - 14;
  if (x < 14) x = 14;
  if (y < 14) y = 14;
  pop.style.left = x + 'px';
  pop.style.top = y + 'px';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Thread Loop (rAF-based, elastically tracks elements) ─────────────────────
// Perf notes:
//  - Target elements (graph node / connected-list row) are resolved once per
//    targetId and cached, instead of re-running querySelectorAll+Array.find
//    scans on every single animation frame (this was the dominant cost in
//    "always" thread mode with many links — O(links * nodes) per frame).
//    The cache is invalidated whenever the graph/list DOM is rebuilt.
//  - SVG <path> elements are updated in place via a keyed D3 join instead of
//    being destroyed and recreated every frame, cutting per-frame DOM churn.

let threadTargetElCache = new Map();
function invalidateThreadTargetCache() {
  threadTargetElCache.clear();
}

function resolveThreadTargetEl(targetId) {
  const cached = threadTargetElCache.get(targetId);
  if (cached && document.contains(cached)) return cached;

  let el = null;
  if (currentGraphView === 'canvas') {
    el = document.querySelector(`#graph-svg g[data-id="${CSS.escape(targetId)}"] circle:not(.selection-ring)`);
    if (!el) {
      const baseTarget = targetId.split('/').pop().replace(/\.[^.]+$/, '');
      const matchingGroup = Array.from(document.querySelectorAll('#graph-svg g[data-id]')).find(g => {
        const gid = g.dataset.id || '';
        return gid === targetId || gid.endsWith('/' + targetId) || targetId.endsWith('/' + gid) ||
          (baseTarget && (gid.split('/').pop() || '').replace(/\.[^.]+$/, '') === baseTarget);
      });
      if (matchingGroup) el = matchingGroup.querySelector('circle:not(.selection-ring)');
    }
  } else {
    el = document.querySelector(`.conn-item[data-target-id="${CSS.escape(targetId)}"]`);
    if (!el) {
      const baseTarget = targetId.split('/').pop().replace(/\.[^.]+$/, '');
      el = Array.from(document.querySelectorAll('.conn-item')).find(item => {
        const tid = item.dataset.targetId || '';
        return tid === targetId || tid.endsWith('/' + targetId) || targetId.endsWith('/' + tid) ||
          (baseTarget && (tid.split('/').pop() || '').replace(/\.[^.]+$/, '') === baseTarget);
      });
    }
  }
  if (el) threadTargetElCache.set(targetId, el);
  return el;
}

function computeThreadLine(spanEl, targetId) {
  const spanRect = spanEl.getBoundingClientRect();
  if (spanRect.width === 0 && spanRect.height === 0) return null;
  // Don't draw if the code span is scrolled outside the visible viewport
  if (spanRect.bottom < 60 || spanRect.top > window.innerHeight - 30) return null;

  const x1 = spanRect.right + 2;
  const y1 = spanRect.top + spanRect.height / 2;

  const targetEl = resolveThreadTargetEl(targetId);
  if (!targetEl) return null;

  let x2, y2;
  if (currentGraphView === 'canvas') {
    const rect = targetEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    x2 = rect.left + rect.width / 2;
    y2 = rect.top + rect.height / 2;
  } else {
    const rect = targetEl.getBoundingClientRect();
    const listContainer = document.getElementById('connected-list-container');
    const listRect = listContainer ? listContainer.getBoundingClientRect() : null;
    if (listRect && (rect.bottom < listRect.top + 8 || rect.top > listRect.bottom - 8)) return null;
    x2 = rect.left + 8;
    y2 = rect.top + rect.height / 2;
  }

  const dx = (x2 - x1) * 0.45;
  const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  return { pathD };
}

function startThreadLoop() {
  if (threadRafId) return;
  const threadSvg = d3.select('#thread-svg');

  function drawFrame() {
    if (threadMode === 'hover') {
      if (activeThreadSpan && activeThreadTarget) {
        const line = computeThreadLine(activeThreadSpan, activeThreadTarget);
        const sel = threadSvg.selectAll('path.thread-line').data(line ? [line] : [], (_d, i) => i);
        sel.exit().remove();
        sel.enter().append('path')
          .attr('class', 'thread-line thread-active')
          .attr('stroke-opacity', 0.9)
          .attr('stroke-dasharray', '5 2')
          .merge(sel)
          .attr('d', d => d.pathD);
      } else {
        threadSvg.selectAll('*').remove();
        threadRafId = null;
        return;
      }
    } else if (threadMode === 'always') {
      const lines = [];
      for (const { span, targetId } of allThreadSpans) {
        const line = computeThreadLine(span, targetId);
        if (line) lines.push(line);
      }
      const sel = threadSvg.selectAll('path.thread-line').data(lines, (_d, i) => i);
      sel.exit().remove();
      sel.enter().append('path')
        .attr('class', 'thread-line')
        .attr('stroke-opacity', 0.35)
        .attr('stroke-dasharray', 'none')
        .merge(sel)
        .attr('d', d => d.pathD);
    }

    threadRafId = requestAnimationFrame(drawFrame);
  }

  threadRafId = requestAnimationFrame(drawFrame);
}

function stopThreadLoop() {
  if (threadRafId) {
    cancelAnimationFrame(threadRafId);
    threadRafId = null;
  }
  clearThreadSvg();
  activeThreadSpan = null;
  activeThreadTarget = null;
}

function clearThreadSvg() {
  d3.select('#thread-svg').selectAll('*').remove();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Thread Mode Controls ──────────────────────────────────────────────────────

function cycleThreadMode(btn) {
  const modes = ['hover', 'always', 'off'];
  const idx = modes.indexOf(threadMode);
  threadMode = modes[(idx + 1) % modes.length];
  localStorage.setItem('syndocs_thread_mode', threadMode);

  btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Threads: ${threadMode}`;
  btn.classList.toggle('active', threadMode !== 'off');

  if (threadMode === 'off') {
    stopThreadLoop();
  } else if (threadMode === 'always') {
    activeThreadSpan = null;
    startThreadLoop();
  } else {
    // hover: stop always loop, threads only drawn on hover
    stopThreadLoop();
  }
}

function toggleHighlightKeywords(btn) {
  highlightKeywords = !highlightKeywords;
  btn.classList.toggle('active', highlightKeywords);
  if (currentDocId && DATA.docs[currentDocId]) renderDocContent(DATA.docs[currentDocId], currentDocId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Notes Editor ─────────────────────────────────────────────────────────────

function toggleEditNotes() {
  if (!authToken) {
    document.getElementById('auth-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('auth-code-input').focus(), 50);
    return;
  }
  isEditingNotes = !isEditingNotes;
  const view = document.getElementById('notes-view');
  const editor = document.getElementById('notes-editor-box');
  const btn = document.getElementById('edit-notes-btn');
  const subBtn = document.getElementById('edit-notes-toggle-btn');
  if (isEditingNotes) {
    view.style.display = 'none';
    editor.style.display = 'flex';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-eye"></i> Preview';
    if (subBtn) subBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Preview';
  } else {
    view.style.display = 'block';
    editor.style.display = 'none';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Notes';
    if (subBtn) subBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit';
  }
}

function saveNotes() {
  if (!authToken || !currentDocId) return;
  const textarea = document.getElementById('notes-textarea');
  const notes = textarea.value;
  const ind = document.getElementById('save-indicator');
  ind.textContent = 'Saving…';

  const doc = DATA.docs[currentDocId];
  const type = doc?.type || 'doc';

  fetch('/api/doc/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ id: currentDocId, type, notes })
  })
  .then(r => r.json())
  .then(res => {
    if (res.ok) {
      ind.innerHTML = 'Saved <i class="fa-solid fa-check"></i>';
      doc.notes = notes;
      const view = document.getElementById('notes-view');
      if (view) view.innerHTML = marked.parse(notes || '> _No notes yet._');
      setTimeout(() => { ind.textContent = ''; toggleEditNotes(); }, 700);
    } else {
      ind.textContent = 'Error: ' + (res.error || 'unknown');
    }
  })
  .catch(() => { ind.textContent = 'Save failed'; });
}

// ── Per-annotation (microdoc) notes editing ──────────────────────────────────
// Reuses the same /api/doc/save endpoint the whole-file notes editor uses —
// the server already supports type:'microdoc' (writes into the mirror doc's
// matching @synd section), it just wasn't wired up in the UI until now.

function toggleMicrodocEdit(triggerEl) {
  if (!authToken) {
    document.getElementById('auth-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('auth-code-input').focus(), 50);
    return;
  }
  const card = triggerEl.closest('.microdoc-card');
  if (!card) return;
  if (!card.classList.contains('expanded')) card.classList.add('expanded');

  const notesDiv = card.querySelector('.mc-notes');
  const editorBox = card.querySelector('.mc-editor-box');
  const editing = editorBox.classList.toggle('editing');
  notesDiv.style.display = editing ? 'none' : 'block';
  editorBox.style.display = editing ? 'flex' : 'none';
  if (editing) {
    const ta = editorBox.querySelector('.mc-editor-textarea');
    if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
  }
}

function saveMicrodocNotes(triggerEl) {
  if (!authToken) return;
  const editorBox = triggerEl.closest('.mc-editor-box');
  const card = triggerEl.closest('.microdoc-card');
  if (!editorBox || !card) return;

  const mId = editorBox.dataset.microId;
  const textarea = editorBox.querySelector('.mc-editor-textarea');
  const notes = textarea.value;
  const ind = editorBox.querySelector('.mc-save-indicator');
  if (ind) ind.textContent = 'Saving…';

  fetch('/api/doc/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ id: mId, type: 'microdoc', notes })
  })
  .then(r => r.json())
  .then(res => {
    if (res.ok) {
      if (ind) ind.innerHTML = 'Saved <i class="fa-solid fa-check"></i>';
      if (DATA.docs[mId]) DATA.docs[mId].notes = notes;
      if (currentMicrodocs[card.dataset.label]) currentMicrodocs[card.dataset.label].notes = notes;
      const notesDiv = card.querySelector('.mc-notes');
      if (notesDiv) notesDiv.innerHTML = marked.parse(notes && notes.trim() ? notes : '_No notes added yet._');
      setTimeout(() => {
        if (ind) ind.textContent = '';
        editorBox.classList.remove('editing');
        notesDiv.style.display = 'block';
        editorBox.style.display = 'none';
      }, 700);
    } else if (ind) {
      ind.textContent = 'Error: ' + (res.error || 'unknown');
    }
  })
  .catch(() => { if (ind) ind.textContent = 'Save failed'; });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Graph Panel ──────────────────────────────────────────────────────────────

function initLinkDirection() {
  setLinkDirection(linkDirection, true);
}

function setLinkDirection(dir, silent = false) {
  if (!['all', 'incoming', 'outgoing'].includes(dir)) dir = 'all';
  linkDirection = dir;
  localStorage.setItem('syndocs_link_direction', dir);

  ['all', 'incoming', 'outgoing'].forEach(d => {
    const btn = document.getElementById('btn-dir-' + d);
    if (btn) btn.classList.toggle('active', d === dir);
  });

  if (currentDocId) {
    updateConnectedList(currentDocId);
  } else {
    updateConnectedList('');
  }

  applyGraphDirectionFilter();
}

function setGraphView(view) {
  currentGraphView = view;
  invalidateThreadTargetCache();
  document.getElementById('btn-view-canvas').classList.toggle('active', view === 'canvas');
  document.getElementById('btn-view-list').classList.toggle('active', view === 'list');
  document.getElementById('graph-svg-container').style.display = view === 'canvas' ? 'block' : 'none';
  document.getElementById('connected-list-container').style.display = view === 'list' ? 'block' : 'none';
  if (view === 'list' && currentDocId) updateConnectedList(currentDocId);
}

function updateConnectedList(docId) {
  invalidateThreadTargetCache();
  const container = document.getElementById('connected-list-container');
  const countBadge = document.getElementById('conn-count-badge');
  container.innerHTML = '';

  if (!docId) {
    container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:28px; font-size:12px;">Select a document to inspect connected files.</div>';
    if (countBadge) countBadge.textContent = '0 links';
    return;
  }

  const baseId = docId.includes('#') ? docId.split('#')[0] : docId;

  const isTargetEdge = e => {
    return (e.target === docId || e.target === baseId || e.target.startsWith(baseId + '#')) &&
           e.source !== docId && e.source !== baseId && !e.source.startsWith(baseId + '#');
  };

  const isSourceEdge = e => {
    return (e.source === docId || e.source === baseId || e.source.startsWith(baseId + '#')) &&
           e.target !== docId && e.target !== baseId && !e.target.startsWith(baseId + '#');
  };

  let relevantEdges = [];
  if (linkDirection === 'incoming') {
    relevantEdges = DATA.edges.filter(e => isTargetEdge(e) && e.kind !== 'contains');
  } else if (linkDirection === 'outgoing') {
    relevantEdges = DATA.edges.filter(e => isSourceEdge(e) && e.kind !== 'contains');
  } else {
    relevantEdges = DATA.edges.filter(e => (isTargetEdge(e) || isSourceEdge(e)) && e.kind !== 'contains');
  }

  if (countBadge) {
    const dirText = linkDirection === 'incoming' ? 'incoming' : linkDirection === 'outgoing' ? 'outgoing' : 'links';
    countBadge.textContent = relevantEdges.length + ' ' + dirText;
  }

  if (relevantEdges.length === 0) {
    const msg = linkDirection === 'incoming'
      ? 'No incoming links found.<br><span style="font-size:11px; color:var(--text-muted);">No other files currently call or reference this file.</span>'
      : linkDirection === 'outgoing'
      ? 'No outgoing links found.<br><span style="font-size:11px; color:var(--text-muted);">This file does not call or import any tracked files.</span>'
      : 'No connected files.';
    container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:28px; font-size:12px; line-height:1.6;">' + msg + '</div>';
    return;
  }

  const map = new Map();
  for (const e of relevantEdges) {
    const isInc = isTargetEdge(e);
    const otherId = isInc ? e.source : e.target;
    const otherBase = otherId.includes('#') ? otherId.split('#')[0] : otherId;
    if (!map.has(otherBase)) map.set(otherBase, { edges: [], incomingCount: 0, outgoingCount: 0 });
    const entry = map.get(otherBase);
    entry.edges.push(e);
    if (isInc) entry.incomingCount++;
    else entry.outgoingCount++;
  }

  for (const [otherId, info] of map.entries()) {
    const item = document.createElement('div');
    item.className = 'conn-item';
    item.dataset.targetId = otherId;
    const label = otherId.split('/').pop();

    let dirBadge = '';
    if (info.incomingCount > 0 && info.outgoingCount > 0) {
      dirBadge = '<span class="tree-badge dim" style="color:var(--accent-hover); border-color:var(--accent-glow);"><i class="fa-solid fa-arrows-left-right"></i> Two-way</span>';
    } else if (info.incomingCount > 0) {
      dirBadge = '<span class="tree-badge dim" style="color:var(--calls); border-color:rgba(56,189,248,0.3);"><i class="fa-solid fa-arrow-left"></i> Incoming</span>';
    } else {
      dirBadge = '<span class="tree-badge dim" style="color:var(--imports); border-color:rgba(251,146,60,0.3);"><i class="fa-solid fa-arrow-right"></i> Outgoing</span>';
    }

    const edgePills = info.edges.slice(0, 4).map(e => {
      const eIsInc = isTargetEdge(e);
      const symbolText = e.symbol ? ': ' + escapeHtml(e.symbol) : '';
      const prefix = eIsInc ? 'called by' : 'calls';
      return '<span style="color:var(--' + (e.kind || 'calls') + ')">• ' + prefix + ' (' + escapeHtml(e.kind || 'ref') + ')' + symbolText + '</span>';
    }).join(' ');

    item.innerHTML =
      '<div class="conn-item-title">' +
        '<span>' + escapeHtml(label) + '</span>' +
        '<div style="display:flex; gap:5px; align-items:center;">' +
          dirBadge +
          '<span class="tree-badge dim">' + info.edges.length + ' link' + (info.edges.length > 1 ? 's' : '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="conn-item-path">' + escapeHtml(otherId) + '</div>' +
      '<div class="conn-item-meta">' + edgePills + '</div>';

    item.addEventListener('click', () => openDoc(otherId));
    container.appendChild(item);
  }
}

function buildGraph() {
  invalidateThreadTargetCache();
  const svg = d3.select('#graph-svg');
  const root = document.getElementById('graph-svg-container');

  // Update module-level dimensions so onPhysicsChange can access them
  graphW = root.clientWidth || 400;
  graphH = root.clientHeight || 500;
  const W = graphW;
  const H = graphH;

  // Stop old simulation before wiping DOM
  if (simulation) { simulation.stop(); simulation = null; }
  svg.selectAll('*').remove();

  if (!DATA.nodes || DATA.nodes.length === 0) return;

  const nodeColor = d => {
    if (d.status === 'ok') return 'var(--ok)';
    if (d.status === 'stale') return 'var(--stale)';
    if (d.status === 'missing') return 'var(--missing)';
    if (d.status === 'none') return 'var(--text-dim)';
    return 'var(--text-muted)';
  };

  const edgeColor = d => {
    const map = { calls: 'var(--calls)', imports: 'var(--imports)', extends: 'var(--extends)', references: 'var(--references)', contains: 'var(--accent)' };
    return map[d.kind] || 'var(--border)';
  };

  // Compute edge counts for hub sizing (stored in module scope for onPhysicsChange)
  graphEdgeCount = new Map();
  DATA.nodes.forEach(n => graphEdgeCount.set(n.id, 0));
  DATA.edges.forEach(e => {
    graphEdgeCount.set(e.source, (graphEdgeCount.get(e.source) || 0) + 1);
    graphEdgeCount.set(e.target, (graphEdgeCount.get(e.target) || 0) + 1);
  });
  const edgeCount = graphEdgeCount;

  const nodeRadius = d => {
    const cnt = edgeCount.get(d.id) || 0;
    return Math.min(5 + cnt * 1.2, 14);
  };

  // Attach zoom exactly once — reuse if already bound
  const zoom = d3.zoom().scaleExtent([0.1, 6])
    .on('zoom', e => svgG.attr('transform', e.transform));
  svg.call(zoom);

  // Defs: arrowhead marker
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -4 8 8')
    .attr('refX', 14)
    .attr('refY', 0)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-4L8,0L0,4')
    .attr('fill', 'var(--border)')
    .attr('opacity', 0.5);

  svgG = svg.append('g');

  // Build node objects, preserving positions from old simulation nodes when rebuilding
  const nodeMap = new Map(DATA.nodes.map(n => [n.id, { ...n }]));
  const links = DATA.edges
    .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target) && e.source !== e.target)
    .map(e => ({ ...e }));
  const nodes = Array.from(nodeMap.values());

  // Read physics slider values (with safe defaults)
  const gravityVal = parseFloat((document.getElementById('slider-gravity') || { value: '0.06' }).value);
  const chargeVal  = parseFloat((document.getElementById('slider-charge')  || { value: '-280' }).value);
  const distVal    = parseFloat((document.getElementById('slider-dist')    || { value: '110'  }).value);

  // Simulation — Obsidian-like open layout with radial spread
  graphLinkForce = d3.forceLink(links).id(d => d.id)
    .distance(d => d.kind === 'contains' ? 45 : distVal)
    .strength(d => d.kind === 'contains' ? 0.6 : 0.25);

  simulation = d3.forceSimulation(nodes)
    .alphaDecay(0.025)
    .velocityDecay(0.38)
    .force('link', graphLinkForce)
    .force('charge', d3.forceManyBody().strength(d => chargeVal - (edgeCount.get(d.id) || 0) * 20))
    .force('center', d3.forceCenter(W / 2, H / 2).strength(gravityVal))
    .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 10).strength(0.85))
    .force('radial', d3.forceRadial(Math.min(W, H) * 0.3, W / 2, H / 2).strength(0.04));

  // Obsidian-style straight graph lines — brighter by default
  const linkLines = svgG.append('g')
    .attr('class', 'graph-links')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', d => edgeColor(d))
    .attr('stroke-width', 1.4)
    .attr('stroke-opacity', 0.55)
    .attr('stroke-linecap', 'round');

  // Node groups
  const nodeGroup = svgG.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('data-id', d => d.id)
    .attr('cursor', 'pointer')
    .on('click', (e, d) => openDoc(d.id))
    .on('mouseover', (e, d) => {
      document.getElementById('graph-info').textContent = d.id + ' (' + d.status + ')';
      d3.select(e.currentTarget).select('circle.node-core')
        .transition().duration(150)
        .attr('r', nodeRadius(d) * 1.35);

      // Obsidian-style focus: brighten connected edges and connected neighbor nodes
      linkLines
        .transition().duration(120)
        .attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id ? 0.9 : 0.08))
        .attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id ? 2.0 : 0.8));

      nodeGroup
        .transition().duration(120)
        .attr('opacity', n => {
          if (n.id === d.id) return 1;
          const isConnected = links.some(l => (l.source.id === d.id && l.target.id === n.id) || (l.target.id === d.id && l.source.id === n.id));
          return isConnected ? 1 : 0.25;
        });
    })
    .on('mouseout', (e, d) => {
      document.getElementById('graph-info').textContent = 'Hover node to inspect · drag to rearrange';
      d3.select(e.currentTarget).select('circle.node-core')
        .transition().duration(150)
        .attr('r', nodeRadius(d));

      applyGraphDirectionFilter();
    })
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.15).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

  // Selection ring
  nodeGroup.append('circle')
    .attr('class', 'selection-ring')
    .attr('r', d => nodeRadius(d) + 5)
    .attr('fill', 'none')
    .attr('stroke', 'var(--accent-hover)')
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0);

  // Core circle — full opacity so nodes are clearly visible
  nodeGroup.append('circle')
    .attr('class', 'node-core')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => nodeColor(d))
    .attr('fill-opacity', 1.0)
    .attr('stroke', d => nodeColor(d))
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.7);

  // Label (only show for nodes with enough space)
  nodeGroup.append('text')
    .attr('dy', d => nodeRadius(d) + 10)
    .attr('text-anchor', 'middle')
    .attr('font-size', d => d.type === 'microdoc' ? 7.5 : 9)
    .attr('fill', 'var(--text-dim)')
    .attr('pointer-events', 'none')
    .attr('opacity', d => edgeCount.get(d.id) > 1 ? 1 : 0.6)
    .text(d => d.label.length > 14 ? d.label.slice(0, 13) + '…' : d.label);

  simulation.on('tick', () => {
    linkLines
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    nodeGroup.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
  });
}

function onPhysicsChange() {
  const gravEl = document.getElementById('slider-gravity');
  const chgEl  = document.getElementById('slider-charge');
  const dstEl  = document.getElementById('slider-dist');
  if (gravEl) document.getElementById('val-gravity').textContent = parseFloat(gravEl.value).toFixed(2);
  if (chgEl)  document.getElementById('val-charge').textContent  = chgEl.value;
  if (dstEl)  document.getElementById('val-dist').textContent    = dstEl.value;

  // Update forces in-place — no rebuild so nodes keep their current positions
  if (!simulation) { buildGraph(); return; }

  const gravity = parseFloat(gravEl ? gravEl.value : '0.06');
  const charge  = parseFloat(chgEl  ? chgEl.value  : '-280');
  const dist    = parseFloat(dstEl  ? dstEl.value  : '110');
  const W = graphW, H = graphH;

  if (graphLinkForce) {
    graphLinkForce.distance(d => d.kind === 'contains' ? 45 : dist);
  }
  simulation
    .force('charge', d3.forceManyBody().strength(d => charge - (graphEdgeCount.get(d.id) || 0) * 20))
    .force('center', d3.forceCenter(W / 2, H / 2).strength(gravity))
    .force('radial', d3.forceRadial(Math.min(W, H) * 0.3, W / 2, H / 2).strength(0.04))
    .alphaTarget(0.3)
    .restart();

  // Cool down after 800 ms so the graph settles
  setTimeout(() => { if (simulation) simulation.alphaTarget(0); }, 800);
}

function highlightGraphNode(id) {
  if (!svgG) return;
  svgG.selectAll('g[data-id]').each(function(d) {
    const isSelected = d.id === id;
    d3.select(this).select('.selection-ring')
      .transition().duration(180)
      .attr('stroke-opacity', isSelected ? 1 : 0);
  });
  applyGraphDirectionFilter();
}

function applyGraphDirectionFilter() {
  if (!svgG) return;
  const id = currentDocId;
  const linesSel = svgG.selectAll('line');
  const nodesSel = svgG.selectAll('g[data-id]');

  if (!id) {
    linesSel.transition().duration(200).attr('stroke-opacity', 0.35).attr('stroke-width', 1.2);
    nodesSel.transition().duration(200).attr('opacity', 1);
    return;
  }

  const baseId = id.includes('#') ? id.split('#')[0] : id;

  const isIncomingEdge = l => {
    const t = l.target.id || l.target;
    return (t === id || t === baseId || t.startsWith(baseId + '#')) && l.source.id !== id && l.source.id !== baseId && !l.source.id.startsWith(baseId + '#');
  };

  const isOutgoingEdge = l => {
    const s = l.source.id || l.source;
    return (s === id || s === baseId || s.startsWith(baseId + '#')) && l.target.id !== id && l.target.id !== baseId && !l.target.id.startsWith(baseId + '#');
  };

  if (linkDirection === 'incoming') {
    linesSel.transition().duration(200)
      .attr('stroke-opacity', l => isIncomingEdge(l) ? 0.95 : 0.05)
      .attr('stroke-width', l => isIncomingEdge(l) ? 2.2 : 0.7);
    nodesSel.transition().duration(200)
      .attr('opacity', n => {
        if (n.id === id || n.id === baseId || n.id.startsWith(baseId + '#')) return 1;
        const hasIncoming = DATA.edges.some(e => {
          const t = e.target;
          const s = e.source;
          return (t === id || t === baseId || t.startsWith(baseId + '#')) && (s === n.id || s.startsWith(n.id + '#'));
        });
        return hasIncoming ? 1 : 0.18;
      });
  } else if (linkDirection === 'outgoing') {
    linesSel.transition().duration(200)
      .attr('stroke-opacity', l => isOutgoingEdge(l) ? 0.95 : 0.05)
      .attr('stroke-width', l => isOutgoingEdge(l) ? 2.2 : 0.7);
    nodesSel.transition().duration(200)
      .attr('opacity', n => {
        if (n.id === id || n.id === baseId || n.id.startsWith(baseId + '#')) return 1;
        const hasOutgoing = DATA.edges.some(e => {
          const s = e.source;
          const t = e.target;
          return (s === id || s === baseId || s.startsWith(baseId + '#')) && (t === n.id || t.startsWith(n.id + '#'));
        });
        return hasOutgoing ? 1 : 0.18;
      });
  } else {
    // 'all'
    linesSel.transition().duration(200)
      .attr('stroke-opacity', l => (isIncomingEdge(l) || isOutgoingEdge(l)) ? 0.85 : 0.12)
      .attr('stroke-width', l => (isIncomingEdge(l) || isOutgoingEdge(l)) ? 1.8 : 0.9);
    nodesSel.transition().duration(200)
      .attr('opacity', n => {
        if (n.id === id || n.id === baseId || n.id.startsWith(baseId + '#')) return 1;
        const isConn = DATA.edges.some(e => {
          const s = e.source, t = e.target;
          return ((s === id || s === baseId || s.startsWith(baseId + '#')) && (t === n.id || t.startsWith(n.id + '#'))) ||
                 ((t === id || t === baseId || t.startsWith(baseId + '#')) && (s === n.id || s.startsWith(n.id + '#')));
        });
        return isConn ? 1 : 0.22;
      });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDiffLines(raw) {
  const tripleTick = String.fromCharCode(96, 96, 96);
  return raw.split('\n')
    .filter(l => !l.startsWith(tripleTick) && !l.startsWith('<!--') && !l.startsWith('##'))
    .map(l => {
      if (l.startsWith('+')) return `<span class="diff-line-add">${escapeHtml(l)}</span>`;
      if (l.startsWith('-')) return `<span class="diff-line-del">${escapeHtml(l)}</span>`;
      return escapeHtml(l);
    }).join('\n');
}

function extractConnections(content) {
  const m = content.match(/<!-- syndocs-graph-start -->([sS]*?)<!-- syndocs-graph-end -->/);
  if (!m) return [];
  const rows = [];
  for (const l of m[1].split('\n')) {
    if (!l.startsWith('|') || l.includes('Line') || l.includes('---')) continue;
    const cells = l.split('|').filter(Boolean).map(s => s.trim());
    if (cells.length >= 4 && cells[0] !== '') {
      rows.push({ line: cells[0], symbol: cells[1], linksTo: cells[2], edge: cells[3], why: cells[4] || '' });
    }
  }
  return rows;
}

function renderConnectionTable(rows) {
  return `
    <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:8px; letter-spacing:-0.01em;">
      Connections &amp; References
    </div>
    <table class="connections-table">
      <thead><tr><th>Line</th><th>Symbol</th><th>Target</th><th>Edge</th><th>Why</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td style="font-family:var(--font-mono); color:var(--text-muted); font-size:11.5px;">${escapeHtml(r.line)}</td>
            <td><code>${escapeHtml(r.symbol.replace(/`/g, ''))}</code></td>
            <td style="font-family:var(--font-mono); font-size:11.5px;">${escapeHtml(r.linksTo)}</td>
            <td><span class="tree-badge dim">${escapeHtml(r.edge)}</span></td>
            <td style="font-style:italic; color:var(--text-muted); font-size:12px;">${escapeHtml(r.why || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function escapeHtml(s) {
  if (typeof s !== 'string') return String(s || '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegex(s) {
  // Escape regex special chars using split/join to avoid template-literal escaping issues
  const specials = ['\\', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']'];
  for (const ch of specials) s = s.split(ch).join('\\' + ch);
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Search ───────────────────────────────────────────────────────────────────

function setupSearch() {
  let searchTimer;
  document.getElementById('search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderSidebar(e.target.value.trim()), 120);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Window Controls ──────────────────────────────────────────────────────────

function toggleGraphPanel() {
  document.getElementById('app').classList.toggle('graph-hidden');
  setTimeout(() => {
    if (currentGraphView === 'canvas') buildGraph();
    if (threadMode === 'always' && threadRafId) {
      stopThreadLoop();
      startThreadLoop();
    }
  }, 300);
}

function setupWindowResize() {
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentGraphView === 'canvas') buildGraph();
    }, 200);
  });
}

function setupGlobalClickClose() {
  document.addEventListener('click', e => {
    const dropdown = document.getElementById('theme-dropdown');
    const wrapper = document.getElementById('theme-picker-wrapper');
    if (dropdown && wrapper && !wrapper.contains(e.target)) dropdown.classList.remove('open');
    const fontDropdown = document.getElementById('font-dropdown');
    const fontWrapper = document.getElementById('font-picker-wrapper');
    if (fontDropdown && fontWrapper && !fontWrapper.contains(e.target)) fontDropdown.classList.remove('open');
  });
}

function openHome() {
  currentDocId = null;
  // showEmptyState() is the single source of truth for hiding doc-content
  // (toggles a class, never an inline style — an inline style set here
  // would permanently override the CSS class rule afterward, which was the
  // root cause of "the app stops loading any doc until a hard refresh"
  // after visiting Home).
  showEmptyState();
  document.querySelectorAll('.tree-row.active').forEach(r => r.classList.remove('active'));
  applyGraphDirectionFilter();
  updateConnectedList('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SSE Live Reload ──────────────────────────────────────────────────────────

function setupSSE() {
  const es = new EventSource('/events');
  es.addEventListener('reload', () => {
    fetch('/api/data')
      .then(r => r.json())
      .then(d => {
        Object.assign(DATA, d);
        renderStats();
        renderSidebar();
        if (currentDocId) openDoc(currentDocId);
      }).catch(() => {});
  });
  es.addEventListener('error', () => {
    // silently retry — EventSource auto-reconnects
  });
}
