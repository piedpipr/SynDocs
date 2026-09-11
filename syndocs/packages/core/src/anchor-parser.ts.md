# anchor-parser.ts
<!-- syndocs-hash: 7f253d505d9e -->

```ts
// @syndocs
import type { LanguageConfig, ParsedAnchor } from './types';
import { buildAnchorRegex } from './languages';

/**
 * Scan a source file's content for @syndocs and @syndocs: label anchor comments.
 *
 * Rules:
 *  - At most ONE bare @syndocs per file (whole-file anchor). Duplicate whole-file
 *    anchors are silently ignored beyond the first.
 *  - @syndocs: label produces a micro-doc for the immediately following block.
 *    Labels must be unique within a file; duplicates are an error logged to stderr.
 */
// @syndocs: parse-anchors
export function parseAnchors(
  content: string,
  langConfig: LanguageConfig,
): ParsedAnchor[] {
  const lines = content.split('\n');
  const re = buildAnchorRegex(langConfig.style);
  const anchors: ParsedAnchor[] = [];
  const seenLabels = new Set<string>();
  let hasWholeFile = false;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;

    const rawLabel = m[1]; // may be undefined

    if (!rawLabel) {
      // Whole-file anchor
      if (!hasWholeFile) {
        anchors.push({ kind: 'whole-file', lineIndex: i });
        hasWholeFile = true;
      }
    } else {
      const label = rawLabel.trim();
      if (seenLabels.has(label)) {
        process.stderr.write(
          `[syndocs] Warning: duplicate label "@syndocs: ${label}" in file — skipping extra\n`,
        );
        continue;
      }
      seenLabels.add(label);
      anchors.push({ kind: 'micro', label, lineIndex: i });
    }
  }

  return anchors;
}

/**
 * Extract the source text "owned" by a micro-doc anchor.
 * That is: everything from the line after the anchor comment
 * up to (but not including) the next anchor comment line,
 * trimmed of leading/trailing blank lines.
 */
// @syndocs: extract-micro-code
export function extractMicroDocCode(
  content: string,
  anchor: ParsedAnchor,
  nextAnchorLineIndex?: number,
): string {
  const lines = content.split('\n');
  const start = anchor.lineIndex + 1;
  const end = nextAnchorLineIndex ?? lines.length;
  return lines.slice(start, end).join('\n').trim();
}
```

## Notes

> _Add documentation notes here._
