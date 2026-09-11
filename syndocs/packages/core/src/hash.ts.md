# hash.ts
<!-- syndocs-hash: 9e09b3aa564a -->

```ts
// @syndocs
import { createHash } from 'crypto';

/**
 * Normalise content before hashing so that:
 *  - Windows CRLF and bare CR are treated identically to LF
 *  - Trailing whitespace on each line is stripped (avoids editor-reformatting noise)
 *  - A single trailing newline is guaranteed
 *
 * This is the ONLY normalisation step — deliberately not stripping blank lines
 * or indentation, so real structural changes still trigger a hash change.
 */
export function normalise(content: string): string {
  const lf = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = lf.split('\n').map(l => l.trimEnd()).join('\n');
  // Ensure exactly one trailing newline so an editor auto-adding one is not a hit
  return trimmed.replace(/\n*$/, '\n');
}

/**
 * Compute a short (12-char) SHA-256 hex fingerprint of the normalised content.
 * "Short" is fine for drift detection — collisions are astronomically unlikely
 * at 48-bit precision for files of this size.
 */
// @syndocs: compute-hash
export function computeHash(content: string): string {
  const norm = normalise(content);
  return createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 12);
}
```

## Notes

> _Add documentation notes here._
