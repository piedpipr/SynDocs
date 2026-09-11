# adapter.ts
<!-- syndocs-hash: 6d3c3fdd48ce -->

```ts
// @syndocs
/**
 * CodeGraph adapter for SynDocs.
 *
 * Reads directly from .codegraph/codegraph.db using node:sqlite — no CodeGraph
 * npm dependency needed, no subprocess spawning, no version coupling.
 *
 * Degrades gracefully: if the DB doesn't exist (codegraph init hasn't been run)
 * every method returns empty results and open() returns null.
 *
 * Requires Node >= 22.5 for the built-in node:sqlite module.
 */

import fs from 'fs';
import path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GraphEdge {
  /** Edge kind as stored in CodeGraph: 'calls' | 'imports' | 'extends' | 'implements' | 'references' */
  kind: string;
  /** 0-based source line of this edge in the source file */
  sourceLine: number;
  /** Repo-root-relative path of the source file */
  sourceFile?: string;
  /** Name of the source symbol (function, class, …) */
  sourceSymbol: string;
  /** Repo-root-relative path of the target file */
  targetFile: string;
  /** Name of the target symbol, if known */
  targetSymbol: string | null;
}

export interface CodeTokenEdge {
  line: number;
  col: number;
  name: string;
  kind: string;
  targetFile: string;
  targetSymbol: string | null;
}

export interface NodeBoundary {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class CodeGraphAdapter {
  /** Opens a project's CodeGraph index. Returns null if not initialised. */
  static open(projectRoot: string): CodeGraphAdapter | null {
    const dbPath = path.join(projectRoot, '.codegraph', 'codegraph.db');
    if (!fs.existsSync(dbPath)) return null;
    try {
      // Dynamic require so the import of node:sqlite only happens at call time,
      // letting the caller catch the error cleanly on Node < 22.5.
      const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
      const db = new DatabaseSync(dbPath, { open: true });
      return new CodeGraphAdapter(db, projectRoot);
    } catch {
      return null;
    }
  }

  private constructor(
    private readonly db: import('node:sqlite').DatabaseSync,
    private readonly projectRoot: string,
  ) {}

  /**
   * All outbound structural edges from a source file.
   * Edges where the target lives in the same file are excluded — we only
   * want cross-file connections for the wiki-link table.
   */
  getEdgesForFile(absOrRelPath: string): GraphEdge[] {
    const rel = this._toRel(absOrRelPath);
    try {
      const stmt = this.db.prepare(`
        SELECT
          e.kind,
          COALESCE(e.line, 0)   AS source_line,
          sn.name               AS source_symbol,
          tn.file_path          AS target_file,
          tn.name               AS target_symbol
        FROM edges e
        JOIN nodes sn ON e.source = sn.id
        JOIN nodes tn ON e.target = tn.id
        WHERE sn.file_path = ?
          AND tn.file_path != ?
          AND e.kind IN ('calls','imports','extends','implements','references')
        ORDER BY e.line NULLS LAST, sn.name
      `);
      return (stmt.all(rel, rel) as any[]).map(r => ({
        kind:         r.kind,
        sourceLine:   Number(r.source_line),
        sourceSymbol: String(r.source_symbol),
        targetFile:   String(r.target_file),
        targetSymbol: r.target_symbol != null ? String(r.target_symbol) : null,
      }));
    } catch {
      return [];
    }
  }

  /**
   * All structural cross-file edges across the entire repository.
   */
  getAllEdges(): GraphEdge[] {
    try {
      const stmt = this.db.prepare(`
        SELECT
          e.kind,
          COALESCE(e.line, 0) AS source_line,
          sn.file_path        AS source_file,
          sn.name             AS source_symbol,
          tn.file_path        AS target_file,
          tn.name             AS target_symbol
        FROM edges e
        JOIN nodes sn ON e.source = sn.id
        JOIN nodes tn ON e.target = tn.id
        WHERE sn.file_path != tn.file_path
          AND e.kind IN ('calls','imports','extends','implements','references')
        ORDER BY sn.file_path, e.line
      `);
      return (stmt.all() as any[]).map(r => ({
        kind:         String(r.kind),
        sourceLine:   Number(r.source_line),
        sourceFile:   String(r.source_file),
        sourceSymbol: String(r.source_symbol),
        targetFile:   String(r.target_file),
        targetSymbol: r.target_symbol != null ? String(r.target_symbol) : null,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Precise AST outbound references for symbols/keywords in a specific source file.
   * Drives in-code token anchors and link thread lines.
   */
  getFileTokens(absOrRelPath: string): CodeTokenEdge[] {
    const rel = this._toRel(absOrRelPath);
    try {
      const stmt = this.db.prepare(`
        SELECT
          COALESCE(e.line, 0) AS line,
          COALESCE(e.col, 0)  AS col,
          tn.name             AS name,
          e.kind              AS kind,
          tn.file_path        AS target_file,
          tn.name             AS target_symbol
        FROM edges e
        JOIN nodes sn ON e.source = sn.id
        JOIN nodes tn ON e.target = tn.id
        WHERE sn.file_path = ?
          AND tn.file_path != ?
          AND e.kind IN ('calls', 'imports', 'extends', 'implements', 'references')
          AND e.line IS NOT NULL
        ORDER BY e.line ASC, e.col ASC
      `);
      return (stmt.all(rel, rel) as any[]).map(r => ({
        line:         Number(r.line),
        col:          Number(r.col),
        name:         String(r.name),
        kind:         String(r.kind),
        targetFile:   String(r.target_file),
        targetSymbol: r.target_symbol != null ? String(r.target_symbol) : null,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Find the tightest AST node that contains the given line.
   * Used to resolve @syndocs: label markers to exact function/method boundaries.
   */
  getNodeBoundary(absOrRelPath: string, nearLine: number): NodeBoundary | null {
    const rel = this._toRel(absOrRelPath);
    try {
      const stmt = this.db.prepare(`
        SELECT name, kind, start_line, end_line
        FROM nodes
        WHERE file_path = ?
          AND start_line <= ?
          AND end_line   >= ?
          AND kind IN ('function','method','class','struct','property','field','constant','variable','enum')
        ORDER BY (end_line - start_line) ASC
        LIMIT 1
      `);
      const row = stmt.get(rel, nearLine, nearLine) as any;
      if (!row) return null;
      return {
        name:      String(row.name),
        kind:      String(row.kind),
        startLine: Number(row.start_line),
        endLine:   Number(row.end_line),
      };
    } catch {
      return null;
    }
  }

  /**
   * Find the exact AST declaration immediately starting at or below fromLine.
   */
  getNextNode(absOrRelPath: string, fromLine: number): NodeBoundary | null {
    const rel = this._toRel(absOrRelPath);
    try {
      const stmt = this.db.prepare(`
        SELECT name, kind, start_line, end_line
        FROM nodes
        WHERE file_path = ?
          AND start_line >= ?
          AND kind IN ('function','method','class','struct','property','field','constant','variable','enum')
        ORDER BY start_line ASC
        LIMIT 1
      `);
      const row = stmt.get(rel, fromLine) as any;
      if (!row) return null;
      return {
        name:      String(row.name),
        kind:      String(row.kind),
        startLine: Number(row.start_line),
        endLine:   Number(row.end_line),
      };
    } catch {
      return null;
    }
  }

  /**
   * Find the parent function or class enclosing the given line.
   */
  getEnclosingScope(absOrRelPath: string, line: number): NodeBoundary | null {
    const rel = this._toRel(absOrRelPath);
    try {
      const stmt = this.db.prepare(`
        SELECT name, kind, start_line, end_line
        FROM nodes
        WHERE file_path = ?
          AND start_line <= ?
          AND end_line >= ?
          AND kind IN ('function','method','class')
        ORDER BY (end_line - start_line) ASC
        LIMIT 1
      `);
      const row = stmt.get(rel, line, line) as any;
      if (!row) return null;
      return {
        name:      String(row.name),
        kind:      String(row.kind),
        startLine: Number(row.start_line),
        endLine:   Number(row.end_line),
      };
    } catch {
      return null;
    }
  }

  /**
   * Outbound cross-file edges that originate strictly within [startLine, endLine).
   */
  getScopedEdges(absOrRelPath: string, startLine: number, endLine: number): GraphEdge[] {
    const rel = this._toRel(absOrRelPath);
    try {
      const stmt = this.db.prepare(`
        SELECT
          e.kind,
          COALESCE(e.line, 0)   AS source_line,
          sn.name               AS source_symbol,
          tn.file_path          AS target_file,
          tn.name               AS target_symbol
        FROM edges e
        JOIN nodes sn ON e.source = sn.id
        JOIN nodes tn ON e.target = tn.id
        WHERE sn.file_path = ?
          AND tn.file_path != ?
          AND e.kind IN ('calls','imports','extends','implements','references')
          AND e.line >= ?
          AND e.line < ?
        ORDER BY e.line ASC, sn.name
      `);
      return (stmt.all(rel, rel, startLine, endLine) as any[]).map(r => ({
        kind:         r.kind,
        sourceLine:   Number(r.source_line),
        sourceSymbol: String(r.source_symbol),
        targetFile:   String(r.target_file),
        targetSymbol: r.target_symbol != null ? String(r.target_symbol) : null,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Files that import or call into the given file.
   * Used by `syndocs check` to warn about downstream documented files
   * when a source file is found stale.
   */
  getImpactRadius(absOrRelPath: string): string[] {
    const rel = this._toRel(absOrRelPath);
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT sn.file_path
        FROM edges e
        JOIN nodes sn ON e.source = sn.id
        JOIN nodes tn ON e.target = tn.id
        WHERE tn.file_path = ?
          AND e.kind IN ('calls','imports','extends','implements')
      `);
      return (stmt.all(rel) as any[]).map(r => String(r.file_path));
    } catch {
      return [];
    }
  }

  /** True if the CodeGraph index exists and the nodes table is non-empty. */
  isReady(): boolean {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) AS n FROM nodes');
      const row = stmt.get() as any;
      return Number(row.n) > 0;
    } catch {
      return false;
    }
  }

  close(): void {
    try { this.db.close(); } catch { /* ignore */ }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _toRel(p: string): string {
    if (path.isAbsolute(p)) {
      return path.relative(this.projectRoot, p).split(path.sep).join('/');
    }
    return p.replace(/\\/g, '/');
  }
}
```

## Notes

> _Add documentation notes here._
