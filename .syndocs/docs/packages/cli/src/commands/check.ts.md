# check.ts
<!-- syndocs-hash: e62f6d4322c5 -->

```ts
// @syndocs
import fs from 'fs';
import path from 'path';
import {
  CheckResult,
  computeDiff,
  computeHash,
  getLangConfig,
  getMicroDocPath,
  getMirrorPath,
  getSourceFromMicroDoc,
  getSourceFromMirror,
  parseAnchors,
  parseMirrorDoc,
  ParsedAnchor,
} from '@syndocs/core';
import {
  SynDocsConfig,
  GraphAdapter,
  c,
  readFileSafe,
  walkSourceFiles,
  walkMirrorDocs,
  walkMicroDocs,
  loadGraphAdapter,
  matchesTargets,
} from '../utils';

export interface CheckOptions {
  cwd: string;
  config: SynDocsConfig;
  targets?: string[];
  collection?: 'all' | 'docs' | 'microdocs';
  failOnStale?: boolean;
  blastRadius?: boolean;
}

export async function runCheck(opts: CheckOptions): Promise<number> {
  const { cwd, config, targets = [], collection = 'all', failOnStale = false, blastRadius = true } = opts;

  console.log(c.bold('SynDocs — check\n'));

  const checkDocs = collection === 'all' || collection === 'docs';
  const checkMicros = collection === 'all' || collection === 'microdocs';

  // Load graph adapter once — null if CodeGraph index absent
  const adapter: GraphAdapter = blastRadius ? await loadGraphAdapter(cwd) : null;
  if (adapter && !adapter.isReady()) {
    adapter.close();
  }

  const results: CheckResult[] = [];

  // ── 1. Check from source files outward ─────────────────────────────────────
  for (const relPath of walkSourceFiles(cwd, config)) {
    if (targets.length > 0 && !matchesTargets(relPath, targets)) continue;

    const absPath = path.join(cwd, relPath);
    const content = readFileSafe(absPath);
    if (!content) continue;

    const langConfig = getLangConfig(relPath);
    if (!langConfig) continue;

    const anchors = parseAnchors(content, langConfig);
    if (anchors.length === 0) continue;

    // Check whole-file doc if requested
    const wholeFileAnchor = anchors.find(a => a.kind === 'whole-file');
    if (checkDocs && wholeFileAnchor) {
      const mirrorRel = getMirrorPath(relPath, config.docsRoot);
      const mirrorAbs = path.join(cwd, mirrorRel);

      if (!fs.existsSync(mirrorAbs)) {
        results.push({ sourceFile: relPath, mirrorFile: mirrorRel, status: 'missing-doc' });
      } else {
        const doc = parseMirrorDoc(readFileSafe(mirrorAbs)!);
        const section = doc.sections.find(s => s.kind === 'whole-file');
        const currentHash = computeHash(content);
        const storedHash = section?.hash;

        if (!storedHash) {
          results.push({ sourceFile: relPath, mirrorFile: mirrorRel, status: 'no-hash', currentHash });
        } else if (currentHash === storedHash) {
          results.push({ sourceFile: relPath, mirrorFile: mirrorRel, status: 'ok', currentHash, storedHash });
        } else {
          const diff = computeDiff(section?.codeCopy ?? '', content);
          results.push({ sourceFile: relPath, mirrorFile: mirrorRel, status: 'stale', currentHash, storedHash, diff });
        }
      }
    }

    // Check micro-docs if requested
    if (checkMicros) {
      const microAnchors = anchors.filter(a => a.kind === 'micro' && a.label);
      for (const anchor of microAnchors) {
        const label = anchor.label!;
        const microRel = getMicroDocPath(relPath, label, config.microdocsRoot);
        const microAbs = path.join(cwd, microRel);

        const microCode = extractCodeSnippet(content, anchor, anchors, absPath, adapter);
        const currentHash = computeHash(microCode);

        if (!fs.existsSync(microAbs)) {
          results.push({
            sourceFile: relPath,
            mirrorFile: microRel,
            status: 'missing-doc',
            isMicroDoc: true,
            targetLabel: label,
            currentHash,
          });
        } else {
          const doc = parseMirrorDoc(readFileSafe(microAbs)!);
          const section = doc.sections[0];
          const storedHash = section?.hash;

          if (!storedHash) {
            results.push({
              sourceFile: relPath,
              mirrorFile: microRel,
              status: 'no-hash',
              isMicroDoc: true,
              targetLabel: label,
              currentHash,
            });
          } else if (currentHash === storedHash) {
            results.push({
              sourceFile: relPath,
              mirrorFile: microRel,
              status: 'ok',
              isMicroDoc: true,
              targetLabel: label,
              currentHash,
              storedHash,
            });
          } else {
            const diff = computeDiff(section?.codeCopy ?? '', microCode);
            results.push({
              sourceFile: relPath,
              mirrorFile: microRel,
              status: 'stale',
              isMicroDoc: true,
              targetLabel: label,
              currentHash,
              storedHash,
              diff,
            });
          }
        }
      }
    }
  }

  // ── 2. Check for orphaned docs or removed annotations ─────────────────────
  if (checkDocs) {
    for (const mirrorRel of walkMirrorDocs(config.docsRoot, cwd)) {
      try {
        const sourceRel = getSourceFromMirror(mirrorRel, config.docsRoot);
        if (targets.length > 0 && !matchesTargets(sourceRel, targets)) continue;

        const sourceAbs = path.join(cwd, sourceRel);
        if (!fs.existsSync(sourceAbs)) {
          results.push({ sourceFile: sourceRel, mirrorFile: mirrorRel, status: 'missing-source' });
        } else {
          // Source exists — verify that @syndocs annotation is still present
          const sourceContent = readFileSafe(sourceAbs);
          const langConfig = getLangConfig(sourceRel);
          if (sourceContent && langConfig) {
            const anchors = parseAnchors(sourceContent, langConfig);
            if (!anchors.some(a => a.kind === 'whole-file')) {
              results.push({ sourceFile: sourceRel, mirrorFile: mirrorRel, status: 'annotation-removed' });
            }
          }
        }
      } catch { /* skip malformed */ }
    }
  }

  if (checkMicros) {
    for (const microRel of walkMicroDocs(config.microdocsRoot, cwd)) {
      try {
        const { sourceRel, label } = getSourceFromMicroDoc(microRel, config.microdocsRoot);
        if (targets.length > 0 && !matchesTargets(sourceRel, targets)) continue;

        const sourceAbs = path.join(cwd, sourceRel);
        if (!fs.existsSync(sourceAbs)) {
          results.push({
            sourceFile: sourceRel,
            mirrorFile: microRel,
            status: 'missing-source',
            isMicroDoc: true,
            targetLabel: label,
          });
        } else {
          // Source exists — verify that @syndocs: <label> is still present
          const sourceContent = readFileSafe(sourceAbs);
          const langConfig = getLangConfig(sourceRel);
          if (sourceContent && langConfig) {
            const anchors = parseAnchors(sourceContent, langConfig);
            if (!anchors.some(a => a.kind === 'micro' && a.label === label)) {
              results.push({
                sourceFile: sourceRel,
                mirrorFile: microRel,
                status: 'micro-annotation-removed',
                isMicroDoc: true,
                targetLabel: label,
              });
            }
          }
        }
      } catch { /* skip malformed */ }
    }
  }

  // Print results (strictly read-only, no files written)
  await printResults(results, adapter, cwd, config);

  adapter?.close();

  const bad = results.filter(
    r =>
      r.status === 'stale' ||
      r.status === 'missing-doc' ||
      r.status === 'missing-source' ||
      r.status === 'annotation-removed' ||
      r.status === 'micro-annotation-removed' ||
      r.status === 'no-hash',
  ).length;

  return failOnStale && bad > 0 ? 1 : 0;
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

// ─── Output ───────────────────────────────────────────────────────────────────

async function printResults(
  results: CheckResult[],
  adapter: GraphAdapter,
  cwd: string,
  config: SynDocsConfig,
): Promise<void> {
  const ok = results.filter(r => r.status === 'ok');
  const stale = results.filter(r => r.status === 'stale');
  const missing = results.filter(r => r.status === 'missing-doc' || r.status === 'no-hash');
  const orphans = results.filter(
    r =>
      r.status === 'missing-source' ||
      r.status === 'annotation-removed' ||
      r.status === 'micro-annotation-removed',
  );

  for (const r of ok) {
    const tag = r.isMicroDoc ? c.dim('#' + r.targetLabel) : '';
    console.log('  ' + c.green('\u2713 ok') + '        ' + r.sourceFile + (tag ? ' ' + tag : ''));
  }

  for (const r of stale) {
    const tag = r.isMicroDoc ? ' ' + c.cyan('#' + r.targetLabel) : '';
    console.log('  ' + c.yellow('~ stale') + '     ' + r.sourceFile + tag);
    console.log('             ' + c.dim('stored: ') + (r.storedHash ?? 'none') + '  ' + c.dim('current: ') + r.currentHash);

    if (r.diff) {
      const lines = r.diff.split('\n').slice(0, 8);
      const hasMore = r.diff.split('\n').length > 8;
      console.log('');
      for (const l of lines) {
        const pad = '             ';
        if (l.startsWith('+')) console.log(c.green(pad + l));
        else if (l.startsWith('-')) console.log(c.red(pad + l));
        else console.log(c.dim(pad + l));
      }
      if (hasMore) console.log(c.dim('             ...'));
      console.log('');
    }

    if (adapter && !r.isMicroDoc) {
      const absPath = path.join(cwd, r.sourceFile);
      const downstream = adapter.getImpactRadius(absPath).filter(f => {
        const mirrorAbs = path.join(cwd, getMirrorPath(f, config.docsRoot));
        return fs.existsSync(mirrorAbs) && f !== r.sourceFile;
      });

      if (downstream.length > 0) {
        console.log('  ' + c.yellow('  \u26a1 downstream docs may be affected:'));
        for (const f of downstream.slice(0, 5)) {
          console.log('       ' + c.dim(f));
        }
        if (downstream.length > 5) {
          console.log('       ' + c.dim('\u2026and ' + (downstream.length - 5) + ' more'));
        }
        console.log('');
      }
    }
  }

  for (const r of missing) {
    const tag = r.isMicroDoc ? ' #' + r.targetLabel : '';
    if (r.status === 'missing-doc') {
      console.log('  ' + c.yellow('! no doc') + '    ' + r.sourceFile + tag + '  ' + c.dim('\u2192 run syndocs update'));
    } else {
      console.log('  ' + c.yellow('! no hash') + '   ' + r.sourceFile + tag + '  ' + c.dim('\u2192 run syndocs update'));
    }
  }

  for (const r of orphans) {
    const tag = r.isMicroDoc ? ' #' + r.targetLabel : '';
    if (r.status === 'annotation-removed') {
      console.log('  ' + c.yellow('! removed') + '   ' + r.sourceFile + '  ' + c.dim('\u2192 @syndocs annotation removed in source'));
    } else if (r.status === 'micro-annotation-removed') {
      console.log('  ' + c.yellow('! removed') + '   ' + r.sourceFile + tag + '  ' + c.dim('\u2192 micro-doc label removed in source'));
    } else {
      console.log('  ' + c.red('\u2717 orphan') + '    ' + r.mirrorFile + '  ' + c.dim('\u2192 source deleted'));
    }
  }

  console.log('');
  const msgs = [
    c.green(String(ok.length)) + ' ok',
    stale.length ? c.yellow(stale.length + ' stale') : '',
    missing.length ? c.yellow(missing.length + ' missing') : '',
    orphans.length ? c.red(orphans.length + ' attention') : '',
  ].filter(Boolean);

  console.log('  ' + c.bold('Result:') + '  ' + msgs.join(', ') + '  (' + results.length + ' documented items)');
  if (adapter) console.log('  ' + c.dim('(blast-radius: on)'));
}
```

## Notes

> _Add documentation notes here._
