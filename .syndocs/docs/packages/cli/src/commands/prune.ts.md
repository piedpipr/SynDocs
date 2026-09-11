# prune.ts
<!-- syndocs-hash: 34ffd09ddb49 -->

```ts
// @syndocs
import fs from 'fs';
import path from 'path';
import {
  getLangConfig,
  getSourceFromMicroDoc,
  getSourceFromMirror,
  parseAnchors,
} from '@syndocs/core';
import {
  SynDocsConfig,
  c,
  readFileSafe,
  walkMirrorDocs,
  walkMicroDocs,
  matchesTargets,
} from '../utils';

export interface PruneOptions {
  cwd: string;
  config: SynDocsConfig;
  targets?: string[];
  collection?: 'all' | 'docs' | 'microdocs';
  dryRun?: boolean;
}

export async function runPrune(opts: PruneOptions): Promise<void> {
  const { cwd, config, targets = [], collection = 'all', dryRun = false } = opts;

  console.log(c.bold('SynDocs — prune\n'));
  if (dryRun) console.log(c.yellow('  dry-run mode: no files will be deleted\n'));

  const pruneDocs = collection === 'all' || collection === 'docs';
  const pruneMicros = collection === 'all' || collection === 'microdocs';

  let pruned = 0;

  // 1. Whole-file docs
  if (pruneDocs) {
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
          reason = 'source file deleted';
        } else {
          const sourceContent = readFileSafe(sourceAbs);
          const langConfig = getLangConfig(sourceRel);
          if (sourceContent && langConfig) {
            const anchors = parseAnchors(sourceContent, langConfig);
            if (!anchors.some(a => a.kind === 'whole-file')) {
              isOrphan = true;
              reason = '@syndocs annotation removed from source';
            }
          }
        }

        if (isOrphan) {
          if (!dryRun) fs.unlinkSync(mirrorAbs);
          console.log('  ' + c.red('\u2717 pruned') + '  ' + mirrorRel + '  ' + c.dim('(' + reason + ')'));
          pruned++;
        }
      } catch { /* skip malformed */ }
    }
  }

  // 2. Micro-docs
  if (pruneMicros) {
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
          reason = 'source file deleted';
        } else {
          const sourceContent = readFileSafe(sourceAbs);
          const langConfig = getLangConfig(sourceRel);
          if (sourceContent && langConfig) {
            const anchors = parseAnchors(sourceContent, langConfig);
            if (!anchors.some(a => a.kind === 'micro' && a.label === label)) {
              isOrphan = true;
              reason = `micro-doc label #${label} removed from source`;
            }
          }
        }

        if (isOrphan) {
          if (!dryRun) fs.unlinkSync(microAbs);
          console.log('  ' + c.red('\u2717 pruned') + '  ' + microRel + '  ' + c.dim('(' + reason + ')'));
          pruned++;
        }
      } catch { /* skip malformed */ }
    }
  }

  console.log('');
  if (pruned === 0) {
    console.log('  ' + c.green('\u2713') + ' No orphaned documentation files found.');
  } else {
    console.log('  ' + c.bold('Result:') + '  ' + c.red(String(pruned)) + ' orphaned files ' + (dryRun ? 'would be removed' : 'pruned'));
  }
}
```

## Notes

> _Add documentation notes here._
