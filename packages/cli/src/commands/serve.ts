// @syndocs
/**
 * syndocs serve
 *
 * Starts a local web server that provides an interactive documentation studio:
 * - Dual-tab sidebar: Docs Tree (.syndocs/) and Codebase Tree with stats
 * - D3 force-directed graph view and Connected Files list
 * - In-code keyword anchors with SVG thread connections to graph nodes
 * - Password-protected Notes editor for safe human documentation editing
 * - Live reload via SSE
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HTML_TEMPLATE } from '../web/html';
import { INTERNAL_GUIDES } from '../web/internal-docs';
import {
  computeHash,
  getLangConfig,
  getMirrorPath,
  getSourceFromMirror,
  parseAnchors,
  parseMirrorDoc,
  renderMirrorDoc,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  verifySessionToken,
} from '@syndocs/core';
import {
  SynDocsConfig,
  GraphAdapter,
  c,
  ensureDir,
  readFileSafe,
  walkSourceFiles,
  walkMirrorDocs,
  walkGuides,
  writeFile,
  loadGraphAdapter,
} from '../utils';

export interface ServeOptions {
  cwd: string;
  config: SynDocsConfig;
  port?: number;
}

const DEFAULT_PORT = 4748;

// ─── Data types sent to the browser ───────────────────────────────────────

export interface DocNode {
  id: string; // repo-root-relative source or doc path
  label: string;
  status: 'ok' | 'stale' | 'missing' | 'none';
  group: string;
  type: 'doc' | 'microdoc' | 'guide';
  targetLabel?: string;
  lineCount?: number;
  microCount?: number;
}

export interface DocEdge {
  source: string;
  target: string;
  kind: string;
  line: number;
  col?: number;
  symbol: string;
  why?: string;
}

export interface DocEntry {
  title: string;
  content: string;
  status: string;
  type: 'doc' | 'microdoc' | 'guide';
  sourceFile: string;
  codeCopy?: string;
  codeLanguage?: string;
  notes: string;
  tokens: {
    line: number;
    col: number;
    name: string;
    kind: string;
    targetFile: string;
    targetSymbol: string | null;
  }[];
  downstream: string[];
  elementKind?: string;
  elementName?: string;
  scopeStartLine?: number;
  scopeEndLine?: number;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'dir' | 'doc' | 'microdoc' | 'guide' | 'file';
  status?: string;
  children?: TreeNode[];
  lineCount?: number;
  hash?: string;
  microCount?: number;
  targetLabel?: string;
}

export interface SynDocsData {
  nodes: DocNode[];
  edges: DocEdge[];
  docs: Record<string, DocEntry>;
  docsTree: TreeNode;
  codebaseTree: TreeNode;
  authRequired: boolean;
  hasCodeGraph: boolean;
}

// ─── Main command ─────────────────────────────────────────────────────────

export async function runServe(opts: ServeOptions): Promise<void> {
  const { cwd, config, port = DEFAULT_PORT } = opts;

  // Ensure .syndocs/auth.json exists for authentication
  ensureAuthFile(cwd);
  const sessionSecret = crypto.randomBytes(32).toString('hex');

  let data = await buildData(cwd, config);

  // SSE clients
  const sseClients: Set<http.ServerResponse> = new Set();

  function broadcast(event: string) {
    for (const res of sseClients) {
      res.write(`event: ${event}\ndata: {}\n\n`);
    }
  }

  // File watcher — reload data and notify clients on change
  const syndocsDir = path.join(cwd, '.syndocs');
  const watchDir = fs.existsSync(syndocsDir) ? syndocsDir : path.join(cwd, config.docsRoot);
  if (fs.existsSync(watchDir)) {
    fs.watch(watchDir, { recursive: true }, (_, filename) => {
      if (!filename || !filename.endsWith('.md')) return;
      buildData(cwd, config).then(d => {
        data = d;
        broadcast('reload');
      }).catch(err => {
        console.error('[syndocs serve] Watch rebuild error:', err?.message || err);
      });
    });
  }

  // HTTP server
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url ?? '/', `http://localhost:${port}`);
    const pathname = parsedUrl.pathname;

    // CORS headers for flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── SSE endpoint ──────────────────────────────────────────────────────
    if (pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // ── Data API ──────────────────────────────────────────────────────────
    if (pathname === '/api/data') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // ── Auth: Login ───────────────────────────────────────────────────────
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBodyJson(req);
      const code = String(body?.code ?? '');
      const auth = readAuthFile(cwd);

      if (!auth || !auth.hash || !auth.salt) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Auth not configured on server' }));
        return;
      }

      const isValid = verifyPassword(code, auth.hash, auth.salt);
      if (isValid) {
        const token = generateSessionToken(sessionSecret);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, token }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid access code' }));
      }
      return;
    }

    // ── Auth: Status check ────────────────────────────────────────────────
    if (pathname === '/api/auth/status') {
      const authHeader = req.headers.authorization ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const isAuthenticated = token ? verifySessionToken(token, sessionSecret) : false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authenticated: isAuthenticated }));
      return;
    }

    // ── Document Save Endpoint ────────────────────────────────────────────
    if (pathname === '/api/doc/save' && req.method === 'POST') {
      const authHeader = req.headers.authorization ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const isAuthenticated = token ? verifySessionToken(token, sessionSecret) : false;

      if (!isAuthenticated) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized: invalid or expired access code session' }));
        return;
      }

      const body = await readBodyJson(req);
      const id = String(body?.id ?? '');
      const type = String(body?.type ?? 'doc');
      const editedNotes = String(body?.notes ?? '');

      const success = saveDocumentNotes(cwd, config, id, type, editedNotes);
      if (success) {
        // Re-read data and broadcast SSE
        data = await buildData(cwd, config);
        broadcast('reload');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Failed to update document notes' }));
      }
      return;
    }

    // ── Static Fonts endpoint ─────────────────────────────────────────────
    if (pathname.startsWith('/fonts/')) {
      const fontFilename = path.basename(pathname);
      const candidatePaths = [
        path.join(cwd, '.syndocs', 'fonts', fontFilename),
        path.resolve(__dirname, '..', '..', 'assets', 'fonts', fontFilename),
        path.resolve(__dirname, '..', 'assets', 'fonts', fontFilename),
      ];
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          res.writeHead(200, {
            'Content-Type': 'font/woff2',
            'Cache-Control': 'public, max-age=31536000, immutable',
          });
          fs.createReadStream(p).pipe(res);
          return;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Font not found');
      return;
    }

    // ── Main HTML Page ────────────────────────────────────────────────────
    if (pathname === '/' || pathname === '/index.html') {
      const page = HTML_TEMPLATE.replace(
        '__SYNDOCS_DATA__',
        JSON.stringify(data).replace(/</g, '\\u003c'),
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.listen(port, '127.0.0.1', () => {
    console.log('');
    console.log(c.bold('SynDocs — studio & web server'));
    console.log('');
    console.log('  ' + c.green('\u2714') + '  ' + c.bold(String(data.nodes.length)) + ' documentation nodes loaded');
    console.log('  ' + c.green('\u2714') + '  ' + c.bold(String(data.edges.length)) + ' code connections mapped');
    console.log('  ' + c.green('\u2714') + '  ' + c.cyan('http://localhost:' + port) + ' (Web UI active)');
    console.log('');
    console.log('  ' + c.dim('Web UI editing enabled with access code auth'));
    console.log('  ' + c.dim('Press Ctrl+C to stop'));
    console.log('');
  });

  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}

// ─── Helper: Save edited notes to disk ────────────────────────────────────────

function saveDocumentNotes(
  cwd: string,
  config: SynDocsConfig,
  id: string,
  type: string,
  editedNotes: string,
): boolean {
  try {
    if (type === 'guide') {
      const guideAbs = path.join(cwd, config.guidesRoot, id.replace(/^guides\//, ''));
      if (!fs.existsSync(guideAbs)) return false;
      writeFile(guideAbs, editedNotes);
      return true;
    }

    if (type === 'microdoc') {
      // id is e.g. "packages/core/src/hash.ts#compute-hash"
      const [sourceRel, label] = id.split('#');
      if (!sourceRel || !label) return false;
      const mirrorRel = getMirrorPath(sourceRel, config.docsRoot);
      const mirrorAbs = path.join(cwd, mirrorRel);
      if (!fs.existsSync(mirrorAbs)) return false;

      const raw = readFileSafe(mirrorAbs);
      if (!raw) return false;

      const parsed = parseMirrorDoc(raw);
      const section = parsed.sections.find(s => s.kind === 'micro' && s.label === label);
      if (section) {
        section.notes = editedNotes;
      }
      writeFile(mirrorAbs, renderMirrorDoc(parsed));
      return true;
    }

    // Whole-file doc
    const mirrorRel = getMirrorPath(id, config.docsRoot);
    const mirrorAbs = path.join(cwd, mirrorRel);
    if (!fs.existsSync(mirrorAbs)) return false;

    const raw = readFileSafe(mirrorAbs);
    if (!raw) return false;

    const parsed = parseMirrorDoc(raw);
    const wholeSection = parsed.sections.find(s => s.kind === 'whole-file');
    if (wholeSection) {
      wholeSection.notes = editedNotes;
    }
    writeFile(mirrorAbs, renderMirrorDoc(parsed));
    return true;
  } catch {
    return false;
  }
}

// ─── Build graph & tree data from codebase ────────────────────────────────────

async function buildData(cwd: string, config: SynDocsConfig): Promise<SynDocsData> {
  const nodes: DocNode[] = [];
  const edges: DocEdge[] = [];
  const docs: Record<string, DocEntry> = {};

  const adapter: GraphAdapter = await loadGraphAdapter(cwd);
  const hasCodeGraph = Boolean(adapter && adapter.isReady());

  // 1. Process whole-file mirror docs
  for (const mirrorRel of walkMirrorDocs(config.docsRoot, cwd)) {
    let sourceRel: string;
    try {
      sourceRel = getSourceFromMirror(mirrorRel, config.docsRoot);
    } catch {
      continue;
    }

    const mirrorAbs = path.join(cwd, mirrorRel);
    const content = readFileSafe(mirrorAbs);
    if (!content) continue;

    const doc = parseMirrorDoc(content);
    const section = doc.sections.find(s => s.kind === 'whole-file');

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

    // Outbound AST tokens and downstream dependencies from CodeGraph
    const tokens = adapter ? (adapter as any).getFileTokens?.(sourceRel) ?? [] : [];
    const downstream = adapter ? adapter.getImpactRadius(sourceAbs) : [];

    nodes.push({
      id: sourceRel,
      label,
      status,
      group,
      type: 'doc',
      lineCount: section?.codeCopy?.split('\n').length ?? 0,
    });

    docs[sourceRel] = {
      title: doc.title,
      content,
      status,
      type: 'doc',
      sourceFile: sourceRel,
      codeCopy: section?.codeCopy ?? '',
      codeLanguage: section?.codeLanguage ?? 'ts',
      notes: section?.notes ?? '',
      tokens,
      downstream,
    };

    // Extract table edges
    const graphEdges = extractEdgesFromContent(content, sourceRel);
    edges.push(...graphEdges);

    // Micro-doc sections
    for (const microSection of doc.sections.filter(s => s.kind === 'micro')) {
      const id = `${sourceRel}#${microSection.label}`;

      nodes.push({
        id,
        label: `#${microSection.label}`,
        status, // Inherits missing status from parent if source deleted
        group: sourceRel,
        type: 'microdoc',
        targetLabel: microSection.label,
        lineCount: microSection.codeCopy?.split('\n').length ?? 0,
      });

      docs[id] = {
        title: `${path.basename(sourceRel)} #${microSection.label}`,
        content, // the UI splits this out or shows it differently
        status,
        type: 'microdoc',
        sourceFile: sourceRel,
        codeCopy: microSection.codeCopy ?? '',
        codeLanguage: microSection.codeLanguage ?? 'ts',
        notes: microSection.notes ?? '',
        elementKind: microSection.elementKind,
        elementName: microSection.elementName,
        scopeStartLine: microSection.scopeStartLine,
        scopeEndLine: microSection.scopeEndLine,
        tokens: [],
        downstream: [],
      };

      // Connect microdoc to its parent file
      edges.push({
        source: id,
        target: sourceRel,
        kind: 'contains',
        line: 0,
        symbol: microSection.label ?? '',
        why: 'Part of source file',
      });
    }
  }

  // 3. Process guides (both user project guides and built-in internal guides)
  for (const guideRel of walkGuides(config.guidesRoot, cwd)) {
    const guideAbs = path.join(cwd, guideRel);
    const content = readFileSafe(guideAbs);
    if (!content) continue;

    const id = guideRel;
    const label = path.basename(guideRel);

    nodes.push({
      id,
      label,
      status: 'ok',
      group: 'guides',
      type: 'guide',
    });

    docs[id] = {
      title: label,
      content,
      status: 'ok',
      type: 'guide',
      sourceFile: guideRel,
      notes: content,
      tokens: [],
      downstream: [],
    };
  }

  // 3b. Built-in SynDocs internal guides (always available)
  for (const internal of INTERNAL_GUIDES) {
    if (!docs[internal.id]) {
      nodes.push({
        id: internal.id,
        label: internal.title,
        status: 'ok',
        group: 'guides/internal',
        type: 'guide',
      });

      docs[internal.id] = {
        title: internal.title,
        content: internal.content,
        status: 'ok',
        type: 'guide',
        sourceFile: internal.id,
        notes: internal.content,
        tokens: [],
        downstream: [],
      };
    }
  }

  // 4. Incorporate all CodeGraph structural edges directly if ready
  if (adapter && (adapter as any).getAllEdges) {
    try {
      const cgEdges = (adapter as any).getAllEdges();
      for (const e of cgEdges) {
        edges.push({
          source: e.sourceFile,
          target: e.targetFile,
          kind: e.kind,
          line: e.sourceLine,
          symbol: e.sourceSymbol,
        });
      }
    } catch {
      /* ignore */
    }
  }

  adapter?.close();

  // Deduplicate edges
  const seen = new Set<string>();
  const dedupedEdges = edges.filter(e => {
    const k = `${e.source}>${e.target}:${e.kind}:${e.line}:${e.symbol}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Build hierarchical trees for sidebar
  const docsTree = buildDocsTree(nodes);
  const codebaseTree = buildCodebaseTree(cwd, config, nodes);

  return {
    nodes,
    edges: dedupedEdges,
    docs,
    docsTree,
    codebaseTree,
    authRequired: true,
    hasCodeGraph,
  };
}

function extractEdgesFromContent(content: string, sourceId: string): DocEdge[] {
  const m = content.match(/<!-- syndocs-graph-start -->([\s\S]*?)<!-- syndocs-graph-end -->/);
  if (!m) return [];

  const edges: DocEdge[] = [];
  for (const line of m[1].split('\n')) {
    if (!line.startsWith('|') || line.includes('Line') || line.includes('---') || line.includes('Why column')) continue;
    const cells = line.split('|').filter(Boolean).map(s => s.trim());
    if (cells.length < 4) continue;

    const [lineNum, symbol, linksTo, edgeKind, why] = cells;
    const wikiMatch = linksTo.match(/\[\[([^\]]+)\]\]/);
    if (!wikiMatch) continue;

    const ref = wikiMatch[1].split('#')[0];
    const targetId = ref;
    if (!lineNum || lineNum === '—') continue;

    edges.push({
      source: sourceId,
      target: targetId,
      kind: edgeKind?.trim() ?? 'calls',
      line: parseInt(lineNum, 10) || 0,
      symbol: symbol?.replace(/`/g, '').trim() ?? '',
      why: why?.trim() || undefined,
    });
  }
  return edges;
}

// ─── Hierarchy Builders ───────────────────────────────────────────────────────

function buildDocsTree(nodes: DocNode[]): TreeNode {
  const root: TreeNode = { name: '.syndocs', path: '.syndocs', type: 'dir', children: [] };
  const docsDir: TreeNode = { name: 'docs', path: '.syndocs/docs', type: 'dir', children: [] };
  const guidesDir: TreeNode = { name: 'guides', path: '.syndocs/guides', type: 'dir', children: [] };

  root.children!.push(docsDir, guidesDir);

  for (const node of nodes) {
    if (node.type === 'doc') {
      addPathToTree(docsDir, node.id, node);
    } else if (node.type === 'microdoc') {
      // The id is `src/foo.ts#label`. The parent file is `src/foo.ts`.
      // We want the microdoc to appear as a child of the `src/foo.ts` file node.
      const [parentPath, label] = node.id.split('#');
      addPathToTree(docsDir, parentPath, { ...node, id: node.id, label: '#' + label }, true);
    } else if (node.type === 'guide') {
      if (node.id.startsWith('guides/internal/')) {
        let internalDir = guidesDir.children!.find(c => c.name === 'SynDocs Guides' && c.type === 'dir');
        if (!internalDir) {
          internalDir = { name: 'SynDocs Guides', path: '.syndocs/guides/internal', type: 'dir', children: [] };
          guidesDir.children!.push(internalDir);
        }
        internalDir.children!.push({
          name: node.label,
          path: node.id,
          type: 'guide',
          status: node.status,
        });
      } else {
        guidesDir.children!.push({
          name: node.label,
          path: node.id,
          type: 'guide',
          status: node.status,
        });
      }
    }
  }

  return root;
}

function addPathToTree(parent: TreeNode, relPath: string, node: DocNode, isMicroDoc = false): void {
  const parts = relPath.split('/');
  let curr = parent;

  // Traverse directories
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    let child = curr.children?.find(c => c.name === p && c.type === 'dir');
    if (!child) {
      child = { name: p, path: parts.slice(0, i + 1).join('/'), type: 'dir', children: [] };
      curr.children = curr.children ?? [];
      curr.children.push(child);
    }
    curr = child;
  }

  const fileName = parts[parts.length - 1];
  curr.children = curr.children ?? [];

  let fileNode = curr.children.find(c => c.name === fileName && c.type === 'doc');
  
  if (!fileNode) {
    fileNode = {
      name: fileName,
      path: relPath, // the file's path
      type: 'doc', // may be updated if it's the actual file node
      status: 'missing', // fallback until actual doc node is added
      children: [],
    };
    curr.children.push(fileNode);
  }

  if (isMicroDoc) {
    fileNode.children = fileNode.children ?? [];
    fileNode.children.push({
      name: node.label,
      path: node.id,
      type: 'microdoc',
      status: node.status,
      lineCount: node.lineCount,
      targetLabel: node.targetLabel,
    });
  } else {
    // Update the file node with actual doc info
    fileNode.status = node.status;
    fileNode.lineCount = node.lineCount;
    // ensure children array exists if we are overriding an earlier skeleton
    fileNode.children = fileNode.children ?? [];
  }
}

function buildCodebaseTree(cwd: string, config: SynDocsConfig, nodes: DocNode[]): TreeNode {
  const root: TreeNode = { name: 'codebase', path: '', type: 'dir', children: [] };
  const docMap = new Map<string, DocNode>();
  for (const n of nodes) {
    if (n.type === 'doc') docMap.set(n.id, n);
  }

  for (const relPath of walkSourceFiles(cwd, config)) {
    const parts = relPath.split('/');
    let curr = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      let child = curr.children?.find(c => c.name === p && c.type === 'dir');
      if (!child) {
        child = { name: p, path: parts.slice(0, i + 1).join('/'), type: 'dir', children: [] };
        curr.children = curr.children ?? [];
        curr.children.push(child);
      }
      curr = child;
    }

    const docNode = docMap.get(relPath);
    curr.children = curr.children ?? [];
    curr.children.push({
      name: parts[parts.length - 1],
      path: relPath,
      type: 'file',
      status: docNode ? docNode.status : 'none',
      lineCount: docNode?.lineCount,
    });
  }

  return root;
}

// ─── Auth Storage ─────────────────────────────────────────────────────────────

interface AuthConfig {
  hash: string;
  salt: string;
  createdAt: string;
}

function ensureAuthFile(cwd: string): void {
  const authFile = path.join(cwd, '.syndocs', 'auth.json');
  if (!fs.existsSync(authFile)) {
    const { hash, salt } = hashPassword('syndocs');
    ensureDir(path.join(cwd, '.syndocs'));
    fs.writeFileSync(
      authFile,
      JSON.stringify({ hash, salt, createdAt: new Date().toISOString() }, null, 2) + '\n',
      'utf8',
    );
  }
}

function readAuthFile(cwd: string): AuthConfig | null {
  const authFile = path.join(cwd, '.syndocs', 'auth.json');
  try {
    return JSON.parse(fs.readFileSync(authFile, 'utf8'));
  } catch {
    return null;
  }
}

async function readBodyJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}
