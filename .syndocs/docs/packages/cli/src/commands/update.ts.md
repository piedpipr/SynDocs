# update.ts
<!-- syndocs-hash: 971c5e1aca60 -->

```ts
// @syndocs
import fs from 'fs';
import path from 'path';
import {
  computeHash,
  getCodeBlockLang,
  getLangConfig,
  getMicroDocPath,
  getMirrorPath,
  getSourceFromMicroDoc,
  getSourceFromMirror,
  parseAnchors,
  parseMirrorDoc,
  ParsedAnchor,
  renderMicroDoc,
  renderMirrorDoc,
  renderNewMirrorDoc,
} from '@syndocs/core';
import {
  SynDocsConfig,
  GraphAdapter,
  c,
  readFileSafe,
  walkSourceFiles,
  walkMirrorDocs,
  walkMicroDocs,
  writeFile,
  loadGraphAdapter,
  matchesTargets,
} from '../utils';

export interface UpdateOptions {
  cwd: string;
  config: SynDocsConfig;
  targets?: string[];
  collection?: 'all' | 'docs' | 'microdocs';
  dryRun?: boolean;
  prune?: boolean;
}

export async function runUpdate(opts: UpdateOptions): Promise<void> {
  const { cwd, config, targets = [], collection = 'all', dryRun = false, prune = false } = opts;

  console.log(c.bold('SynDocs — update\n'));
  if (dryRun) console.log(c.yellow('  dry-run mode: no files will be written\n'));

  const updateDocs = collection === 'all' || collection === 'docs';
  const updateMicros = collection === 'all' || collection === 'microdocs';

  // Load graph adapter for AST-exact micro-doc boundaries
  const adapter: GraphAdapter = await loadGraphAdapter(cwd);

  let created = 0, updated = 0, alreadyOk = 0, skipped = 0, pruned = 0, orphanedKept = 0;

  // ── 1. Update & auto-create from source files ──────────────────────────────
  for (const relPath of walkSourceFiles(cwd, config)) {
    if (targets.length > 0 && !matchesTargets(relPath, targets)) continue;

    const absPath = path.join(cwd, relPath);
    const content = readFileSafe(absPath);
    if (!content) {
      console.log('  ' + c.red('\u2717 not found') + '  ' + relPath);
      skipped++;
      continue;
    }

    const langConfig = getLangConfig(relPath);
    if (!langConfig) {
      skipped++;
      continue;
    }

    const anchors = parseAnchors(content, langConfig);
    if (anchors.length === 0) {
      if (targets.length > 0) {
        console.log('  ' + c.dim('skip') + '  ' + relPath + '  ' + c.dim('(no @syndocs marker)'));
      }
      skipped++;
      continue;
    }

    const currentHash = computeHash(content);
    const lang = getCodeBlockLang(relPath);

    // Whole-file doc
    const wholeFileAnchor = anchors.find(a => a.kind === 'whole-file');
    if (updateDocs && wholeFileAnchor) {
      const mirrorRel = getMirrorPath(relPath, config.docsRoot);
      const mirrorAbs = path.join(cwd, mirrorRel);

      if (!fs.existsSync(mirrorAbs)) {
        // Auto-create brand-new mirror doc!
        const docContent = renderNewMirrorDoc(relPath, content, lang, currentHash);
        if (!dryRun) writeFile(mirrorAbs, docContent);
        console.log('  ' + c.green('+ created') + '   ' + relPath + '  \u2192  ' + c.cyan(mirrorRel));
        created++;
      } else {
        const doc = parseMirrorDoc(readFileSafe(mirrorAbs)!);
        const section = doc.sections.find(s => s.kind === 'whole-file');

        if (section?.hash === currentHash && !section.pendingDiff) {
          alreadyOk++;
        } else {
          const updatedSections = doc.sections.map(s =>
            s.kind === 'whole-file'
              ? { ...s, hash: currentHash, codeCopy: content, codeLanguage: lang, pendingDiff: undefined }
              : s,
          );
          if (!dryRun) writeFile(mirrorAbs, renderMirrorDoc({ ...doc, sections: updatedSections }));
          console.log('  ' + c.green('\u2191 updated') + '   ' + relPath + '  \u2192  ' + c.cyan(mirrorRel));
          updated++;
        }
      }
    }

    // Micro-docs
    if (updateMicros) {
      const microAnchors = anchors.filter(a => a.kind === 'micro' && a.label);
      for (const anchor of microAnchors) {
        const label = anchor.label!;
        const microRel = getMicroDocPath(relPath, label, config.microdocsRoot);
        const microAbs = path.join(cwd, microRel);

        const microCode = extractCodeSnippet(content, anchor, anchors, absPath, adapter);
        const microHash = computeHash(microCode);

        if (!fs.existsSync(microAbs)) {
          // Auto-create brand-new micro-doc!
          const microDocContent = renderMicroDoc(relPath, label, microCode, lang, microHash);
          if (!dryRun) writeFile(microAbs, microDocContent);
          console.log('  ' + c.green('+ created') + '   ' + relPath + ' ' + c.cyan('#' + label) + '  \u2192  ' + c.dim(microRel));
          created++;
        } else {
          const doc = parseMirrorDoc(readFileSafe(microAbs)!);
          const section = doc.sections[0];

          if (section?.hash === microHash && !section.pendingDiff) {
            alreadyOk++;
          } else {
            const notes = section?.notes ?? '';
            const updatedContent = renderMicroDoc(relPath, label, microCode, lang, microHash, notes);
            if (!dryRun) writeFile(microAbs, updatedContent);
            console.log('  ' + c.green('\u2191 updated') + '   ' + relPath + ' ' + c.cyan('#' + label));
            updated++;
          }
        }
      }
    }
  }

  // ── 2. Orphan check & prune handling ──────────────────────────────────────
  if (updateDocs) {
    for (const mirrorRel of walkMirrorDocs(config.docsRoot, cwd)) {
      try {
        const sourceRel = getSourceFromMirror(mirrorRel, config.docsRoot);
        if (targets.length > 0 && !matchesTargets(sourceRel, targets)) continue;

        const sourceAbs = path.join(cwd, sourceRel);
        const mirrorAbs = path.join(cwd, mirrorRel);

        let isOrphan = false;
        let reason = '';

        if (!fs.existsSync(sourceAbs)) {
          isOrphan = true;
          reason = 'source deleted';
        } else {
          const sourceContent = readFileSafe(sourceAbs);
          const langConfig = getLangConfig(sourceRel);
          if (sourceContent && langConfig) {
            const anchors = parseAnchors(sourceContent, langConfig);
            if (!anchors.some(a => a.kind === 'whole-file')) {
              isOrphan = true;
              reason = '@syndocs annotation removed in source';
            }
          }
        }

        if (isOrphan) {
          if (prune) {
            if (!dryRun) fs.unlinkSync(mirrorAbs);
            console.log('  ' + c.red('\u2717 pruned') + '    ' + mirrorRel + '  ' + c.dim('(' + reason + ')'));
            pruned++;
          } else {
            console.log('  ' + c.yellow('! orphan') + '    ' + mirrorRel + '  ' + c.dim('(' + reason + ') — kept (use --prune to delete)'));
            orphanedKept++;
          }
        }
      } catch { /* skip malformed */ }
    }
  }

  if (updateMicros) {
    for (const microRel of walkMicroDocs(config.microdocsRoot, cwd)) {
      try {
        const { sourceRel, label } = getSourceFromMicroDoc(microRel, config.microdocsRoot);
        if (targets.length > 0 && !matchesTargets(sourceRel, targets)) continue;

        const sourceAbs = path.join(cwd, sourceRel);
        const microAbs = path.join(cwd, microRel);

        let isOrphan = false;
        let reason = '';

        if (!fs.existsSync(sourceAbs)) {
          isOrphan = true;
          reason = 'source deleted';
        } else {
          const sourceContent = readFileSafe(sourceAbs);
          const langConfig = getLangConfig(sourceRel);
          if (sourceContent && langConfig) {
            const anchors = parseAnchors(sourceContent, langConfig);
            if (!anchors.some(a => a.kind === 'micro' && a.label === label)) {
              isOrphan = true;
              reason = `label #${label} removed in source`;
            }
          }
        }

        if (isOrphan) {
          if (prune) {
            if (!dryRun) fs.unlinkSync(microAbs);
            console.log('  ' + c.red('\u2717 pruned') + '    ' + microRel + '  ' + c.dim('(' + reason + ')'));
            pruned++;
          } else {
            console.log('  ' + c.yellow('! orphan') + '    ' + microRel + '  ' + c.dim('(' + reason + ') — kept (use --prune to delete)'));
            orphanedKept++;
          }
        }
      } catch { /* skip malformed */ }
    }
  }

  adapter?.close();

  console.log('');
  const msgs = [
    created ? c.green(String(created) + ' created') : '',
    c.green(String(updated)) + ' updated',
    c.dim(String(alreadyOk) + ' already current'),
    pruned ? c.red(String(pruned) + ' pruned') : '',
    orphanedKept ? c.yellow(String(orphanedKept) + ' orphaned (kept)') : '',
    skipped ? c.dim(String(skipped) + ' skipped') : '',
  ].filter(Boolean);

  console.log('  ' + c.bold('Result:') + '  ' + msgs.join(', '));
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
```

## Notes

> _Add documentation notes here._
