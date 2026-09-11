# @syndocs: render-hunks
> Source: `packages/core/src/differ.ts`
<!-- syndocs-hash: 883479e8643e -->

```ts
function renderHunks(edits: Edit[], context: number): string {
  const n = edits.length;

  // Mark lines that should be shown (near a change)
  const show = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (edits[i][0] !== '=') {
      for (let j = Math.max(0, i - context); j <= Math.min(n - 1, i + context); j++) {
        show[j] = true;
      }
    }
  }

  const out: string[] = [];
  let prevShown = false;

  for (let i = 0; i < n; i++) {
    const [op, line] = edits[i];
    if (!show[i]) {
      if (prevShown) out.push('...');
      prevShown = false;
      continue;
    }
    if (op === '+') out.push(`+${line}`);
    else if (op === '-') out.push(`-${line}`);
    else out.push(` ${line}`);
    prevShown = true;
  }

  return out.join('\n');
}

/**
 * Produce a human-readable unified-style diff between `oldText` and `newText`.
 * Returns an empty string when the two texts are identical (after splitting on \n).
 *
 * @param context  Number of unchanged lines to show around each changed region (default 3).
 */
```

## Notes

> _Add documentation notes here._
