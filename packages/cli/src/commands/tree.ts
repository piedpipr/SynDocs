// @syndocs
import fs from 'fs';
import path from 'path';
import {
  computeHash,
  getLangConfig,
  getMicroDocPath,
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

    const anchors = parseAnchors(content, langConfig);
    if (anchors.length === 0) continue;

    const currentHash = computeHash(content);
    const sourceLines = content.split('\n').length;

    let hasWholeDoc = false;
    let docStatus: 'ok' | 'stale' | 'missing' | 'orphan' | undefined;
    let docHash: string | undefined;
    let diffLines: number | undefined;

    const wholeFileAnchor = anchors.find(a => a.kind === 'whole-file');
    if (showDocs && wholeFileAnchor) {
      hasWholeDoc = true;
      totalDocs++;
      const mirrorRel = getMirrorPath(relPath, config.docsRoot);
      const mirrorAbs = path.join(cwd, mirrorRel);

      if (!fs.existsSync(mirrorAbs)) {
        docStatus = 'missing';
        missingCount++;
      } else {
        const doc = parseMirrorDoc(readFileSafe(mirrorAbs)!);
        const section = doc.sections.find(s => s.kind === 'whole-file');
        docHash = section?.hash;

        if (docHash === currentHash) {
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
        const microRel = getMicroDocPath(relPath, label, config.microdocsRoot);
        const microAbs = path.join(cwd, microRel);

        // Approximate micro code length
        const nextAnchor = anchors.find(a => a.lineIndex > anchor.lineIndex);
        const microLines = (nextAnchor?.lineIndex ?? sourceLines) - anchor.lineIndex;

        if (!fs.existsSync(microAbs)) {
          microDocs.push({ label, status: 'missing', lineCount: microLines });
          missingCount++;
        } else {
          const doc = parseMirrorDoc(readFileSafe(microAbs)!);
          const section = doc.sections[0];
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

    if (staleOnly && docStatus !== 'stale' && !microDocs.some(m => m.status === 'stale')) {
      continue;
    }

    let downstreamCount: number | undefined;
    if (adapter) {
      downstreamCount = adapter.getImpactRadius(absPath).length;
    }

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

  // ── Render Tree ───────────────────────────────────────────────────────────
  console.log(c.cyan(c.bold('.syndocs/')));

  // Render docs branch
  if (showDocs) {
    console.log(c.dim('├── ') + c.bold('docs/'));
    const docFiles = fileNodes.filter(f => f.hasWholeDoc);

    docFiles.forEach((file, index) => {
      const isLastFile = index === docFiles.length - 1 && (!showMicros || fileNodes.length === 0);
      const prefix = isLastFile ? '│   └── ' : '│   ├── ';
      const statusBadge = formatStatusBadge(file.docStatus ?? 'missing');
      const hashBadge = file.docHash ? c.dim(`(${file.docHash.slice(0, 7)})`) : '';
      const linesBadge = file.docLineCount ? c.dim(`${file.docLineCount}L`) : '';
      const impactBadge = file.downstreamCount ? c.yellow(`⚡ ${file.downstreamCount} deps`) : '';

      console.log(
        `${c.dim(prefix)}${file.relPath} ${statusBadge} ${linesBadge} ${hashBadge} ${impactBadge}`.trim(),
      );
    });
  }

  // Render microdocs branch
  if (showMicros) {
    const microFiles = fileNodes.filter(f => f.microDocs.length > 0);
    console.log(c.dim('├── ') + c.bold('microdocs/'));

    microFiles.forEach((file, fIndex) => {
      const isLastFile = fIndex === microFiles.length - 1;
      const filePrefix = isLastFile ? '│   └── ' : '│   ├── ';
      const subPrefix = isLastFile ? '│       ' : '│   │   ';

      console.log(`${c.dim(filePrefix)}${c.bold(file.relPath)} ${c.dim(`(${file.microDocs.length} micro-docs)`)}`);

      file.microDocs.forEach((micro, mIndex) => {
        const isLastMicro = mIndex === file.microDocs.length - 1;
        const leafPrefix = isLastMicro ? '└── ' : '├── ';
        const badge = formatStatusBadge(micro.status);
        const lines = c.dim(`${micro.lineCount}L`);
        const hash = micro.hash ? c.dim(`(${micro.hash.slice(0, 7)})`) : '';

        console.log(`${c.dim(subPrefix + leafPrefix)}#${c.cyan(micro.label)} ${badge} ${lines} ${hash}`.trim());
      });
    });
  }

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
