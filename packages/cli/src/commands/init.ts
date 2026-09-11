// @syndocs
import fs from 'fs';
import path from 'path';
import {
  computeHash,
  getCodeBlockLang,
  getLangConfig,
  getMirrorPath,
  parseAnchors,
  renderNewMirrorDoc,
} from '@syndocs/core';
import { SynDocsConfig, c, readFileSafe, walkSourceFiles, writeFile, loadGraphAdapter } from '../utils';
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

  // ── 1. Mirror docs ──────────────────────────────────────────────────────────

  let created = 0, skipped = 0, found = 0;

  for (const relPath of walkSourceFiles(cwd, config)) {
    const absPath = path.join(cwd, relPath);
    const content = readFileSafe(absPath);
    if (!content) continue;

    const langConfig = getLangConfig(relPath);
    if (!langConfig) continue;

    const anchors = parseAnchors(content, langConfig);
    if (anchors.length === 0) continue;

    found++;

    const mirrorRel = getMirrorPath(relPath, config.docsRoot);
    const mirrorAbs = path.join(cwd, mirrorRel);

    if (fs.existsSync(mirrorAbs)) {
      console.log('  ' + c.dim('skip') + '  ' + relPath + '  ' + c.dim('\u2192 mirror doc exists'));
      skipped++;
      continue;
    }

    const hash = computeHash(content);
    const lang = getCodeBlockLang(relPath);
    const docContent = renderNewMirrorDoc(relPath, content, lang, hash);

    if (!dryRun) writeFile(mirrorAbs, docContent);
    console.log('  ' + c.green('create') + '  ' + relPath + '  \u2192  ' + c.cyan(mirrorRel));
    created++;
  }

  console.log('');
  console.log(
    '  ' + c.bold('Mirror docs:') + '  ' + c.green(String(created)) + ' created, '
    + c.dim(String(skipped)) + ' skipped, '
    + c.dim(String(found)) + ' documented files found',
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
    console.log('  ' + c.yellow('\u26a0') + '  codegraph not found — install it with:');
    console.log('       ' + c.cyan('npm i -g @colbymchenry/codegraph') + '  then re-run ' + c.cyan('syndocs init'));
    console.log('  Core drift-detection works without it; graph-link and blast-radius need it.');
  }
}
