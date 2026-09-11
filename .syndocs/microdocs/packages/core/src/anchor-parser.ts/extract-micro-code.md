# @syndocs: extract-micro-code
> Source: `packages/core/src/anchor-parser.ts`
<!-- syndocs-hash: bb70b4eb08b4 -->

```ts
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
