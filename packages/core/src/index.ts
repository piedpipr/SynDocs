// Types
export type {
  CheckResult,
  CheckStatus,
  CommentStyle,
  DocSection,
  EmbedSection,
  LanguageConfig,
  LintResult,
  LintStatus,
  MirrorDocData,
  ParsedAnchor,
  ParsedEmbed,
} from './types';

// Hashing
export { computeHash, normalise } from './hash';

// Language detection
export { getCodeBlockLang, getLangConfig } from './languages';

// Anchor parsing
export { extractMicroDocCode, parseAnchors } from './anchor-parser';

// Mirror path computation
export {
  getMirrorPath,
  getSourceFromMirror,
  isUnderDocsRoot,
} from './mirror-path';

// Doc file I/O
export { parseEmbeds, parseMirrorDoc } from './doc-parser';
export {
  renderEmbedBlock,
  renderMirrorDoc,
  renderNewMirrorDoc,
} from './doc-writer';

// Diff
export { computeDiff } from './differ';
