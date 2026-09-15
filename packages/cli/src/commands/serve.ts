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
  extractMicroDocCode,
  getCodeBlockLang,
  getCommentSyntax,
  getLangConfig,
  getMirrorPath,
  getSourceFromMirror,
  parseAnchors,
  parseMirrorDoc,
  renderMirrorDoc,
  renderNewMirrorDoc,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  verifySessionToken,
  DocSection,
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
  type: 'doc' | 'microdoc' | 'guide' | 'external';
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
  type: 'doc' | 'microdoc' | 'guide' | 'external';
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

    // ── Annotation Insertion Endpoint ─────────────────────────────────────
    // Writes a new @synd marker comment into the real source file at the
    // requested line(s), then re-runs the normal init/update pipeline for
    // that one file so the mirror doc gains the matching (empty) micro-doc
    // section. Never alters existing code — only inserts comment lines, or
    // appends a trailing comment to a line.
    //
    // modes:
    //   'inline' — single line: append `<comment> @synd` to end of that line
    //   'above'  — multi-line: insert `<comment> @synd` above the first line
    //   'block'  — multi-line: 'above' plus `<comment> @endsynd` after last
    if (pathname === '/api/annotation/add' && req.method === 'POST') {
      const authHeader = req.headers.authorization ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const isAuthenticated = token ? verifySessionToken(token, sessionSecret) : false;

      if (!isAuthenticated) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized: invalid or expired access code session' }));
        return;
      }

      const body = await readBodyJson(req);
      const relPath = String(body?.path ?? '');
      const startLine = Number(body?.startLine ?? 0);
      const endLine = Number(body?.endLine ?? startLine);
      const mode = String(body?.mode ?? 'inline');

      const result = addAnnotationToSource(cwd, config, relPath, startLine, endLine, mode);
      if (result.ok) {
        data = await buildData(cwd, config);
        broadcast('reload');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
      return;
    }

    // ── Doc Sync Endpoint (fixes 'stale' -> 'ok') ──────────────────────────
    // A doc goes 'stale' when its source file changes after the mirror doc
    // was generated (the stored hash/code snapshot no longer matches what's
    // on disk). There was previously no way to resolve this from the Web
    // UI at all — only the CLI's `syndocs update` could. This re-syncs the
    // stored code/hash with the current source, preserving all notes.
    if (pathname === '/api/doc/sync' && req.method === 'POST') {
      const authHeader = req.headers.authorization ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const isAuthenticated = token ? verifySessionToken(token, sessionSecret) : false;

      if (!isAuthenticated) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized: invalid or expired access code session' }));
        return;
      }

      const body = await readBodyJson(req);
      const relPath = String(body?.path ?? '');
      const normalized = path.normalize(relPath).replace(/^([./\\]+)/, m => m.replace(/\.\./g, ''));
      const absPath = path.resolve(cwd, normalized);
      if (absPath !== cwd && !absPath.startsWith(cwd + path.sep)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Path outside project root' }));
        return;
      }

      const result = regenerateMirrorFromSource(cwd, config, normalized);
      if (result.ok) {
        data = await buildData(cwd, config);
        broadcast('reload');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
      return;
    }

    // ── Raw File Endpoint ──────────────────────────────────────────────────
    // Lets the Web UI's "Code" (codebase) tab show source for files that
    // don't have a mirror doc yet — clicking an undocumented file previously
    // did nothing (no DATA.docs entry to render). Read-only; only serves
    // files that walkSourceFiles/buildCodebaseTree would themselves surface
    // (recognized source language, inside cwd, not ignored), so this can't
    // be used to read arbitrary files on the host.
    if (pathname === '/api/file/raw' && req.method === 'GET') {
      const relPath = parsedUrl.searchParams.get('path') ?? '';
      const normalized = path.normalize(relPath).replace(/^([./\\]+)/, m => m.replace(/\.\./g, ''));
      const langConfig = getLangConfig(normalized);
      const absPath = path.resolve(cwd, normalized);
      const withinCwd = absPath === cwd || absPath.startsWith(cwd + path.sep);

      if (!relPath || !langConfig || !withinCwd || !fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'File not found or not a recognized source file' }));
        return;
      }

      const content = readFileSafe(absPath);
      if (content === null) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Failed to read file' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        path: normalized,
        content,
        language: getCodeBlockLang(normalized),
        hasMirrorDoc: fs.existsSync(path.join(cwd, getMirrorPath(normalized, config.docsRoot))),
      }));
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
      const jsonSafe = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
      const page = HTML_TEMPLATE.replace('__SYNDOCS_DATA__', () => jsonSafe);
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

// ─── Helper: Insert a @synd annotation marker into a real source file ────────

interface AddAnnotationResult {
  ok: boolean;
  error?: string;
  /** Labels of micro-doc sections that exist now but didn't before. */
  newLabels?: string[];
  /** The doc id (source path) whose mirror doc was updated. */
  docId?: string;
}

/**
 * Write a new `@synd` marker comment into a source file and regenerate that
 * file's mirror doc so the new (empty) micro-doc section exists and is
 * immediately editable in the Web UI.
 *
 * Guarantees:
 *  - Only ever *inserts* whole comment lines, or appends a trailing comment
 *    to the end of an existing line. Existing code is never rewritten or
 *    reformatted, so this cannot alter program behavior.
 *  - Existing notes in the mirror doc are preserved (same merge strategy
 *    `syndocs update` uses): sections are matched by label and only their
 *    code/hash are refreshed.
 *
 * modes:
 *  - 'inline' (single line)  → append ` <comment> @synd` to that line
 *  - 'above'  (multi-line)   → insert `<comment> @synd` above the first line
 *  - 'block'  (multi-line)   → 'above', plus `<comment> @endsynd` after the
 *                              last line, marking an explicit block range
 */
// ─── Helper: regenerate a mirror doc's code/hash from its current source ────

interface SyncResult {
  ok: boolean;
  error?: string;
  docId?: string;
}

/**
 * Re-sync a mirror doc's stored code snapshots and hashes with the file's
 * current on-disk content — the fix for a 'stale' status (source changed
 * since the doc was last generated). Notes are always preserved; only
 * code/hash/scope are refreshed. Shared by the sync-only endpoint and by
 * addAnnotationToSource() (which regenerates after inserting a marker).
 *
 * Micro-doc sections whose @synd marker no longer exists in the source
 * (e.g. the annotated code was deleted) are dropped, matching what
 * `syndocs update` does — a mirror doc shouldn't keep documenting code
 * that's gone.
 */
function regenerateMirrorFromSource(
  cwd: string,
  config: SynDocsConfig,
  normalized: string,
): SyncResult {
  const langConfig = getLangConfig(normalized);
  if (!langConfig) return { ok: false, error: 'Not a recognized source file' };

  const sourceAbs = path.join(cwd, normalized);
  if (!fs.existsSync(sourceAbs)) return { ok: false, error: 'Source file not found' };

  const sourceContent = readFileSafe(sourceAbs);
  if (sourceContent === null) return { ok: false, error: 'Failed to read source file' };

  const mirrorRel = getMirrorPath(normalized, config.docsRoot);
  const mirrorAbs = path.join(cwd, mirrorRel);
  if (!fs.existsSync(mirrorAbs)) return { ok: false, error: 'No mirror doc exists for this file yet' };

  const existingRaw = readFileSafe(mirrorAbs);
  const existingDoc = existingRaw ? parseMirrorDoc(existingRaw) : null;

  const lang = getCodeBlockLang(normalized);
  const currentHash = computeHash(sourceContent);
  const anchors = parseAnchors(sourceContent, langConfig, { filePath: normalized });

  const newSections: DocSection[] = [];
  const existingWhole = existingDoc?.sections.find(s => s.kind === 'whole-file');
  newSections.push({
    kind: 'whole-file',
    hash: currentHash,
    codeCopy: sourceContent,
    codeLanguage: lang,
    notes: existingWhole?.notes ?? '',
  });

  const microAnchors = anchors.filter(a => a.kind === 'micro' && a.label);
  for (const anchor of microAnchors) {
    const nextAnchor = anchors.find(a => a.lineIndex > anchor.lineIndex);
    const microCode = extractMicroDocCode(sourceContent, anchor, nextAnchor?.lineIndex);
    const existingSection = existingDoc?.sections.find(
      s => s.kind === 'micro' && s.label === anchor.label,
    );
    newSections.push({
      kind: 'micro',
      label: anchor.label!,
      hash: computeHash(microCode),
      codeCopy: microCode,
      codeLanguage: lang,
      notes: existingSection?.notes ?? '',
      elementKind: anchor.elementKind,
      elementName: anchor.elementName,
      scopeStartLine: anchor.scopeStartLine,
      scopeEndLine: anchor.scopeEndLine,
    });
  }

  const title = existingDoc?.title ?? (normalized.split('/').pop() ?? normalized);
  writeFile(mirrorAbs, renderMirrorDoc({ title, sections: newSections }));

  return { ok: true, docId: normalized };
}

function addAnnotationToSource(
  cwd: string,
  config: SynDocsConfig,
  relPath: string,
  startLine: number,
  endLine: number,
  mode: string,
): AddAnnotationResult {
  try {
    if (!relPath) return { ok: false, error: 'No file path provided' };

    // Path safety: must resolve inside cwd and be a known source language.
    const normalized = path.normalize(relPath).replace(/^([./\\]+)/, m => m.replace(/\.\./g, ''));
    const absPath = path.resolve(cwd, normalized);
    if (absPath !== cwd && !absPath.startsWith(cwd + path.sep)) {
      return { ok: false, error: 'Path outside project root' };
    }
    const langConfig = getLangConfig(normalized);
    if (!langConfig) return { ok: false, error: 'Not a recognized source file' };
    if (!fs.existsSync(absPath)) return { ok: false, error: 'File not found' };

    const comment = getCommentSyntax(normalized);
    if (!comment) return { ok: false, error: 'No known comment syntax for this language' };

    const original = readFileSafe(absPath);
    if (original === null) return { ok: false, error: 'Failed to read file' };

    // Preserve the file's existing newline style so inserting a marker
    // doesn't rewrite every line ending on CRLF checkouts.
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const lines = original.split(/\r?\n/);

    // Incoming line numbers are 1-based (matching what the UI displays).
    const startIdx = Math.max(0, Math.min(lines.length - 1, startLine - 1));
    const endIdx = Math.max(startIdx, Math.min(lines.length - 1, endLine - 1));

    const indentOf = (line: string) => (line.match(/^[ \t]*/)?.[0] ?? '');
    const marker = (body: string, indent: string) =>
      `${indent}${comment.prefix} ${body}${comment.suffix}`;

    // Capture which micro-doc labels already existed so we can report only
    // the newly created one back to the UI.
    const mirrorRel = getMirrorPath(normalized, config.docsRoot);
    const mirrorAbs = path.join(cwd, mirrorRel);
    const existingDoc = fs.existsSync(mirrorAbs)
      ? parseMirrorDoc(readFileSafe(mirrorAbs) ?? '')
      : null;
    const labelsBefore = new Set(
      (existingDoc?.sections ?? [])
        .filter(s => s.kind === 'micro' && s.label)
        .map(s => s.label as string),
    );

    if (mode === 'inline') {
      // Trailing marker on a single line — scopes to that line/block.
      if (/@synd\b(?!ocs)/.test(lines[startIdx])) {
        return { ok: false, error: 'That line already has a @synd annotation' };
      }
      lines[startIdx] = `${lines[startIdx]} ${comment.prefix} @synd${comment.suffix}`;
    } else if (mode === 'above' || mode === 'block') {
      const indent = indentOf(lines[startIdx]);
      // Only reject if the line directly above is itself a *micro* @synd
      // marker (i.e. would collide with the one we're about to add). A
      // file-level `@syndocs` header — which by design sits at the top of
      // the file, often immediately above the first declaration — is not a
      // conflict, so match the marker word precisely rather than doing a
      // loose `.includes('@synd')` substring test (which also matched
      // "@syndocs" and made annotating the first declaration impossible).
      const prevLine = startIdx > 0 ? lines[startIdx - 1] : '';
      if (/@synd\b(?!ocs)/.test(prevLine)) {
        return { ok: false, error: 'There is already a @synd annotation above that line' };
      }
      if (mode === 'block') {
        // Insert the end marker first so the start insertion doesn't shift
        // the end index out from under us.
        lines.splice(endIdx + 1, 0, marker('@endsynd', indentOf(lines[endIdx])));
      }

      // The tokenizer merges *consecutive* comment lines into a single
      // comment span, and only the first @synd-family marker in a span is
      // read. So inserting `// @synd` directly beneath an existing comment
      // (very common — the file-level `// @syndocs` header, or a JSDoc
      // block above a declaration) would silently produce no micro-doc at
      // all. A blank separator line keeps it as its own span.
      const prevIsComment = prevLine.trim() !== '' &&
        new RegExp('^\\s*' + comment.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(prevLine);
      const toInsert = prevIsComment
        ? ['', marker('@synd', indent)]
        : [marker('@synd', indent)];
      lines.splice(startIdx, 0, ...toInsert);
    } else {
      return { ok: false, error: `Unknown annotation mode: ${mode}` };
    }

    const updatedSource = lines.join(newline);
    writeFile(absPath, updatedSource);

    // ── Regenerate the mirror doc for just this file ──────────────────────
    // Same merge strategy as `syndocs update`: match sections by label,
    // refresh code/hash, keep notes.
    const lang = getCodeBlockLang(normalized);
    const currentHash = computeHash(updatedSource);
    const anchors = parseAnchors(updatedSource, langConfig, { filePath: normalized });

    const newSections: DocSection[] = [];

    const existingWhole = existingDoc?.sections.find(s => s.kind === 'whole-file');
    newSections.push({
      kind: 'whole-file',
      hash: currentHash,
      codeCopy: updatedSource,
      codeLanguage: lang,
      notes: existingWhole?.notes ?? '',
    });

    const microAnchors = anchors.filter(a => a.kind === 'micro' && a.label);
    for (const anchor of microAnchors) {
      const nextAnchor = anchors.find(a => a.lineIndex > anchor.lineIndex);
      const microCode = extractMicroDocCode(updatedSource, anchor, nextAnchor?.lineIndex);
      const existingSection = existingDoc?.sections.find(
        s => s.kind === 'micro' && s.label === anchor.label,
      );
      newSections.push({
        kind: 'micro',
        label: anchor.label!,
        hash: computeHash(microCode),
        codeCopy: microCode,
        codeLanguage: lang,
        notes: existingSection?.notes ?? '',
        elementKind: anchor.elementKind,
        elementName: anchor.elementName,
        scopeStartLine: anchor.scopeStartLine,
        scopeEndLine: anchor.scopeEndLine,
      });
    }

    const title = existingDoc?.title ?? (normalized.split('/').pop() ?? normalized);
    writeFile(mirrorAbs, renderMirrorDoc({ title, sections: newSections }));

    const newLabels = microAnchors
      .map(a => a.label as string)
      .filter(l => !labelsBefore.has(l));

    return { ok: true, docId: normalized, newLabels };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Failed to add annotation' };
  }
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

    if (!fs.existsSync(mirrorAbs)) {
      // No mirror doc exists yet for this file — this happens when notes
      // are added from the Web UI's "Code" (codebase) tab to a file that
      // has never been through `syndocs init`/annotated with @synd markers.
      // Create a fresh mirror doc on the spot instead of refusing, so
      // "click an undocumented file, write notes, save" works end-to-end
      // without requiring a CLI round-trip first.
      const sourceAbs = path.join(cwd, id);
      if (!fs.existsSync(sourceAbs) || !getLangConfig(id)) return false;
      const sourceContent = readFileSafe(sourceAbs);
      if (sourceContent === null) return false;

      const hash = computeHash(sourceContent);
      const lang = getCodeBlockLang(id);
      const fresh = renderNewMirrorDoc(id, sourceContent, lang, hash, []);
      const parsed = parseMirrorDoc(fresh);
      const wholeSection = parsed.sections.find(s => s.kind === 'whole-file');
      if (wholeSection) wholeSection.notes = editedNotes;
      writeFile(mirrorAbs, renderMirrorDoc(parsed));
      return true;
    }

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

    // Outbound AST tokens and downstream dependencies from CodeGraph.
    // Gated on hasCodeGraph (adapter.isReady()), not just adapter truthiness
    // — an adapter can be non-null but not ready (DB missing/empty/stale),
    // in which case querying it would previously fail silently inside
    // getFileTokens's try/catch and produce an empty tokens array
    // indistinguishable from "CodeGraph has nothing to say about this file".
    const tokens = hasCodeGraph ? (adapter as any).getFileTokens?.(sourceRel) ?? [] : [];
    const downstream = hasCodeGraph ? adapter!.getImpactRadius(sourceAbs) : [];

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

  // 4. Incorporate all CodeGraph structural edges directly if ready.
  // Was previously gated on `adapter && (adapter as any).getAllEdges` —
  // truthy-checking the adapter and the method's existence, but never
  // actually checking `hasCodeGraph`/`isReady()`. A non-null-but-not-ready
  // adapter (DB present but empty/stale) would silently produce zero
  // edges here, which starves the connected-files sidebar list entirely —
  // and since thread lines are drawn TO entries in that list, an empty
  // DATA.edges means threads have nothing to draw to even when in-code
  // token highlighting (tokens, above) is working correctly.
  if (hasCodeGraph && (adapter as any).getAllEdges) {
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
    } catch (err) {
      process.stderr.write(
        `[syndocs] Warning: getAllEdges() failed while building the graph view: ` +
        `${err instanceof Error ? err.message : String(err)}\n`,
      );
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

  // Add lightweight graph nodes for any CodeGraph source/target file not yet documented.
  // Without this, buildGraph() in the browser silently drops every edge where either
  // endpoint isn't in DATA.nodes, giving an incomplete graph even when CodeGraph has
  // many more connections than the set of @syndocs-annotated files.
  // We skip obvious non-project paths (node_modules, dist, .git).
  const ignoredPrefixes = ['node_modules/', 'dist/', '.git/', '.next/', 'build/'];
  const nodeIds = new Set(nodes.map(n => n.id));
  for (const e of dedupedEdges) {
    for (const fileId of [e.source, e.target]) {
      if (!fileId || nodeIds.has(fileId)) continue;
      if (ignoredPrefixes.some(p => fileId.startsWith(p))) continue;
      const label = fileId.split('/').pop() ?? fileId;
      const parts = fileId.split('/');
      const group = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
      nodes.push({
        id: fileId,
        label,
        status: 'none',   // no mirror doc — shown as a dim node in the graph
        group,
        // Deliberately NOT type:'doc' — these are synthetic placeholders for
        // CodeGraph edge endpoints that don't have a real mirror doc (often
        // just a bare filename CodeGraph couldn't fully resolve to a project
        // path, e.g. "adapter.ts" instead of "packages/graph/src/adapter.ts").
        // They exist purely so the graph can render a dim node for them.
        // buildDocsTree() only picks up type:'doc'/'microdoc'/'guide', so
        // using a distinct type keeps these out of the Docs tab tree, where
        // they previously showed up as bogus root-level "status: none"
        // entries with the wrong (unresolved, directory-less) path.
        type: 'external',
      });
      nodeIds.add(fileId);
    }
  }

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
