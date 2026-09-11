// @syndocs
/**
 * SynDocs Web Studio HTML Template
 * Features:
 * - Dual-tab sidebar: Docs Tree & Codebase Tree with collapse/expand & stats
 * - Interactive Code Keyword Anchors with live rAF-tracked SVG thread connections
 * - Syntax highlighting (hljs) with overlaid glowing thread-link spans
 * - Notion-style microdoc annotation cards with inline hover popovers
 * - D3 Force-Directed graph with curved links, hub sizing, smooth simulation
 * - Connected Files List with thread-to-list-item visualization
 * - Rich markdown typography via custom marked renderer + hljs fences
 * - 6 themes with localStorage persistence
 * - Password-protected Notes Editor with live Markdown preview
 */

export const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en" data-theme="midnight">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SynDocs — Code-Synced Documentation Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.0/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ─── Theme Variables ─────────────────────────────────────────────────────── */
:root,
[data-theme="midnight"] {
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
  --accent-2: #8b5cf6;
  --accent-hover: #818cf8;
  --accent-glow: rgba(99, 102, 241, 0.2);
  --accent-glow-strong: rgba(99, 102, 241, 0.35);
  --ok: #10b981;
  --ok-dim: rgba(16, 185, 129, 0.12);
  --stale: #f59e0b;
  --stale-dim: rgba(245, 158, 11, 0.12);
  --missing: #ef4444;
  --missing-dim: rgba(239, 68, 68, 0.12);
  --calls: #38bdf8;
  --imports: #fb923c;
  --extends: #c084fc;
  --references: #34d399;
  --thread-color: rgba(99, 102, 241, 0.7);
  --thread-active: rgba(129, 140, 248, 1);
  --sidebar-w: 290px;
  --graph-w: 400px;
  --header-h: 50px;
  --radius: 10px;
  --shadow: 0 8px 32px rgba(0,0,0,0.5);
}

[data-theme="obsidian"] {
  --bg: #0d0d0d;
  --bg-surface: #161616;
  --bg-surface-2: #1e1e1e;
  --bg-surface-hover: #252525;
  --border: #2a2a2a;
  --border-focus: #a855f7;
  --text: #f0f0f0;
  --text-dim: #a0a0a0;
  --text-muted: #606060;
  --accent: #a855f7;
  --accent-2: #7c3aed;
  --accent-hover: #c084fc;
  --accent-glow: rgba(168, 85, 247, 0.18);
  --accent-glow-strong: rgba(168, 85, 247, 0.35);
  --thread-color: rgba(168, 85, 247, 0.7);
  --thread-active: rgba(192, 132, 252, 1);
}

[data-theme="nord"] {
  --bg: #1a1f2e;
  --bg-surface: #1e2435;
  --bg-surface-2: #242b3d;
  --bg-surface-hover: #2e3750;
  --border: #3b4566;
  --border-focus: #81a1c1;
  --text: #eceff4;
  --text-dim: #d8dee9;
  --text-muted: #8892a4;
  --accent: #81a1c1;
  --accent-2: #5e81ac;
  --accent-hover: #88c0d0;
  --accent-glow: rgba(129, 161, 193, 0.18);
  --accent-glow-strong: rgba(136, 192, 208, 0.35);
  --thread-color: rgba(129, 161, 193, 0.7);
  --thread-active: rgba(136, 192, 208, 1);
}

[data-theme="solarized"] {
  --bg: #001f27;
  --bg-surface: #002b36;
  --bg-surface-2: #073642;
  --bg-surface-hover: #0d4355;
  --border: #1a5260;
  --border-focus: #cb4b16;
  --text: #fdf6e3;
  --text-dim: #eee8d5;
  --text-muted: #93a1a1;
  --accent: #cb4b16;
  --accent-2: #dc322f;
  --accent-hover: #d87f3c;
  --accent-glow: rgba(203, 75, 22, 0.2);
  --accent-glow-strong: rgba(203, 75, 22, 0.38);
  --thread-color: rgba(203, 75, 22, 0.7);
  --thread-active: rgba(216, 127, 60, 1);
}

[data-theme="catppuccin"] {
  --bg: #1e1e2e;
  --bg-surface: #24273a;
  --bg-surface-2: #2a2d3e;
  --bg-surface-hover: #363a52;
  --border: #363849;
  --border-focus: #cba6f7;
  --text: #cdd6f4;
  --text-dim: #bac2de;
  --text-muted: #7f849c;
  --accent: #cba6f7;
  --accent-2: #b4befe;
  --accent-hover: #d5b3ff;
  --accent-glow: rgba(203, 166, 247, 0.18);
  --accent-glow-strong: rgba(203, 166, 247, 0.35);
  --thread-color: rgba(203, 166, 247, 0.7);
  --thread-active: rgba(213, 179, 255, 1);
}

[data-theme="light"] {
  --bg: #f8fafc;
  --bg-surface: #ffffff;
  --bg-surface-2: #f1f5f9;
  --bg-surface-hover: #e2e8f0;
  --border: #cbd5e1;
  --border-focus: #6366f1;
  --text: #0f172a;
  --text-dim: #334155;
  --text-muted: #64748b;
  --accent: #6366f1;
  --accent-2: #4f46e5;
  --accent-hover: #4f46e5;
  --accent-glow: rgba(99, 102, 241, 0.15);
  --accent-glow-strong: rgba(99, 102, 241, 0.28);
  --ok: #059669;
  --ok-dim: rgba(5, 150, 105, 0.1);
  --stale: #d97706;
  --stale-dim: rgba(217, 119, 6, 0.1);
  --missing: #dc2626;
  --missing-dim: rgba(220, 38, 38, 0.1);
  --thread-color: rgba(99, 102, 241, 0.6);
  --thread-active: rgba(79, 70, 229, 1);
  --shadow: 0 8px 32px rgba(0,0,0,0.12);
}

/* ─── Base ─────────────────────────────────────────────────────────────────── */
html, body {
  height: 100%;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13.5px;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

/* ─── App Layout ───────────────────────────────────────────────────────────── */
#app {
  display: grid;
  grid-template-rows: var(--header-h) 1fr;
  grid-template-columns: var(--sidebar-w) 1fr var(--graph-w);
  height: 100vh;
  transition: grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}
#app.graph-hidden {
  grid-template-columns: var(--sidebar-w) 1fr 0px;
}
#app.sidebar-hidden {
  grid-template-columns: 0px 1fr var(--graph-w);
}

/* ─── Header ───────────────────────────────────────────────────────────────── */
#header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  z-index: 50;
  backdrop-filter: blur(8px);
}
#logo {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.03em;
  color: var(--text);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
#logo .spark { color: var(--accent); }
#logo .badge {
  font-size: 9.5px;
  padding: 2px 6px;
  background: var(--accent-glow);
  color: var(--accent-hover);
  border-radius: 6px;
  border: 1px solid var(--accent-glow-strong);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

#stats { display: flex; gap: 6px; margin-left: 4px; }
.stat-pill {
  font-size: 10.5px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.stat-pill.ok { background: var(--ok-dim); color: var(--ok); border: 1px solid rgba(16, 185, 129, 0.25); }
.stat-pill.stale { background: var(--stale-dim); color: var(--stale); border: 1px solid rgba(245, 158, 11, 0.25); }
.stat-pill.missing { background: var(--missing-dim); color: var(--missing); border: 1px solid rgba(239, 68, 68, 0.25); }

#search-wrapper {
  margin-left: auto;
  position: relative;
  width: 230px;
}
#search {
  width: 100%;
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 6px 12px 6px 30px;
  font-size: 12.5px;
  outline: none;
  transition: all 0.15s;
  font-family: inherit;
}
#search:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
  font-size: 11px;
}

.header-btn {
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-dim);
  padding: 5px 11px;
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.header-btn:hover { background: var(--bg-surface-hover); border-color: var(--accent); color: var(--text); }
.header-btn.active { background: var(--accent); color: #fff; border-color: var(--accent-hover); }

/* Theme picker */
#theme-picker-wrapper { position: relative; }
#theme-dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px;
  box-shadow: var(--shadow);
  z-index: 200;
  min-width: 200px;
  gap: 4px;
  flex-direction: column;
}
#theme-dropdown.open { display: flex; }
.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 12.5px;
  transition: background 0.12s;
  color: var(--text-dim);
  border: 1px solid transparent;
}
.theme-option:hover { background: var(--bg-surface-hover); color: var(--text); }
.theme-option.active { background: var(--accent-glow); color: var(--accent-hover); border-color: var(--accent-glow-strong); }
.theme-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.15);
}

/* ─── Sidebar ──────────────────────────────────────────────────────────────── */
#sidebar {
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.25s;
}
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
}
.sidebar-tab {
  flex: 1;
  padding: 9px 6px;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  letter-spacing: 0.01em;
}
.sidebar-tab:hover { color: var(--text); }
.sidebar-tab.active { color: var(--accent-hover); border-bottom-color: var(--accent); background: var(--bg-surface); }

.sidebar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface-2);
  font-size: 10.5px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.sidebar-toolbar-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: inherit;
}
.sidebar-toolbar-btn:hover { color: var(--text); background: var(--bg-surface-hover); }

.tree-view-container {
  flex: 1;
  overflow-y: auto;
  padding: 6px 3px;
}
.tree-view-container::-webkit-scrollbar { width: 4px; }
.tree-view-container::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

/* ─── Tree Nodes ───────────────────────────────────────────────────────────── */
.tree-node { margin: 1px 0; font-size: 12px; }
.tree-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
  position: relative;
}
.tree-row:hover { background: var(--bg-surface-hover); }
.tree-row.active {
  background: var(--accent-glow);
  color: var(--accent-hover);
  font-weight: 600;
}
.tree-toggle {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}
.tree-icon { font-size: 11px; opacity: 0.8; flex-shrink: 0; }
.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-badge {
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
  flex-shrink: 0;
}
.tree-badge.ok { color: var(--ok); background: var(--ok-dim); }
.tree-badge.stale { color: var(--stale); background: var(--stale-dim); }
.tree-badge.missing { color: var(--missing); background: var(--missing-dim); }
.tree-badge.dim { color: var(--text-muted); background: var(--bg-surface-2); }
.tree-children { padding-left: 13px; }
.tree-children.collapsed { display: none; }

/* ─── Content Panel ─────────────────────────────────────────────────────────── */
#content-panel {
  overflow-y: auto;
  position: relative;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}
#content-panel::-webkit-scrollbar { width: 6px; }
#content-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

#doc-header {
  padding: 18px 32px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(8px);
}
.doc-breadcrumbs {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 5px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  letter-spacing: -0.01em;
}
.doc-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.025em;
  display: flex;
  align-items: center;
  gap: 10px;
}
.doc-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text-dim);
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s;
  font-family: inherit;
}
.action-btn:hover { background: var(--bg-surface-hover); border-color: var(--accent); color: var(--text); }
.action-btn.primary { background: var(--accent); color: #fff; border-color: transparent; }
.action-btn.primary:hover { background: var(--accent-hover); }

/* ─── Document Body ─────────────────────────────────────────────────────────── */
#doc-body {
  padding: 24px 32px;
  max-width: 960px;
  width: 100%;
}

/* ─── Code Section ──────────────────────────────────────────────────────────── */
.code-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 8px;
}
.code-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
}
.code-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.tool-pill {
  padding: 3px 9px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  color: var(--text-muted);
  user-select: none;
  transition: all 0.15s;
  font-size: 11px;
}
.tool-pill:hover { border-color: var(--accent); color: var(--text); }
.tool-pill.active { background: var(--accent-glow); color: var(--accent-hover); border-color: var(--accent-glow-strong); }

.code-viewer-container {
  position: relative;
  margin-bottom: 20px;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
}
.code-lang-badge {
  position: absolute;
  top: 10px;
  right: 12px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
  background: var(--bg-surface-2);
  padding: 2px 7px;
  border-radius: 4px;
  z-index: 2;
  user-select: none;
  letter-spacing: 0.04em;
}
.code-viewer {
  background: var(--bg-surface) !important;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.7;
  padding: 16px 14px;
  margin: 0;
}
.code-viewer code {
  background: none !important;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
}
/* Restore hljs colors */
.code-viewer .hljs { background: none; }

/* ─── Thread-link spans (overlaid on hljs output) ──────────────────────────── */
.code-link {
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.12s;
  font-weight: 600;
  position: relative;
}
.code-link::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 1px;
  background: currentColor;
  opacity: 0.5;
}
.code-link.kind-calls { color: #7dd3fc !important; text-shadow: 0 0 8px rgba(125,211,252,0.5); }
.code-link.kind-imports { color: #fdba74 !important; text-shadow: 0 0 8px rgba(253,186,116,0.5); }
.code-link.kind-extends { color: #d8b4fe !important; text-shadow: 0 0 8px rgba(216,180,254,0.5); }
.code-link.kind-references { color: #6ee7b7 !important; text-shadow: 0 0 8px rgba(110,231,183,0.5); }
.code-link:hover {
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  text-shadow: 0 0 14px currentColor;
}
[data-theme="light"] .code-link.kind-calls { color: #0369a1 !important; text-shadow: none; }
[data-theme="light"] .code-link.kind-imports { color: #c2410c !important; text-shadow: none; }
[data-theme="light"] .code-link.kind-extends { color: #7c3aed !important; text-shadow: none; }

/* ─── Annotation glyph inline in code ──────────────────────────────────────── */
.annotation-glyph {
  display: inline-block;
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  font-size: 10px;
  color: var(--accent-hover);
  background: var(--accent-glow);
  border: 1px solid var(--accent-glow-strong);
  border-radius: 3px;
  cursor: pointer;
  vertical-align: middle;
  margin-left: 6px;
  transition: all 0.15s;
  user-select: none;
  font-style: normal;
}
.annotation-glyph:hover {
  background: var(--accent-glow-strong);
  transform: scale(1.15);
}

/* ─── Microdoc Popover ─────────────────────────────────────────────────────── */
#microdoc-popover {
  position: fixed;
  display: none;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: var(--shadow), 0 0 0 1px var(--accent-glow-strong);
  z-index: 300;
  max-width: 380px;
  min-width: 260px;
  pointer-events: none;
}
#microdoc-popover .mp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
#microdoc-popover .mp-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-hover);
}
#microdoc-popover .mp-kind {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-surface-2);
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: auto;
}
#microdoc-popover .mp-body {
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-dim);
  max-height: 200px;
  overflow: hidden;
}

/* ─── Microdoc Cards ───────────────────────────────────────────────────────── */
.microdocs-section {
  margin: 8px 0 20px;
}
.microdocs-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.microdoc-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 10px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.microdoc-card:hover { border-color: var(--accent-glow-strong); }
.microdoc-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  background: var(--bg-surface-2);
  transition: background 0.1s;
}
.microdoc-card-header:hover { background: var(--bg-surface-hover); }
.mc-glyph { font-size: 13px; }
.mc-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-hover);
}
.mc-element-kind {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 1px 7px;
  border-radius: 4px;
}
.mc-toggle {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 10px;
  transition: transform 0.2s;
}
.microdoc-card.expanded .mc-toggle { transform: rotate(90deg); }
.microdoc-card-body {
  display: none;
  padding: 14px;
  border-top: 1px solid var(--border);
}
.microdoc-card.expanded .microdoc-card-body { display: block; }
.mc-code {
  background: var(--bg) !important;
  border: 1px solid var(--border);
  border-radius: 7px;
  overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px;
  line-height: 1.65;
  padding: 12px;
  margin-bottom: 12px;
}
.mc-code code { background: none !important; }
.mc-notes { font-size: 12.5px; }

/* ─── SVG Thread Layer ─────────────────────────────────────────────────────── */
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
  stroke: var(--thread-color);
  transition: opacity 0.2s;
}
.thread-line.thread-active {
  stroke-width: 2px;
  stroke: var(--thread-active);
  filter: drop-shadow(0 0 5px var(--thread-active));
}

/* ─── Hover Tooltip Card ───────────────────────────────────────────────────── */
#hover-card {
  position: fixed;
  display: none;
  background: var(--bg-surface);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 10px 14px;
  font-size: 12px;
  box-shadow: var(--shadow);
  z-index: 200;
  pointer-events: none;
  max-width: 320px;
}
#hover-card .hc-title { font-weight: 700; color: var(--text); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
#hover-card .hc-path { font-family: 'JetBrains Mono', monospace; color: var(--text-dim); font-size: 10.5px; }
#hover-card .hc-why { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); font-style: italic; color: var(--text-muted); font-size: 11.5px; }

/* ─── Pending Diff Block ───────────────────────────────────────────────────── */
.diff-alert-box {
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: var(--radius);
  padding: 14px;
  margin: 12px 0 20px;
}
.diff-alert-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--stale);
  margin-bottom: 10px;
  font-size: 13px;
}
.diff-pre {
  background: var(--bg) !important;
  border-radius: 6px;
  padding: 12px;
  font-size: 11.5px;
  overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
}
.diff-line-add { color: var(--ok); }
.diff-line-del { color: var(--missing); }

/* ─── Connections Table ─────────────────────────────────────────────────────── */
.connections-section { margin: 20px 0; }
.connections-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 12px;
}
.connections-table th {
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  padding: 7px 11px;
  text-align: left;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.connections-table td { border: 1px solid var(--border); padding: 7px 11px; color: var(--text-dim); }
.connections-table tr:hover td { background: var(--bg-surface-2); }

/* ─── Notes & Markdown Editor ───────────────────────────────────────────────── */
.notes-container {
  margin-top: 28px;
  border-top: 1px solid var(--border);
  padding-top: 20px;
}
.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.notes-title { font-size: 15px; font-weight: 700; color: var(--text); }
.editor-box {
  display: none;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}
.editor-textarea {
  width: 100%;
  min-height: 200px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.7;
  outline: none;
  resize: vertical;
}
.editor-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.editor-buttons { display: flex; align-items: center; gap: 10px; }

/* ─── Markdown Rendered Typography ─────────────────────────────────────────── */
.markdown-rendered {
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-dim);
}
.markdown-rendered h1,
.markdown-rendered h2,
.markdown-rendered h3,
.markdown-rendered h4,
.markdown-rendered h5,
.markdown-rendered h6 {
  color: var(--text);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-top: 1.8em;
  margin-bottom: 0.6em;
  line-height: 1.3;
}
.markdown-rendered h1 { font-size: 1.7em; border-bottom: 1px solid var(--border); padding-bottom: 0.4em; }
.markdown-rendered h2 { font-size: 1.3em; }
.markdown-rendered h3 { font-size: 1.1em; }
.markdown-rendered h4 { font-size: 1em; color: var(--text-dim); }
.markdown-rendered p { margin-bottom: 1em; }
.markdown-rendered a { color: var(--accent-hover); text-decoration: none; border-bottom: 1px solid var(--accent-glow-strong); transition: border-color 0.15s; }
.markdown-rendered a:hover { border-color: var(--accent-hover); }
.markdown-rendered code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.88em;
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  padding: 0.15em 0.45em;
  border-radius: 4px;
  color: var(--accent-hover);
}
.markdown-rendered pre {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  overflow-x: auto;
  margin: 1em 0;
}
.markdown-rendered pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.92em;
  color: var(--text);
  border-radius: 0;
}
.markdown-rendered blockquote {
  border-left: 3px solid var(--accent);
  padding: 8px 16px;
  margin: 1em 0;
  color: var(--text-muted);
  background: var(--accent-glow);
  border-radius: 0 6px 6px 0;
  font-style: italic;
}
.markdown-rendered blockquote p { margin-bottom: 0; }
.markdown-rendered ul, .markdown-rendered ol {
  padding-left: 1.6em;
  margin-bottom: 1em;
}
.markdown-rendered li { margin-bottom: 0.3em; }
.markdown-rendered li::marker { color: var(--accent); }
.markdown-rendered table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.93em;
}
.markdown-rendered th {
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--text-dim);
}
.markdown-rendered td {
  border: 1px solid var(--border);
  padding: 7px 12px;
  color: var(--text-dim);
}
.markdown-rendered tr:nth-child(even) td { background: var(--bg-surface-2); }
.markdown-rendered hr {
  border: none;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--border), transparent);
  margin: 2em 0;
}
.markdown-rendered strong { color: var(--text); font-weight: 600; }
.markdown-rendered em { color: var(--text-dim); }

/* ─── Right Graph Panel ─────────────────────────────────────────────────────── */
#graph-panel {
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
#graph-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg);
  flex-shrink: 0;
}
.graph-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
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
  padding: 3px 9px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-family: inherit;
  transition: all 0.12s;
}
.switch-btn.active { background: var(--accent); color: #fff; }
.switch-btn:not(.active):hover { color: var(--text); }

#graph-svg-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}
#graph-svg { width: 100%; height: 100%; }

/* ─── Connected Files List ──────────────────────────────────────────────────── */
#connected-list-container {
  display: none;
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}
#connected-list-container::-webkit-scrollbar { width: 4px; }
#connected-list-container::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
.conn-item {
  padding: 10px 12px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 7px;
  cursor: pointer;
  transition: all 0.15s;
}
.conn-item:hover { background: var(--bg-surface-hover); border-color: var(--accent); }
.conn-item.thread-target { border-color: var(--accent-glow-strong); box-shadow: 0 0 0 1px var(--accent-glow); }
.conn-item-title { font-weight: 600; font-size: 12.5px; color: var(--text); display: flex; align-items: center; justify-content: space-between; }
.conn-item-path { font-size: 10.5px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
.conn-item-meta { font-size: 10.5px; color: var(--text-dim); margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; }

#graph-footer {
  padding: 8px 12px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  background: var(--bg);
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

/* ─── Auth Modal ────────────────────────────────────────────────────────────── */
#auth-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(10px);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.auth-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 26px;
  width: 370px;
  box-shadow: var(--shadow);
}
.auth-title { font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 7px; }
.auth-desc { font-size: 12.5px; color: var(--text-dim); margin-bottom: 18px; line-height: 1.55; }
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
  font-family: inherit;
}
.auth-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.auth-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* ─── Empty State ───────────────────────────────────────────────────────────── */
#empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  text-align: center;
  gap: 12px;
  padding: 40px;
}
#empty-state .empty-icon { font-size: 42px; margin-bottom: 4px; }
#empty-state .empty-title { font-size: 17px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
#empty-state .empty-desc { max-width: 440px; line-height: 1.6; font-size: 13.5px; }
.empty-actions { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
</style>
</head>
<body>

<!-- Thread Lines SVG overlay -->
<svg id="thread-svg" aria-hidden="true"></svg>

<!-- Hover Tooltip Card -->
<div id="hover-card" role="tooltip"></div>

<!-- Microdoc Popover -->
<div id="microdoc-popover" role="tooltip">
  <div class="mp-header">
    <span style="font-size:14px">🏷️</span>
    <span class="mp-label" id="mp-label-text"></span>
    <span class="mp-kind" id="mp-kind-text"></span>
  </div>
  <div class="mp-body markdown-rendered" id="mp-body-text"></div>
</div>

<!-- Auth Modal -->
<div id="auth-modal" role="dialog" aria-label="Authentication">
  <div class="auth-card">
    <div class="auth-title">🔐 Unlock Web UI Editing</div>
    <div class="auth-desc">Enter your project access code to enable documentation editing. Configured in <code>.syndocs/auth.json</code>.</div>
    <input type="password" id="auth-code-input" class="auth-input" placeholder="Access code..." autocomplete="current-password">
    <div class="auth-actions">
      <button class="action-btn" id="auth-cancel-btn">Cancel</button>
      <button class="action-btn primary" id="auth-submit-btn">Unlock</button>
    </div>
  </div>
</div>

<div id="app">
  <!-- Header -->
  <header id="header">
    <div id="logo" onclick="openHome()" title="SynDocs Home">
      <span class="spark">⚡</span><span>Syn</span>Docs <span class="badge">Studio</span>
    </div>
    <div id="stats"></div>

    <div id="search-wrapper">
      <span class="search-icon">⌕</span>
      <input id="search" type="text" placeholder="Search docs & code..." autocomplete="off" aria-label="Search documentation">
    </div>

    <div id="theme-picker-wrapper">
      <button class="header-btn" id="theme-picker-btn" title="Change theme" onclick="toggleThemePicker()">
        🎨 Theme
      </button>
      <div id="theme-dropdown">
        <div class="theme-option" data-theme="midnight" onclick="applyTheme('midnight')">
          <span class="theme-swatch" style="background:linear-gradient(135deg,#0b0e14,#6366f1)"></span>
          Midnight
        </div>
        <div class="theme-option" data-theme="obsidian" onclick="applyTheme('obsidian')">
          <span class="theme-swatch" style="background:linear-gradient(135deg,#0d0d0d,#a855f7)"></span>
          Obsidian
        </div>
        <div class="theme-option" data-theme="nord" onclick="applyTheme('nord')">
          <span class="theme-swatch" style="background:linear-gradient(135deg,#1a1f2e,#81a1c1)"></span>
          Nord
        </div>
        <div class="theme-option" data-theme="solarized" onclick="applyTheme('solarized')">
          <span class="theme-swatch" style="background:linear-gradient(135deg,#001f27,#cb4b16)"></span>
          Solarized Dark
        </div>
        <div class="theme-option" data-theme="catppuccin" onclick="applyTheme('catppuccin')">
          <span class="theme-swatch" style="background:linear-gradient(135deg,#1e1e2e,#cba6f7)"></span>
          Catppuccin Mocha
        </div>
        <div class="theme-option" data-theme="light" onclick="applyTheme('light')">
          <span class="theme-swatch" style="background:linear-gradient(135deg,#f8fafc,#6366f1)"></span>
          Light Studio
        </div>
      </div>
    </div>

    <button id="auth-toggle-btn" class="header-btn" title="Toggle edit mode">
      <span id="auth-status-icon">🔒</span> <span id="auth-status-text">Read Only</span>
    </button>
    <button id="toggle-graph" class="header-btn" onclick="toggleGraphPanel()" title="Toggle graph panel">◫ Graph</button>
  </header>

  <!-- Left Sidebar -->
  <nav id="sidebar" aria-label="Documentation tree">
    <div class="sidebar-tabs">
      <div class="sidebar-tab active" id="tab-docs" onclick="switchSidebarTab('docs')" role="tab">
        📄 Docs
      </div>
      <div class="sidebar-tab" id="tab-codebase" onclick="switchSidebarTab('codebase')" role="tab">
        💻 Code
      </div>
    </div>
    <div class="sidebar-toolbar">
      <span id="tree-counter">Loading...</span>
      <div>
        <button class="sidebar-toolbar-btn" onclick="expandAllTree()" title="Expand all">⊞</button>
        <button class="sidebar-toolbar-btn" onclick="collapseAllTree()" title="Collapse all">⊟</button>
      </div>
    </div>
    <div class="tree-view-container" id="tree-view" role="tree"></div>
  </nav>

  <!-- Center Content Panel -->
  <main id="content-panel" aria-label="Document content">
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
        <div class="empty-title">SynDocs Interactive Studio</div>
        <div class="empty-desc">
          Select a document from the sidebar or click any node in the graph to begin exploring your codebase documentation.
        </div>
        <div class="empty-actions">
          <button class="action-btn primary" onclick="openDoc('guides/internal/quickstart.md')">⚡ Quickstart</button>
          <button class="action-btn" onclick="openDoc('guides/internal/annotations.md')">🏷️ Annotations</button>
          <button class="action-btn" onclick="openDoc('guides/internal/cli-reference.md')">🛠️ CLI Ref</button>
        </div>
      </div>
      <div id="doc-content" style="display:none;"></div>
    </div>
  </main>

  <!-- Right Graph Panel -->
  <aside id="graph-panel" aria-label="Codebase graph">
    <div id="graph-header">
      <div class="graph-title">Codebase Graph</div>
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
      <span id="graph-cg-badge" style="font-size:10px; opacity:0.65;"></span>
    </div>
  </aside>
</div>

<script>
// ═══════════════════════════════════════════════════════════════════════════════
// Data injected by server
const DATA = __SYNDOCS_DATA__;

// ─── Global State ─────────────────────────────────────────────────────────────
let currentDocId = null;
let currentSidebarTab = 'docs';
let currentGraphView = 'canvas';
let isEditingNotes = false;
let authToken = localStorage.getItem('syndocs_auth_token') || null;
let threadMode = localStorage.getItem('syndocs_thread_mode') || 'hover'; // 'always' | 'hover' | 'off'
let highlightKeywords = true;
let currentTheme = localStorage.getItem('syndocs_theme') || 'midnight';

// D3 simulation variables
let simulation = null;
let svgG = null;
let graphNodes = null;

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

  const hasRepoDocs = DATA.nodes.some(n => n.type === 'doc');
  if (!hasRepoDocs && DATA.docs['guides/internal/quickstart.md']) {
    openDoc('guides/internal/quickstart.md');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Theme System ─────────────────────────────────────────────────────────────

const THEMES = ['midnight', 'obsidian', 'nord', 'solarized', 'catppuccin', 'light'];

function initTheme() {
  applyTheme(currentTheme, true);
}

function applyTheme(name, silent = false) {
  if (!THEMES.includes(name)) name = 'midnight';
  currentTheme = name;
  document.documentElement.setAttribute('data-theme', name);
  localStorage.setItem('syndocs_theme', name);

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
    return \`<pre class="mc-code hljs"><code class="language-\${escapeHtml(validLang)}">\${highlighted}</code></pre>\`;
  };

  // Inline code
  renderer.codespan = (code) => \`<code>\${code}</code>\`;

  // Links open in new tab
  renderer.link = (href, title, text) =>
    \`<a href="\${href}" title="\${title || ''}" target="_blank" rel="noopener">\${text}</a>\`;

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
          icon.textContent = '🔓'; text.textContent = 'Edit Mode';
        } else {
          authToken = null;
          localStorage.removeItem('syndocs_auth_token');
          icon.textContent = '🔒'; text.textContent = 'Read Only';
        }
      }).catch(() => {});
  } else {
    icon.textContent = '🔒'; text.textContent = 'Read Only';
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
    \`<span class="stat-pill ok">✓ \${ok}</span>\`,
    stale ? \`<span class="stat-pill stale">~ \${stale}</span>\` : '',
    missing ? \`<span class="stat-pill missing">! \${missing}</span>\` : ''
  ].join('');
  document.getElementById('graph-cg-badge').textContent = DATA.hasCodeGraph ? '⚡ CodeGraph' : 'Fallback';
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
    \`\${totalCount} \${currentSidebarTab === 'docs' ? 'docs' : 'files'}\`;
  container.appendChild(buildDomTree(treeData, filter));
}

function countLeaves(node) {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((a, c) => a + countLeaves(c), 0);
}

function buildDomTree(node, filter = '') {
  const el = document.createElement('div');
  el.className = 'tree-node';
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const row = document.createElement('div');
  row.className = 'tree-row' + (currentDocId === node.path ? ' active' : '');
  row.setAttribute('role', 'treeitem');

  if (filter && !nodeMatchesFilter(node, filter)) el.style.display = 'none';

  let childrenContainer = null;
  if (hasChildren) {
    childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
  }

  if (hasChildren) {
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▼';
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      if (childrenContainer) {
        const collapsed = childrenContainer.classList.toggle('collapsed');
        toggle.textContent = collapsed ? '▶' : '▼';
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
  const iconMap = { microdoc: '🏷️', guide: '📖', doc: '📄', file: '📄', dir: '📁' };
  icon.textContent = iconMap[node.type] || '📄';
  row.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.targetLabel ? '#' + node.targetLabel : node.name;
  label.title = node.path || node.name;
  row.appendChild(label);

  if (node.status && node.status !== 'none') {
    const badge = document.createElement('span');
    badge.className = 'tree-badge ' + node.status;
    badge.textContent = node.status === 'ok' ? '✓' : node.status === 'stale' ? '~' : '!';
    badge.title = node.status;
    row.appendChild(badge);
  }

  if (node.type === 'dir') {
    row.addEventListener('click', e => {
      e.stopPropagation();
      if (childrenContainer) {
        const collapsed = childrenContainer.classList.toggle('collapsed');
        const tog = row.querySelector('.tree-toggle');
        if (tog) tog.textContent = collapsed ? '▶' : '▼';
      }
    });
  } else {
    row.addEventListener('click', () => openDoc(node.path));
  }

  el.appendChild(row);
  if (hasChildren && childrenContainer && node.children) {
    for (const child of node.children) childrenContainer.appendChild(buildDomTree(child, filter));
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
  document.querySelectorAll('.tree-children').forEach(c => c.classList.remove('collapsed'));
  document.querySelectorAll('.tree-toggle').forEach(t => t.textContent = '▼');
}

function collapseAllTree() {
  document.querySelectorAll('.tree-children').forEach(c => c.classList.add('collapsed'));
  document.querySelectorAll('.tree-toggle').forEach(t => t.textContent = '▶');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Document Viewing ─────────────────────────────────────────────────────────

function openDoc(id) {
  currentDocId = id;
  const doc = DATA.docs[id];

  document.querySelectorAll('.tree-row').forEach(r => {
    const lbl = r.querySelector('.tree-label');
    r.classList.toggle('active', lbl && lbl.title === id);
  });

  highlightGraphNode(id);
  updateConnectedList(id);

  if (!doc) {
    document.getElementById('doc-header').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    document.getElementById('doc-content').style.display = 'none';
    stopThreadLoop();
    return;
  }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('doc-header').style.display = 'flex';
  document.getElementById('doc-content').style.display = 'block';
  document.getElementById('doc-path').textContent = doc.sourceFile;
  document.getElementById('doc-title-text').textContent = doc.title;

  const badge = document.getElementById('doc-status-badge');
  badge.className = 'tree-badge ' + (doc.status || 'dim');
  badge.textContent = doc.status === 'ok' ? '✓ in sync' : doc.status === 'stale' ? '~ stale' : doc.status || '';

  renderDocContent(doc, id);
}

function renderDocContent(doc, id) {
  const container = document.getElementById('doc-content');
  container.innerHTML = '';
  currentMicrodocs = {};

  stopThreadLoop();
  allThreadSpans = [];

  // ── 1. Code Block ──────────────────────────────────────────────────────────
  if (doc.codeCopy) {
    const codeHeader = document.createElement('div');
    codeHeader.className = 'code-section-header';
    codeHeader.innerHTML =
      '<div class="code-section-title">Source Code (' + escapeHtml(doc.codeLanguage || 'code') + ')</div>' +
      '<div class="code-tools">' +
        '<span class="tool-pill ' + (threadMode !== 'off' ? 'active' : '') + '" id="thread-mode-pill" onclick="cycleThreadMode(this)">⚡ Threads: ' + escapeHtml(threadMode) + '</span>' +
        '<span class="tool-pill ' + (highlightKeywords ? 'active' : '') + '" id="highlight-pill" onclick="toggleHighlightKeywords(this)">💡 Links</span>' +
      '</div>';
    container.appendChild(codeHeader);

    const viewerBox = document.createElement('div');
    viewerBox.className = 'code-viewer-container';

    const langBadge = document.createElement('div');
    langBadge.className = 'code-lang-badge';
    langBadge.textContent = (doc.codeLanguage || 'code').toUpperCase();
    viewerBox.appendChild(langBadge);

    const pre = document.createElement('pre');
    pre.className = 'code-viewer';
    const codeEl = document.createElement('code');

    // Build highlighted code with overlaid thread links
    codeEl.innerHTML = buildHighlightedCodeHtml(doc.codeCopy, doc.tokens || [], doc.codeLanguage || 'ts', currentMicrodocs);
    pre.appendChild(codeEl);
    viewerBox.appendChild(pre);
    container.appendChild(viewerBox);

    // Collect thread spans
    allThreadSpans = [];
    codeEl.querySelectorAll('.code-link').forEach(span => {
      allThreadSpans.push({ span, targetId: span.dataset.target });
    });

    attachTokenListeners(codeEl, id);
    attachGlyphListeners(codeEl);
  }

  // ── 2. Pending Diff ────────────────────────────────────────────────────────
  const diffMatch = doc.content && doc.content.match(/<!-- syndocs-pending-start -->([\s\S]*?)<!-- syndocs-pending-end -->/);
  if (diffMatch) {
    const diffBox = document.createElement('div');
    diffBox.className = 'diff-alert-box';
    diffBox.innerHTML = \`
      <div class="diff-alert-title">⚠ Code drift detected (pending update)</div>
      <pre class="diff-pre">\${formatDiffLines(diffMatch[1])}</pre>
    \`;
    container.appendChild(diffBox);
  }

  // ── 3. Microdoc Cards ──────────────────────────────────────────────────────
  // Find microdocs for this source file from DATA.docs
  const microEntries = [];
  for (const [dId, dEntry] of Object.entries(DATA.docs)) {
    if (dEntry.type === 'microdoc' && dEntry.sourceFile === (doc.sourceFile || id)) {
      const label = dId.includes('#') ? dId.split('#').slice(1).join('#') : dId;
      microEntries.push({ id: dId, label, entry: dEntry });
      currentMicrodocs[label] = { notes: dEntry.notes, elementKind: '', elementName: label };
    }
  }

  if (microEntries.length > 0) {
    const microSection = document.createElement('div');
    microSection.className = 'microdocs-section';
    microSection.innerHTML = '<div class="microdocs-section-title">🏷️ Annotations (' + microEntries.length + ')</div>';

    for (const { id: mId, label, entry } of microEntries) {
      const card = document.createElement('div');
      card.className = 'microdoc-card';
      card.dataset.label = label;

      const header = document.createElement('div');
      header.className = 'microdoc-card-header';
      const kindSpan = entry.codeLanguage ? '<span class="mc-element-kind">' + escapeHtml(entry.codeLanguage) + '</span>' : '';
      header.innerHTML =
        '<span class="mc-glyph">🏷️</span>' +
        '<span class="mc-label">#' + escapeHtml(label) + '</span>' +
        kindSpan +
        '<span class="mc-toggle">▶</span>';
      header.addEventListener('click', () => card.classList.toggle('expanded'));

      const body = document.createElement('div');
      body.className = 'microdoc-card-body';

      if (entry.codeCopy) {
        const mcPre = document.createElement('pre');
        mcPre.className = 'mc-code';
        const mcCode = document.createElement('code');
        const validLang = entry.codeLanguage && hljs.getLanguage(entry.codeLanguage) ? entry.codeLanguage : 'plaintext';
        try {
          mcCode.innerHTML = hljs.highlight(entry.codeCopy, { language: validLang }).value;
        } catch {
          mcCode.textContent = entry.codeCopy;
        }
        mcPre.appendChild(mcCode);
        body.appendChild(mcPre);
      }

      const notesDiv = document.createElement('div');
      notesDiv.className = 'mc-notes markdown-rendered';
      const rawNotes = entry.notes && entry.notes.trim() ? entry.notes : '_No notes yet._';
      notesDiv.innerHTML = marked.parse(rawNotes);
      body.appendChild(notesDiv);

      card.appendChild(header);
      card.appendChild(body);
      microSection.appendChild(card);
    }

    container.appendChild(microSection);
  }

  // ── 4. Connections Table ───────────────────────────────────────────────────
  const connections = extractConnections(doc.content || '');
  if (connections.length > 0) {
    const connSection = document.createElement('div');
    connSection.className = 'connections-section';
    connSection.innerHTML = renderConnectionTable(connections);
    container.appendChild(connSection);
  }

  // ── 5. Notes & Editor ─────────────────────────────────────────────────────
  const notesContainer = document.createElement('div');
  notesContainer.className = 'notes-container';

  const notesHeader = document.createElement('div');
  notesHeader.className = 'notes-header';
  notesHeader.innerHTML = \`
    <div class="notes-title">📝 Documentation Notes</div>
    <button class="action-btn" id="edit-notes-toggle-btn" onclick="toggleEditNotes()">✏️ Edit</button>
  \`;
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
  editorBox.innerHTML = \`
    <textarea id="notes-textarea" class="editor-textarea" placeholder="Write documentation notes in Markdown...">\${escapeHtml(doc.notes || '')}</textarea>
    <div class="editor-buttons">
      <button class="action-btn primary" onclick="saveNotes()">💾 Save Notes</button>
      <button class="action-btn" onclick="toggleEditNotes()">Cancel</button>
      <span id="save-indicator" style="font-size:12px; color:var(--text-muted); margin-left:8px;"></span>
    </div>
  \`;
  notesContainer.appendChild(editorBox);
  container.appendChild(notesContainer);

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

  if (!highlightKeywords || tokens.length === 0) {
    return addAnnotationGlyphs(highlighted, code, microdocRegistry);
  }

  // Step 2: build per-line token map
  const lines = code.split('\\n');
  const tokenMap = new Map();
  for (const t of tokens) {
    if (!tokenMap.has(t.line)) tokenMap.set(t.line, []);
    tokenMap.get(t.line).push(t);
  }

  // Step 3: overlay code-link spans on highlighted lines
  const hlLines = highlighted.split('\\n');
  const resultLines = hlLines.map((hlLine, idx) => {
    const lineNum = idx + 1;
    const lineTokens = tokenMap.get(lineNum) || [];
    if (lineTokens.length === 0) return hlLine;

    let result = hlLine;
    for (const tok of lineTokens) {
      // Only match the token name when it appears as a text node (outside <...>)
      result = overlayCodeLink(result, tok);
    }
    return result;
  });

  const overlaid = resultLines.join('\\n');
  return addAnnotationGlyphs(overlaid, code, microdocRegistry);
}

function overlayCodeLink(hlLine, tok) {
  const escapedName = escapeHtml(tok.name);
  const kindClass = \`kind-\${tok.kind || 'calls'}\`;
  const dataAttrs = \`data-target="\${escapeHtml(tok.targetFile)}" data-name="\${escapedName}" data-kind="\${escapeHtml(tok.kind)}" data-line="\${tok.line}"\`;
  const replacement = \`<span class="code-link \${kindClass}" \${dataAttrs}>\${escapedName}</span>\`;

  // Replace only text content occurrences — skip those inside <tag ...> attributes
  // We walk through the string splitting on < > boundaries
  let result = '';
  let pos = 0;
  const str = hlLine;
  const nameLen = escapedName.length;

  while (pos < str.length) {
    if (str[pos] === '<') {
      // find end of tag
      const end = str.indexOf('>', pos);
      if (end === -1) { result += str.slice(pos); break; }
      result += str.slice(pos, end + 1);
      pos = end + 1;
    } else {
      // text node — find next '<'
      const nextTag = str.indexOf('<', pos);
      const segment = nextTag === -1 ? str.slice(pos) : str.slice(pos, nextTag);
      // replace first occurrence of token name in this text segment
      const idx = segment.indexOf(escapedName);
      if (idx !== -1) {
        // check word boundary (simple: char before/after must not be alphanum)
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

function addAnnotationGlyphs(highlightedHtml, rawCode, microdocRegistry) {
  if (!microdocRegistry || Object.keys(microdocRegistry).length === 0) return highlightedHtml;

  const lines = highlightedHtml.split('\\n');
  const rawLines = rawCode.split('\\n');

  return lines.map((line, idx) => {
    const rawLine = rawLines[idx] || '';
    // Check if this raw line has a @syndocs: label annotation
    const m = rawLine.match(/@synd(?:ocs)?:\\s*([\\w-]+)/);
    if (!m) return line;
    const label = m[1];
    if (!microdocRegistry[label]) return line;
    return line + \`<span class="annotation-glyph" data-microdoc="\${escapeHtml(label)}" title="Microdoc: #\${escapeHtml(label)}">◈</span>\`;
  }).join('\\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Thread Link Listeners ────────────────────────────────────────────────────

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
      hoverCard.innerHTML = \`
        <div class="hc-title">
          <span style="color:var(--\${kind || 'calls'})">\${escapeHtml((kind || 'calls').toUpperCase())}</span>
          \${escapeHtml(symbolName)}
        </div>
        <div class="hc-path">\${escapeHtml(targetFile)} · line \${escapeHtml(String(line))}</div>
        <div class="hc-why">Click to navigate to this file's documentation</div>
      \`;
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
    span.addEventListener('click', () => openDoc(targetFile));
  });
}

function attachGlyphListeners(codeEl) {
  const popover = document.getElementById('microdoc-popover');
  const labelEl = document.getElementById('mp-label-text');
  const kindEl = document.getElementById('mp-kind-text');
  const bodyEl = document.getElementById('mp-body-text');

  codeEl.querySelectorAll('.annotation-glyph').forEach(glyph => {
    const label = glyph.dataset.microdoc;
    glyph.addEventListener('mouseenter', e => {
      const micro = currentMicrodocs[label];
      if (!micro) return;
      labelEl.textContent = '#' + label;
      kindEl.textContent = micro.elementKind || 'annotation';
      bodyEl.innerHTML = marked.parse(micro.notes && micro.notes.trim() ? micro.notes : '_No notes yet._');
      popover.style.display = 'block';
      positionPopover(e.clientX, e.clientY);
    });
    glyph.addEventListener('mousemove', e => positionPopover(e.clientX, e.clientY));
    glyph.addEventListener('mouseleave', () => { popover.style.display = 'none'; });
    glyph.addEventListener('click', e => {
      e.stopPropagation();
      // Scroll to and expand the matching microdoc card
      const card = document.querySelector(\`.microdoc-card[data-label="\${CSS.escape(label)}"]\`);
      if (card) {
        card.classList.add('expanded');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  let x = cx + 16, y = cy + 14;
  if (x + 400 > vw) x = cx - 400 - 8;
  if (y + 250 > vh) y = cy - 250 - 8;
  pop.style.left = x + 'px';
  pop.style.top = y + 'px';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Thread Loop (rAF-based, elastically tracks elements) ─────────────────────

function startThreadLoop() {
  if (threadRafId) return;

  function drawFrame() {
    const threadSvg = d3.select('#thread-svg');
    threadSvg.selectAll('*').remove();

    if (threadMode === 'hover') {
      if (activeThreadSpan && activeThreadTarget) {
        drawThreadToTarget(threadSvg, activeThreadSpan, activeThreadTarget, true);
      } else {
        threadRafId = null;
        return;
      }
    } else if (threadMode === 'always') {
      for (const { span, targetId } of allThreadSpans) {
        drawThreadToTarget(threadSvg, span, targetId, false);
      }
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

function drawThreadToTarget(threadSvg, spanEl, targetId, isActive) {
  const spanRect = spanEl.getBoundingClientRect();
  if (spanRect.width === 0 && spanRect.height === 0) return;

  // Don't draw if the code span is scrolled outside the visible viewport
  if (spanRect.bottom < 60 || spanRect.top > window.innerHeight - 30) return;

  // Source point: right edge of span
  const x1 = spanRect.right + 2;
  const y1 = spanRect.top + spanRect.height / 2;

  let x2, y2, found = false;

  if (currentGraphView === 'canvas') {
    // Try to find the D3 graph node's circle
    let nodeEl = document.querySelector(\`#graph-svg g[data-id="\${CSS.escape(targetId)}"] circle:not(.selection-ring)\`);
    if (!nodeEl) {
      const baseTarget = targetId.split('/').pop().replace(/\\.[^.]+$/, '');
      const matchingGroup = Array.from(document.querySelectorAll('#graph-svg g[data-id]')).find(g => {
        const gid = g.dataset.id || '';
        return gid === targetId || gid.endsWith('/' + targetId) || targetId.endsWith('/' + gid) ||
          (baseTarget && (gid.split('/').pop() || '').replace(/\\.[^.]+$/, '') === baseTarget);
      });
      if (matchingGroup) nodeEl = matchingGroup.querySelector('circle:not(.selection-ring)');
    }
    if (nodeEl) {
      const rect = nodeEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        x2 = rect.left + rect.width / 2;
        y2 = rect.top + rect.height / 2;
        found = true;
      }
    }
  } else {
    // Connected list mode: thread to conn-item element
    let connEl = document.querySelector(\`.conn-item[data-target-id="\${CSS.escape(targetId)}"]\`);
    if (!connEl) {
      const baseTarget = targetId.split('/').pop().replace(/\\.[^.]+$/, '');
      connEl = Array.from(document.querySelectorAll('.conn-item')).find(el => {
        const tid = el.dataset.targetId || '';
        return tid === targetId || tid.endsWith('/' + targetId) || targetId.endsWith('/' + tid) ||
          (baseTarget && (tid.split('/').pop() || '').replace(/\\.[^.]+$/, '') === baseTarget);
      });
    }
    if (connEl) {
      const rect = connEl.getBoundingClientRect();
      const listContainer = document.getElementById('connected-list-container');
      const listRect = listContainer ? listContainer.getBoundingClientRect() : null;
      if (listRect && (rect.bottom < listRect.top + 8 || rect.top > listRect.bottom - 8)) return;
      x2 = rect.left + 8;
      y2 = rect.top + rect.height / 2;
      found = true;
    }
  }

  if (!found) return;

  const dx = (x2 - x1) * 0.45;
  const pathD = \`M \${x1} \${y1} C \${x1 + dx} \${y1}, \${x2 - dx} \${y2}, \${x2} \${y2}\`;

  threadSvg.append('path')
    .attr('class', 'thread-line' + (isActive ? ' thread-active' : ''))
    .attr('d', pathD)
    .attr('stroke-opacity', isActive ? 0.9 : 0.35)
    .attr('stroke-dasharray', isActive ? '5 2' : 'none');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Thread Mode Controls ──────────────────────────────────────────────────────

function cycleThreadMode(btn) {
  const modes = ['hover', 'always', 'off'];
  const idx = modes.indexOf(threadMode);
  threadMode = modes[(idx + 1) % modes.length];
  localStorage.setItem('syndocs_thread_mode', threadMode);

  btn.textContent = \`⚡ Threads: \${threadMode}\`;
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
    if (btn) btn.textContent = '👁️ Preview';
    if (subBtn) subBtn.textContent = '👁️ Preview';
  } else {
    view.style.display = 'block';
    editor.style.display = 'none';
    if (btn) btn.textContent = '✏️ Edit Notes';
    if (subBtn) subBtn.textContent = '✏️ Edit';
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
      ind.textContent = 'Saved ✓';
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

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Graph Panel ──────────────────────────────────────────────────────────────

function setGraphView(view) {
  currentGraphView = view;
  document.getElementById('btn-view-canvas').classList.toggle('active', view === 'canvas');
  document.getElementById('btn-view-list').classList.toggle('active', view === 'list');
  document.getElementById('graph-svg-container').style.display = view === 'canvas' ? 'block' : 'none';
  document.getElementById('connected-list-container').style.display = view === 'list' ? 'block' : 'none';
  if (view === 'list' && currentDocId) updateConnectedList(currentDocId);
}

function updateConnectedList(docId) {
  const container = document.getElementById('connected-list-container');
  container.innerHTML = '';
  const connectedEdges = DATA.edges.filter(e => e.source === docId || e.target === docId);

  if (connectedEdges.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:28px; font-size:12.5px;">No connected files.</div>';
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
    item.dataset.targetId = otherId;
    const label = otherId.split('/').pop();
    item.innerHTML = \`
      <div class="conn-item-title">
        \${escapeHtml(label)}
        <span class="tree-badge dim">\${edges.length} link\${edges.length > 1 ? 's' : ''}</span>
      </div>
      <div class="conn-item-path">\${escapeHtml(otherId)}</div>
      <div class="conn-item-meta">
        \${edges.slice(0, 4).map(e => \`<span style="color:var(--\${e.kind || 'calls'})">• \${escapeHtml(e.kind || 'ref')}: \${escapeHtml(e.symbol || '')}</span>\`).join(' ')}
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

  if (!DATA.nodes || DATA.nodes.length === 0) return;

  const nodeColor = d => {
    if (d.status === 'ok') return 'var(--ok)';
    if (d.status === 'stale') return 'var(--stale)';
    if (d.status === 'missing') return 'var(--missing)';
    return 'var(--text-muted)';
  };

  const edgeColor = d => {
    const map = { calls: 'var(--calls)', imports: 'var(--imports)', extends: 'var(--extends)', references: 'var(--references)', contains: 'var(--accent)' };
    return map[d.kind] || 'var(--border)';
  };

  // Compute edge counts for hub sizing
  const edgeCount = new Map();
  DATA.nodes.forEach(n => edgeCount.set(n.id, 0));
  DATA.edges.forEach(e => {
    edgeCount.set(e.source, (edgeCount.get(e.source) || 0) + 1);
    edgeCount.set(e.target, (edgeCount.get(e.target) || 0) + 1);
  });

  const nodeRadius = d => {
    const cnt = edgeCount.get(d.id) || 0;
    return Math.min(5 + cnt * 1.2, 14);
  };

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

  const nodeMap = new Map(DATA.nodes.map(n => [n.id, { ...n }]));
  const links = DATA.edges
    .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target) && e.source !== e.target)
    .map(e => ({ ...e }));
  const nodes = Array.from(nodeMap.values());

  // Simulation with smoother parameters
  simulation = d3.forceSimulation(nodes)
    .alphaDecay(0.025)
    .velocityDecay(0.38)
    .force('link', d3.forceLink(links).id(d => d.id).distance(d => {
      // Microdoc edges stay close; code edges spread out
      return d.kind === 'contains' ? 50 : 120;
    }).strength(d => d.kind === 'contains' ? 0.6 : 0.25))
    .force('charge', d3.forceManyBody().strength(d => -250 - (edgeCount.get(d.id) || 0) * 20))
    .force('center', d3.forceCenter(W / 2, H / 2).strength(0.08))
    .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 10).strength(0.85))
    .force('radial', d3.forceRadial(Math.min(W, H) * 0.3, W / 2, H / 2).strength(0.04));

  // Links as curved paths
  const linkPaths = svgG.append('g')
    .selectAll('path')
    .data(links)
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', d => edgeColor(d))
    .attr('stroke-width', 1.1)
    .attr('stroke-opacity', 0.4)
    .attr('marker-end', 'url(#arrow)');

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
        .attr('r', nodeRadius(d) * 1.4);
    })
    .on('mouseout', (e, d) => {
      document.getElementById('graph-info').textContent = 'Hover node to inspect · drag to rearrange';
      d3.select(e.currentTarget).select('circle.node-core')
        .transition().duration(150)
        .attr('r', nodeRadius(d));
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

  // Core circle
  nodeGroup.append('circle')
    .attr('class', 'node-core')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => nodeColor(d))
    .attr('fill-opacity', 0.85)
    .attr('stroke', d => nodeColor(d))
    .attr('stroke-width', 0.5)
    .attr('stroke-opacity', 0.4);

  // Label (only show for nodes with enough space)
  nodeGroup.append('text')
    .attr('dy', d => nodeRadius(d) + 10)
    .attr('text-anchor', 'middle')
    .attr('font-size', d => d.type === 'microdoc' ? 7.5 : 9)
    .attr('fill', 'var(--text-dim)')
    .attr('pointer-events', 'none')
    .attr('opacity', d => edgeCount.get(d.id) > 1 ? 1 : 0.6)
    .text(d => d.label.length > 14 ? d.label.slice(0, 13) + '…' : d.label);

  // Curved link path update
  function curvePath(d) {
    const sx = d.source.x, sy = d.source.y;
    const tx = d.target.x, ty = d.target.y;
    const dx = tx - sx, dy = ty - sy;
    const dr = Math.sqrt(dx * dx + dy * dy) * 0.75;
    return \`M\${sx},\${sy}A\${dr},\${dr} 0 0,1 \${tx},\${ty}\`;
  }

  simulation.on('tick', () => {
    linkPaths.attr('d', curvePath);
    nodeGroup.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
  });
}

function highlightGraphNode(id) {
  if (!svgG) return;
  svgG.selectAll('g[data-id]').each(function(d) {
    const isSelected = d.id === id;
    d3.select(this).select('.selection-ring')
      .transition().duration(180)
      .attr('stroke-opacity', isSelected ? 1 : 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function extractConnections(content) {
  const m = content.match(/<!-- syndocs-graph-start -->([\s\S]*?)<!-- syndocs-graph-end -->/);
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
    <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:8px; letter-spacing:-0.01em;">
      Connections &amp; References
    </div>
    <table class="connections-table">
      <thead><tr><th>Line</th><th>Symbol</th><th>Target</th><th>Edge</th><th>Why</th></tr></thead>
      <tbody>
        \${rows.map(r => \`
          <tr>
            <td style="font-family:'JetBrains Mono',monospace; color:var(--text-muted); font-size:11.5px;">\${escapeHtml(r.line)}</td>
            <td><code>\${escapeHtml(r.symbol.replace(/\`/g, ''))}</code></td>
            <td style="font-family:'JetBrains Mono',monospace; font-size:11.5px;">\${escapeHtml(r.linksTo)}</td>
            <td><span class="tree-badge dim">\${escapeHtml(r.edge)}</span></td>
            <td style="font-style:italic; color:var(--text-muted); font-size:12px;">\${escapeHtml(r.why || '—')}</td>
          </tr>
        \`).join('')}
      </tbody>
    </table>
  \`;
}

function escapeHtml(s) {
  if (typeof s !== 'string') return String(s || '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegex(s) {
  // Escape regex special chars using split/join to avoid template-literal escaping issues
  const specials = ['\\\\', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']'];
  for (const ch of specials) s = s.split(ch).join('\\\\' + ch);
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
    if (!wrapper.contains(e.target)) dropdown.classList.remove('open');
  });
}

function openHome() {
  currentDocId = null;
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('doc-header').style.display = 'none';
  document.getElementById('doc-content').style.display = 'none';
  stopThreadLoop();
  document.querySelectorAll('.tree-row.active').forEach(r => r.classList.remove('active'));
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
</script>
</body>
</html>`;
