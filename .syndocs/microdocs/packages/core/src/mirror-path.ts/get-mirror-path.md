# @syndocs: get-mirror-path
> Source: `packages/core/src/mirror-path.ts`
<!-- syndocs-hash: 031295108169 -->

```ts
export function getMirrorPath(
  sourceFile: string,
  docsRoot = 'docs',
): string {
  // Normalise slashes and strip leading ./
  const norm = sourceFile.replace(/\\/g, '/').replace(/^\.\//, '');
  return path.posix.join(docsRoot, norm + '.md');
}

/**
 * Reverse: given a mirror doc path, recover the original source file path.
 * Throws if the path doesn't look like a valid mirror doc.
 */
```

## Notes

> _Add documentation notes here._
