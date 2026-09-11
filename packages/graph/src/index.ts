export type { GraphEdge, NodeBoundary } from './adapter';
export { CodeGraphAdapter } from './adapter';

/**
 * Convenience: open the adapter for a project, returning null if the
 * CodeGraph index doesn't exist yet. Import this in CLI commands that
 * need graph features so they degrade gracefully.
 *
 * Dynamic-import friendly — wrap the caller in try/catch to handle
 * Node < 22.5 environments where node:sqlite is unavailable.
 */
export function openAdapter(projectRoot: string) {
  const { CodeGraphAdapter } = require('./adapter');
  return CodeGraphAdapter.open(projectRoot) as import('./adapter').CodeGraphAdapter | null;
}
