# doc-parser.ts
<!-- syndocs-hash: c0c6798d3474 -->

```ts
// @syndocs
import type { DocSection, MirrorDocData, ParsedEmbed } from './types';

// ─── Regex constants ──────────────────────────────────────────────────────────

const HASH_RE   = /<!--\s*syndocs-hash:\s*([a-f0-9]+)\s*-->/;
const SYNCED_RE = /<!--\s*syndocs-synced:\s*([a-f0-9]+)\s*-->/;
// @syndocs-embed: path  or  @syndocs-embed: path#label
const EMBED_RE  = /@syndocs-embed:\s*([^\s#]+)(?:#(\S+))?/;
// Section separator for micro-docs inside a mirror doc
const MICRO_HEADER_RE = /^##\s+@syndocs:\s+(\S+)/;
const PENDING_START   = '<!-- syndocs-pending-start -->';
const PENDING_END     = '<!-- syndocs-pending-end -->';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a mirror doc (.md file under docs/) into a MirrorDocData struct.
 *
 * The format expected:
 *
 *   # Filename.ext
 *   <!-- syndocs-hash: abc123 -->
 *
 *   ```lang
 *   ...code...
 *   ```
 *
 *   ## Notes
 *   ...prose...
 *
 *   <!-- syndocs-pending-start -->
 *   ## ⚠ Pending changes
 *   ```diff
 *   ...
 *   ```
 *   <!-- syndocs-pending-end -->
 *
 *   ---
 *   ## @syndocs: label
 *   <!-- syndocs-hash: def456 -->
 *   ...repeat...
 */
export function parseMirrorDoc(content: string): MirrorDocData {
  const lines = content.split('\n');

  // Title from the first H1
  const title = (lines[0] ?? '').replace(/^#+\s*/, '').trim();

  // Split into raw section blocks: the first block is the whole-file section,
  // subsequent blocks (separated by "---" + "## @syndocs: label") are micro-docs.
  const rawSections = splitIntoSections(lines);

  const sections: DocSection[] = rawSections.map((block, idx) => {
    if (idx === 0) {
      return parseSectionBlock(block, 'whole-file', undefined);
    }
    // First line of a micro-section is the "## @syndocs: label" header
    const headerMatch = block[0]?.match(MICRO_HEADER_RE);
    const label = headerMatch?.[1];
    return parseSectionBlock(block.slice(1), 'micro', label);
  });

  return { title, sections };
}

/**
 * Parse a composed doc (guides/*.md) for embed directives.
 * Returns each @syndocs-embed line found, with path, label, and synced hash.
 */
export function parseEmbeds(content: string): ParsedEmbed[] {
  const lines = content.split('\n');
  const embeds: ParsedEmbed[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const embedMatch = line.match(EMBED_RE);
    if (!embedMatch) continue;

    const targetPath  = embedMatch[1];
    const targetLabel = embedMatch[2];

    // synced hash may be inline: @syndocs-embed: path <!-- syndocs-synced: abc -->
    const syncedMatch = line.match(SYNCED_RE);

    embeds.push({
      targetPath,
      targetLabel,
      syncedHash: syncedMatch?.[1],
      lineIndex: i,
      raw: line,
    });
  }

  return embeds;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Split the lines of a mirror doc into an array of "blocks", where each block
 * is a list of lines belonging to one section (whole-file or micro-doc).
 * Sections are delimited by a "---" line followed by "## @syndocs: label".
 */
function splitIntoSections(lines: string[]): string[][] {
  const sections: string[][] = [];
  let current: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A "---" separator followed by "## @syndocs:" starts a new section
    if (line.trim() === '---') {
      const next = lines[i + 1] ?? '';
      if (MICRO_HEADER_RE.test(next)) {
        sections.push(current);
        current = [];
        i++; // consume the --- line; next iteration will be the ## @syndocs: header
        current.push(lines[i]);
        continue;
      }
    }

    current.push(line);
  }

  sections.push(current);
  return sections;
}

/**
 * Parse one section block into a DocSection.
 */
function parseSectionBlock(
  lines: string[],
  kind: DocSection['kind'],
  label: string | undefined,
): DocSection {
  const hash        = extractHash(lines);
  const codeCopy    = extractFirstCodeBlock(lines).code;
  const codeLanguage = extractFirstCodeBlock(lines).lang;
  const pendingDiff = extractPendingDiff(lines);
  const notes       = extractNotes(lines);

  return { kind, label, hash, codeCopy, codeLanguage, notes, pendingDiff };
}

function extractHash(lines: string[]): string | undefined {
  for (const l of lines) {
    const m = l.match(HASH_RE);
    if (m) return m[1];
  }
  return undefined;
}

function extractFirstCodeBlock(lines: string[]): { code: string; lang: string } {
  let inBlock = false;
  let lang = '';
  const block: string[] = [];

  for (const line of lines) {
    if (!inBlock) {
      const open = line.match(/^```(\w*)/);
      if (open && !line.includes('diff')) {
        // Skip diff blocks (those are pending diffs, not code copies)
        inBlock = true;
        lang = open[1] ?? '';
      }
      continue;
    }
    if (line === '```' || line.startsWith('```')) {
      break; // end of first code block
    }
    block.push(line);
  }

  return { code: block.join('\n'), lang };
}

/**
 * Extract the diff text from inside the pending-changes fences.
 */
function extractPendingDiff(lines: string[]): string | undefined {
  const startIdx = lines.findIndex(l => l.trim() === PENDING_START);
  const endIdx   = lines.findIndex(l => l.trim() === PENDING_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return undefined;

  const inner = lines.slice(startIdx + 1, endIdx);

  // Find the ```diff ... ``` block inside
  const diffOpen = inner.findIndex(l => l.startsWith('```diff'));
  const diffClose = inner.findIndex((l, i) => i > diffOpen && l === '```');
  if (diffOpen === -1 || diffClose === -1) return undefined;

  return inner.slice(diffOpen + 1, diffClose).join('\n');
}

/**
 * Extract notes: everything after the first code block (and after any pending-changes block).
 * The "## Notes" heading is consumed; the raw prose is returned.
 */
function extractNotes(lines: string[]): string {
  // Find the end of the first code block
  let pastCode = false;
  let codeDepth = 0;
  let noteStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!pastCode) {
      if (line.match(/^```/)) codeDepth++;
      if (codeDepth > 0 && line === '```' && i > 0) {
        codeDepth--;
        if (codeDepth === 0) pastCode = true;
      }
      continue;
    }

    // Skip pending-changes block
    if (line.trim() === PENDING_START) {
      // Skip until end
      while (i < lines.length && lines[i].trim() !== PENDING_END) i++;
      continue;
    }

    // "## Notes" or "### Notes" heading — start collecting after it
    if (line.match(/^#{2,3}\s+Notes/i)) {
      noteStart = i + 1;
      break;
    }
  }

  if (noteStart === -1) return '';

  // Collect until next "##" heading or end-of-section marker
  const noteLines: string[] = [];
  for (let i = noteStart; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^##/) && !line.match(/^#{3,}/)) break; // sibling section
    if (line.trim() === PENDING_START) break;
    noteLines.push(line);
  }

  // Trim leading/trailing blank lines
  while (noteLines.length > 0 && noteLines[0]!.trim() === '') noteLines.shift();
  while (noteLines.length > 0 && noteLines[noteLines.length - 1]!.trim() === '') noteLines.pop();

  return noteLines.join('\n');
}
```

## Notes

> _Add documentation notes here._
