# differ.ts
<!-- syndocs-hash: f4798b69562f -->

```ts
// @syndocs
type Op = '+' | '-' | '=';
type Edit = [Op, string];

/**
 * Build a minimal edit script via LCS.
 * O(m*n) in both time and space — fine for code files, not for multi-MB blobs.
 */
// @syndocs: lcs-edit-script
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
// @syndocs: render-hunks
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
// @syndocs: compute-diff
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
