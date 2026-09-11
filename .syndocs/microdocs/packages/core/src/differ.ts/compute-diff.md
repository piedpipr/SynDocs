# @syndocs: compute-diff
> Source: `packages/core/src/differ.ts`
<!-- syndocs-hash: 0c0f0d9a7306 -->

```ts
export function computeDiff(
  oldText: string,
  newText: string,
  context = 3,
): string {
  const a = oldText.split('\n');
  const b = newText.split('\n');

  // Cheap early exit
  if (a.join('\n') === b.join('\n')) return '';

  const edits = buildEditScript(a, b);

  if (edits.every(([op]) => op === '=')) return '';

  return renderHunks(edits, context);
}
```

## Notes

> _Add documentation notes here._
