# @syndocs: compute-hash
> Source: `packages/core/src/hash.ts`
<!-- syndocs-hash: 499c9e05f803 -->

```ts
export function computeHash(content: string): string {
  const norm = normalise(content);
  return createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 12);
}
```

## Notes

> _Add documentation notes here._
