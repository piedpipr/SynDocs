# @syndocs: parse-anchors
> Source: `packages/core/src/anchor-parser.ts`
<!-- syndocs-hash: 3e7e605073a0 -->

```ts
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
```

## Notes

> _Add documentation notes here._
