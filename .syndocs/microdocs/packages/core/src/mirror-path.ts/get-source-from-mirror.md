# @syndocs: get-source-from-mirror
> Source: `packages/core/src/mirror-path.ts`
<!-- syndocs-hash: 0db42c7a564c -->

```ts
export function getSourceFromMirror(
  mirrorFile: string,
  docsRoot = 'docs',
): string {
  const norm = mirrorFile.replace(/\\/g, '/');
  const prefix = docsRoot.replace(/\\/g, '/').replace(/\/?$/, '/');
  if (!norm.startsWith(prefix)) {
    throw new Error(`"${mirrorFile}" is not under "${docsRoot}/"`);
  }
  const rel = norm.slice(prefix.length);
  if (!rel.endsWith('.md')) {
    throw new Error(`"${mirrorFile}" does not end in .md`);
  }
  return rel.slice(0, -3); // strip trailing .md
}

/**
 * Return true if the given file path lives under the docs root or hidden .syndocs
 * (so we don't try to document the docs themselves).
 */
```

## Notes

> _Add documentation notes here._
