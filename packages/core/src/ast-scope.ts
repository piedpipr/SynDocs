// @syndocs
/**
 * Tree-sitter based scope resolution.
 *
 * Replaces the old regex/brace-counting fallback in anchor-parser.ts
 * (DECLARATION_PATTERNS + findBlockEnd + detectElement) for every language
 * that has a bundled grammar. Two concrete, reproduced bugs motivated this:
 *
 *   1. `findBlockEnd`'s brace counter counted `{`/`}` characters in raw
 *      text, so a string/comment/template literal containing an unbalanced
 *      brace character (e.g. `"curly: }"`) desynced the counter and caused
 *      a micro-doc to swallow the NEXT unrelated function too.
 *   2. Explicit `@synd: label` annotations never called scope resolution
 *      at all (only bare `@synd` did), so a label sitting inside a
 *      multi-line JSDoc block above a multi-line function signature
 *      produced a corrupted snippet starting mid-comment.
 *
 * A real parser can't have either failure mode: strings/comments/template
 * literals are tokenized as atomic units before any structural matching
 * happens, and scope resolution is "find the next declaration sibling
 * after this exact comment NODE" rather than "scan raw lines below this
 * line number for a declaration-shaped regex match".
 *
 * CodeGraph (@syndocs/graph) is NOT used for this anymore — see its
 * package README / the top-level README: CodeGraph's job is the
 * dependency graph (blast-radius, wiki-links, in-code token highlighting
 * in the Web Studio), which this module has no overlap with and doesn't
 * touch. Scope resolution is now tree-sitter-only, with the old regex
 * scanner kept solely as a last-resort for languages with no bundled
 * grammar below (see FALLBACK-ELIGIBLE note in anchor-parser.ts).
 *
 * Async/sync boundary: exactly like tokenizer.ts's `initTokenizer`, wasm
 * loading is unavoidably async, but `parseAnchors` is called synchronously
 * throughout the CLI. `initAstEngine()` must be awaited once at startup;
 * `resolveScopeViaAst` is synchronous after that.
 */

import path from 'path';
import { fileURLToPath } from 'url';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AstScopeResult {
  name: string;
  kind: string;
  /** 0-based, inclusive */
  startLine: number;
  /** 0-based, exclusive */
  endLine: number;
}

// ─── Language → grammar file + declaration node-type table ────────────────
//
// `wasmFile` must exist under tree-sitter-wasms' `out/` directory.
// `declTypes` maps a tree-sitter node `type` to the human-facing "kind"
// string doc-writer.ts renders in the `> 🔍 kind · name · lines` breadcrumb
// (kept consistent with the kind vocabulary the old DECLARATION_PATTERNS
// table used, so existing rendered docs don't change shape).
// `nameField` is the field name to read the declared identifier from; falls
// back to the first `identifier`-ish named child if the field is absent.

interface GrammarSpec {
  wasmFile: string;
  declTypes: Record<string, string>;
}

const GRAMMARS: Record<string, GrammarSpec> = {
  javascript: {
    wasmFile: 'tree-sitter-javascript.wasm',
    declTypes: {
      function_declaration: 'function',
      class_declaration: 'class',
      method_definition: 'method',
      variable_declarator: 'variable',
      lexical_declaration: 'variable',
    },
  },
  typescript: {
    wasmFile: 'tree-sitter-typescript.wasm',
    declTypes: {
      function_declaration: 'function',
      class_declaration: 'class',
      interface_declaration: 'interface',
      type_alias_declaration: 'type',
      enum_declaration: 'enum',
      method_definition: 'method',
      variable_declarator: 'variable',
      lexical_declaration: 'variable',
      public_field_definition: 'field',
    },
  },
  tsx: {
    wasmFile: 'tree-sitter-tsx.wasm',
    declTypes: {
      function_declaration: 'function',
      class_declaration: 'class',
      interface_declaration: 'interface',
      type_alias_declaration: 'type',
      enum_declaration: 'enum',
      method_definition: 'method',
      variable_declarator: 'variable',
      lexical_declaration: 'variable',
      public_field_definition: 'field',
    },
  },
  python: {
    wasmFile: 'tree-sitter-python.wasm',
    declTypes: {
      function_definition: 'function',
      class_definition: 'class',
    },
  },
  go: {
    wasmFile: 'tree-sitter-go.wasm',
    declTypes: {
      function_declaration: 'function',
      method_declaration: 'method',
      type_spec: 'struct',
      const_spec: 'variable',
      var_spec: 'variable',
    },
  },
  rust: {
    wasmFile: 'tree-sitter-rust.wasm',
    declTypes: {
      function_item: 'function',
      struct_item: 'struct',
      trait_item: 'trait',
      impl_item: 'impl',
      enum_item: 'enum',
      const_item: 'variable',
    },
  },
  java: {
    wasmFile: 'tree-sitter-java.wasm',
    declTypes: {
      method_declaration: 'method',
      class_declaration: 'class',
      interface_declaration: 'interface',
      field_declaration: 'field',
      enum_declaration: 'enum',
    },
  },
  c: {
    wasmFile: 'tree-sitter-c.wasm',
    declTypes: {
      function_definition: 'function',
      struct_specifier: 'struct',
      declaration: 'variable',
    },
  },
  cpp: {
    wasmFile: 'tree-sitter-cpp.wasm',
    declTypes: {
      function_definition: 'function',
      class_specifier: 'class',
      struct_specifier: 'struct',
      declaration: 'variable',
    },
  },
  c_sharp: {
    wasmFile: 'tree-sitter-c_sharp.wasm',
    declTypes: {
      method_declaration: 'method',
      class_declaration: 'class',
      struct_declaration: 'struct',
      interface_declaration: 'interface',
      field_declaration: 'field',
      property_declaration: 'field',
    },
  },
  php: {
    wasmFile: 'tree-sitter-php.wasm',
    declTypes: {
      function_definition: 'function',
      method_declaration: 'method',
      class_declaration: 'class',
      // `return new class extends Migration { ... }` — Laravel migrations and
      // other PHP files using anonymous classes use this node type. Without it,
      // upward AST walks from inside the anonymous class body (e.g. a
      // $table->string() call) skip the anonymous class entirely and settle on
      // the outer method_declaration, collapsing every inline @synd inside the
      // Schema::create closure into the enclosing up()/down() function scope.
      anonymous_class_declaration: 'class',
      property_declaration: 'field',
    },
  },
  ruby: {
    wasmFile: 'tree-sitter-ruby.wasm',
    declTypes: {
      method: 'method',
      class: 'class',
      module: 'module',
    },
  },
  swift: {
    wasmFile: 'tree-sitter-swift.wasm',
    declTypes: {
      function_declaration: 'function',
      class_declaration: 'class',
      property_declaration: 'variable',
    },
  },
  kotlin: {
    wasmFile: 'tree-sitter-kotlin.wasm',
    declTypes: {
      function_declaration: 'function',
      class_declaration: 'class',
      property_declaration: 'variable',
    },
  },
};

/** Shiki grammar id (from languages.ts) → tree-sitter grammar id above. */
const SHIKI_TO_TS_GRAMMAR: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  jsx: 'javascript',
  tsx: 'tsx',
  python: 'python',
  go: 'go',
  rust: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'c_sharp',
  php: 'php',
  ruby: 'ruby',
  swift: 'swift',
  kotlin: 'kotlin',
};

/** True if `grammarId` (a shiki id from LanguageConfig) has tree-sitter support. */
export function hasAstSupport(grammarId: string): boolean {
  return grammarId in SHIKI_TO_TS_GRAMMAR;
}

// ─── Parser singletons ──────────────────────────────────────────────────────

let parserCtor: typeof import('web-tree-sitter').Parser | null = null;
let LanguageCtor: typeof import('web-tree-sitter').Language | null = null;
const loadedLanguages = new Map<string, InstanceType<typeof import('web-tree-sitter').Language>>();
const parsersByGrammar = new Map<string, InstanceType<typeof import('web-tree-sitter').Parser>>();

function resolveWasmDir(): string {
  // tree-sitter-wasms ships its .wasm files under out/ relative to its own
  // package root — resolve via the package's own package.json so this
  // works regardless of how deeply nested node_modules ends up (npm
  // workspaces, pnpm, etc.) rather than assuming a fixed relative path.
  const pkgJsonPath = require.resolve('tree-sitter-wasms/package.json');
  return path.join(path.dirname(pkgJsonPath), 'out');
}

/**
 * Must be called (and awaited) once before any synchronous call to
 * `resolveScopeViaAst`. Idempotent — safe to call multiple times; only
 * loads grammars not already loaded. Mirrors tokenizer.ts's
 * `initTokenizer` contract exactly.
 *
 * `grammarIds` are shiki grammar ids (as stored in LanguageConfig) — pass
 * the ones you're about to touch to keep startup fast; omit to load every
 * language this module supports.
 */
export async function initAstEngine(grammarIds?: string[]): Promise<void> {
  const { Parser, Language } = await import('web-tree-sitter');
  if (!parserCtor) {
    await Parser.init();
    parserCtor = Parser;
    LanguageCtor = Language;
  }

  const wanted = grammarIds
    ? [...new Set(grammarIds.map(id => SHIKI_TO_TS_GRAMMAR[id]).filter((x): x is string => !!x))]
    : Object.keys(GRAMMARS);

  const wasmDir = resolveWasmDir();

  for (const tsGrammarId of wanted) {
    if (loadedLanguages.has(tsGrammarId)) continue;
    const spec = GRAMMARS[tsGrammarId];
    if (!spec) continue;
    const wasmPath = path.join(wasmDir, spec.wasmFile);
    const lang = await LanguageCtor!.load(wasmPath);
    loadedLanguages.set(tsGrammarId, lang);

    const parser = new parserCtor!();
    parser.setLanguage(lang);
    parsersByGrammar.set(tsGrammarId, parser);
  }
}

/** True once `initAstEngine` has completed at least once. */
export function isAstEngineReady(): boolean {
  return parserCtor !== null;
}

// ─── Scope resolution ───────────────────────────────────────────────────────

/**
 * Resolve scope boundaries using a real syntax tree.
 *
 * `lineIndex` semantics match anchor-parser.ts's existing contract:
 *  - inline=true:  the comment and the code are on the SAME line
 *                   (`lineIndex` is that line) — resolve the tightest
 *                   enclosing declaration.
 *  - inline=false: `lineIndex` is the last line of the comment block —
 *                   resolve the NEXT declaration after the comment.
 *
 * Returns null if the grammar for this file isn't loaded/supported, or if
 * no declaration node can be found (caller falls back to the regex tier).
 */
export function resolveScopeViaAst(
  content: string,
  shikiGrammarId: string,
  lineIndex: number,
  inline: boolean,
): AstScopeResult | null {
  const tsGrammarId = SHIKI_TO_TS_GRAMMAR[shikiGrammarId];
  if (!tsGrammarId) return null;

  const parser = parsersByGrammar.get(tsGrammarId);
  if (!parser) return null;

  const spec = GRAMMARS[tsGrammarId]!;
  const tree = parser.parse(content);
  if (!tree) return null;

  try {
    if (inline) {
      // Find the tightest named node whose span contains this line, then
      // walk upward until we hit a node type in this language's decl table.
      //
      // Using column 0 here is WRONG: tree-sitter's descendantForPosition
      // resolves the tightest node containing that exact byte offset, and
      // column 0 of an indented line often falls in the gap between a
      // parent's own token (e.g. class_body's opening `{`) and its first
      // named child, landing one level too high (verified: this produced
      // "class" instead of "method" for `  public void foo() { // @synd`).
      // Using the END of the line instead reliably lands inside the
      // innermost node whose content actually occupies that line — the
      // annotation is a trailing comment, so this is also semantically
      // more correct: we want the node the comment is trailing *inside of*.
      const line = content.split('\n')[lineIndex] ?? '';
      const point = { row: lineIndex, column: line.length };
      let node = tree.rootNode.descendantForPosition(point);
      while (node) {
        const kind = spec.declTypes[node.type];
        if (kind) return toScopeResult(node, kind);
        node = node.parent;
      }
      return null;
    }

    // Above-annotation: find the comment node ending at lineIndex, then
    // take the next named sibling that is (or contains) a declaration.
    const commentNode = findCommentEndingAt(tree.rootNode, lineIndex);
    if (!commentNode) return null;

    let sibling = commentNode.nextNamedSibling;
    while (sibling && sibling.type === 'comment') sibling = sibling.nextNamedSibling;
    if (!sibling) return null;

    // The sibling might be a wrapper (e.g. TS `export_statement` wrapping a
    // `function_declaration`, or a `lexical_declaration` wrapping a
    // `variable_declarator`) — drill down to find the actual decl type.
    let node: typeof sibling | null = sibling;
    while (node) {
      const kind = spec.declTypes[node.type];
      if (kind) return toScopeResult(node, kind);
      // Only drill into the first named child — export wrappers and
      // single-declarator statements both have exactly one meaningful
      // child; multi-declarator statements (`let a = 1, b = 2`) are rare
      // enough with @synd annotations that first-child is an acceptable
      // resolution, matching the old fallback's own single-name behavior.
      node = node.namedChildren.length > 0 ? node.namedChildren[0]! : null;
    }
    return null;
  } catch {
    // Any tree-sitter internal error → let the caller fall back to regex
    // rather than propagate and abort the whole file's parse.
    return null;
  }
}

function toScopeResult(node: { text: string; type: string; startPosition: { row: number }; endPosition: { row: number }; childForFieldName?: (f: string) => any }, kind: string): AstScopeResult {
  const nameNode = node.childForFieldName?.('name') ?? findNameChild(node as any);
  const name = nameNode?.text ?? node.type;
  return {
    name,
    kind,
    startLine: node.startPosition.row,
    // Exclusive end, matching the old ScopeResult contract used throughout
    // anchor-parser.ts / extractMicroDocCode.
    endLine: node.endPosition.row + 1,
  };
}

function findNameChild(node: any): { text: string } | null {
  for (const child of node.namedChildren ?? []) {
    if (child.type === 'identifier' || child.type.endsWith('_identifier') || child.type === 'name' || child.type === 'constant') {
      return child;
    }
  }
  return null;
}

/** Find a `comment` node whose endPosition.row === targetLine, anywhere in the tree. */
function findCommentEndingAt(node: any, targetLine: number): any | null {
  if (node.type === 'comment' && node.endPosition.row === targetLine) return node;
  if (node.startPosition.row > targetLine) return null; // prune: subtree starts after target
  if (node.endPosition.row < targetLine) return null;   // prune: subtree ends before target
  for (const child of node.namedChildren ?? []) {
    const found = findCommentEndingAt(child, targetLine);
    if (found) return found;
  }
  return null;
}
