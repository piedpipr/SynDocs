# init.ts
<!-- syndocs-hash: d8c5856f6cf7 -->

```ts
// @syndocs
import fs from 'fs';
import path from 'path';
import {
  computeHash,
  getCodeBlockLang,
  getLangConfig,
  getMirrorPath,
  hashPassword,
  parseAnchors,
  ParsedAnchor,
  renderNewMirrorDoc,
  extractMicroDocCode,
  DocSection,
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
import readline from 'readline';

function askPrompt(question: string): Promise<string> {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) return resolve('');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export interface InitOptions {
  cwd: string;
  config: SynDocsConfig;
  dryRun?: boolean;
  skipCodegraph?: boolean;
  accessCode?: string;
}

export async function runInit(opts: InitOptions): Promise<void> {
  const { cwd, config, dryRun, skipCodegraph, accessCode } = opts;

  console.log(c.bold('SynDocs — init\n'));
  if (dryRun) console.log(c.yellow('  dry-run mode: no files will be written\n'));

  // Ensure directory structure exists
  if (!dryRun) {
    ensureDir(path.join(cwd, config.docsRoot));
    ensureDir(path.join(cwd, config.guidesRoot));

    const cfgPath = path.join(cwd, 'syndocs.config.json');
    if (!fs.existsSync(cfgPath)) {
      const defaultJson = JSON.stringify(config, null, 2) + '\n';
      fs.writeFileSync(cfgPath, defaultJson, 'utf8');
      console.log('  ' + c.green('+ created') + '   syndocs.config.json');
    }

    const authFile = path.join(cwd, '.syndocs', 'auth.json');
    if (!fs.existsSync(authFile) || accessCode) {
      let codeToUse = accessCode;
      if (!codeToUse && process.stdin.isTTY) {
        codeToUse = await askPrompt('  Enter access code for Web UI editing [default: syndocs]: ');
      }
      if (!codeToUse) codeToUse = 'syndocs';
      const { hash, salt } = hashPassword(codeToUse);
      fs.writeFileSync(
        authFile,
        JSON.stringify({ hash, salt, createdAt: new Date().toISOString() }, null, 2) + '\n',
        'utf8',
      );
      console.log('  ' + c.green('+ configured') + ' .syndocs/auth.json ' + c.dim(`(edit access code: "${codeToUse}")`));
    }
  }

  // Load graph adapter for AST-exact micro-doc boundaries
  const adapter: GraphAdapter = await loadGraphAdapter(cwd);

  // ── 1. Create docs & micro-docs ─────────────────────────────────────────────

  let docsCreated = 0, skipped = 0, found = 0;

  for (const relPath of walkSourceFiles(cwd, config)) {
    const absPath = path.join(cwd, relPath);
    const content = readFileSafe(absPath);
    if (!content) continue;

    const langConfig = getLangConfig(relPath);
    if (!langConfig) continue;

    const anchors = parseAnchors(content, langConfig);
    if (anchors.length === 0) continue;

    found++;

    const currentHash = computeHash(content);
    const lang = getCodeBlockLang(relPath);

    const mirrorRel = getMirrorPath(relPath, config.docsRoot);
    const mirrorAbs = path.join(cwd, mirrorRel);

    if (fs.existsSync(mirrorAbs)) {
      skipped++;
      continue;
    }

    // Build micro-doc sections
    const microSections: DocSection[] = [];
    const microAnchors = anchors.filter(a => a.kind === 'micro' && a.label);
    
    for (const anchor of microAnchors) {
      // Scope resolution with GraphAdapter if CodeGraph active
      if (adapter && anchor.autoScoped && anchor.scopeStartLine === undefined) {
         const boundary = adapter.getNextNode(absPath, anchor.lineIndex + 1);
         if (boundary) {
           anchor.scopeStartLine = boundary.startLine - 1;
           anchor.scopeEndLine = boundary.endLine;
         }
      }

      const nextAnchor = anchors.find(a => a.lineIndex > anchor.lineIndex);
      const microCode = extractMicroDocCode(content, anchor, nextAnchor?.lineIndex);
      const microHash = computeHash(microCode);

      microSections.push({
        kind: 'micro',
        label: anchor.label!,
        hash: microHash,
        codeCopy: microCode,
        codeLanguage: lang,
        notes: '',
        elementKind: anchor.elementKind,
        elementName: anchor.elementName,
        scopeStartLine: anchor.scopeStartLine,
        scopeEndLine: anchor.scopeEndLine,
      });
    }

    const docContent = renderNewMirrorDoc(relPath, content, lang, currentHash, microSections);
    if (!dryRun) writeFile(mirrorAbs, docContent);
    console.log('  ' + c.green('+ created') + '   ' + relPath + '  \u2192  ' + c.cyan(mirrorRel));
    docsCreated++;
  }

  adapter?.close();

  console.log('');
  console.log(
    '  ' + c.bold('Summary:') + '  '
    + c.green(String(docsCreated)) + ' mirror docs created, '
    + c.dim(String(skipped)) + ' already existed',
  );

  if (found === 0) {
    console.log('');
    console.log(c.yellow('  No @synd or @syndocs markers found.') + ' Add one to a source file:\n');
    console.log('    // @synd              \u2190 whole-file (JS/TS/PHP/Go/\u2026)');
    console.log('    # @synd               \u2190 whole-file (Python/Ruby/YAML/\u2026)');
    console.log('    // @synd: my-label    \u2190 micro-doc for a specific block');
    console.log('    const X = 1; // @synd \u2190 micro-doc for single line scoped block');
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
```

## Notes

> _Add documentation notes here._

---

## @synd: log
> 🔍 method · `log` · lines 167–167
<!-- syndocs-hash: 9353c5511b6e -->

```ts
console.log('    // @synd              \u2190 whole-file (JS/TS/PHP/Go/\u2026)');
```

### Notes

> _Add documentation notes here._

---

## @synd: my-label
<!-- syndocs-hash: 01ba4719c80b -->

```ts

```

### Notes

> _Add documentation notes here._

---

## @synd: x
> 🔍 variable · `X` · lines 170–170
<!-- syndocs-hash: 6088a0185746 -->

```ts
console.log('    const X = 1; // @synd \u2190 micro-doc for single line scoped block');
```

### Notes

> _Add documentation notes here._
