// @syndocs
import fs from 'fs';
import path from 'path';
import {
  computeHash,
  getCodeBlockLang,
  getLangConfig,
  getMirrorPath,
  getSourceFromMirror,
  parseAnchors,
  parseMirrorDoc,
  ParsedAnchor,
  renderMirrorDoc,
  renderNewMirrorDoc,
  extractMicroDocCode,
  DocSection,
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

    const mirrorRel = getMirrorPath(relPath, config.docsRoot);
    const mirrorAbs = path.join(cwd, mirrorRel);
    
    let existingDoc = fs.existsSync(mirrorAbs) ? parseMirrorDoc(readFileSafe(mirrorAbs)!) : null;
    let didChange = false;
    let newSections: DocSection[] = [];

    // Whole-file doc
    const wholeFileAnchor = anchors.find(a => a.kind === 'whole-file');
    if (updateDocs && wholeFileAnchor) {
      const existingSection = existingDoc?.sections.find(s => s.kind === 'whole-file');
      
      if (!existingSection) {
        newSections.push({
          kind: 'whole-file',
          hash: currentHash,
          codeCopy: content,
          codeLanguage: lang,
          notes: '',
        });
        didChange = true;
        console.log('  ' + c.green('+ created doc') + '   ' + relPath + '  \u2192  ' + c.cyan(mirrorRel));
        if (!existingDoc) created++;
      } else {
        if (existingSection.hash === currentHash && !existingSection.pendingDiff) {
           newSections.push(existingSection); // no change needed
        } else {
           newSections.push({ ...existingSection, hash: currentHash, codeCopy: content, codeLanguage: lang, pendingDiff: undefined });
           didChange = true;
           console.log('  ' + c.green('\u2191 updated doc') + '   ' + relPath + '  \u2192  ' + c.cyan(mirrorRel));
           if (!existingDoc) updated++;
        }
      }
    } else if (existingDoc) {
      // Keep existing whole-file section if we aren't updating docs
      const existingSection = existingDoc.sections.find(s => s.kind === 'whole-file');
      if (existingSection) newSections.push(existingSection);
    }

    // Micro-docs
    if (updateMicros) {
      const microAnchors = anchors.filter(a => a.kind === 'micro' && a.label);
      for (const anchor of microAnchors) {
        const label = anchor.label!;
        
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

        const existingSection = existingDoc?.sections.find(s => s.kind === 'micro' && s.label === label);

        if (!existingSection) {
          newSections.push({
            kind: 'micro',
            label,
            hash: microHash,
            codeCopy: microCode,
            codeLanguage: lang,
            notes: '',
            elementKind: anchor.elementKind,
            elementName: anchor.elementName,
            scopeStartLine: anchor.scopeStartLine,
            scopeEndLine: anchor.scopeEndLine,
          });
          didChange = true;
          console.log('  ' + c.green('+ created block') + ' ' + relPath + ' ' + c.cyan('#' + label));
        } else {
          if (existingSection.hash === microHash && !existingSection.pendingDiff) {
            newSections.push(existingSection); // no change needed
          } else {
            newSections.push({
              ...existingSection,
              hash: microHash,
              codeCopy: microCode,
              codeLanguage: lang,
              pendingDiff: undefined,
              elementKind: anchor.elementKind || existingSection.elementKind,
              elementName: anchor.elementName || existingSection.elementName,
              scopeStartLine: anchor.scopeStartLine ?? existingSection.scopeStartLine,
              scopeEndLine: anchor.scopeEndLine ?? existingSection.scopeEndLine,
            });
            didChange = true;
            console.log('  ' + c.green('\u2191 updated block') + ' ' + relPath + ' ' + c.cyan('#' + label));
          }
        }
      }
    } else if (existingDoc) {
      // keep existing micro sections if we aren't updating micros
      newSections.push(...existingDoc.sections.filter(s => s.kind === 'micro'));
    }

    // Retain pruned/orphaned micro sections if not pruning
    if (existingDoc && !prune) {
       for (const existing of existingDoc.sections.filter(s => s.kind === 'micro')) {
          if (!newSections.some(n => n.kind === 'micro' && n.label === existing.label)) {
             newSections.push(existing);
             orphanedKept++;
          }
       }
    } else if (existingDoc && prune) {
       for (const existing of existingDoc.sections.filter(s => s.kind === 'micro')) {
          if (!newSections.some(n => n.kind === 'micro' && n.label === existing.label)) {
             console.log('  ' + c.red('\u2717 pruned block') + '  ' + relPath + ' ' + c.dim('#' + existing.label));
             didChange = true;
             pruned++;
          }
       }
    }

    if (didChange) {
      const docTitle = relPath.split('/').pop() ?? relPath;
      if (!dryRun) writeFile(mirrorAbs, renderMirrorDoc({ title: docTitle, sections: newSections }));
      if (existingDoc) updated++;
    } else {
      alreadyOk++;
    }
  }

  // ── 2. Orphan check for whole files ───────────────────────────────────────
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
              const mirrorDoc = parseMirrorDoc(readFileSafe(mirrorAbs)!);
              if (mirrorDoc.sections.some(s => s.kind === 'whole-file')) {
                 isOrphan = true;
                 reason = '@syndocs annotation removed in source';
              }
            }
          }
        }

        if (isOrphan) {
          if (prune) {
            if (!dryRun) fs.unlinkSync(mirrorAbs);
            console.log('  ' + c.red('\u2717 pruned doc') + '    ' + mirrorRel + '  ' + c.dim('(' + reason + ')'));
            pruned++;
          } else {
            console.log('  ' + c.yellow('! orphan') + '    ' + mirrorRel + '  ' + c.dim('(' + reason + ') — kept (use --prune to delete)'));
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
    updated ? c.green(String(updated) + ' updated') : '',
    alreadyOk ? c.dim(String(alreadyOk) + ' already current') : '',
    pruned ? c.red(String(pruned) + ' pruned') : '',
    orphanedKept ? c.yellow(String(orphanedKept) + ' orphaned (kept)') : '',
    skipped ? c.dim(String(skipped) + ' skipped') : '',
  ].filter(Boolean);

  console.log('  ' + c.bold('Result:') + '  ' + (msgs.join(', ') || 'no changes'));
}
