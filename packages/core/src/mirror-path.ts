// @syndocs
import path from 'path';

/**
 * Given a source file path (relative to the repo root),
 * return the corresponding mirror doc path under `docsRoot`.
 *
 * Examples (docsRoot = "docs"):
 *   "src/auth/Login.php"     → "docs/src/auth/Login.php.md"
 *   "./src/utils/helpers.ts" → "docs/src/utils/helpers.ts.md"
 */
// @syndocs: get-mirror-path
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
// @syndocs: get-source-from-mirror
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
// @syndocs: is-under-docs-root
export function isUnderDocsRoot(filePath: string, docsRoot = '.syndocs/docs'): boolean {
  const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const docsPrefix = docsRoot.replace(/\\/g, '/').replace(/\/?$/, '/');
  return (
    norm.startsWith(docsPrefix) ||
    norm === docsRoot ||
    norm.startsWith('.syndocs/') ||
    norm === '.syndocs' ||
    norm.startsWith('syndocs/') ||
    norm === 'syndocs'
  );
}

/**
 * Given a source file path and a micro-doc label,
 * return the corresponding micro-doc path under `microdocsRoot`.
 *
 * Example:
 *   getMicroDocPath("packages/core/src/anchor-parser.ts", "parse-anchors", ".syndocs/microdocs")
 *   → ".syndocs/microdocs/packages/core/src/anchor-parser.ts/parse-anchors.md"
 */
export function getMicroDocPath(
  sourceFile: string,
  label: string,
  microdocsRoot = '.syndocs/microdocs',
): string {
  const norm = sourceFile.replace(/\\/g, '/').replace(/^\.\//, '');
  const cleanLabel = label.replace(/[\\/]/g, '_');
  return path.posix.join(microdocsRoot, norm, cleanLabel + '.md');
}

/**
 * Given a micro-doc file path, recover the original source file and label.
 */
export function getSourceFromMicroDoc(
  microDocPath: string,
  microdocsRoot = '.syndocs/microdocs',
): { sourceRel: string; label: string } {
  const norm = microDocPath.replace(/\\/g, '/');
  const prefix = microdocsRoot.replace(/\\/g, '/').replace(/\/?$/, '/');
  if (!norm.startsWith(prefix)) {
    throw new Error(`"${microDocPath}" is not under "${microdocsRoot}/"`);
  }
  const rel = norm.slice(prefix.length);
  if (!rel.endsWith('.md')) {
    throw new Error(`"${microDocPath}" does not end in .md`);
  }
  const withoutExt = rel.slice(0, -3);
  const lastSlash = withoutExt.lastIndexOf('/');
  if (lastSlash === -1) {
    throw new Error(`"${microDocPath}" has invalid micro-doc path structure`);
  }
  const sourceRel = withoutExt.slice(0, lastSlash);
  const label = withoutExt.slice(lastSlash + 1);
  return { sourceRel, label };
}
