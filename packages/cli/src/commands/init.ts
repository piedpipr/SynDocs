// @syndocs
import fs from 'fs';
import path from 'path';
import {
  computeHash,
  getCodeBlockLang,
  getLangConfig,
  getMicroDocPath,
  getMirrorPath,
  hashPassword,
  parseAnchors,
  ParsedAnchor,
  renderMicroDoc,
  renderNewMirrorDoc,
} from '@syndocs/core';
import {
  SynDocsConfig,
  GraphAdapter,
  c,
  ensureDir,
  readFileSafe,
  walkSourceFiles,
  writeFile,
  loadGraphAdapter,
} from '../utils';
import { execSync } from 'child_process';

export interface InitOptions {
  cwd: string;
  config: SynDocsConfig;
  dryRun?: boolean;
  skipCodegraph?: boolean;
}

export async function runInit(opts: InitOptions): Promise<void> {
  const { cwd, config, dryRun, skipCodegraph } = opts;

  console.log(c.bold('SynDocs — init\n'));
  if (dryRun) console.log(c.yellow('  dry-run mode: no files will be written\n'));

  // Ensure directory structure exists
  if (!dryRun) {
    ensureDir(path.join(cwd, config.docsRoot));
    ensureDir(path.join(cwd, config.microdocsRoot));
    ensureDir(path.join(cwd, config.guidesRoot));

    const cfgPath = path.join(cwd, 'syndocs.config.json');
    if (!fs.existsSync(cfgPath)) {
      const defaultJson = JSON.stringify(config, null, 2) + '\n';
      fs.writeFileSync(cfgPath, defaultJson, 'utf8');
      console.log('  ' + c.green('+ created') + '   syndocs.config.json');
    }

    const authFile = path.join(cwd, '.syndocs', 'auth.json');
    if (!fs.existsSync(authFile)) {
      const { hash, salt } = hashPassword('syndocs');
      fs.writeFileSync(
        authFile,
        JSON.stringify({ hash, salt, createdAt: new Date().toISOString() }, null, 2) + '\n',
        'utf8',
      );
      console.log('  ' + c.green('+ created') + '   .syndocs/auth.json ' + c.dim('(default code: "syndocs" — change with `syndocs auth`)'));
    }
  }

  // Load graph adapter for AST-exact micro-doc boundaries
  const adapter: GraphAdapter = await loadGraphAdapter(cwd);

  // ── 1. Create docs & micro-docs ─────────────────────────────────────────────

  let docsCreated = 0, microsCreated = 0, skipped = 0, found = 0;

  for (const relPath of walkSourceFiles(cwd, config)) {
    const absPath = path.join(cwd, relPath);
    const content = readFileSafe(absPath);
    if (!content) continue;

    const langConfig = getLangConfig(relPath);
    if (!langConfig) continue;

    const anchors = parseAnchors(content, langConfig);
    if (anchors.length === 0) continue;

    found++;

    const hash = computeHash(content);
    const lang = getCodeBlockLang(relPath);

    // Whole-file doc
    const wholeFileAnchor = anchors.find(a => a.kind === 'whole-file');
    if (wholeFileAnchor) {
      const mirrorRel = getMirrorPath(relPath, config.docsRoot);
      const mirrorAbs = path.join(cwd, mirrorRel);

      if (fs.existsSync(mirrorAbs)) {
        skipped++;
      } else {
        const docContent = renderNewMirrorDoc(relPath, content, lang, hash);
        if (!dryRun) writeFile(mirrorAbs, docContent);
        console.log('  ' + c.green('+ created') + '   ' + relPath + '  \u2192  ' + c.cyan(mirrorRel));
        docsCreated++;
      }
    }

    // Micro-docs
    const microAnchors = anchors.filter(a => a.kind === 'micro' && a.label);
    for (const anchor of microAnchors) {
      const label = anchor.label!;
      const microRel = getMicroDocPath(relPath, label, config.microdocsRoot);
      const microAbs = path.join(cwd, microRel);

      if (fs.existsSync(microAbs)) {
        skipped++;
      } else {
        const microCode = extractCodeSnippet(content, anchor, anchors, absPath, adapter);
        const microHash = computeHash(microCode);
        const microDocContent = renderMicroDoc(relPath, label, microCode, lang, microHash);
        if (!dryRun) writeFile(microAbs, microDocContent);
        console.log('  ' + c.green('+ created') + '   ' + relPath + ' ' + c.cyan('#' + label) + '  \u2192  ' + c.dim(microRel));
        microsCreated++;
      }
    }
  }

  adapter?.close();

  console.log('');
  console.log(
    '  ' + c.bold('Summary:') + '  '
    + c.green(String(docsCreated)) + ' mirror docs, '
    + c.green(String(microsCreated)) + ' micro-docs created, '
    + c.dim(String(skipped)) + ' already existed',
  );

  if (found === 0) {
    console.log('');
    console.log(c.yellow('  No @syndocs markers found.') + ' Add one to a source file:\n');
    console.log('    // @syndocs              \u2190 whole-file (JS/TS/PHP/Go/\u2026)');
    console.log('    # @syndocs               \u2190 whole-file (Python/Ruby/YAML/\u2026)');
    console.log('    // @syndocs: my-label    \u2190 micro-doc for a specific block');
  }

  // ── 2. CodeGraph index ──────────────────────────────────────────────────────

  if (skipCodegraph || dryRun) return;

  const cgDb = path.join(cwd, '.codegraph', 'codegraph.db');
  if (fs.existsSync(cgDb)) {
    console.log('\n  ' + c.dim('CodeGraph index already exists — skipping codegraph init'));
    return;
  }

  console.log('\n  ' + c.bold('CodeGraph') + '  initialising code graph\u2026');

  try {
    execSync('codegraph init --yes', { cwd, stdio: 'inherit' });
    console.log('  ' + c.green('\u2713') + '  CodeGraph index built — run ' + c.cyan('syndocs graph-link') + ' to wire wiki-links');
  } catch {
    console.log('  ' + c.yellow('\u26a0') + '  codegraph not found or failed.');
    console.log('       ' + c.cyan('npm i -g @colbymchenry/codegraph') + '  then re-run ' + c.cyan('syndocs init'));
    console.log('  Core drift-detection works without it; graph-link and blast-radius need it.');
  }
}

function extractCodeSnippet(
  content: string,
  anchor: ParsedAnchor,
  allAnchors: ParsedAnchor[],
  absPath: string,
  adapter: GraphAdapter,
): string {
  const lines = content.split('\n');
  let startLine = anchor.lineIndex + 1;
  let endLine: number | undefined;

  if (adapter) {
    const boundary = adapter.getNodeBoundary(absPath, startLine);
    if (boundary) {
      startLine = boundary.startLine - 1;
      endLine = boundary.endLine;
    }
  }

  if (endLine === undefined) {
    const nextAnchor = allAnchors.find(a => a.lineIndex > anchor.lineIndex);
    endLine = nextAnchor?.lineIndex ?? lines.length;
  }

  return lines.slice(startLine, endLine).join('\n').trim();
}
