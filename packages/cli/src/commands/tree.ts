// @syndocs
import fs from 'fs';
import path from 'path';
import {
  computeHash,
  getLangConfig,
  getMirrorPath,
  parseAnchors,
  parseMirrorDoc,
  parseEmbeds,
} from '@syndocs/core';
import {
  SynDocsConfig,
  GraphAdapter,
  c,
  readFileSafe,
  walkSourceFiles,
  walkGuides,
  loadGraphAdapter,
  matchesTargets,
} from '../utils';

export interface TreeOptions {
  cwd: string;
  config: SynDocsConfig;
  targets?: string[];
  collection?: 'all' | 'docs' | 'microdocs';
  staleOnly?: boolean;
  orphansOnly?: boolean;
}

interface MicroDocLeaf {
  label: string;
  status: 'ok' | 'stale' | 'missing' | 'orphan';
  lineCount: number;
  hash?: string;
  diffLines?: number;
}

interface FileDocNode {
  relPath: string;
  hasWholeDoc: boolean;
  docStatus?: 'ok' | 'stale' | 'missing' | 'orphan';
  docLineCount?: number;
  docHash?: string;
  diffLines?: number;
  microDocs: MicroDocLeaf[];
  downstreamCount?: number;
}

export async function runTree(opts: TreeOptions): Promise<void> {
  const { cwd, config, targets = [], collection = 'all', staleOnly = false } = opts;

  console.log(c.bold('SynDocs — tree\n'));

  const showDocs = collection === 'all' || collection === 'docs';
  const showMicros = collection === 'all' || collection === 'microdocs';

  const adapter: GraphAdapter = await loadGraphAdapter(cwd);

  const fileNodes: FileDocNode[] = [];
  let totalDocs = 0;
  let totalMicros = 0;
  let okCount = 0;
  let staleCount = 0;
  let missingCount = 0;

  // Collect source files & documentation
  for (const relPath of walkSourceFiles(cwd, config)) {
    if (targets.length > 0 && !matchesTargets(relPath, targets)) continue;

    const absPath = path.join(cwd, relPath);
    const content = readFileSafe(absPath);
    if (!content) continue;

    const langConfig = getLangConfig(relPath);
    if (!langConfig) continue;

    const anchors = parseAnchors(content, langConfig, { filePath: relPath });
    if (anchors.length === 0) continue;

    const currentHash = computeHash(content);
    const sourceLines = content.split('\n').length;

    let hasWholeDoc = false;
    let docStatus: 'ok' | 'stale' | 'missing' | 'orphan' | undefined;
    let docHash: string | undefined;
    let diffLines: number | undefined;

    const mirrorRel = getMirrorPath(relPath, config.docsRoot);
    const mirrorAbs = path.join(cwd, mirrorRel);
    
    let mirrorDoc = fs.existsSync(mirrorAbs) ? parseMirrorDoc(readFileSafe(mirrorAbs)!) : null;

    const wholeFileAnchor = anchors.find(a => a.kind === 'whole-file');
    if (wholeFileAnchor) {
      hasWholeDoc = true;
      totalDocs++;

      if (!mirrorDoc) {
        docStatus = 'missing';
        missingCount++;
      } else {
        const section = mirrorDoc.sections.find(s => s.kind === 'whole-file');
        docHash = section?.hash;

        if (!section) {
           docStatus = 'missing';
           missingCount++;
        } else if (docHash === currentHash) {
          docStatus = 'ok';
          okCount++;
        } else {
          docStatus = 'stale';
          staleCount++;
          diffLines = Math.abs(sourceLines - (section?.codeCopy?.split('\n').length ?? 0)) || 1;
        }
      }
    }

    const microDocs: MicroDocLeaf[] = [];
    if (showMicros) {
      const microAnchors = anchors.filter(a => a.kind === 'micro' && a.label);
      for (const anchor of microAnchors) {
        totalMicros++;
        const label = anchor.label!;

        // Approximate micro code length
        const nextAnchor = anchors.find(a => a.lineIndex > anchor.lineIndex);
        const microLines = (nextAnchor?.lineIndex ?? sourceLines) - anchor.lineIndex;

        if (!mirrorDoc) {
          microDocs.push({ label, status: 'missing', lineCount: microLines });
          missingCount++;
        } else {
          const section = mirrorDoc.sections.find(s => s.kind === 'micro' && s.label === label);
          
          if (!section) {
             microDocs.push({ label, status: 'missing', lineCount: microLines });
             missingCount++;
          } else {
             const storedHash = section?.hash;
             const codeCopy = section?.codeCopy ?? '';
             const codeHash = computeHash(codeCopy);

             if (storedHash === codeHash && storedHash) {
               microDocs.push({ label, status: 'ok', lineCount: codeCopy.split('\n').length, hash: storedHash });
               okCount++;
             } else {
               microDocs.push({ label, status: 'stale', lineCount: microLines, hash: storedHash, diffLines: 1 });
               staleCount++;
             }
          }
        }
      }
    }

    if (staleOnly && docStatus !== 'stale' && !microDocs.some(m => m.status === 'stale')) {
      continue;
    }

    let downstreamCount: number | undefined;
    if (adapter) {
      downstreamCount = adapter.getImpactRadius(absPath).length;
    }
    
    // Only add to tree if we're showing something from it
    if ((showDocs && hasWholeDoc) || (showMicros && microDocs.length > 0)) {
       fileNodes.push({
         relPath,
         hasWholeDoc,
         docStatus,
         docLineCount: sourceLines,
         docHash,
         diffLines,
         microDocs,
         downstreamCount,
       });
    }
  }

  // ── Render Tree ───────────────────────────────────────────────────────────
  console.log(c.cyan(c.bold('.syndocs/')));

  // Render docs branch
  console.log(c.dim('├── ') + c.bold('docs/'));

  fileNodes.forEach((file, index) => {
    const isLastFile = index === fileNodes.length - 1;
    const filePrefix = isLastFile ? '│   └── ' : '│   ├── ';
    
    // Build badge string for whole-file doc if we're showing it and it has one
    let docInfo = '';
    if (showDocs && file.hasWholeDoc) {
       const statusBadge = formatStatusBadge(file.docStatus ?? 'missing');
       const hashBadge = file.docHash ? c.dim(`(${file.docHash.slice(0, 7)})`) : '';
       const linesBadge = file.docLineCount ? c.dim(`${file.docLineCount}L`) : '';
       const impactBadge = file.downstreamCount ? c.yellow(`⚡ ${file.downstreamCount} deps`) : '';
       docInfo = ` ${statusBadge} ${linesBadge} ${hashBadge} ${impactBadge}`.trim();
    }
    
    console.log(`${c.dim(filePrefix)}${c.bold(file.relPath)} ${docInfo}`.trimEnd());

    // Print micro docs under the file if any
    if (showMicros && file.microDocs.length > 0) {
      const subPrefix = isLastFile ? '│       ' : '│   │   ';
      file.microDocs.forEach((micro, mIndex) => {
        const isLastMicro = mIndex === file.microDocs.length - 1;
        const leafPrefix = isLastMicro ? '└── ' : '├── ';
        const badge = formatStatusBadge(micro.status);
        const lines = c.dim(`${micro.lineCount}L`);
        const hash = micro.hash ? c.dim(`(${micro.hash.slice(0, 7)})`) : '';

        console.log(`${c.dim(subPrefix + leafPrefix)}#${c.cyan(micro.label)} ${badge} ${lines} ${hash}`.trim());
      });
    }
  });


  // Render guides branch
  console.log(c.dim('└── ') + c.bold('guides/'));
  const guideFiles = Array.from(walkGuides(config.guidesRoot, cwd));
  if (guideFiles.length === 0) {
    console.log(c.dim('    └── (no guides yet)'));
  } else {
    guideFiles.forEach((guide, gIndex) => {
      const isLast = gIndex === guideFiles.length - 1;
      const prefix = isLast ? '    └── ' : '    ├── ';
      const fullGuidePath = path.join(cwd, guide);
      const guideContent = readFileSafe(fullGuidePath) ?? '';
      const embeds = parseEmbeds(guideContent);
      const embedBadge = embeds.length > 0 ? c.cyan(`[${embeds.length} embeds]`) : c.dim('(no embeds)');
      console.log(`${c.dim(prefix)}${path.basename(guide)} ${embedBadge}`);
    });
  }

  // ── Summary Box ───────────────────────────────────────────────────────────
  console.log('');
  const totalItems = totalDocs + totalMicros;
  const syncPercentage = totalItems > 0 ? Math.round((okCount / totalItems) * 100) : 100;
  const syncColor = syncPercentage === 100 ? c.green : syncPercentage > 75 ? c.yellow : c.red;

  console.log(c.dim('─'.repeat(60)));
  console.log(
    `  ${c.bold('Status:')}    ${syncColor(syncPercentage + '% in sync')} ` +
    `(${c.green(okCount + ' ok')}, ${staleCount ? c.yellow(staleCount + ' stale') : c.dim('0 stale')}, ${missingCount ? c.red(missingCount + ' missing') : c.dim('0 missing')})`
  );
  console.log(
    `  ${c.bold('Coverage:')}  ${c.cyan(String(fileNodes.length))} documented files, ` +
    `${c.cyan(String(totalDocs))} whole-docs, ${c.cyan(String(totalMicros))} micro-docs, ` +
    `${c.cyan(String(guideFiles.length))} guides`
  );
  if (adapter) {
    console.log(`  ${c.bold('Graph:')}     ${c.green('CodeGraph active')} (impact radius & AST boundaries enabled)`);
  } else {
    console.log(`  ${c.bold('Graph:')}     ${c.dim('CodeGraph absent (install: npm i -g @colbymchenry/codegraph)')}`);
  }
  console.log(c.dim('─'.repeat(60)));

  adapter?.close();
}

function formatStatusBadge(status: string): string {
  switch (status) {
    case 'ok':
      return c.green('[ok]');
    case 'stale':
      return c.yellow('[stale]');
    case 'missing':
      return c.red('[missing]');
    case 'orphan':
      return c.red('[orphan]');
    default:
      return c.dim(`[${status}]`);
  }
}
