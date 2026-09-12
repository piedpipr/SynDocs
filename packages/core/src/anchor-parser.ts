// @syndocs
import type { LanguageConfig, ParsedAnchor } from './types';
import type { GraphAdapterLike } from './graph-adapter-like';
import { toKebabSlug, generateUniqueSlug } from './slug';
import { extractCommentSpans, type CommentSpan } from './tokenizer';

// ─── Declaration detection patterns (regex fallback for structural scoping) ───
// These regexes extract element name and kind from a declaration line. They
// are intentionally broad and are used ONLY when no CodeGraph AST adapter is
// available (see `resolveScopeBoundaries` / `ParseAnchorsOptions.graphAdapter`
// below) — CodeGraph's AST is preferred whenever the project has it indexed,
// since it knows real symbol boundaries instead of guessing from one line of
// text. This table is the pre-existing fallback tier, kept as-is.

const DECLARATION_PATTERNS: Array<{ re: RegExp; kind: string; nameGroup: number }> = [
  // TypeScript / JavaScript / Java / C# / Go / Rust / Swift / Kotlin
  { re: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,          kind: 'function',  nameGroup: 1 },
  { re: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,          kind: 'class',     nameGroup: 1 },
  { re: /(?:export\s+)?interface\s+(\w+)/,                       kind: 'interface', nameGroup: 1 },
  { re: /(?:export\s+)?type\s+(\w+)\s*=/,                       kind: 'type',      nameGroup: 1 },
  { re: /(?:export\s+)?enum\s+(\w+)/,                           kind: 'enum',      nameGroup: 1 },
  { re: /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/,       kind: 'variable',  nameGroup: 1 },
  // NOTE: bare "identifier followed by (" detection (Java/C#-style typed
  // method declarations like `public void foo()`) is handled separately by
  // `detectMethodCallLikeDeclaration` below, NOT as a DECLARATION_PATTERNS
  // regex entry — a naive `(\w+)\s*\(` pattern here matched `$table->string(`
  // as a method declaration named "string" (see the regression this fixed:
  // an inline `// @synd` after `$table->string(...)->default(...)` was
  // misidentified because nothing distinguished "declaring a method" from
  // "calling one on an object"). The dedicated function below requires the
  // identifier not be preceded by `.`, `->`, or `::`, and excludes common
  // statement keywords, before treating it as a declaration.
  // Go
  { re: /func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/,           kind: 'function',  nameGroup: 1 },
  { re: /type\s+(\w+)\s+struct/,                                 kind: 'struct',    nameGroup: 1 },
  // Rust
  { re: /(?:pub\s+)?fn\s+(\w+)/,                                kind: 'function',  nameGroup: 1 },
  { re: /(?:pub\s+)?struct\s+(\w+)/,                            kind: 'struct',    nameGroup: 1 },
  { re: /(?:pub\s+)?trait\s+(\w+)/,                             kind: 'trait',     nameGroup: 1 },
  { re: /impl(?:\s*<[^>]*>)?\s+(\w+)/,                          kind: 'impl',      nameGroup: 1 },
  // Python
  { re: /def\s+(\w+)\s*\(/,                                     kind: 'function',  nameGroup: 1 },
  { re: /class\s+(\w+)/,                                        kind: 'class',     nameGroup: 1 },
  // Ruby
  { re: /def\s+(\w+)/,                                          kind: 'method',    nameGroup: 1 },
  { re: /module\s+(\w+)/,                                       kind: 'module',    nameGroup: 1 },
  // PHP
  { re: /(?:public|private|protected|static)?\s*function\s+(\w+)/,  kind: 'function', nameGroup: 1 },
  // SQL
  { re: /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE)\s+(\w+)/i, kind: 'schema', nameGroup: 1 },
  // Swift
  { re: /(?:public|private|internal|open)?\s*func\s+(\w+)/,     kind: 'function',  nameGroup: 1 },
  // Kotlin
  { re: /(?:fun|val|var)\s+(\w+)/,                              kind: 'function',  nameGroup: 1 },
  // Generic single-line assignment (fallback for const X = ..., etc.)
  // Guarded against matching object property access (e.g. `$table->foo =`,
  // `this.foo =`) as a variable declaration — same class of bug as the
  // removed generic method pattern above (see detectMethodCallLikeDeclaration).
  { re: /(?<![.\w]|->|::)(\w+)\s*[:=][^=]/,                     kind: 'variable',  nameGroup: 1 },
];

const ANCHOR_RE = /@(?:syndocs|synd)(?:\s*:\s*(\S+))?/;

export interface ParseAnchorsOptions {
  /**
   * Optional CodeGraph adapter. When present and `.isReady()`, scope
   * resolution (mapping an annotation to the function/class/etc. it
   * documents) prefers real AST boundaries over the regex-based
   * `DECLARATION_PATTERNS` fallback below. Comment/annotation DETECTION
   * itself never depends on this — it always uses the grammar tokenizer —
   * so `syndocs` works fully even when CodeGraph hasn't been indexed.
   */
  graphAdapter?: GraphAdapterLike | null;
  /** Repo-relative or absolute path of the file being parsed, required to query graphAdapter. */
  filePath?: string;
}

/**
 * Scan a source file's content for @syndocs/@synd anchor comments.
 *
 * Rules:
 *  - At most ONE bare @synd per file (whole-file anchor) — the first bare one at line ≤ 5
 *    or the first bare one that appears before any code.
 *  - @synd: label produces a micro-doc block.
 *  - Bare @synd above a code element produces an auto-scoped micro-doc block.
 *  - Inline @synd at end of a code line scopes to that line or block.
 *  - All micro-docs are embedded as sections within the parent mirror doc.
 *
 * Comment detection is delegated to `extractCommentSpans` (tokenizer.ts),
 * which tokenizes the file with a real TextMate grammar so multi-line block
 * comments, JSDoc-style headers, and language-specific string/regex syntax
 * are all handled correctly — see tokenizer.ts's file header for the full
 * rationale. If tokenization fails for this file for any reason (unexpected
 * grammar edge case, unsupported language snuck through, etc.), we fall back
 * to a conservative single-line scanner so one problematic file can't take
 * down an entire `syndocs check`/`update` run — see `scanCommentsFallback`.
 */
// @synd: parse-anchors
export function parseAnchors(
  content: string,
  langConfig: LanguageConfig,
  options: ParseAnchorsOptions = {},
): ParsedAnchor[] {
  const lines = content.split('\n');
  const anchors: ParsedAnchor[] = [];
  const seenLabels = new Set<string>();
  let hasWholeFile = false;

  let spans: CommentSpan[];
  try {
    spans = extractCommentSpans(content, langConfig.grammarId);
  } catch (err) {
    process.stderr.write(
      `[syndocs] Warning: grammar tokenization failed for this file (${(err as Error).message}); ` +
      `falling back to a conservative single-line comment scan, which may miss multi-line comments.\n`,
    );
    spans = scanCommentsFallback(lines);
  }

  for (const span of spans) {
    const anchorMatch = span.text.match(ANCHOR_RE);
    if (!anchorMatch) continue;

    const rawLabel = anchorMatch[1]; // may be undefined
    const i = span.startLine;
    // "Inline" means code precedes the comment on its start line — i.e. this
    // comment is a trailing annotation, not a comment-only line/block.
    const inline = !span.isFullLineStart;

    // ── 1. Full-line / comment-only annotation ─────────────────────────
    if (!inline) {
      if (!rawLabel) {
        // Bare annotation — whole-file if first & near top, otherwise auto-scoped micro
        if (!hasWholeFile && isHeaderArea(lines, i)) {
          anchors.push({ kind: 'whole-file', lineIndex: i });
          hasWholeFile = true;
        } else {
          // Auto-scoped micro-doc: scan the line(s) after the comment block for a code element
          const scope = resolveScopeBoundaries(lines, span.endLine, false, options);
          const slug = scope
            ? generateUniqueSlug(toKebabSlug(scope.name), seenLabels)
            : generateUniqueSlug(`block-L${i + 1}`, seenLabels);

          seenLabels.add(slug);
          anchors.push({
            kind: 'micro',
            label: slug,
            lineIndex: i,
            autoScoped: true,
            elementKind: scope?.kind,
            elementName: scope?.name,
            scopeStartLine: scope?.startLine,
            scopeEndLine: scope?.endLine,
          });
        }
      } else {
        // Explicit label
        const label = rawLabel.trim();
        if (seenLabels.has(label)) {
          process.stderr.write(
            `[syndocs] Warning: duplicate label "@synd: ${label}" in file — skipping extra\n`,
          );
          continue;
        }
        seenLabels.add(label);
        anchors.push({ kind: 'micro', label, lineIndex: i });
      }
      continue;
    }

    // ── 2. Inline (trailing) annotation ───────────────────────────────
    if (!rawLabel) {
      // Inline bare: scope to the current line's code element
      const scope = resolveScopeBoundaries(lines, i, true, options);
      const slug = scope
        ? generateUniqueSlug(toKebabSlug(scope.name), seenLabels)
        : generateUniqueSlug(`line-L${i + 1}`, seenLabels);

      seenLabels.add(slug);
      anchors.push({
        kind: 'micro',
        label: slug,
        lineIndex: i,
        autoScoped: true,
        inline: true,
        elementKind: scope?.kind,
        elementName: scope?.name,
        scopeStartLine: scope?.startLine,
        scopeEndLine: scope?.endLine,
      });
    } else {
      const label = rawLabel.trim();
      if (seenLabels.has(label)) {
        process.stderr.write(
          `[syndocs] Warning: duplicate label "@synd: ${label}" in file — skipping extra\n`,
        );
        continue;
      }
      seenLabels.add(label);
      anchors.push({ kind: 'micro', label, lineIndex: i, inline: true });
    }
  }

  return anchors;
}

/**
 * Conservative last-resort comment scanner used only if the real tokenizer
 * throws for a given file. Deliberately simple and deliberately WORSE than
 * the tokenizer (single-line `//`/`#`/`--` markers only, no block-comment or
 * string-literal awareness) — it exists purely so one file's grammar failure
 * degrades that one file gracefully instead of crashing the whole run. Any
 * file that hits this path is logged (see caller) so it's never a silent
 * accuracy regression.
 */
function scanCommentsFallback(lines: string[]): CommentSpan[] {
  const spans: CommentSpan[] = [];
  const markers = ['//', '#', '--'];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const marker of markers) {
      const idx = line.indexOf(marker);
      if (idx === -1) continue;
      const before = line.slice(0, idx);
      spans.push({
        startLine: i,
        endLine: i,
        startColumn: idx,
        text: line.slice(idx),
        isFullLineStart: before.trim().length === 0,
      });
      break;
    }
  }
  return spans;
}

/**
 * Extract the source text "owned" by a micro-doc anchor.
 * Uses scope boundaries if available, otherwise falls back to
 * next-anchor or end-of-file.
 */
// @synd: extract-micro-code
export function extractMicroDocCode(
  content: string,
  anchor: ParsedAnchor,
  nextAnchorLineIndex?: number,
): string {
  const lines = content.split('\n');

  // If the anchor has resolved scope boundaries, use them
  if (anchor.scopeStartLine !== undefined && anchor.scopeEndLine !== undefined) {
    return lines.slice(anchor.scopeStartLine, anchor.scopeEndLine).join('\n').trim();
  }

  // Fallback: everything from anchor line+1 to next anchor or EOF
  const start = anchor.lineIndex + 1;
  const end = nextAnchorLineIndex ?? lines.length;
  return lines.slice(start, end).join('\n').trim();
}

// ─── Scope resolution (AST-preferred, regex fallback) ─────────────────────────

interface ScopeResult {
  name: string;
  kind: string;
  startLine: number; // 0-based, inclusive
  endLine: number;   // 0-based, exclusive
}

/**
 * Determine if a bare annotation at lineIndex is in the "header area" —
 * i.e. it's near the top of the file and precedes any substantial code.
 */
function isHeaderArea(lines: string[], lineIndex: number): boolean {
  // If it's literally the first non-blank line, it's header
  if (lineIndex <= 5) {
    // Check that no code precedes it (only blanks, comments, shebangs)
    for (let i = 0; i < lineIndex; i++) {
      const l = lines[i].trim();
      if (l && !l.startsWith('//') && !l.startsWith('#!') && !l.startsWith('#') &&
          !l.startsWith('/*') && !l.startsWith('*') && !l.startsWith('<!--') &&
          !l.startsWith('--') && !l.startsWith('"""') && !l.startsWith("'''")) {
        return false; // There's real code before this line
      }
    }
    return true;
  }
  return false;
}

/**
 * Resolve the scope boundaries for an annotation.
 *
 * If a ready CodeGraph adapter + filePath were supplied, prefer real AST
 * node boundaries: `getEnclosingScope`/`getNodeBoundary` for inline
 * annotations (the code is on the same line as the comment), or
 * `getNextNode` for above-line annotations (the declaration is the next AST
 * node after the comment). Falls back to the regex-based
 * `DECLARATION_PATTERNS` scan whenever the adapter is absent, not ready, or
 * simply has no node at that location (e.g. annotation sits over a bare
 * statement with no named symbol) — the regex path still adds value there.
 */
function resolveScopeBoundaries(
  lines: string[],
  lineIndex: number,
  inline: boolean,
  options: ParseAnchorsOptions,
): ScopeResult | null {
  const astResult = resolveScopeViaGraph(lineIndex, inline, options);
  if (astResult) return astResult;

  return inline
    ? resolveInlineScope(lines, lineIndex)
    : resolveAboveScope(lines, lineIndex);
}

function resolveScopeViaGraph(
  lineIndex: number,
  inline: boolean,
  options: ParseAnchorsOptions,
): ScopeResult | null {
  const { graphAdapter, filePath } = options;
  if (!graphAdapter || !filePath) return null;
  if (!graphAdapter.isReady()) return null;

  try {
    // 1-based lines in CodeGraph's schema vs. our 0-based lineIndex.
    const oneBasedLine = lineIndex + 1;

    const node = inline
      ? graphAdapter.getEnclosingScope(filePath, oneBasedLine) ?? graphAdapter.getNodeBoundary(filePath, oneBasedLine)
      : graphAdapter.getNextNode(filePath, oneBasedLine + 1);

    if (!node) return null;

    return {
      name: node.name,
      kind: node.kind,
      // Convert back to 0-based, exclusive-end to match ScopeResult's contract.
      startLine: node.startLine - 1,
      endLine: node.endLine,
    };
  } catch {
    // Any adapter error (stale DB, schema drift, etc.) falls through to regex.
    return null;
  }
}

/**
 * Resolve scope for an inline annotation — the code is on the same line.
 * Strip the comment, detect the element, figure out if it starts a block.
 */
function resolveInlineScope(lines: string[], lineIndex: number): ScopeResult | null {
  const line = lines[lineIndex];
  // Strip trailing comment to get the code portion. This is a best-effort
  // strip for the regex fallback path only — the tokenizer already knows
  // precisely where the comment starts, but by the time we're here we only
  // have raw lines, so we re-derive it with the same broad patterns as
  // before rather than threading the exact column through (kept simple
  // since this is fallback-tier code, not the primary detection path).
  const codePart = line.replace(/\s*\/\/\s*@(?:syndocs|synd).*$/, '')
                       .replace(/\s*#\s*@(?:syndocs|synd).*$/, '')
                       .replace(/\s*--\s*@(?:syndocs|synd).*$/, '')
                       .replace(/\s*\/\*\s*@(?:syndocs|synd).*\*\/\s*$/, '')
                       .replace(/\s*<!--\s*@(?:syndocs|synd).*-->\s*$/, '')
                       .trim();

  // Try to identify the element
  const detected = detectElement(codePart);
  if (!detected) return null;

  // Check if this line opens a block (has an opening brace or colon for Python)
  if (codePart.includes('{') || codePart.endsWith(':')) {
    // Find the closing brace/block
    const endLine = findBlockEnd(lines, lineIndex);
    return {
      name: detected.name,
      kind: detected.kind,
      startLine: lineIndex,
      endLine: endLine,
    };
  }

  // Single-line scope
  return {
    name: detected.name,
    kind: detected.kind,
    startLine: lineIndex,
    endLine: lineIndex + 1,
  };
}

/**
 * Resolve scope for an above-line annotation — scan the next line(s) for a declaration.
 * `lineIndex` here is the last line of the annotation's comment block (its
 * `endLine`), so this always starts scanning strictly after the comment.
 */
function resolveAboveScope(lines: string[], lineIndex: number): ScopeResult | null {
  // Find the next non-blank, non-comment line
  let declLine = -1;
  for (let i = lineIndex + 1; i < Math.min(lineIndex + 6, lines.length); i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (l.startsWith('//') || l.startsWith('#') || l.startsWith('/*') ||
        l.startsWith('*') || l.startsWith('<!--') || l.startsWith('--')) continue;
    declLine = i;
    break;
  }

  if (declLine === -1) return null;

  const detected = detectElement(lines[declLine].trim());
  if (!detected) {
    // Can't identify — use a generic scope from declLine to next blank or next anchor
    return {
      name: `block-L${declLine + 1}`,
      kind: 'block',
      startLine: declLine,
      endLine: findBlockEnd(lines, declLine),
    };
  }

  return {
    name: detected.name,
    kind: detected.kind,
    startLine: declLine,
    endLine: findBlockEnd(lines, declLine),
  };
}

/**
 * Try to detect the code element name and kind from a declaration line.
 * Checks DECLARATION_PATTERNS first (keyword-anchored: function/class/def/
 * fn/struct/etc — these can't be confused with a call or member access
 * since they require a literal declaration keyword), then falls back to
 * `detectMethodCallLikeDeclaration` for languages like Java/C# where a
 * method declaration has no fixed keyword (`public void foo()`), which
 * needs the extra guards below to avoid misreading a method *call* as one.
 */
function detectElement(codeLine: string): { name: string; kind: string } | null {
  for (const pat of DECLARATION_PATTERNS) {
    const m = codeLine.match(pat.re);
    if (m && m[pat.nameGroup]) {
      return { name: m[pat.nameGroup], kind: pat.kind };
    }
  }
  return detectMethodCallLikeDeclaration(codeLine);
}

// Statement-leading keywords that can legitimately precede `identifier(`
// without that identifier being a declaration — e.g. `if (isValid(x))`,
// `return calculateTotal(x)`. Deliberately does NOT include type-keyword-like
// words (e.g. `void`, `int`) since those precede a genuine declaration name
// in Java/C#-style `public void foo()` and must NOT be excluded.
const STATEMENT_KEYWORDS = new Set([
  'if', 'while', 'for', 'switch', 'catch', 'return', 'new', 'else', 'foreach',
  'typeof', 'instanceof', 'yield', 'throw', 'delete', 'await',
]);

/**
 * Detect a bare `identifier(` declaration (Java/C#/Kotlin-style typed method
 * declarations with no fixed keyword, e.g. `public void foo()`), while
 * rejecting the shapes that are calls, not declarations:
 *   - preceded by `.`, `->`, or `::` (member access: `$table->string(...)`,
 *     `this.doSomething()`, `self::helper()`)
 *   - the identifier itself, or the word immediately before it, is a
 *     statement-leading keyword (`if (x())`, `return foo()`)
 *   - it's a nested call argument (`if (isValid(x))` — the inner `isValid`
 *     is directly preceded by `(`)
 * This exists as a separate, more heavily guarded function (rather than one
 * more entry in DECLARATION_PATTERNS) specifically because a single regex
 * here previously matched `$table->string('x')->default('y')` as a method
 * declaration named `string` — any future change to these rules should keep
 * that case, and the DECLARATION_PATTERNS-keyword-anchored cases above it,
 * covered by anchor-parser.test.ts.
 */
function detectMethodCallLikeDeclaration(codeLine: string): { name: string; kind: string } | null {
  const re = /(?<![.\w]|->|::)([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codeLine))) {
    const name = m[1];
    if (STATEMENT_KEYWORDS.has(name)) continue;

    const before = codeLine.slice(0, m.index);
    if (/\($/.test(before.trimEnd())) continue; // nested call argument

    const prevWord = before.match(/([A-Za-z_]\w*)\s*$/);
    if (prevWord && STATEMENT_KEYWORDS.has(prevWord[1])) continue;

    return { name, kind: 'method' };
  }
  return null;
}

/**
 * Find the end of a block starting at startLine using brace/indentation counting.
 * Returns the 0-based exclusive end line.
 */
function findBlockEnd(lines: string[], startLine: number): number {
  const startIndent = lines[startLine].search(/\S/);
  const startText = lines[startLine].trim();

  // Brace-based: count { and }
  if (startText.includes('{')) {
    let depth = 0;
    for (let i = startLine; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth <= 0 && i > startLine) return i + 1;
    }
    return lines.length;
  }

  // Python/YAML-style: indentation-based
  if (startText.endsWith(':')) {
    for (let i = startLine + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === '') continue; // skip blanks
      const indent = l.search(/\S/);
      if (indent <= startIndent) return i;
    }
    return lines.length;
  }

  // Single statement: just this line
  return startLine + 1;
}
