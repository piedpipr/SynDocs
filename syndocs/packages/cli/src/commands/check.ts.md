# check.ts
<!-- syndocs-hash: 8d86c997475b -->

```ts
// @syndocs
import fs from 'fs';
import path from 'path';
import {
  CheckResult,
  computeDiff,
  computeHash,
  getLangConfig,
  getMirrorPath,
  getSourceFromMirror,
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
  walkMirrorDocs,
  writeFile,
  loadGraphAdapter,
} from '../utils';

export interface CheckOptions {
  cwd: string;
  config: SynDocsConfig;
  annotate?: boolean;
  failOnStale?: boolean;
  blastRadius?: boolean;
}

export async function runCheck(opts: CheckOptions): Promise<number> {
  const { cwd, config, annotate = true, failOnStale = false, blastRadius = true } = opts;

  console.log(c.bold('SynDocs — check\n'));

  // Load graph adapter once — null if CodeGraph index absent
  const adapter: GraphAdapter = blastRadius ? await loadGraphAdapter(cwd) : null;
  if (adapter && !adapter.isReady()) {
    // DB exists but index is empty — treat as absent
    adapter.close();
  }

  const results: CheckResult[] = [];

  for (const relPath of walkSourceFiles(cwd, config)) {
    const absPath = path.join(cwd, relPath);
    const content = readFileSafe(absPath);
    if (!content) continue;

    const langConfig = getLangConfig(relPath);
    if (!langConfig) continue;

    const anchors = parseAnchors(content, langConfig);
    if (anchors.length === 0) continue;

    const mirrorRel = getMirrorPath(relPath, config.docsRoot);
    const mirrorAbs = path.join(cwd, mirrorRel);

    if (!fs.existsSync(mirrorAbs)) {
      results.push({ sourceFile: relPath, mirrorFile: mirrorRel, status: 'missing-doc' });
      continue;
    }

    const doc      = parseMirrorDoc(readFileSafe(mirrorAbs)!);
    const section  = doc.sections.find(s => s.kind === 'whole-file');
    if (!section) continue;

    const currentHash = computeHash(content);
    const storedHash  = section.hash;

    if (!storedHash) {
      results.push({ sourceFile: relPath, mirrorFile: mirrorRel, status: 'no-hash', currentHash });
      continue;
    }

    if (currentHash === storedHash) {
      results.push({ sourceFile: relPath, mirrorFile: mirrorRel, status: 'ok', currentHash, storedHash });
      continue;
    }

    const diff = computeDiff(section.codeCopy ?? '', content);
    results.push({ sourceFile: relPath, mirrorFile: mirrorRel, status: 'stale', currentHash, storedHash, diff });

    if (annotate) {
      const updated = {
        ...doc,
        sections: doc.sections.map(s =>
          s.kind === 'whole-file' ? { ...s, pendingDiff: diff } : s,
        ),
      };
      writeFile(mirrorAbs, renderMirrorDoc(updated));
    }
  }

  // Orphaned mirror docs (source deleted)
  for (const mirrorRel of walkMirrorDocs(config.docsRoot, cwd)) {
    try {
      const sourceRel = getSourceFromMirror(mirrorRel, config.docsRoot);
      if (!fs.existsSync(path.join(cwd, sourceRel))) {
        results.push({ sourceFile: sourceRel, mirrorFile: mirrorRel, status: 'missing-source' });
      }
    } catch { /* skip malformed */ }
  }

  // Print
  await printResults(results, adapter, cwd, config);

  adapter?.close();

  const bad = results.filter(r => r.status === 'stale' || r.status === 'missing-doc' ||
                                   r.status === 'missing-source' || r.status === 'no-hash').length;
  return failOnStale && bad > 0 ? 1 : 0;
}

// ─── Output ───────────────────────────────────────────────────────────────────

async function printResults(
  results: CheckResult[],
  adapter: GraphAdapter,
  cwd: string,
  config: SynDocsConfig,
): Promise<void> {
  const ok      = results.filter(r => r.status === 'ok');
  const stale   = results.filter(r => r.status === 'stale');
  const missing = results.filter(r =>
    r.status === 'missing-doc' || r.status === 'missing-source' || r.status === 'no-hash');

  for (const r of ok) {
    console.log('  ' + c.green('\u2713 ok') + '        ' + r.sourceFile);
  }

  for (const r of stale) {
    console.log('  ' + c.yellow('~ stale') + '     ' + r.sourceFile);
    console.log('             ' + c.dim('stored: ') + r.storedHash + '  ' + c.dim('current: ') + r.currentHash);

    if (r.diff) {
      const lines   = r.diff.split('\n').slice(0, 8);
      const hasMore = r.diff.split('\n').length > 8;
      console.log('');
      for (const l of lines) {
        const pad = '             ';
        if (l.startsWith('+'))      console.log(c.green(pad + l));
        else if (l.startsWith('-')) console.log(c.red(pad + l));
        else                        console.log(c.dim(pad + l));
      }
      if (hasMore) console.log(c.dim('             ...'));
      console.log('');
    }

    // Blast-radius warning — which other documented files depend on this one
    if (adapter) {
      const absPath    = path.join(cwd, r.sourceFile);
      const downstream = adapter.getImpactRadius(absPath)
        .filter(f => {
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
    if (r.status === 'missing-doc') {
      console.log('  ' + c.yellow('! no doc') + '    ' + r.sourceFile + '  ' + c.dim('\u2192 run syndocs init'));
    } else if (r.status === 'missing-source') {
      console.log('  ' + c.red('\u2717 orphan') + '    ' + r.mirrorFile + '  ' + c.dim('\u2192 source deleted'));
    } else {
      console.log('  ' + c.yellow('! no hash') + '   ' + r.sourceFile + '  ' + c.dim('\u2192 run syndocs update'));
    }
  }

  console.log('');
  const msgs = [
    c.green(String(ok.length)) + ' ok',
    stale.length   ? c.yellow(stale.length + ' stale')      : '',
    missing.length ? c.yellow(missing.length + ' attention') : '',
  ].filter(Boolean);
  console.log('  ' + c.bold('Result:') + '  ' + msgs.join(', ') + '  (' + results.length + ' documented files)');
  if (adapter) console.log('  ' + c.dim('(blast-radius: on)'));
}
```

<!-- syndocs-graph-start -->
| Line | Symbol | Links to | Edge |
|------|--------|----------|------|
| 38 | `runCheck` | [[anchor-parser.ts#parseanchors]] | calls |
| 40 | `runCheck` | [[mirror-path.ts#getmirrorpath]] | calls |
| 45 | `runCheck` | [[hash.ts#computehash]] | calls |
| 52 | `runCheck` | [[differ.ts#computediff]] | calls |
| | | | |
| | *Why column — fill in the reason for each connection* | | |
<!-- syndocs-graph-end -->

## Notes

> _Add documentation notes here._
