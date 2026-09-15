// @syndocs
/**
 * Universal comment tokenizer.
 *
 * Replaces the old hand-rolled per-line regex + manual quote-tracking
 * (`findRealComment`, one `CommentStyle` per language) with a real TextMate
 * grammar tokenizer (shiki, wrapping vscode-textmate + vscode-oniguruma —
 * the same engine VS Code uses for syntax highlighting).
 *
 * Why this replaced the regex approach:
 *   - Multi-line block comments (`/* ... *\/`) need lexer state carried
 *     across lines. The old per-line scanner had none, so a `/** @synd *\/`
 *     header spanning multiple lines was invisible.
 *   - Languages like JS/TS/Java/C/Go support BOTH `//` and `/* *\/`, but the
 *     old `LanguageConfig` only recorded one style, so JSDoc-style anchors
 *     were never matched in files configured for `//`.
 *   - Distinguishing a comment marker from the same characters inside a
 *     string or regex literal (`/don't-match/`) requires actually knowing
 *     the language's grammar — naive quote-toggling gets this wrong.
 * A TextMate grammar solves all three by construction: it tracks state
 * line-to-line, encodes every comment form a language has, and correctly
 * scopes regex/string literals separately from comments.
 *
 * Boundary: grammar/WASM loading is inherently async, but `parseAnchors` in
 * anchor-parser.ts is called synchronously all over the CLI. We resolve this
 * with an explicit init step (`initTokenizer`) that must run once before any
 * synchronous tokenization — see `getTokenizerSync` below for the contract.
 */

import type { Highlighter } from 'shiki';
import { bundledLanguages } from 'shiki';

// ─── Comment span extraction ──────────────────────────────────────────────────

export interface CommentSpan {
  /** 0-based line index where this comment run starts */
  startLine: number;
  /** 0-based line index where this comment run ends (inclusive) */
  endLine: number;
  /** 0-based column of the first comment token on startLine */
  startColumn: number;
  /**
   * Concatenated text of the comment content across all its lines, joined
   * with '\n'. Comment-delimiter punctuation (`//`, `/*`, `*\/`, `#`, `<!--`,
   * `-->`) is INCLUDED, matching the shape the old `commentText` had before
   * stripping — anchor-parser strips the leading marker itself via its
   * existing anchor regex, so behavior for label extraction is unchanged.
   */
  text: string;
  /** true if nothing but whitespace precedes the comment on startLine */
  isFullLineStart: boolean;
}

const COMMENT_SCOPE_PREFIX = 'comment';

// ─── Highlighter singleton ─────────────────────────────────────────────────────

let highlighterPromise: Promise<Highlighter> | null = null;
let highlighter: Highlighter | null = null;
const loadedGrammars = new Set<string>();

/**
 * Must be called (and awaited) once before any synchronous call to
 * `extractCommentSpans` / `parseAnchors`. Idempotent — safe to call multiple
 * times (e.g. once per CLI invocation); subsequent calls just ensure any
 * newly-requested grammars are loaded on the existing instance.
 *
 * `grammarIds` lets callers warm only the languages they're about to touch
 * (fast for single-file commands); omit it to warm every language SynDocs
 * knows about (used by long-running `serve`).
 */
export async function initTokenizer(grammarIds?: string[]): Promise<void> {
  const { createHighlighter } = await import('shiki');
  const ids = grammarIds ?? Object.keys(bundledLanguages);
  const toLoad = ids.filter(id => !loadedGrammars.has(id) && id in bundledLanguages);

  if (!highlighter) {
    highlighterPromise = createHighlighter({ themes: [], langs: toLoad });
    highlighter = await highlighterPromise;
  } else if (toLoad.length > 0) {
    await highlighter.loadLanguage(...(toLoad as Parameters<Highlighter['loadLanguage']>));
  }

  for (const id of toLoad) loadedGrammars.add(id);
}

/** True once `initTokenizer` has completed at least once. */
export function isTokenizerReady(): boolean {
  return highlighter !== null;
}

function getHighlighterOrThrow(): Highlighter {
  if (!highlighter) {
    throw new Error(
      '[syndocs] Tokenizer used before initialization. Call `await initTokenizer()` once ' +
      'at program startup before any parseAnchors()/extractCommentSpans() call. This is a ' +
      'programming error in the caller, not a runtime/environment issue.',
    );
  }
  return highlighter;
}

// ─── Public extraction API ─────────────────────────────────────────────────────

/**
 * Tokenize `content` as `grammarId` and return every contiguous comment run
 * (a single-line `//` comment, or a `/* *\/`-style block possibly spanning
 * many lines) as a `CommentSpan`.
 *
 * Throws only if the tokenizer hasn't been initialized (programming error).
 * Grammar-level crashes (e.g. the shiki/vscode-textmate `startIndex` bug
 * triggered by PHP anonymous classes) are caught internally and handled by
 * `extractCommentSpansRegex` — a language-aware regex scanner that correctly
 * merges consecutive line comments and handles block comments. This keeps the
 * error contained here rather than propagating to anchor-parser.ts's rough
 * last-resort fallback, and eliminates the "grammar tokenization failed"
 * warning for affected files.
 */
export function extractCommentSpans(content: string, grammarId: string): CommentSpan[] {
  const hl = getHighlighterOrThrow();

  // `grammarId` is a plain `string` in LanguageConfig by design — we don't
  // want @syndocs/core's public config type coupled to shiki's exact
  // BundledLanguage literal union, which would leak an implementation
  // detail into our API surface and break if shiki renames/removes a
  // language id. We validate + cast at this single boundary instead.
  if (!(grammarId in bundledLanguages)) {
    throw new Error(
      `[syndocs] Unknown grammar id "${grammarId}" — not one of shiki's bundled languages. ` +
      `This indicates a bug in languages.ts's BY_EXTENSION table, not a caller error.`,
    );
  }

  let lines: ReturnType<typeof hl.codeToTokensBase>;
  try {
    lines = hl.codeToTokensBase(content, {
      lang: grammarId as Parameters<Highlighter['codeToTokensBase']>[1]['lang'],
      includeExplanation: true,
    });
  } catch {
    // shiki/vscode-textmate grammar bug — reproduced with PHP anonymous-class
    // syntax (`return new class extends X { ... }`), which causes the
    // explanation builder to read `.startIndex` off an undefined scope entry.
    // Fall back to a language-aware regex scanner rather than letting the
    // error propagate to anchor-parser.ts's rough last-resort handler.
    return extractCommentSpansRegex(content, grammarId);
  }

  const spans: CommentSpan[] = [];
  // The scope name of the currently-open multi-line comment run (e.g.
  // "comment.block.ts"), or null if we're not inside one. This is the
  // authoritative signal from the grammar itself for "is this token part of
  // the SAME comment as the previous line's", as opposed to inferring it
  // from indentation/column heuristics, which can't distinguish "still the
  // same block comment" from "a new, unrelated line comment directly below".
  let openScopeName: string | null = null;
  let open: CommentSpan | null = null;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    let lineCommentText = '';
    let firstCommentColumn = -1;
    let onlyWhitespaceBeforeComment = true;
    let lineCommentScopeName: string | null = null;
    let sawNonWhitespaceBeforeAnyComment = false;

    for (const tok of lines[lineIdx]) {
      // IMPORTANT: shiki's `codeToTokensBase` merges adjacent characters that
      // share the same rendered style into one `content` token, but its
      // `explanation` array preserves the underlying per-character-run
      // scopes — which can legitimately differ *within* one merged token
      // (e.g. "code(); " merges code, punctuation, and trailing whitespace
      // that happen to render identically). Checking only `explanation[0]`
      // silently misses a comment that starts partway through a merged
      // token, so every sub-token must be inspected individually.
      let offsetInTok = 0;
      for (const sub of tok.explanation ?? []) {
        const scopes = sub.scopes.map(s => s.scopeName);
        const commentScope = scopes.find(s => s.startsWith(COMMENT_SCOPE_PREFIX));

        if (commentScope) {
          if (firstCommentColumn === -1) {
            firstCommentColumn = tok.offset + offsetInTok;
            onlyWhitespaceBeforeComment = !sawNonWhitespaceBeforeAnyComment;
          }
          lineCommentText += sub.content;
          lineCommentScopeName = commentScope;
        } else if (sub.content.trim() !== '') {
          sawNonWhitespaceBeforeAnyComment = true;
        }
        offsetInTok += sub.content.length;
      }
    }

    const sawCommentOnThisLine = firstCommentColumn !== -1;
    const isContinuationOfOpenRun =
      sawCommentOnThisLine &&
      open !== null &&
      openScopeName !== null &&
      lineCommentScopeName === openScopeName &&
      open.endLine === lineIdx - 1 &&
      onlyWhitespaceBeforeComment;

    if (sawCommentOnThisLine && isContinuationOfOpenRun) {
      open!.text += '\n' + lineCommentText;
      open!.endLine = lineIdx;
    } else {
      if (open) spans.push(open);
      if (sawCommentOnThisLine) {
        open = {
          startLine: lineIdx,
          endLine: lineIdx,
          startColumn: firstCommentColumn,
          text: lineCommentText,
          isFullLineStart: onlyWhitespaceBeforeComment,
        };
        openScopeName = lineCommentScopeName;
      } else {
        open = null;
        openScopeName = null;
      }
    }
  }
  if (open) spans.push(open);

  return spans;
}

// ─── Regex fallback (used when shiki grammar crashes) ─────────────────────────

/**
 * Language-aware regex comment scanner, activated when `codeToTokensBase`
 * throws for a specific file (e.g. PHP anonymous-class startIndex bug).
 *
 * Handles:
 *   `//`          single-line  — JS, TS, PHP, Java, C, C++, Go, Rust, Swift, Kotlin, C#
 *   `/* ... *\/`  block        — same C-family languages
 *   `#`           single-line  — Python, Ruby, Shell, YAML, Dockerfile
 *   `--`          single-line  — SQL, Lua
 *   `<!-- -->`    block        — HTML, XML
 *
 * Consecutive same-marker full-line comments are merged into a single
 * CommentSpan (mirrors `isContinuationOfOpenRun` in the shiki path), so a
 * multi-line `// block` ending with `// @synd` arrives as one span with full
 * text — exactly the shape anchor-parser.ts expects.
 *
 * Inline trailing comments (code before the marker) are never merged; each
 * is its own single-line span, same as the shiki tokenizer produces.
 */
function extractCommentSpansRegex(content: string, grammarId: string): CommentSpan[] {
  const rawLines = content.split('\n');
  const spans: CommentSpan[] = [];

  // Which comment forms does this grammar use?
  const slashSlash = new Set(['javascript','typescript','jsx','tsx','php','java','c','cpp',
                               'csharp','go','rust','swift','kotlin','css','scss','sass']);
  const hashStyle  = new Set(['python','ruby','shellscript','yaml','dockerfile']);
  const dashDash   = new Set(['sql','lua']);
  const htmlStyle  = new Set(['html','xml']);
  const blockSlash = new Set([...slashSlash]); // /* */ mirrors // languages

  const useSlash = slashSlash.has(grammarId);
  const useHash  = hashStyle.has(grammarId);
  const useDash  = dashDash.has(grammarId);
  const useBlock = blockSlash.has(grammarId);
  const useHtml  = htmlStyle.has(grammarId);

  let open: CommentSpan | null = null;
  let openMarker: string | null = null;
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i]!;
    const trimmed = line.trimStart();
    const leadingSpaces = line.length - trimmed.length;

    // ── Block comment: /* ... */ ─────────────────────────────────────────────
    if (useBlock && trimmed.startsWith('/*')) {
      if (open) { spans.push(open); open = null; openMarker = null; }

      const blockStartLine = i;
      const blockCol       = leadingSpaces;
      let blockText        = '';
      const isFull         = line.slice(0, leadingSpaces).trim().length === 0;

      while (i < rawLines.length) {
        const bLine = rawLines[i]!;
        blockText += (blockText ? '\n' : '') + bLine;
        if (bLine.includes('*/')) { i++; break; }
        i++;
      }

      spans.push({
        startLine: blockStartLine,
        endLine:   i - 1,
        startColumn: blockCol,
        text: blockText,
        isFullLineStart: isFull,
      });
      continue;
    }

    // ── Block comment: <!-- ... --> ──────────────────────────────────────────
    if (useHtml && trimmed.startsWith('<!--')) {
      if (open) { spans.push(open); open = null; openMarker = null; }

      const blockStartLine = i;
      let blockText = '';

      while (i < rawLines.length) {
        blockText += (blockText ? '\n' : '') + rawLines[i]!;
        if (rawLines[i]!.includes('-->')) { i++; break; }
        i++;
      }

      spans.push({
        startLine: blockStartLine,
        endLine:   i - 1,
        startColumn: leadingSpaces,
        text: blockText,
        isFullLineStart: true,
      });
      continue;
    }

    // ── Single-line markers ──────────────────────────────────────────────────
    let marker: string | null = null;
    let markerCol = -1;

    if (useSlash) {
      const idx = line.indexOf('//');
      if (idx !== -1) { marker = '//'; markerCol = idx; }
    }
    if (!marker && useHash) {
      const idx = line.indexOf('#');
      if (idx !== -1) { marker = '#'; markerCol = idx; }
    }
    if (!marker && useDash) {
      const idx = line.indexOf('--');
      if (idx !== -1) { marker = '--'; markerCol = idx; }
    }

    if (marker !== null) {
      const before = line.slice(0, markerCol);
      const isFull = before.trim().length === 0;

      const canMerge =
        open !== null &&
        openMarker === marker &&
        isFull &&
        open.isFullLineStart &&
        open.endLine === i - 1;

      if (canMerge) {
        open!.text    += '\n' + line.slice(markerCol);
        open!.endLine  = i;
      } else {
        if (open) spans.push(open);
        open = {
          startLine:      i,
          endLine:        i,
          startColumn:    markerCol,
          text:           line.slice(markerCol),
          isFullLineStart: isFull,
        };
        openMarker = marker;
      }
    } else {
      if (open) { spans.push(open); open = null; openMarker = null; }
    }

    i++;
  }

  if (open) spans.push(open);
  return spans;
}
