# lint-embeds.ts
<!-- syndocs-hash: 0884ac8ee1cb -->

```ts
// @syndocs
import fs from 'fs';
import path from 'path';
import { LintResult, getMirrorPath, parseAnchors, parseEmbeds, getLangConfig } from '@syndocs/core';
import { SynDocsConfig, c, readFileSafe, walkGuides } from '../utils';

export interface LintEmbedsOptions {
  cwd: string;
  config: SynDocsConfig;
}

export async function runLintEmbeds(opts: LintEmbedsOptions): Promise<number> {
  const { cwd, config } = opts;

  console.log(c.bold('SynDocs — lint-embeds\n'));

  const results: LintResult[] = [];

  for (const guideRel of walkGuides(config.guidesRoot, cwd)) {
    const guideAbs = path.join(cwd, guideRel);
    const content  = readFileSafe(guideAbs);
    if (!content) continue;

    const embeds = parseEmbeds(content);
    if (embeds.length === 0) continue;

    for (const embed of embeds) {
      const sourceAbs = path.join(cwd, embed.targetPath);

      if (!fs.existsSync(sourceAbs)) {
        results.push({
          composedFile: guideRel,
          embed,
          status: 'broken-path',
          message: 'source file not found: ' + embed.targetPath,
        });
        continue;
      }

      const sourceContent = readFileSafe(sourceAbs);
      const langConfig    = getLangConfig(embed.targetPath);
      if (sourceContent && langConfig) {
        const anchors = parseAnchors(sourceContent, langConfig);

        if (embed.targetLabel) {
          const hasLabel = anchors.some(a => a.kind === 'micro' && a.label === embed.targetLabel);
          if (!hasLabel) {
            results.push({
              composedFile: guideRel,
              embed,
              status: 'broken-label',
              message: 'label "@syndocs: ' + embed.targetLabel + '" not found in ' + embed.targetPath,
            });
            continue;
          }
        } else {
          const hasWholeFile = anchors.some(a => a.kind === 'whole-file');
          if (!hasWholeFile) {
            results.push({
              composedFile: guideRel,
              embed,
              status: 'broken-label',
              message: 'no @syndocs whole-file marker in ' + embed.targetPath,
            });
            continue;
          }
        }
      }

      results.push({ composedFile: guideRel, embed, status: 'ok' });
    }
  }

  let prevFile = '';
  for (const r of results) {
    if (r.composedFile !== prevFile) {
      console.log('  ' + c.cyan(r.composedFile));
      prevFile = r.composedFile;
    }
    const target = r.embed.targetPath + (r.embed.targetLabel ? '#' + r.embed.targetLabel : '');
    if (r.status === 'ok') {
      console.log('    ' + c.green('\u2713') + '  ' + target);
    } else {
      console.log('    ' + c.red('\u2717') + '  line ' + (r.embed.lineIndex + 1) + ' @syndocs-embed: ' + target);
      console.log('       ' + c.red(r.message ?? r.status));
    }
  }

  const broken = results.filter(r => r.status !== 'ok');
  console.log('');
  if (results.length === 0) {
    console.log('  ' + c.dim('No composed docs with @syndocs-embed directives found.'));
    return 0;
  }
  console.log(
    '  ' + c.bold('Result:') + '  ' + c.green(String(results.length - broken.length)) + ' ok, '
    + (broken.length > 0 ? c.red(broken.length + ' broken') : c.dim('0 broken')),
  );
  return broken.length > 0 ? 1 : 0;
}
```

## Notes

> _Add documentation notes here._
