// @syndocs
import fs from 'fs';
import path from 'path';
import {
  getLangConfig,
  getSourceFromMirror,
  parseAnchors,
  parseMirrorDoc,
  renderMirrorDoc,
  DocSection
} from '@syndocs/core';
import {
  SynDocsConfig,
  c,
  readFileSafe,
  walkMirrorDocs,
  matchesTargets,
  writeFile,
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

  let prunedDocs = 0;
  let prunedBlocks = 0;

  for (const mirrorRel of walkMirrorDocs(config.docsRoot, cwd)) {
    try {
      const sourceRel = getSourceFromMirror(mirrorRel, config.docsRoot);
      if (targets.length > 0 && !matchesTargets(sourceRel, targets)) continue;

      const sourceAbs = path.join(cwd, sourceRel);
      const mirrorAbs = path.join(cwd, mirrorRel);
      const mirrorContent = readFileSafe(mirrorAbs);
      if (!mirrorContent) continue;
      
      const mirrorDoc = parseMirrorDoc(mirrorContent);
      
      // If source file doesn't exist, prune the whole document
      if (!fs.existsSync(sourceAbs)) {
         if (pruneDocs || pruneMicros) { // Pruning either will remove it if source is gone
            if (!dryRun) fs.unlinkSync(mirrorAbs);
            console.log('  ' + c.red('\u2717 pruned doc') + '  ' + mirrorRel + '  ' + c.dim('(source file deleted)'));
            prunedDocs++;
         }
         continue;
      }
      
      const sourceContent = readFileSafe(sourceAbs);
      const langConfig = getLangConfig(sourceRel);
      if (!sourceContent || !langConfig) continue;
      
      const anchors = parseAnchors(sourceContent, langConfig);
      const newSections: DocSection[] = [];
      let didChange = false;

      for (const section of mirrorDoc.sections) {
        if (section.kind === 'whole-file') {
           if (pruneDocs && !anchors.some(a => a.kind === 'whole-file')) {
              console.log('  ' + c.red('\u2717 pruned doc') + '  ' + mirrorRel + '  ' + c.dim('(@synd annotation removed from source)'));
              didChange = true;
              prunedDocs++;
              // If we prune the whole file doc, we could decide to keep the file if there are micros, 
              // but Notion-like usually needs the file header. For now just omit section.
           } else {
              newSections.push(section);
           }
        } else if (section.kind === 'micro') {
           if (pruneMicros && !anchors.some(a => a.kind === 'micro' && a.label === section.label)) {
              console.log('  ' + c.red('\u2717 pruned block') + '  ' + sourceRel + ' ' + c.dim('#' + section.label));
              didChange = true;
              prunedBlocks++;
           } else {
              newSections.push(section);
           }
        } else {
           newSections.push(section); // Preserve embeds etc if any
        }
      }

      if (didChange) {
         if (newSections.length === 0) {
            if (!dryRun) fs.unlinkSync(mirrorAbs);
         } else {
            if (!dryRun) writeFile(mirrorAbs, renderMirrorDoc({ title: mirrorDoc.title, sections: newSections }));
         }
      }
    } catch { /* skip malformed */ }
  }

  console.log('');
  if (prunedDocs === 0 && prunedBlocks === 0) {
    console.log('  ' + c.green('\u2713') + ' No orphaned documentation found.');
  } else {
    console.log(
       '  ' + c.bold('Result:') + '  ' 
       + (prunedDocs ? c.red(String(prunedDocs)) + ' orphaned docs ' : '')
       + (prunedDocs && prunedBlocks ? ', ' : '')
       + (prunedBlocks ? c.red(String(prunedBlocks)) + ' orphaned blocks ' : '')
       + (dryRun ? 'would be removed' : 'pruned')
    );
  }
}
