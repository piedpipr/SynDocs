// @syndocs
import type { LanguageConfig, ParsedAnchor } from './types';
import { toKebabSlug, generateUniqueSlug } from './slug';
import { extractCommentSpans, type CommentSpan } from './tokenizer';
import { hasAstSupport, resolveScopeViaAst } from './ast-scope';

// ─── Declaration detection patterns (last-resort fallback for structural ───
// ─── scoping, languages with NO bundled tree-sitter grammar only)        ───
//
// Scope resolution is now tree-sitter-based (see ast-scope.ts) for every
// language with a bundled grammar — it can't be fooled by a brace/quote
// character inside a string, comment, or template literal, unlike the
// regex+brace-counting this table used to back exclusively. This table
// now only fires for languages ast-scope.ts has no grammar for (currently:
// SQL — DDL statements aren't really "declarations with a body" in the
// same sense anyway). It is intentionally NOT exhaustive anymore; do not
// add entries for languages that have a grammar in ast-scope.ts's
// GRAMMARS table — fix or extend that table instead.
const DECLARATION_PATTERNS: Array<{ re: RegExp; kind: string; nameGroup: number }> = [
  // SQL — no tree-sitter grammar wired up (DDL/DML, not really "code
  // declarations" in the AST sense that would benefit from full parsing).
  { re: /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE)\s+(\w+)/i, kind: 'schema', nameGroup: 1 },
  // Generic single-line assignment — last-resort catch-all for any
  // ungrammared language's `const X = ...`-shaped line. Guarded against
  // matching object property access (e.g. `$table->foo =`, `this.foo =`)
  // as a variable declaration.
  { re: /(?<![.\w]|->|::)(\w+)\s*[:=][^=]/,                     kind: 'variable',  nameGroup: 1 },
];

const ANCHOR_RE = /@(?:syndocs|synd)(?:\s*:\s*(\S+))?/;

/**
 * Explicit block-end marker: `@endsynd`.
 *
 * Normally a `@synd` annotation's scope is resolved automatically (via
 * tree-sitter, falling back to regex) to the enclosing/following code
 * element. `@endsynd` lets the range be stated explicitly instead — the
 * annotation scopes from the line after its `@synd` marker up to the line
 * before the matching `@endsynd`. This is what the Web UI's "Add Doc
 * (Block)" action emits when the user selects an arbitrary span of lines
 * that may not correspond to a single AST node.
 *
 * Matched before ANCHOR_RE would see it, since "@endsynd" doesn't contain
 * "@synd" as a prefix-aligned match but we check it explicitly for clarity.
 */
const END_ANCHOR_RE = /@endsynd\b/;

export interface ParseAnchorsOptions {
  /** Repo-relative or absolute path of the file being parsed (currently informational only; kept for forward-compatibility with future path-sensitive resolution). */
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
 *
 * Scope resolution (mapping an annotation to the exact function/class/etc.
 * boundaries it documents) is tree-sitter-based — see ast-scope.ts — for
 * every language with a bundled grammar, both for bare AND explicit-label
 * annotations. Languages with no bundled grammar fall back to the regex
 * `DECLARATION_PATTERNS` tier below. This module has no dependency on
 * CodeGraph: CodeGraph's role in SynDocs is the dependency graph (blast
 * radius, wiki-links, in-code token highlighting in the Web Studio), which
 * is unrelated to finding a declaration's own start/end lines.
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

  // Pre-scan for explicit block-end markers so a `@synd` annotation can look
  // ahead for its matching `@endsynd` and use that as an explicit scope end
  // instead of AST/regex-inferred boundaries.
  const endMarkerLines: number[] = [];
  const anchorSpanLines: number[] = [];
  for (const span of spans) {
    if (END_ANCHOR_RE.test(span.text)) endMarkerLines.push(span.startLine);
    else if (ANCHOR_RE.test(span.text)) anchorSpanLines.push(span.startLine);
  }
  /**
   * The `@endsynd` that belongs to the annotation starting at `line`: the
   * first end marker after it, but only if no *other* `@synd` annotation
   * appears in between (otherwise that end marker belongs to the later
   * annotation, not this one).
   */
  const matchingEndMarker = (line: number): number | undefined => {
    const end = endMarkerLines.find(l => l > line);
    if (end === undefined) return undefined;
    const interveningAnchor = anchorSpanLines.find(l => l > line && l < end);
    return interveningAnchor === undefined ? end : undefined;
  };

  for (const span of spans) {
    // An `@endsynd` marker is a delimiter, not an annotation of its own.
    if (END_ANCHOR_RE.test(span.text)) continue;

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
          const scope = resolveScopeBoundaries(content, lines, langConfig, span.endLine, false);

          // An explicit `@endsynd` below this marker overrides the inferred
          // scope end entirely, letting the user document an arbitrary span
          // of lines that need not line up with a single AST node. Scope
          // indices are 0-based with an exclusive end (see
          // extractMicroDocCode), so the `@endsynd` line index is itself the
          // correct exclusive end — the documented range is the lines
          // strictly between the two markers.
          const explicitEnd = matchingEndMarker(span.endLine);
          const useExplicit = explicitEnd !== undefined;

          // An explicit @endsynd range can span several declarations, so
          // naming it after whichever one happens to come first would be
          // misleading — label it as a block instead.
          const slug = useExplicit
            ? generateUniqueSlug(`block-L${i + 1}`, seenLabels)
            : scope
              ? generateUniqueSlug(toKebabSlug(scope.name), seenLabels)
              : generateUniqueSlug(`block-L${i + 1}`, seenLabels);

          seenLabels.add(slug);
          anchors.push({
            kind: 'micro',
            label: slug,
            lineIndex: i,
            autoScoped: true,
            // An explicit @endsynd range is a custom block by definition —
            // it may span several declarations, so don't inherit the kind of
            // whichever one happens to be first.
            elementKind: useExplicit ? 'block' : scope?.kind,
            elementName: useExplicit ? slug : scope?.name,
            scopeStartLine: useExplicit ? span.endLine + 1 : scope?.startLine,
            scopeEndLine: useExplicit ? explicitEnd : scope?.endLine,
          });
        }
      } else {
        // Explicit label — this branch previously never resolved scope
        // boundaries at all (see ast-scope.ts's file header, bug #2: a
        // `@synd: label` sitting inside a multi-line JSDoc block above a
        // multi-line function signature produced a corrupted snippet that
        // started mid-comment, because nothing here ever looked past the
        // comment itself). Resolve the same way the bare-annotation branch
        // above does, using the comment block's END line as the scan point
        // so a label anywhere inside a multi-line comment still resolves
        // to the declaration that follows the whole block.
        const label = rawLabel.trim();
        if (seenLabels.has(label)) {
          process.stderr.write(
            `[syndocs] Warning: duplicate label "@synd: ${label}" in file — skipping extra\n`,
          );
          continue;
        }
        seenLabels.add(label);
        const scope = resolveScopeBoundaries(content, lines, langConfig, span.endLine, false);
        // An explicit `@endsynd` defines a custom range for a labelled
        // annotation exactly as it does for a bare one.
        const explicitEnd = matchingEndMarker(span.endLine);
        const useExplicit = explicitEnd !== undefined;
        anchors.push({
          kind: 'micro',
          label,
          lineIndex: i,
          elementKind: useExplicit ? 'block' : scope?.kind,
          elementName: useExplicit ? label : scope?.name,
          scopeStartLine: useExplicit ? span.endLine + 1 : scope?.startLine,
          scopeEndLine: useExplicit ? explicitEnd : scope?.endLine,
        });
      }
      continue;
    }

    // ── 2. Inline (trailing) annotation ───────────────────────────────
    if (!rawLabel) {
      // Inline bare: scope to the current line's code element
      const scope = resolveScopeBoundaries(content, lines, langConfig, i, true);
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
      // Explicit inline label — same fix as the above-annotation branch:
      // resolve scope boundaries instead of leaving them undefined.
      const label = rawLabel.trim();
      if (seenLabels.has(label)) {
        process.stderr.write(
          `[syndocs] Warning: duplicate label "@synd: ${label}" in file — skipping extra\n`,
        );
        continue;
      }
      seenLabels.add(label);
      const scope = resolveScopeBoundaries(content, lines, langConfig, i, true);
      anchors.push({
        kind: 'micro',
        label,
        lineIndex: i,
        inline: true,
        elementKind: scope?.kind,
        elementName: scope?.name,
        scopeStartLine: scope?.startLine,
        scopeEndLine: scope?.endLine,
      });
    }
  }

  return anchors;
}

/**
 * Conservative last-resort comment scanner used only if the real tokenizer
 * throws for a given file. Single-line `//`/`#`/`--` markers only — no
 * block-comment or string-literal awareness — but it DOES merge consecutive
 * full-line comment runs that use the same marker into a single CommentSpan,
 * matching the shape that the shiki-based extractor produces.
 *
 * Why merging matters: without it a `@synd` anchor on the last line of a
 * multi-line `//` block arrives as a completely isolated single-line span,
 * so the surrounding comment text is lost and scope resolution has nothing
 * useful to work with. The old version (one span per line) made PHP migration
 * files with a `// ... @synd` block header produce blank or mis-scoped
 * micro-doc sections in the output.
 *
 * Merging rules (mirrors the shiki tokenizer's `isContinuationOfOpenRun`):
 *   - The new line must immediately follow the open span (endLine === i − 1).
 *   - Both lines must be full-line-start (no code before the marker).
 *   - Both lines must use the same marker string.
 * Inline trailing comments (code before the marker) are never merged — they
 * are their own single-line span, exactly like the tokenizer produces.
 */
function scanCommentsFallback(lines: string[]): CommentSpan[] {
  const spans: CommentSpan[] = [];
  const markers = ['//', '#', '--'];
  let open: CommentSpan | null = null;
  let openMarker: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let found = false;

    for (const marker of markers) {
      const idx = line.indexOf(marker);
      if (idx === -1) continue;
      const before = line.slice(0, idx);
      const isFull = before.trim().length === 0;

      const canMerge =
        open !== null &&
        openMarker === marker &&
        isFull &&
        open.isFullLineStart &&
        open.endLine === i - 1;

      if (canMerge) {
        open!.text += '\n' + line.slice(idx);
        open!.endLine = i;
      } else {
        if (open) spans.push(open);
        open = {
          startLine: i,
          endLine: i,
          startColumn: idx,
          text: line.slice(idx),
          isFullLineStart: isFull,
        };
        openMarker = marker;
      }

      found = true;
      break;
    }

    if (!found && open) {
      spans.push(open);
      open = null;
      openMarker = null;
    }
  }

  if (open) spans.push(open);
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
 * Prefers a real tree-sitter AST (see ast-scope.ts) whenever this file's
 * language has a bundled grammar — this can't be fooled by a brace,
 * quote, or colon character that merely appears inside a string, comment,
 * or template literal, unlike the regex/brace-counting fallback below.
 * Falls back to the regex-based `DECLARATION_PATTERNS` scan only when
 * there's no grammar for this language, or the AST engine hasn't been
 * initialized (`initAstEngine()` wasn't awaited — see ast-scope.ts), or
 * the AST resolver genuinely finds nothing at that location.
 */
function resolveScopeBoundaries(
  content: string,
  lines: string[],
  langConfig: LanguageConfig,
  lineIndex: number,
  inline: boolean,
): ScopeResult | null {
  // ── Trailing (inline) annotation: ALWAYS documents exactly that one line.
  //
  // Previously this walked up the AST to the enclosing declaration, so
  // `foo(); // @synd` on a line inside a function documented the whole
  // function. Under the simplified model a trailing marker is explicitly a
  // single-line micro-doc, so the range is fixed at [lineIndex, lineIndex+1)
  // regardless of what the line contains. The AST/regex tiers are still
  // consulted, but only to pick a good *name* for the generated label.
  if (inline) {
    let name: string | undefined;

    // Prefer a name derived from the annotated line's own code — for a
    // single-line micro-doc that's more meaningful than the enclosing
    // declaration the AST would report (a trailing marker inside
    // `function outer()` should be labelled after the line, not "outer").
    const detected = detectElement(stripTrailingAnnotation(lines[lineIndex] ?? ''));
    if (detected) {
      name = detected.name;
    } else if (hasAstSupport(langConfig.grammarId)) {
      const astResult = resolveScopeViaAst(content, langConfig.grammarId, lineIndex, true);
      if (astResult) name = astResult.name;
    }

    return {
      name: name ?? `line-L${lineIndex + 1}`,
      kind: 'line',
      startLine: lineIndex,
      endLine: lineIndex + 1,
    };
  }

  // ── Above (full-line) annotation: the immediately following code block.
  // The AST tier resolves the next named sibling after the comment — i.e.
  // the block the annotation precedes, never the block it sits inside.
  if (hasAstSupport(langConfig.grammarId)) {
    const astResult = resolveScopeViaAst(content, langConfig.grammarId, lineIndex, false);
    if (astResult) return astResult;
  }

  return resolveAboveScope(lines, lineIndex);
}

/**
 * Strip a trailing `@synd`/`@syndocs` comment off a line, leaving the code.
 * Best-effort across the comment styles SynDocs supports — used only to give
 * a single-line micro-doc a nicer auto-generated label.
 */
function stripTrailingAnnotation(line: string): string {
  return line
    .replace(/\s*\/\/\s*@(?:syndocs|synd).*$/, '')
    .replace(/\s*#\s*@(?:syndocs|synd).*$/, '')
    .replace(/\s*--\s*@(?:syndocs|synd).*$/, '')
    .replace(/\s*\/\*\s*@(?:syndocs|synd).*\*\/\s*$/, '')
    .replace(/\s*<!--\s*@(?:syndocs|synd).*-->\s*$/, '')
    .trim();
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
 * This is the last-resort tier for languages with no bundled tree-sitter
 * grammar (see ast-scope.ts) — currently just SQL, plus a generic
 * `identifier = ...` catch-all. Languages that previously needed the more
 * elaborate bare-`identifier(`-declaration heuristics here (Java, C#,
 * Kotlin) now all have tree-sitter grammars and are resolved correctly and
 * unambiguously in ast-scope.ts before this function is ever reached — see
 * that module's GRAMMARS table.
 */
function detectElement(codeLine: string): { name: string; kind: string } | null {
  for (const pat of DECLARATION_PATTERNS) {
    const m = codeLine.match(pat.re);
    if (m && m[pat.nameGroup]) {
      return { name: m[pat.nameGroup], kind: pat.kind };
    }
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
