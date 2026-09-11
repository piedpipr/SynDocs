// @syndocs
/**
 * Slug generation utilities for auto-scoped micro-doc labels.
 *
 * Converts code element names to clean, deterministic kebab-case slugs
 * and handles collision-free unique slug generation.
 */

/**
 * Convert a code identifier to a kebab-case slug.
 *
 * Examples:
 *   parseAnchors       → parse-anchors
 *   CodeGraphAdapter   → code-graph-adapter
 *   API_KEY            → api-key
 *   getUserById        → get-user-by-id
 *   __private_method   → private-method
 *   HTMLParser         → html-parser
 */
export function toKebabSlug(name: string): string {
  return name
    // Insert hyphen before uppercase runs followed by lowercase: "HTMLParser" → "HTML-Parser"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    // Insert hyphen between lowercase/digit and uppercase: "getUserById" → "get-User-By-Id"
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    // Replace underscores, spaces, dots with hyphens
    .replace(/[_.\s]+/g, '-')
    // Lowercase everything
    .toLowerCase()
    // Strip leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Collapse multiple hyphens
    .replace(/-{2,}/g, '-');
}

/**
 * Generate a unique slug by appending a numeric suffix if the base slug
 * already exists in the given set.
 *
 * Returns:
 *   "parse-anchors"   if not in set
 *   "parse-anchors-2" if "parse-anchors" already exists
 *   "parse-anchors-3" if both exist, etc.
 */
export function generateUniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
