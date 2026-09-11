// @syndocs
/**
 * syndocs graph-link
 *
 * Reads CodeGraph's call/import edges for every documented source file and
 * writes a connection table (<!-- syndocs-graph-start/end -->) into each
 * mirror doc. The table contains Obsidian-compatible [[wiki-links]] so that
 * opening syndocs/ as an Obsidian vault produces a real connected graph.
 *
 * Only connections where BOTH ends have a mirror doc are included — no point
 * linking to undocumented code.
 *
 * Idempotent: reruns replace the existing table block, leaving Notes untouched.
 */

import fs from 'fs';
import path from 'path';
import {
  getMirrorPath,
  getSourceFromMirror,
  parseMirrorDoc,
} from '@syndocs/core';
import type { GraphEdge } from '@syndocs/graph';
import {
  SynDocsConfig,
  GraphAdapter,
  c,
  readFileSafe,
  walkMirrorDocs,
  writeFile,
  loadGraphAdapter,
} from '../utils';

export interface GraphLinkOptions {
  cwd: string;
  config: SynDocsConfig;
  dryRun?: boolean;
}

const GRAPH_START = '<!-- syndocs-graph-start -->';
const GRAPH_END   = '<!-- syndocs-graph-end -->';

export async function runGraphLink(opts: GraphLinkOptions): Promise<void> {
  const { cwd, config, dryRun } = opts;

  console.log(c.bold('SynDocs — graph-link\n'));

  const adapter: GraphAdapter = await loadGraphAdapter(cwd);

  if (!adapter) {
    console.log(c.yellow('  No CodeGraph index found.'));
    console.log('  Run ' + c.cyan('codegraph init') + ' (or ' + c.cyan('syndocs init') + ') first, then retry.');
    return;
  }

  if (!adapter.isReady()) {
    console.log(c.yellow('  CodeGraph index is empty — run codegraph index to populate it.'));
    adapter.close();
    return;
  }

  let linked = 0, skipped = 0, unchanged = 0;

  for (const mirrorRel of walkMirrorDocs(config.docsRoot, cwd)) {
    let sourceRel: string;
    try {
      sourceRel = getSourceFromMirror(mirrorRel, config.docsRoot);
    } catch { continue; }

    const mirrorAbs = path.join(cwd, mirrorRel);
    const mirrorContent = readFileSafe(mirrorAbs);
    if (!mirrorContent) continue;

    // Get outbound edges from CodeGraph
    const edges = adapter.getEdgesForFile(sourceRel);
    if (edges.length === 0) { skipped++; continue; }

    // Filter to edges whose target also has a mirror doc
    const connectedEdges = edges.filter(e => {
      const targetMirror = path.join(cwd, getMirrorPath(e.targetFile, config.docsRoot));
      return fs.existsSync(targetMirror);
    });

    if (connectedEdges.length === 0) { skipped++; continue; }

    // Deduplicate: one row per unique (sourceLine, targetFile, targetSymbol)
    const deduped = deduplicateEdges(connectedEdges);

    // Build the connection table
    const table = buildConnectionTable(deduped, config.docsRoot);

    // Write into mirror doc — replace existing block or insert before Notes
    const updated = upsertGraphBlock(mirrorContent, table);

    if (updated === mirrorContent) { unchanged++; continue; }

    if (!dryRun) writeFile(mirrorAbs, updated);

    const filename = sourceRel.split('/').pop() ?? sourceRel;
    console.log(
      '  ' + c.cyan('\u2192 linked') + '  ' + sourceRel
      + '  ' + c.dim('(' + deduped.length + ' connection' + (deduped.length === 1 ? '' : 's') + ')'),
    );
    linked++;
  }

  adapter.close();

  console.log('');
  console.log(
    '  ' + c.bold('Result:') + '  '
    + c.green(String(linked)) + ' linked, '
    + c.dim(String(unchanged)) + ' unchanged, '
    + c.dim(String(skipped)) + ' no cross-file connections',
  );

  if (linked > 0) {
    console.log('  ' + c.dim('Open ' + config.docsRoot + '/ as an Obsidian vault to see the graph.'));
  }
}

// ─── Connection table builder ─────────────────────────────────────────────────

function buildConnectionTable(edges: GraphEdge[], docsRoot: string): string {
  const rows = edges.map(e => {
    const targetBaseName = e.targetFile.split('/').pop()?.replace(/\.md$/, '') ?? e.targetFile;

    // Build wiki-link: [[filename#section]] when a matching micro-doc label exists,
    // else [[filename]]. Obsidian resolves by note name (filename without .md).
    const noteRef = e.targetSymbol
      ? targetBaseName + '#' + slugify(e.targetSymbol)
      : targetBaseName;

    const wikiLink  = '[[' + noteRef + ']]';
    const lineLabel = e.sourceLine > 0 ? String(e.sourceLine) : '—';
    const symbol    = e.sourceSymbol ? '`' + e.sourceSymbol + '`' : '—';
    const kind      = e.kind;

    return '| ' + [lineLabel, symbol, wikiLink, kind].join(' | ') + ' |';
  });

  const lines = [
    GRAPH_START,
    '| Line | Symbol | Links to | Edge |',
    '|------|--------|----------|------|',
    ...rows,
    '| | | | |',
    '| | *Why column — fill in the reason for each connection* | | |',
    GRAPH_END,
  ];

  return lines.join('\n');
}

/**
 * Insert or replace the graph block in a mirror doc.
 * - If the block exists, replace it.
 * - Otherwise, insert it between the code block and the ## Notes section.
 */
function upsertGraphBlock(content: string, table: string): string {
  const startIdx = content.indexOf(GRAPH_START);
  const endIdx   = content.indexOf(GRAPH_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace existing block
    return (
      content.slice(0, startIdx).trimEnd()
      + '\n\n' + table + '\n'
      + content.slice(endIdx + GRAPH_END.length).trimStart()
    ).replace(/\n{3,}/g, '\n\n');
  }

  // Insert before ## Notes
  const notesMatch = content.match(/\n(## Notes)/);
  if (notesMatch && notesMatch.index !== undefined) {
    const insertAt = notesMatch.index;
    return (
      content.slice(0, insertAt).trimEnd()
      + '\n\n' + table + '\n\n'
      + content.slice(insertAt).trimStart()
    );
  }

  // Fallback: append at end
  return content.trimEnd() + '\n\n' + table + '\n';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter(e => {
    const key = e.sourceLine + ':' + e.targetFile + ':' + (e.targetSymbol ?? '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
