// @syndocs
import type { CommentStyle, LanguageConfig, ParsedAnchor } from './types';
import { toKebabSlug, generateUniqueSlug } from './slug';

// ─── Declaration detection patterns (for structural fallback) ─────────────────
// These regexes extract element name and kind from a declaration line.
// They are intentionally broad — CodeGraph AST is preferred when available.

const DECLARATION_PATTERNS: Array<{ re: RegExp; kind: string; nameGroup: number }> = [
  // TypeScript / JavaScript / Java / C# / Go / Rust / Swift / Kotlin
  { re: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,          kind: 'function',  nameGroup: 1 },
  { re: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,          kind: 'class',     nameGroup: 1 },
  { re: /(?:export\s+)?interface\s+(\w+)/,                       kind: 'interface', nameGroup: 1 },
  { re: /(?:export\s+)?type\s+(\w+)\s*=/,                       kind: 'type',      nameGroup: 1 },
  { re: /(?:export\s+)?enum\s+(\w+)/,                           kind: 'enum',      nameGroup: 1 },
  { re: /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/,       kind: 'variable',  nameGroup: 1 },
  { re: /(?:public|private|protected|static)?\s*(?:async\s+)?(\w+)\s*\(/,  kind: 'method', nameGroup: 1 },
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
  { re: /(\w+)\s*[:=]/,                                         kind: 'variable',  nameGroup: 1 },
];

// Patterns for detecting single-line declarations (field, variable, constant)
const SINGLE_LINE_KINDS = new Set(['variable', 'field', 'constant']);

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
 */
/**
 * Locate a comment on `line` that is NOT inside a string literal.
 * Skips comment markers that occur inside single quotes, double quotes, or backticks.
 */
function findRealComment(
  line: string,
  style: CommentStyle,
  closeStyle?: string,
): { isFullLine: boolean; commentText: string } | null {
  let inQuote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '\\') {
        i++; // skip escaped char (backslash escapes the next character)
        continue;
      }
      if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inQuote = ch;
      continue;
    }

    if (line.startsWith(style, i)) {
      const before = line.slice(0, i);
      let commentText = line.slice(i + style.length);
      if (closeStyle) {
        const closeIdx = commentText.indexOf(closeStyle);
        if (closeIdx !== -1) {
          commentText = commentText.slice(0, closeIdx);
        }
      }
      return {
        isFullLine: before.trim().length === 0,
        commentText,
      };
    }
  }
  return null;
}

// @synd: parse-anchors
export function parseAnchors(
  content: string,
  langConfig: LanguageConfig,
): ParsedAnchor[] {
  const lines = content.split('\n');
  const anchors: ParsedAnchor[] = [];
  const seenLabels = new Set<string>();
  let hasWholeFile = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const commentInfo = findRealComment(line, langConfig.style, langConfig.closeStyle);
    if (!commentInfo) continue;

    const anchorMatch = commentInfo.commentText.match(/^\s*@(?:syndocs|synd)(?:\s*:\s*(\S+))?/);
    if (!anchorMatch) continue;

    const rawLabel = anchorMatch[1]; // may be undefined

    // ── 1. Full-line annotation (comment-only line) ───────────────────
    if (commentInfo.isFullLine) {
      if (!rawLabel) {
        // Bare annotation — whole-file if first & near top, otherwise auto-scoped micro
        if (!hasWholeFile && isHeaderArea(lines, i)) {
          anchors.push({ kind: 'whole-file', lineIndex: i });
          hasWholeFile = true;
        } else {
          // Auto-scoped micro-doc: scan next line for code element
          const scope = resolveScopeBoundaries(lines, i, false);
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
      const scope = resolveScopeBoundaries(lines, i, true);
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

// ─── Scope resolution (structural fallback) ───────────────────────────────────

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
 * For inline annotations: scope is the current line (or the block starting on that line).
 * For above-line annotations: scan the next non-blank line for a declaration.
 */
function resolveScopeBoundaries(
  lines: string[],
  lineIndex: number,
  inline: boolean,
): ScopeResult | null {
  if (inline) {
    return resolveInlineScope(lines, lineIndex);
  }
  return resolveAboveScope(lines, lineIndex);
}

/**
 * Resolve scope for an inline annotation — the code is on the same line.
 * Strip the comment, detect the element, figure out if it starts a block.
 */
function resolveInlineScope(lines: string[], lineIndex: number): ScopeResult | null {
  const line = lines[lineIndex];
  // Strip trailing comment to get the code portion
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
 */
function resolveAboveScope(lines: string[], lineIndex: number): ScopeResult | null {
  // Find the next non-blank, non-comment line
  let declLine = -1;
  for (let i = lineIndex + 1; i < Math.min(lineIndex + 5, lines.length); i++) {
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
