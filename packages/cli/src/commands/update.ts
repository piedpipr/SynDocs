// @syndocs
import fs from 'fs';
import path from 'path';
import {
  computeHash,
  getCodeBlockLang,
  getLangConfig,
  getMirrorPath,
  parseAnchors,
  parseMirrorDoc,
  renderMirrorDoc,
} from '@syndocs/core';
import {
  SynDocsConfig,
  GraphAdapter,
  c,
  readFileSafe,
  walkSourceFiles,
  writeFile,
  loadGraphAdapter,
} from '../utils';

export interface UpdateOptions {
  cwd: string;
  config: SynDocsConfig;
  files?: string[];
  dryRun?: boolean;
}

export async function runUpdate(opts: UpdateOptions): Promise<void> {
  const { cwd, config, files, dryRun } = opts;

  console.log(c.bold('SynDocs — update\n'));
  if (dryRun) console.log(c.yellow('  dry-run mode: no files will be written\n'));

  // Load graph adapter for AST-exact micro-doc boundaries
  const adapter: GraphAdapter = await loadGraphAdapter(cwd);

  let updated = 0, alreadyOk = 0, skipped = 0;

  const targets = files && files.length > 0
    ? files
    : Array.from(walkSourceFiles(cwd, config));

  for (const relPath of targets) {
    const absPath = path.join(cwd, relPath);
    const content = readFileSafe(absPath);

    if (!content) {
      console.log('  ' + c.red('\u2717 not found') + '  ' + relPath);
      skipped++; continue;
    }

    const langConfig = getLangConfig(relPath);
    if (!langConfig) { skipped++; continue; }

    const anchors = parseAnchors(content, langConfig);
    if (anchors.length === 0) {
      if (files?.length) console.log('  ' + c.dim('skip') + '  ' + relPath + '  ' + c.dim('(no @syndocs marker)'));
      skipped++; continue;
    }

    const mirrorRel = getMirrorPath(relPath, config.docsRoot);
    const mirrorAbs = path.join(cwd, mirrorRel);

    if (!fs.existsSync(mirrorAbs)) {
      console.log('  ' + c.yellow('! no doc') + '  ' + relPath + '  ' + c.dim('\u2192 run syndocs init first'));
      skipped++; continue;
    }

    const doc         = parseMirrorDoc(readFileSafe(mirrorAbs)!);
    const currentHash = computeHash(content);
    const lang        = getCodeBlockLang(relPath);
    const lines       = content.split('\n');

    const wholeSection = doc.sections.find(s => s.kind === 'whole-file');
    if (wholeSection?.hash === currentHash && !wholeSection.pendingDiff) {
      console.log('  ' + c.green('\u2713 ok') + '  ' + relPath + '  ' + c.dim('(already current)'));
      alreadyOk++; continue;
    }

    const updatedSections = doc.sections.map(section => {
      if (section.kind === 'whole-file') {
        return { ...section, hash: currentHash, codeCopy: content, codeLanguage: lang, pendingDiff: undefined };
      }

      // Micro-doc: find the anchor, then use CodeGraph for exact AST boundary
      const anchor = anchors.find(a => a.kind === 'micro' && a.label === section.label);
      if (!anchor) return section;

      let startLine = anchor.lineIndex + 1;
      let endLine: number | undefined;

      // Ask CodeGraph for the AST node at this location for an exact boundary
      if (adapter) {
        const boundary = adapter.getNodeBoundary(absPath, startLine);
        if (boundary) {
          startLine = boundary.startLine - 1; // 0-based
          endLine   = boundary.endLine;       // exclusive upper bound
        }
      }

      if (endLine === undefined) {
        // Fallback: scan to next anchor
        const nextAnchor = anchors.find(a => a.lineIndex > anchor.lineIndex);
        endLine = nextAnchor?.lineIndex ?? lines.length;
      }

      const microCode = lines.slice(startLine, endLine).join('\n').trim();
      const microHash = computeHash(microCode);

      return { ...section, hash: microHash, codeCopy: microCode, codeLanguage: lang, pendingDiff: undefined };
    });

    if (!dryRun) writeFile(mirrorAbs, renderMirrorDoc({ ...doc, sections: updatedSections }));
    console.log('  ' + c.green('\u2191 updated') + '  ' + relPath + '  \u2192  ' + c.cyan(mirrorRel));
    updated++;
  }

  adapter?.close();

  console.log('');
  console.log(
    '  ' + c.bold('Result:') + '  ' + c.green(String(updated)) + ' updated, '
    + c.dim(String(alreadyOk)) + ' already current, '
    + c.dim(String(skipped)) + ' skipped',
  );
}
