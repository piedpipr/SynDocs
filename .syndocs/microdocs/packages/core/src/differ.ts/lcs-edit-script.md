# @syndocs: lcs-edit-script
> Source: `packages/core/src/differ.ts`
<!-- syndocs-hash: 09a0e19f345a -->

```ts
function buildEditScript(a: string[], b: string[]): Edit[] {
  const m = a.length;
  const n = b.length;

  // Guard against unreasonably large files
  if (m * n > 4_000_000) {
    return [
      ['-', `(old: ${m} lines)`],
      ['+', `(new: ${n} lines — file too large for inline diff)`],
    ];
  }

  // DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build edits
  const edits: Edit[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.unshift(['=', a[i - 1]]);
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift(['+', b[j - 1]]);
      j--;
    } else {
      edits.unshift(['-', a[i - 1]]);
      i--;
    }
  }

  return edits;
}

/**
 * Render a diff string from an edit script, with `context` unchanged lines
 * around each changed region. Unchanged gaps larger than 2*context are
 * replaced with a `...` separator.
 */
```

## Notes

> _Add documentation notes here._
