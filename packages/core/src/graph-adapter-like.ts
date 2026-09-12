// @syndocs
/**
 * Structural subset of `@syndocs/graph`'s `CodeGraphAdapter` that
 * `anchor-parser.ts` needs for AST-preferred scope resolution.
 *
 * `@syndocs/core` intentionally does NOT depend on `@syndocs/graph` as a
 * package — `graph` is an optional, Node-22.5+-only integration that the CLI
 * wires in (see `@syndocs/cli`'s `loadGraphAdapter`), and `core` must keep
 * working standalone without it. Declaring this narrow structural interface
 * here — rather than importing `CodeGraphAdapter` — lets callers pass the
 * real adapter in (it satisfies this shape automatically; TypeScript
 * structural typing needs no explicit implements/import on either side)
 * while keeping `core`'s dependency graph one-directional and graph-free.
 */
export interface NodeBoundaryLike {
  name: string;
  kind: string;
  /** 1-based, inclusive — matches CodeGraph's own schema/convention. */
  startLine: number;
  /** 1-based, inclusive. */
  endLine: number;
}

export interface GraphAdapterLike {
  isReady(): boolean;
  getNodeBoundary(filePath: string, nearLine: number): NodeBoundaryLike | null;
  getNextNode(filePath: string, fromLine: number): NodeBoundaryLike | null;
  getEnclosingScope(filePath: string, line: number): NodeBoundaryLike | null;
}
