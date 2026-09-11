# types.ts
<!-- syndocs-hash: ac11ca0a3497 -->

```ts
// @syndocs
// ─── Comment style variants ───────────────────────────────────────────────────

export type CommentStyle = '//' | '#' | '--' | '<!--' | '/*';

export interface LanguageConfig {
  style: CommentStyle;
  closeStyle?: '-->'; // only for HTML-style comments
  codeBlock: string;  // the language hint used in fenced code blocks
}

// ─── Anchor markers found in source files ─────────────────────────────────────

export interface ParsedAnchor {
  kind: 'whole-file' | 'micro';
  label?: string;          // only for @syndocs: label / @synd: label
  lineIndex: number;       // 0-based line in the source file
  autoScoped?: boolean;    // true when label was auto-derived from code element
  inline?: boolean;        // true when annotation is trailing (right side of code)
  elementKind?: string;    // 'function', 'class', 'field', 'variable', etc.
  elementName?: string;    // 'parseAnchors', 'API_KEY', etc.
  scopeStartLine?: number; // 0-based start of scoped code (inclusive)
  scopeEndLine?: number;   // 0-based end of scoped code (exclusive)
}

// ─── Embed markers found in composed docs (guides/) ───────────────────────────

export interface ParsedEmbed {
  targetPath: string;    // e.g. "src/auth/Login.php"
  targetLabel?: string;  // the #label part, for micro-doc embeds
  syncedHash?: string;   // the <!-- syndocs-synced: hash --> value
  lineIndex: number;
  raw: string;           // original @syndocs-embed line, for rewriting
}

// ─── Parsed mirror doc sections ───────────────────────────────────────────────

export interface DocSection {
  kind: 'whole-file' | 'micro';
  label?: string;
  hash?: string;
  codeCopy?: string;
  codeLanguage?: string;
  notes: string;
  pendingDiff?: string;
  elementKind?: string;
  elementName?: string;
  scopeStartLine?: number;
  scopeEndLine?: number;
}

export interface MirrorDocData {
  title: string;          // filename, e.g. "Login.php"
  sections: DocSection[]; // [0] = whole-file (if present), rest = micro-docs
}

// ─── Embed section in a composed doc ─────────────────────────────────────────

export interface EmbedSection {
  targetPath: string;
  targetLabel?: string;
  syncedHash?: string;
  codeCopy?: string;
  codeLanguage?: string;
  pendingDiff?: string;
}

// ─── Results from syndocs check ───────────────────────────────────────────────

export type CheckStatus =
  | 'ok'                       // hash matches
  | 'stale'                    // hash mismatch, diff generated
  | 'missing-doc'              // @syndocs found but no mirror doc yet
  | 'missing-source'           // mirror doc exists but source file is gone
  | 'annotation-removed'       // mirror doc exists but whole-file @syndocs removed from source
  | 'micro-annotation-removed' // micro-doc exists but @syndocs: label removed from source
  | 'no-hash';                 // mirror doc has no hash yet (freshly init'd)

export interface CheckResult {
  sourceFile: string;
  mirrorFile: string;
  status: CheckStatus;
  currentHash?: string;
  storedHash?: string;
  diff?: string;
  isMicroDoc?: boolean;
  targetLabel?: string;
  notes?: string;
}

// ─── Results from syndocs lint-embeds ────────────────────────────────────────

export type LintStatus = 'ok' | 'broken-path' | 'broken-label';

export interface LintResult {
  composedFile: string;
  embed: ParsedEmbed;
  status: LintStatus;
  message?: string;
}
```

## Notes

> _Add documentation notes here._

---

## @synd: line-L73
<!-- syndocs-hash: 7402b4cafaa7 -->

```ts
| 'missing-source'           // mirror doc exists but source file is gone
  | 'annotation-removed'       // mirror doc exists but whole-file @syndocs removed from source
  | 'micro-annotation-removed' // micro-doc exists but @syndocs: label removed from source
  | 'no-hash';                 // mirror doc has no hash yet (freshly init'd)

export interface CheckResult {
  sourceFile: string;
  mirrorFile: string;
  status: CheckStatus;
  currentHash?: string;
  storedHash?: string;
  diff?: string;
  isMicroDoc?: boolean;
  targetLabel?: string;
  notes?: string;
}

// ─── Results from syndocs lint-embeds ────────────────────────────────────────

export type LintStatus = 'ok' | 'broken-path' | 'broken-label';

export interface LintResult {
  composedFile: string;
  embed: ParsedEmbed;
  status: LintStatus;
  message?: string;
}
```

### Notes

> _Add documentation notes here._
