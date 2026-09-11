// @syndocs
import path from 'path';

/**
 * Given a source file path (relative to the repo root),
 * return the corresponding mirror doc path under `docsRoot`.
 *
 * Examples (docsRoot = ".syndocs/docs"):
 *   "src/auth/Login.php"     → ".syndocs/docs/src/auth/Login.php.md"
 *   "./src/utils/helpers.ts" → ".syndocs/docs/src/utils/helpers.ts.md"
 */
// @synd: get-mirror-path
export function getMirrorPath(
  sourceFile: string,
  docsRoot = '.syndocs/docs',
): string {
  // Normalise slashes and strip leading ./
  const norm = sourceFile.replace(/\\/g, '/').replace(/^\.\//, '');
  return path.posix.join(docsRoot, norm + '.md');
}

/**
 * Reverse: given a mirror doc path, recover the original source file path.
 * Throws if the path doesn't look like a valid mirror doc.
 */
// @synd: get-source-from-mirror
export function getSourceFromMirror(
  mirrorFile: string,
  docsRoot = '.syndocs/docs',
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
// @synd: is-under-docs-root
export function isUnderDocsRoot(filePath: string, docsRoot = '.syndocs/docs'): boolean {
  const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const docsPrefix = docsRoot.replace(/\\/g, '/').replace(/\/?$/, '/');
  return (
    norm.startsWith(docsPrefix) ||
    norm === docsRoot ||
    norm.startsWith('.syndocs/') ||
    norm === '.syndocs'
  );
}
