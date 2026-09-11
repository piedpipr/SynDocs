// @syndocs
/**
 * SynDocs Web Studio HTML Template
 * Features:
 * - Dual-tab sidebar: Docs Tree & Codebase Tree with collapse/expand & stats
 * - Interactive Code Keyword Anchors with dynamic SVG connection threads
 * - Hover tooltips for relations and 'Why' notes
 * - Dual graph modes: D3 Force-Directed Canvas & Connected Files List
 * - Password-protected Notes Editor with live Markdown preview
 */

export const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SynDocs — Code-Synced Documentation Studio</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.0/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0b0e14;
  --bg-surface: #121722;
  --bg-surface-2: #182030;
  --bg-surface-hover: #1f293d;
  --border: #242e45;
  --border-focus: #4f46e5;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --text-muted: #64748b;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-glow: rgba(99, 102, 241, 0.25);
  --ok: #10b981;
  --ok-dim: rgba(16, 185, 129, 0.15);
  --stale: #f59e0b;
  --stale-dim: rgba(245, 158, 11, 0.15);
  --missing: #ef4444;
  --missing-dim: rgba(239, 68, 68, 0.15);
  --calls: #38bdf8;
  --imports: #fb923c;
  --extends: #c084fc;
  --references: #34d399;
  --sidebar-w: 290px;
  --graph-w: 420px;
}

html, body {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 13.5px;
  background: var(--bg);
  color: var(--text);
}

/* App Layout */
#app {
  display: grid;
  grid-template-rows: 50px 1fr;
  grid-template-columns: var(--sidebar-w) 1fr var(--graph-w);
  height: 100vh;
  transition: grid-template-columns 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}
#app.graph-hidden {
  grid-template-columns: var(--sidebar-w) 1fr 0px;
}

/* Header */
#header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  z-index: 50;
}
#logo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.02em;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}
#logo span { color: var(--accent); }
#logo .badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--accent-glow);
  color: var(--accent-hover);
  border-radius: 6px;
  border: 1px solid rgba(99, 102, 241, 0.3);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

#stats { display: flex; gap: 8px; margin-left: 8px; }
.stat-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.stat-pill.ok { background: var(--ok-dim); color: var(--ok); border: 1px solid rgba(16, 185, 129, 0.3); }
.stat-pill.stale { background: var(--stale-dim); color: var(--stale); border: 1px solid rgba(245, 158, 11, 0.3); }
.stat-pill.missing { background: var(--missing-dim); color: var(--missing); border: 1px solid rgba(239, 68, 68, 0.3); }

#search-wrapper {
  margin-left: auto;
  position: relative;
  width: 260px;
}
#search {
  width: 100%;
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 6px 12px 6px 30px;
  font-size: 13px;
  outline: none;
  transition: all 0.15s;
}
#search:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
  font-size: 12px;
}

.header-btn {
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.header-btn:hover { background: var(--bg-surface-hover); border-color: var(--accent); }
.header-btn.active { background: var(--accent); color: #fff; border-color: var(--accent-hover); }
.header-btn.auth-btn { font-size: 11.5px; }

/* Sidebar Tabs */
#sidebar {
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.sidebar-tab {
  flex: 1;
  padding: 9px 8px;
  text-align: center;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.sidebar-tab:hover { color: var(--text); }
.sidebar-tab.active {
  color: var(--accent-hover);
  border-bottom-color: var(--accent);
  background: var(--bg-surface);
}

.sidebar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface-2);
  font-size: 11px;
  color: var(--text-muted);
}
.sidebar-toolbar-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 5px;
  border-radius: 4px;
}
.sidebar-toolbar-btn:hover { color: var(--text); background: var(--bg-surface-hover); }

.tree-view-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 4px;
}
.tree-view-container::-webkit-scrollbar { width: 5px; }
.tree-view-container::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

/* Tree Nodes */
.tree-node {
  margin: 1px 0;
  font-size: 12.5px;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
  position: relative;
}
.tree-row:hover { background: var(--bg-surface-hover); }
.tree-row.active { background: var(--bg-surface-2); color: var(--accent-hover); font-weight: 600; }
.tree-toggle {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--text-muted);
  cursor: pointer;
}
.tree-icon { font-size: 12px; opacity: 0.8; }
.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}
.tree-badge.ok { color: var(--ok); background: var(--ok-dim); }
.tree-badge.stale { color: var(--stale); background: var(--stale-dim); }
.tree-badge.missing { color: var(--missing); background: var(--missing-dim); }
.tree-badge.dim { color: var(--text-muted); background: var(--bg-surface-2); }
.tree-children { padding-left: 14px; }
.tree-children.collapsed { display: none; }

/* Content Panel */
#content-panel {
  overflow-y: auto;
  position: relative;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}
#content-panel::-webkit-scrollbar { width: 7px; }
#content-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

#doc-header {
  padding: 20px 36px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.doc-breadcrumbs {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-bottom: 6px;
  font-family: ui-monospace, monospace;
}
.doc-title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: 10px;
}
.doc-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.action-btn:hover { background: var(--bg-surface-hover); border-color: var(--accent); }
.action-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent-hover); }
.action-btn.primary:hover { background: var(--accent-hover); }

/* Document Body */
#doc-body {
  padding: 28px 36px;
  max-width: 900px;
  width: 100%;
}

/* Visualized Code Box */
.code-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px;
}
.code-section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}
.code-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.tool-pill {
  padding: 3px 8px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  color: var(--text-dim);
  user-select: none;
}
.tool-pill.active { background: var(--accent-glow); color: var(--accent-hover); border-color: var(--accent); }

.code-viewer-container {
  position: relative;
  margin-bottom: 24px;
}
.code-viewer {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  line-height: 1.65;
  padding: 16px;
}
.code-viewer code { background: none; padding: 0; }

/* Interactive Code Tokens */
.code-link {
  position: relative;
  color: var(--calls);
  text-decoration: underline;
  text-decoration-color: rgba(56, 189, 248, 0.4);
  text-underline-offset: 3px;
  cursor: pointer;
  padding: 0 2px;
  border-radius: 3px;
  transition: all 0.15s;
  font-weight: 500;
}
.code-link:hover {
  background: rgba(56, 189, 248, 0.2);
  color: #fff;
  text-decoration-color: var(--calls);
}
.code-link.kind-imports { color: var(--imports); text-decoration-color: rgba(251, 146, 60, 0.4); }
.code-link.kind-imports:hover { background: rgba(251, 146, 60, 0.2); }
.code-link.kind-extends { color: var(--extends); text-decoration-color: rgba(192, 132, 252, 0.4); }
.code-link.kind-extends:hover { background: rgba(192, 132, 252, 0.2); }

/* SVG Thread Layer */
#thread-svg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 40;
}
.thread-line {
  fill: none;
  stroke-width: 1.5px;
  stroke-linecap: round;
  transition: opacity 0.2s, stroke-width 0.2s;
}
.thread-line.active {
  stroke-width: 2.5px;
  filter: drop-shadow(0 0 6px var(--accent-hover));
}

/* Hover Tooltip */
#hover-card {
  position: fixed;
  display: none;
  background: rgba(18, 23, 34, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  z-index: 100;
  pointer-events: none;
  max-width: 320px;
}
#hover-card .hc-title { font-weight: 700; color: #fff; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
#hover-card .hc-path { font-family: ui-monospace, monospace; color: var(--text-dim); font-size: 11px; }
#hover-card .hc-why { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); font-style: italic; color: var(--text-muted); }

/* Pending Diff Block */
.diff-alert-box {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 10px;
  padding: 16px;
  margin: 16px 0 24px;
}
.diff-alert-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--stale);
  margin-bottom: 10px;
  font-size: 13.5px;
}
.diff-pre {
  background: #090c10 !important;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  overflow-x: auto;
  font-family: ui-monospace, monospace;
}
.diff-line-add { color: var(--ok); }
.diff-line-del { color: var(--missing); }

/* Connections Table */
.connections-section { margin: 24px 0; }
.connections-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 12.5px;
}
.connections-table th {
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
  color: var(--text-dim);
  font-weight: 600;
}
.connections-table td {
  border: 1px solid var(--border);
  padding: 8px 12px;
}

/* Notes & Markdown Editor */
.notes-container {
  margin-top: 28px;
  border-top: 1px solid var(--border);
  padding-top: 20px;
}
.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.notes-title { font-size: 16px; font-weight: 700; color: #fff; }

.editor-box {
  display: none;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}
.editor-textarea {
  width: 100%;
  min-height: 180px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13.5px;
  line-height: 1.6;
  outline: none;
  resize: vertical;
}
.editor-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.editor-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Right Graph Panel */
#graph-panel {
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
#graph-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg);
}
.graph-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.graph-view-switch {
  display: flex;
  background: var(--bg-surface-2);
  border-radius: 6px;
  padding: 2px;
  border: 1px solid var(--border);
}
.switch-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}
.switch-btn.active { background: var(--accent); color: #fff; }

#graph-svg-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}
#graph-svg {
  width: 100%;
  height: 100%;
}

/* Connected Files List View */
#connected-list-container {
  display: none;
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.conn-item {
  padding: 10px 12px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.conn-item:hover { background: var(--bg-surface-hover); border-color: var(--accent); }
.conn-item-title { font-weight: 600; font-size: 13px; color: #fff; display: flex; align-items: center; justify-content: space-between; }
.conn-item-path { font-size: 11px; color: var(--text-muted); font-family: ui-monospace, monospace; margin-top: 2px; }
.conn-item-meta { font-size: 11px; color: var(--text-dim); margin-top: 6px; display: flex; gap: 10px; }

#graph-footer {
  padding: 10px 14px;
  font-size: 11.5px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  background: var(--bg);
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Auth Modal */
#auth-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.auth-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 360px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}
.auth-title { font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 8px; }
.auth-desc { font-size: 12.5px; color: var(--text-dim); margin-bottom: 18px; line-height: 1.5; }
.auth-input {
  width: 100%;
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text);
  font-size: 14px;
  outline: none;
  margin-bottom: 16px;
}
.auth-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.auth-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Empty state */
#empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  text-align: center;
  gap: 12px;
}
#empty-state .empty-icon { font-size: 40px; }
</style>
</head>
<body>

<!-- Thread Lines SVG overlay -->
<svg id="thread-svg"></svg>

<!-- Hover Tooltip Card -->
<div id="hover-card"></div>

<!-- Auth Modal -->
<div id="auth-modal">
  <div class="auth-card">
    <div class="auth-title">Unlock Web UI Editing</div>
    <div class="auth-desc">Enter your project access code to edit documentation and notes. (Configured in <code>.syndocs/auth.json</code>)</div>
    <input type="password" id="auth-code-input" class="auth-input" placeholder="Access code..." autofocus>
    <div class="auth-actions">
      <button class="action-btn" id="auth-cancel-btn">Cancel</button>
      <button class="action-btn primary" id="auth-submit-btn">Unlock</button>
    </div>
  </div>
</div>

<div id="app">
  <!-- Header -->
  <header id="header">
    <div id="logo" onclick="openHome()">
      <span>⚡ Syn</span>Docs <span class="badge">Studio</span>
    </div>
    <div id="stats"></div>

    <div id="search-wrapper">
      <span class="search-icon">🔍</span>
      <input id="search" type="text" placeholder="Search docs & code..." autocomplete="off">
    </div>

    <button id="auth-toggle-btn" class="header-btn auth-btn">
      <span id="auth-status-icon">🔒</span> <span id="auth-status-text">Read Only</span>
    </button>
    <button id="toggle-graph" class="header-btn">◫ Graph</button>
  </header>

  <!-- Left Sidebar -->
  <nav id="sidebar">
    <div class="sidebar-tabs">
      <div class="sidebar-tab active" id="tab-docs" onclick="switchSidebarTab('docs')">
        <span>📄</span> Docs Tree
      </div>
      <div class="sidebar-tab" id="tab-codebase" onclick="switchSidebarTab('codebase')">
        <span>💻</span> Codebase Tree
      </div>
    </div>
    <div class="sidebar-toolbar">
      <span id="tree-counter">Loading...</span>
      <div>
        <button class="sidebar-toolbar-btn" onclick="expandAllTree()">Expand</button>
        <button class="sidebar-toolbar-btn" onclick="collapseAllTree()">Collapse</button>
      </div>
    </div>
    <div class="tree-view-container" id="tree-view"></div>
  </nav>

  <!-- Center Content Panel -->
  <main id="content-panel">
    <div id="doc-header" style="display:none;">
      <div>
        <div class="doc-breadcrumbs" id="doc-path"></div>
        <div class="doc-title">
          <span id="doc-title-text"></span>
          <span id="doc-status-badge"></span>
        </div>
      </div>
      <div class="doc-actions">
        <button id="edit-notes-btn" class="action-btn primary" onclick="toggleEditNotes()">
          ✏️ Edit Notes
        </button>
      </div>
    </div>

    <div id="doc-body">
      <div id="empty-state">
        <div class="empty-icon">📚</div>
        <div style="font-size:16px; font-weight:600; color:#fff;">SynDocs Interactive Studio</div>
        <div>Select a document from the left sidebar or click any node in the graph to begin.</div>
      </div>
      <div id="doc-content" style="display:none;"></div>
    </div>
  </main>

  <!-- Right Graph Panel -->
  <aside id="graph-panel">
    <div id="graph-header">
      <div class="graph-title">CODEBASE GRAPH</div>
      <div class="graph-view-switch">
        <button class="switch-btn active" id="btn-view-canvas" onclick="setGraphView('canvas')">🕸️ Graph</button>
        <button class="switch-btn" id="btn-view-list" onclick="setGraphView('list')">📋 Connected</button>
      </div>
    </div>

    <div id="graph-svg-container">
      <svg id="graph-svg"></svg>
    </div>

    <div id="connected-list-container"></div>

    <div id="graph-footer">
      <span id="graph-info">Hover node to inspect · drag to rearrange</span>
      <span id="graph-cg-badge" style="font-size:10.5px; opacity:0.7;"></span>
    </div>
  </aside>
</div>

<script>
// Data injected by server
const DATA = __SYNDOCS_DATA__;

// Global State
let currentDocId = null;
let currentSidebarTab = 'docs';
let currentGraphView = 'canvas';
let isEditingNotes = false;
let authToken = localStorage.getItem('syndocs_auth_token') || null;
let threadMode = 'hover'; // 'always' | 'hover' | 'off'
let highlightKeywords = true;

// D3 simulation variables
let simulation = null;
let svgG = null;
let nodeCircles = null;
let linkLines = null;

document.addEventListener('DOMContentLoaded', () => {
  renderStats();
  renderSidebar();
  buildGraph();
  setupSearch();
  setupSSE();
  checkAuthStatus();
  setupAuthModal();
  setupWindowResize();
});

// ─── Authentication ─────────────────────────────────────────────────────────

function checkAuthStatus() {
  const icon = document.getElementById('auth-status-icon');
  const text = document.getElementById('auth-status-text');

  if (authToken) {
    fetch('/api/auth/status', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    })
    .then(r => r.json())
    .then(res => {
      if (res.authenticated) {
        icon.textContent = '🔓';
        text.textContent = 'Edit Mode';
      } else {
        authToken = null;
        localStorage.removeItem('syndocs_auth_token');
        icon.textContent = '🔒';
        text.textContent = 'Read Only';
      }
    })
    .catch(() => {});
  } else {
    icon.textContent = '🔒';
    text.textContent = 'Read Only';
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
      input.focus();
    }
  });

  cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });

  submitBtn.addEventListener('click', doLogin);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

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
        alert(res.error || 'Invalid access code');
      }
    })
    .catch(err => alert('Login error: ' + err.message));
  }
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────

function renderStats() {
  const ok = DATA.nodes.filter(n => n.status === 'ok').length;
  const stale = DATA.nodes.filter(n => n.status === 'stale').length;
  const missing = DATA.nodes.filter(n => n.status === 'missing').length;
  const el = document.getElementById('stats');

  el.innerHTML = [
    \`<span class="stat-pill ok">✓ \${ok} ok</span>\`,
    stale ? \`<span class="stat-pill stale">~ \${stale} stale</span>\` : '',
    missing ? \`<span class="stat-pill missing">! \${missing} missing</span>\` : ''
  ].join('');

  document.getElementById('graph-cg-badge').textContent = DATA.hasCodeGraph ? '⚡ CodeGraph Active' : 'Fallback Mode';
}

// ─── Left Sidebar Tabs & Trees ─────────────────────────────────────────────

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
  document.getElementById('tree-counter').textContent = \`\${totalCount} \${currentSidebarTab === 'docs' ? 'docs' : 'files'}\`;

  const domTree = buildDomTree(treeData, filter);
  container.appendChild(domTree);
}

function countLeaves(node) {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((acc, c) => acc + countLeaves(c), 0);
}

function buildDomTree(node, filter = '') {
  const el = document.createElement('div');
  el.className = 'tree-node';

  const hasChildren = Boolean(node.children && node.children.length > 0);
  const row = document.createElement('div');
  row.className = 'tree-row' + (currentDocId === node.path ? ' active' : '');

  // Filter check
  if (filter && !nodeMatchesFilter(node, filter)) {
    el.style.display = 'none';
  }

  let childrenContainer: HTMLDivElement | null = null;
  if (hasChildren) {
    childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
  }

  if (hasChildren) {
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▼';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (childrenContainer) {
        const isCollapsed = childrenContainer.classList.toggle('collapsed');
        toggle.textContent = isCollapsed ? '▶' : '▼';
      }
    });
    row.appendChild(toggle);
  } else {
    const spacer = document.createElement('span');
    spacer.style.width = '14px';
    row.appendChild(spacer);
  }

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.textContent = node.type === 'microdoc' ? '🏷️' : node.type === 'guide' ? '📖' : node.type === 'doc' ? '📄' : '📁';
  row.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.targetLabel ? '#' + node.targetLabel : node.name;
  label.title = node.path;
  row.appendChild(label);

  if (node.status && node.status !== 'none') {
    const badge = document.createElement('span');
    badge.className = 'tree-badge ' + node.status;
    badge.textContent = node.status;
    row.appendChild(badge);
  }

  if (node.type === 'dir') {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (childrenContainer) {
        const isCollapsed = childrenContainer.classList.toggle('collapsed');
        const toggle = row.querySelector('.tree-toggle');
        if (toggle) toggle.textContent = isCollapsed ? '▶' : '▼';
      }
    });
  } else {
    row.addEventListener('click', () => openDoc(node.path));
  }

  el.appendChild(row);

  if (hasChildren && childrenContainer && node.children) {
    for (const child of node.children) {
      childrenContainer.appendChild(buildDomTree(child, filter));
    }
    el.appendChild(childrenContainer);
  }

  return el;
}

function nodeMatchesFilter(node, filter) {
  const term = filter.toLowerCase();
  if (node.name.toLowerCase().includes(term) || (node.path && node.path.toLowerCase().includes(term))) {
    return true;
  }
  if (node.children) {
    return node.children.some(c => nodeMatchesFilter(c, filter));
  }
  return false;
}

function expandAllTree() {
  document.querySelectorAll('.tree-children').forEach(c => c.classList.remove('collapsed'));
  document.querySelectorAll('.tree-toggle').forEach(t => t.textContent = '▼');
}

function collapseAllTree() {
  document.querySelectorAll('.tree-children').forEach(c => c.classList.add('collapsed'));
  document.querySelectorAll('.tree-toggle').forEach(t => t.textContent = '▶');
}

// ─── Document Viewing & Code Keywords ──────────────────────────────────────

function openDoc(id) {
  currentDocId = id;
  const doc = DATA.docs[id];

  // Update active sidebar item
  document.querySelectorAll('.tree-row').forEach(r => r.classList.remove('active'));
  document.querySelectorAll('.tree-row').forEach(r => {
    if (r.querySelector('.tree-label')?.title === id) r.classList.add('active');
  });

  // Highlight corresponding graph node
  highlightGraphNode(id);
  updateConnectedList(id);

  if (!doc) {
    document.getElementById('doc-header').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    document.getElementById('doc-content').style.display = 'none';
    clearThreads();
    return;
  }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('doc-header').style.display = 'flex';
  document.getElementById('doc-content').style.display = 'block';

  document.getElementById('doc-path').textContent = doc.sourceFile;
  document.getElementById('doc-title-text').textContent = doc.title;

  const badge = document.getElementById('doc-status-badge');
  badge.className = 'tree-badge ' + doc.status;
  badge.textContent = doc.status === 'ok' ? '✓ in sync' : doc.status === 'stale' ? '~ stale' : doc.status;

  renderDocContent(doc, id);
}

function renderDocContent(doc, id) {
  const container = document.getElementById('doc-content');
  container.innerHTML = '';

  // 1. Interactive Visualized Code Block (if code exists)
  if (doc.codeCopy) {
    const codeHeader = document.createElement('div');
    codeHeader.className = 'code-section-header';
    codeHeader.innerHTML = \`
      <div class="code-section-title">Visualized Source Code (\${doc.codeLanguage || 'code'})</div>
      <div class="code-tools">
        <span class="tool-pill \${threadMode !== 'off' ? 'active' : ''}" onclick="cycleThreadMode(this)">⚡ Threads: \${threadMode}</span>
        <span class="tool-pill \${highlightKeywords ? 'active' : ''}" onclick="toggleHighlightKeywords(this)">💡 Highlights</span>
      </div>
    \`;
    container.appendChild(codeHeader);

    const viewerBox = document.createElement('div');
    viewerBox.className = 'code-viewer-container';

    const pre = document.createElement('pre');
    pre.className = 'code-viewer';
    const codeEl = document.createElement('code');

    // Tokenize and build interactive keyword anchors
    codeEl.innerHTML = buildInteractiveCodeHtml(doc.codeCopy, doc.tokens || []);
    pre.appendChild(codeEl);
    viewerBox.appendChild(pre);
    container.appendChild(viewerBox);

    // Attach hover listeners for tooltips and threads
    attachTokenListeners(codeEl, id);
  }

  // 2. Pending diff (if stale)
  const diffMatch = doc.content.match(/<!-- syndocs-pending-start -->([\\s\\S]*?)<!-- syndocs-pending-end -->/);
  if (diffMatch) {
    const diffBox = document.createElement('div');
    diffBox.className = 'diff-alert-box';
    diffBox.innerHTML = \`
      <div class="diff-alert-title">⚠ Code drift detected (pending update)</div>
      <pre class="diff-pre">\${formatDiffLines(diffMatch[1])}</pre>
    \`;
    container.appendChild(diffBox);
  }

  // 3. Connections Table
  const connections = extractConnections(doc.content);
  if (connections.length > 0) {
    const connSection = document.createElement('div');
    connSection.className = 'connections-section';
    connSection.innerHTML = renderConnectionTable(connections);
    container.appendChild(connSection);
  }

  // 4. Notes & Editor Section
  const notesContainer = document.createElement('div');
  notesContainer.className = 'notes-container';

  const notesHeader = document.createElement('div');
  notesHeader.className = 'notes-header';
  notesHeader.innerHTML = \`
    <div class="notes-title">Documentation & Notes</div>
    <button class="action-btn" id="edit-notes-toggle-btn" onclick="toggleEditNotes()">✏️ Edit</button>
  \`;
  notesContainer.appendChild(notesHeader);

  // Notes view (markdown rendered)
  const notesView = document.createElement('div');
  notesView.id = 'notes-view';
  notesView.className = 'markdown-rendered';
  const rawNotes = doc.notes && doc.notes.trim() ? doc.notes : '> _No custom notes added yet._';
  notesView.innerHTML = marked.parse(rawNotes);
  notesContainer.appendChild(notesView);

  // Notes editor (hidden by default)
  const editorBox = document.createElement('div');
  editorBox.id = 'notes-editor-box';
  editorBox.className = 'editor-box';
  editorBox.innerHTML = \`
    <textarea id="notes-textarea" class="editor-textarea" placeholder="Write documentation notes in markdown...">\${doc.notes || ''}</textarea>
    <div class="editor-buttons">
      <button class="action-btn primary" onclick="saveNotes()">💾 Save Notes</button>
      <button class="action-btn" onclick="toggleEditNotes()">Cancel</button>
      <span id="save-indicator" style="font-size:12px; color:var(--text-muted); margin-left:8px;"></span>
    </div>
  \`;
  notesContainer.appendChild(editorBox);

  container.appendChild(notesContainer);

  // Setup threads if mode is 'always'
  setTimeout(() => {
    if (threadMode === 'always') drawThreadsForDocument();
    else clearThreads();
  }, 100);
}

function formatDiffLines(raw) {
  const tripleTick = String.fromCharCode(96, 96, 96);
  return raw.split('\\n')
    .filter(l => !l.startsWith(tripleTick) && !l.startsWith('<!--') && !l.startsWith('##'))
    .map(l => {
      if (l.startsWith('+')) return \`<span class="diff-line-add">\${escapeHtml(l)}</span>\`;
      if (l.startsWith('-')) return \`<span class="diff-line-del">\${escapeHtml(l)}</span>\`;
      return escapeHtml(l);
    }).join('\\n');
}

function buildInteractiveCodeHtml(code, tokens) {
  const lines = code.split('\\n');
  const tokenMap = new Map();

  for (const t of tokens) {
    const key = t.line;
    if (!tokenMap.has(key)) tokenMap.set(key, []);
    tokenMap.get(key).push(t);
  }

  const resultLines = lines.map((lineText, idx) => {
    const lineNum = idx + 1;
    const lineTokens = tokenMap.get(lineNum) || [];
    let processed = escapeHtml(lineText);

    if (highlightKeywords && lineTokens.length > 0) {
      for (const tok of lineTokens) {
        const regex = new RegExp(\`\\\\b(\${escapeRegex(tok.name)})\\\\b\`, 'g');
        processed = processed.replace(regex, (match) => {
          return \`<span class="code-link kind-\${tok.kind}" data-target="\${escapeHtml(tok.targetFile)}" data-name="\${escapeHtml(tok.name)}" data-kind="\${tok.kind}" data-line="\${lineNum}">\${match}</span>\`;
        });
      }
    }
    return processed;
  });

  return resultLines.join('\\n');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeRegex(s) {
  return s.replace(/[.*+?^$\\{\\}()|[\\]\\\\\\/]/g, '\\\\$&');
}

// ─── Dynamic Link Threads Visualization ────────────────────────────────────

function cycleThreadMode(btn) {
  if (threadMode === 'hover') threadMode = 'always';
  else if (threadMode === 'always') threadMode = 'off';
  else threadMode = 'hover';

  btn.textContent = \`⚡ Threads: \${threadMode}\`;
  btn.classList.toggle('active', threadMode !== 'off');

  if (threadMode === 'always') drawThreadsForDocument();
  else clearThreads();
}

function toggleHighlightKeywords(btn) {
  highlightKeywords = !highlightKeywords;
  btn.classList.toggle('active', highlightKeywords);
  if (currentDocId && DATA.docs[currentDocId]) {
    renderDocContent(DATA.docs[currentDocId], currentDocId);
  }
}

function attachTokenListeners(codeEl, currentId) {
  const hoverCard = document.getElementById('hover-card');

  codeEl.querySelectorAll('.code-link').forEach(span => {
    const targetFile = span.dataset.target;
    const symbolName = span.dataset.name;
    const kind = span.dataset.kind;
    const line = span.dataset.line;

    span.addEventListener('mouseenter', (e) => {
      // Show hover card
      hoverCard.style.display = 'block';
      hoverCard.style.left = (e.clientX + 14) + 'px';
      hoverCard.style.top = (e.clientY + 14) + 'px';
      hoverCard.innerHTML = \`
        <div class="hc-title">
          <span style="color:var(--\${kind || 'calls'})">\${kind.toUpperCase()}</span>
          \${symbolName}
        </div>
        <div class="hc-path">\${targetFile} (line \${line})</div>
        <div class="hc-why">Click to navigate to definition doc</div>
      \`;

      // Highlight target node in graph
      highlightGraphNode(targetFile);

      // Draw single thread line to graph node if not off
      if (threadMode !== 'off') {
        drawSingleThread(span, targetFile);
      }
    });

    span.addEventListener('mousemove', (e) => {
      hoverCard.style.left = (e.clientX + 14) + 'px';
      hoverCard.style.top = (e.clientY + 14) + 'px';
    });

    span.addEventListener('mouseleave', () => {
      hoverCard.style.display = 'none';
      if (threadMode === 'hover') clearThreads();
    });

    span.addEventListener('click', () => {
      openDoc(targetFile);
    });
  });
}

function clearThreads() {
  const svg = d3.select('#thread-svg');
  svg.selectAll('*').remove();
}

function drawSingleThread(spanEl, targetFileId) {
  clearThreads();
  const threadSvg = d3.select('#thread-svg');
  const spanRect = spanEl.getBoundingClientRect();

  // Find target node in graph SVG
  const nodeEl = document.querySelector(\`#graph-svg g[data-id="\${targetFileId}"] circle\`);
  if (!nodeEl) return;

  const nodeRect = nodeEl.getBoundingClientRect();

  const x1 = spanRect.right + 4;
  const y1 = spanRect.top + spanRect.height / 2;
  const x2 = nodeRect.left + nodeRect.width / 2;
  const y2 = nodeRect.top + nodeRect.height / 2;

  const dx = (x2 - x1) * 0.5;
  const pathD = \`M \${x1} \${y1} C \${x1 + dx} \${y1}, \${x2 - dx} \${y2}, \${x2} \${y2}\`;

  threadSvg.append('path')
    .attr('class', 'thread-line active')
    .attr('d', pathD)
    .attr('stroke', 'var(--accent)')
    .attr('stroke-dasharray', '4 2');
}

function drawThreadsForDocument() {
  clearThreads();
  const threadSvg = d3.select('#thread-svg');
  const spans = document.querySelectorAll('.code-link');

  spans.forEach(span => {
    const targetFile = span.dataset.target;
    const nodeEl = document.querySelector(\`#graph-svg g[data-id="\${targetFile}"] circle\`);
    if (!nodeEl) return;

    const spanRect = span.getBoundingClientRect();
    const nodeRect = nodeEl.getBoundingClientRect();

    const x1 = spanRect.right;
    const y1 = spanRect.top + spanRect.height / 2;
    const x2 = nodeRect.left + nodeRect.width / 2;
    const y2 = nodeRect.top + nodeRect.height / 2;

    const dx = (x2 - x1) * 0.5;
    const pathD = \`M \${x1} \${y1} C \${x1 + dx} \${y1}, \${x2 - dx} \${y2}, \${x2} \${y2}\`;

    threadSvg.append('path')
      .attr('class', 'thread-line')
      .attr('d', pathD)
      .attr('stroke', 'var(--accent)')
      .attr('opacity', 0.4);
  });
}

// ─── Notes Editor ──────────────────────────────────────────────────────────

function toggleEditNotes() {
  if (!authToken) {
    document.getElementById('auth-modal').style.display = 'flex';
    document.getElementById('auth-code-input').focus();
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
    btn.textContent = '👁️ Preview';
    if (subBtn) subBtn.textContent = '👁️ Preview';
  } else {
    view.style.display = 'block';
    editor.style.display = 'none';
    btn.textContent = '✏️ Edit Notes';
    if (subBtn) subBtn.textContent = '✏️ Edit';
  }
}

function saveNotes() {
  if (!authToken || !currentDocId) return;

  const textarea = document.getElementById('notes-textarea');
  const notes = textarea.value;
  const ind = document.getElementById('save-indicator');
  ind.textContent = 'Saving...';

  const doc = DATA.docs[currentDocId];
  const type = doc?.type || 'doc';

  fetch('/api/doc/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authToken
    },
    body: JSON.stringify({
      id: currentDocId,
      type: type,
      notes: notes
    })
  })
  .then(r => r.json())
  .then(res => {
    if (res.ok) {
      ind.textContent = 'Saved ✓';
      doc.notes = notes;
      document.getElementById('notes-view').innerHTML = marked.parse(notes);
      setTimeout(() => {
        ind.textContent = '';
        toggleEditNotes();
      }, 700);
    } else {
      ind.textContent = 'Error: ' + res.error;
    }
  })
  .catch(err => {
    ind.textContent = 'Save failed';
  });
}

// ─── Right Graph & Connected List ──────────────────────────────────────────

function setGraphView(view) {
  currentGraphView = view;
  document.getElementById('btn-view-canvas').classList.toggle('active', view === 'canvas');
  document.getElementById('btn-view-list').classList.toggle('active', view === 'list');

  const canvas = document.getElementById('graph-svg-container');
  const list = document.getElementById('connected-list-container');

  if (view === 'canvas') {
    canvas.style.display = 'block';
    list.style.display = 'none';
  } else {
    canvas.style.display = 'none';
    list.style.display = 'block';
    if (currentDocId) updateConnectedList(currentDocId);
  }
}

function updateConnectedList(docId) {
  const container = document.getElementById('connected-list-container');
  container.innerHTML = '';

  const connectedEdges = DATA.edges.filter(e => e.source === docId || e.target === docId);

  if (connectedEdges.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:30px;">No connected files for this document.</div>';
    return;
  }

  const map = new Map();
  for (const e of connectedEdges) {
    const otherId = e.source === docId ? e.target : e.source;
    if (!map.has(otherId)) map.set(otherId, []);
    map.get(otherId).push(e);
  }

  for (const [otherId, edges] of map.entries()) {
    const item = document.createElement('div');
    item.className = 'conn-item';
    const label = otherId.split('/').pop();

    item.innerHTML = \`
      <div class="conn-item-title">\${label} <span class="tree-badge dim">\${edges.length} link\${edges.length > 1 ? 's' : ''}</span></div>
      <div class="conn-item-path">\${otherId}</div>
      <div class="conn-item-meta">
        \${edges.map(e => \`<span style="color:var(--\${e.kind || 'calls'})">• \${e.kind}: \${e.symbol || 'sym'}</span>\`).join(' ')}
      </div>
    \`;
    item.addEventListener('click', () => openDoc(otherId));
    container.appendChild(item);
  }
}

function buildGraph() {
  const svg = d3.select('#graph-svg');
  const root = document.getElementById('graph-svg-container');
  const W = root.clientWidth || 400;
  const H = root.clientHeight || 500;

  svg.selectAll('*').remove();

  const nodeColor = d => {
    if (d.status === 'ok') return 'var(--ok)';
    if (d.status === 'stale') return 'var(--stale)';
    if (d.status === 'missing') return 'var(--missing)';
    return '#64748b';
  };

  const edgeColor = d => {
    if (d.kind === 'calls') return 'var(--calls)';
    if (d.kind === 'imports') return 'var(--imports)';
    if (d.kind === 'extends') return 'var(--extends)';
    return '#94a3b8';
  };

  const zoom = d3.zoom().scaleExtent([0.15, 5]).on('zoom', e => svgG.attr('transform', e.transform));
  svg.call(zoom);

  svgG = svg.append('g');

  // Filter nodes & links
  const nodeMap = new Map(DATA.nodes.map(n => [n.id, { ...n }]));
  const links = DATA.edges
    .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map(e => ({ ...e }));
  const nodes = Array.from(nodeMap.values());

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(0.3))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide().radius(18));

  linkLines = svgG.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', d => edgeColor(d))
    .attr('stroke-width', 1.2)
    .attr('stroke-opacity', 0.45);

  const nodeGroup = svgG.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('data-id', d => d.id)
    .attr('cursor', 'pointer')
    .on('click', (e, d) => openDoc(d.id))
    .on('mouseover', (e, d) => {
      document.getElementById('graph-info').textContent = \`\${d.id} (\${d.status})\`;
    })
    .on('mouseout', () => {
      document.getElementById('graph-info').textContent = 'Hover node to inspect · drag to rearrange';
    })
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

  // Glow ring for selected
  nodeGroup.append('circle')
    .attr('class', 'selection-ring')
    .attr('r', 14)
    .attr('fill', 'none')
    .attr('stroke', 'var(--accent)')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0);

  // Core circle
  nodeGroup.append('circle')
    .attr('r', 7)
    .attr('fill', d => nodeColor(d))
    .attr('fill-opacity', 0.9);

  // Label
  nodeGroup.append('text')
    .attr('dy', 16)
    .attr('text-anchor', 'middle')
    .attr('font-size', 9.5)
    .attr('fill', 'var(--text-dim)')
    .attr('pointer-events', 'none')
    .text(d => d.label);

  simulation.on('tick', () => {
    linkLines
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    nodeGroup.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
  });
}

function highlightGraphNode(id) {
  if (!svgG) return;
  svgG.selectAll('g[data-id]').each(function(d) {
    const isSelected = d.id === id;
    d3.select(this).select('.selection-ring')
      .transition().duration(200)
      .attr('stroke-opacity', isSelected ? 1 : 0);
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractConnections(content) {
  const m = content.match(/<!-- syndocs-graph-start -->([\\s\\S]*?)<!-- syndocs-graph-end -->/);
  if (!m) return [];

  const rows = [];
  for (const l of m[1].split('\\n')) {
    if (!l.startsWith('|') || l.includes('Line') || l.includes('---')) continue;
    const cells = l.split('|').filter(Boolean).map(s => s.trim());
    if (cells.length >= 4 && cells[0] !== '') {
      rows.push({ line: cells[0], symbol: cells[1], linksTo: cells[2], edge: cells[3], why: cells[4] || '' });
    }
  }
  return rows;
}

function renderConnectionTable(rows) {
  return \`
    <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:8px;">Connections & References</div>
    <table class="connections-table">
      <thead><tr><th>Line</th><th>Symbol</th><th>Target File</th><th>Edge</th><th>Why</th></tr></thead>
      <tbody>
        \${rows.map(r => \`
          <tr>
            <td style="font-family:ui-monospace; color:var(--text-dim);">\${r.line}</td>
            <td><code>\${r.symbol.replaceAll(String.fromCharCode(96), '')}</code></td>
            <td>\${r.linksTo}</td>
            <td><span class="tree-badge dim">\${r.edge}</span></td>
            <td style="font-style:italic; color:var(--text-muted);">\${r.why || '—'}</td>
          </tr>
        \`).join('')}
      </tbody>
    </table>
  \`;
}

function setupSearch() {
  document.getElementById('search').addEventListener('input', (e) => {
    renderSidebar(e.target.value.trim());
  });
}

function setupWindowResize() {
  window.addEventListener('resize', () => {
    if (currentGraphView === 'canvas') buildGraph();
    if (threadMode === 'always') drawThreadsForDocument();
  });
}

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
      });
  });
}

function openHome() {
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('doc-header').style.display = 'none';
  document.getElementById('doc-content').style.display = 'none';
  clearThreads();
}
</script>
</body>
</html>`;
