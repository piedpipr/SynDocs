// @syndocs
/**
 * syndocs serve
 *
 * Starts a local web server that renders all mirror docs as HTML with a
 * D3 force-directed graph view (Obsidian-style) and live reload via SSE.
 *
 * Port: 4748  (CodeGraph uses 4747, we use 4748)
 * No npm dependencies — uses Node's built-in http and fs modules only.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { HTML_TEMPLATE } from '../web/html';
import {
  computeHash,
  getMirrorPath,
  getSourceFromMirror,
  parseMirrorDoc,
} from '@syndocs/core';
import {
  SynDocsConfig,
  c,
  readFileSafe,
  walkMirrorDocs,
  loadGraphAdapter,
} from '../utils';

export interface ServeOptions {
  cwd: string;
  config: SynDocsConfig;
  port?: number;
}

const DEFAULT_PORT = 4748;

// ─── Data types sent to the browser ───────────────────────────────────────

interface DocNode {
  id: string;     // repo-root-relative source path
  label: string;  // filename only
  status: 'ok' | 'stale' | 'missing' | 'none';
  group: string;  // first two path segments, for sidebar grouping
}

interface DocEdge {
  source: string;
  target: string;
  kind: string;
  line: number;
  symbol: string;
}

interface DocEntry {
  title: string;
  content: string;  // raw mirror doc markdown
  status: string;
}

interface SynDocsData {
  nodes: DocNode[];
  edges: DocEdge[];
  docs:  Record<string, DocEntry>;
}

// ─── Main command ─────────────────────────────────────────────────────────

export async function runServe(opts: ServeOptions): Promise<void> {
  const { cwd, config, port = DEFAULT_PORT } = opts;

  let data = await buildData(cwd, config);

  // SSE clients
  const sseClients: Set<http.ServerResponse> = new Set();

  function broadcast(event: string) {
    for (const res of sseClients) {
      res.write('event: ' + event + '\ndata: {}\n\n');
    }
  }

  // File watcher — reload data and notify clients on any change in .syndocs/
  const syndocsDir = path.join(cwd, '.syndocs');
  const watchDir = fs.existsSync(syndocsDir) ? syndocsDir : path.join(cwd, config.docsRoot);
  if (fs.existsSync(watchDir)) {
    fs.watch(watchDir, { recursive: true }, (_, filename) => {
      if (!filename || !filename.endsWith('.md')) return;
      buildData(cwd, config).then(d => {
        data = d;
        broadcast('reload');
      });
    });
  }

  // HTTP server
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';

    // ── SSE endpoint ──────────────────────────────────────────────────────
    if (url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // ── Data API ──────────────────────────────────────────────────────────
    if (url === '/api/data') {
      const body = JSON.stringify(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }

    // ── Main page ─────────────────────────────────────────────────────────
    if (url === '/' || url === '/index.html') {
      const page = HTML_TEMPLATE.replace(
        '__SYNDOCS_DATA__',
        JSON.stringify(data),
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, '127.0.0.1', () => {
    console.log('');
    console.log(c.bold('SynDocs — serve'));
    console.log('');
    console.log('  ' + c.green('\u2714') + '  ' + c.bold(String(data.nodes.length)) + ' mirror docs loaded');
    console.log('  ' + c.green('\u2714') + '  ' + c.bold(String(data.edges.length)) + ' graph connections');
    console.log('');
    console.log('  ' + c.bold('Open:') + '  ' + c.cyan('http://localhost:' + port));
    console.log('');
    console.log('  ' + c.dim('Watching ' + config.docsRoot + '/ for changes (live reload)'));
    console.log('  ' + c.dim('Press Ctrl+C to stop'));
    console.log('');
  });

  // Keep alive
  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}

// ─── Build graph data from mirror docs ────────────────────────────────────

async function buildData(cwd: string, config: SynDocsConfig): Promise<SynDocsData> {
  const nodes: DocNode[]           = [];
  const edges: DocEdge[]           = [];
  const docs: Record<string, DocEntry> = {};

  // Load graph adapter for any extra edges not yet written into docs
  const adapter = await loadGraphAdapter(cwd);

  for (const mirrorRel of walkMirrorDocs(config.docsRoot, cwd)) {
    let sourceRel: string;
    try {
      sourceRel = getSourceFromMirror(mirrorRel, config.docsRoot);
    } catch { continue; }

    const mirrorAbs = path.join(cwd, mirrorRel);
    const content   = readFileSafe(mirrorAbs);
    if (!content) continue;

    const doc = parseMirrorDoc(content);
    const section = doc.sections.find(s => s.kind === 'whole-file');

    // Determine drift status by comparing hashes
    let status: DocNode['status'] = 'none';
    const sourceAbs = path.join(cwd, sourceRel);
    if (!fs.existsSync(sourceAbs)) {
      status = 'missing';
    } else if (section?.hash) {
      const live = computeHash(fs.readFileSync(sourceAbs, 'utf8'));
      status = live === section.hash ? 'ok' : 'stale';
    }

    const label = sourceRel.split('/').pop() ?? sourceRel;
    const parts = sourceRel.split('/');
    const group = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];

    nodes.push({ id: sourceRel, label, status, group });
    docs[sourceRel] = { title: doc.title, content, status };

    // Extract edges from the connection table already written into this doc
    const graphEdges = extractEdgesFromContent(content, sourceRel);
    edges.push(...graphEdges);
  }

  adapter?.close();

  // Deduplicate edges
  const seen = new Set<string>();
  const deduped = edges.filter(e => {
    const k = e.source + '>' + e.target + ':' + e.kind + ':' + e.line;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { nodes, edges: deduped, docs };
}

// Parse edges out of a mirror doc's <!-- syndocs-graph-start/end --> block
function extractEdgesFromContent(content: string, sourceId: string): DocEdge[] {
  const m = content.match(/<!-- syndocs-graph-start -->([\s\S]*?)<!-- syndocs-graph-end -->/);
  if (!m) return [];

  const edges: DocEdge[] = [];
  for (const line of m[1].split('\n')) {
    if (!line.startsWith('|') || line.includes('Line') || line.includes('---') || line.includes('Why column')) continue;
    const cells = line.split('|').filter(Boolean).map(s => s.trim());
    if (cells.length < 4) continue;

    const [lineNum, symbol, linksTo, edgeKind] = cells;
    const wikiMatch = linksTo.match(/\[\[([^\]]+)\]\]/);
    if (!wikiMatch) continue;

    const ref      = wikiMatch[1].split('#')[0];
    const targetId = ref; // stored as filename — resolve to full path
    if (!lineNum || lineNum === '—') continue;

    edges.push({
      source: sourceId,
      target: targetId,
      kind:   edgeKind?.trim() ?? 'calls',
      line:   parseInt(lineNum, 10) || 0,
      symbol: symbol?.replace(/`/g, '').trim() ?? '',
    });
  }
  return edges;
}
