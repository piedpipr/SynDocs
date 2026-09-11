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

// Language detection and Regex
export { getCodeBlockLang, getLangConfig, buildEmbedRegex, buildInlineAnchorRegex } from './languages';

// Anchor parsing
export { extractMicroDocCode, parseAnchors } from './anchor-parser';

// Slugs
export { toKebabSlug, generateUniqueSlug } from './slug';

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

// Authentication
export {
  generateSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from './auth';
