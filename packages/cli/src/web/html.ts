// @syndocs
/**
 * SynDocs Web Studio HTML Template — assembly module.
 *
 * The actual UI source lives in ./assets as plain, unescaped .css/.js/.html
 * files (real syntax, real editor tooling, no template-literal escaping
 * hacks). This module just stitches them together into one served page:
 *
 *   assets/shell.html   — page structure (head, body markup, placeholders)
 *   assets/styles.css   — all styling, theme variables included
 *   assets/client.js    — all client-side behavior (state, rendering, D3
 *                         graph, notes/microdoc editing, theming, etc.)
 *
 * Features:
 * - Dual-tab sidebar: Docs Tree & Codebase Tree with collapse/expand & stats
 * - Interactive Code Keyword Anchors with live rAF-tracked SVG thread connections
 * - Syntax highlighting (hljs) with overlaid glowing thread-link spans
 * - Notion-style microdoc annotation cards, viewable AND editable inline
 * - D3 Force-Directed graph with curved links, hub sizing, smooth simulation
 * - Connected Files List with thread-to-list-item visualization
 * - Rich markdown typography via custom marked renderer + hljs fences
 * - 13 themes (dark & light) with per-theme syntax highlighting + localStorage persistence
 * - Split (side-by-side) focus mode with edge-activated auto-hiding tree/graph panels
 * - Password-protected Notes/Microdoc Editors with live Markdown preview
 */

import * as fs from 'fs';
import * as path from 'path';

const ASSETS_DIR = path.join(__dirname, 'assets');

function readAsset(name: string): string {
  return fs.readFileSync(path.join(ASSETS_DIR, name), 'utf8');
}

const SHELL_HTML = readAsset('shell.html');
const STYLES_CSS = readAsset('styles.css');
const CLIENT_JS = readAsset('client.js');

export const HTML_TEMPLATE = SHELL_HTML
  .replace('/*__SYNDOCS_STYLES__*/', () => STYLES_CSS)
  .replace('/*__SYNDOCS_CLIENT_JS__*/', () => CLIENT_JS);
