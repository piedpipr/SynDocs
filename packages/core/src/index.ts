// Types
export type {
  CheckResult,
  CheckStatus,
  DocSection,
  EmbedSection,
  LanguageConfig,
  LintResult,
  LintStatus,
  MirrorDocData,
  ParsedAnchor,
  ParsedEmbed,
} from './types';
export type { CommentSpan } from './tokenizer';

// Hashing
export { computeHash, normalise } from './hash';

// Language detection
export { getCodeBlockLang, getLangConfig, getAllConfiguredGrammarIds, getCommentSyntax } from './languages';

// Comment tokenization (see tokenizer.ts for why this replaced regex-based
// comment scanning). `initTokenizer` must be awaited once before any
// `parseAnchors` call; `extractCommentSpans` is exposed for callers that
// want raw comment spans without the full anchor-parsing pipeline.
export { initTokenizer, isTokenizerReady, extractCommentSpans } from './tokenizer';

// AST-based scope resolution (see ast-scope.ts). `initAstEngine` must be
// awaited once before any `parseAnchors` call that expects tree-sitter
// accurate scope boundaries, exactly like `initTokenizer` above.
export { initAstEngine, isAstEngineReady, hasAstSupport } from './ast-scope';

// Anchor parsing
export { extractMicroDocCode, parseAnchors } from './anchor-parser';
export type { ParseAnchorsOptions } from './anchor-parser';

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
