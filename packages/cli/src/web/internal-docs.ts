/**
 * Built-in internal documentation guides served directly by `syndocs serve`.
 * These provide complete, rich documentation inside the Web Studio even in fresh
 * or uninitialized repositories.
 */

export interface InternalGuide {
  id: string;        // e.g. "guides/internal/quickstart.md"
  title: string;     // e.g. "⚡ Quickstart & Core Workflow"
  content: string;   // Markdown content
}

export const INTERNAL_GUIDES: InternalGuide[] = [
  {
    id: 'guides/internal/quickstart.md',
    title: '⚡ Quickstart & Core Workflow',
    content: `# ⚡ SynDocs Quickstart & Core Workflow

Welcome to **SynDocs** — code-synced documentation with a connected knowledge graph.

---

## The 5-Step Documentation Workflow

### 1. Annotate Your Code
Add a documentation marker to any source file:
\`\`\`ts
// \x40synd
export class AuthService { ... }
\`\`\`
Or annotate a specific function, class, or variable:
\`\`\`ts
// \x40synd: password-hashing
export function hashPassword(pwd: string): string { ... }
\`\`\`
Or use trailing inline annotations:
\`\`\`ts
const JWT_SECRET = process.env.JWT_SECRET; // \x40synd
\`\`\`

---

### 2. Initialize Documentation
Run the one-time repository initializer:
\`\`\`bash
syndocs init
\`\`\`
- Prompts for your Web UI edit access code (saved in \`.syndocs/auth.json\`).
- Scans all files with \`\x40synd\` or \`\x40syndocs\` annotations.
- Creates mirror docs under \`.syndocs/docs/\` with exact code snapshots and hash stamps.
- Automatically initializes CodeGraph if installed.

---

### 3. Check for Code Drift
Check whether source code has drifted away from documentation:
\`\`\`bash
syndocs check
\`\`\`
- Strictly read-only: compares live file hashes against stored mirror doc hashes.
- Displays colored diffs for stale sections.
- Shows downstream blast-radius: which other documented modules are affected by the drift.

---

### 4. Update Documentation
When code changes, update the documentation snapshots:
\`\`\`bash
syndocs update
\`\`\`
- Refreshes hash fingerprints and code snippets.
- Preserves all your human-written documentation notes.
- Automatically creates embedded blocks for newly added annotations.

---

### 5. Launch the Web Studio
Open the interactive documentation studio:
\`\`\`bash
syndocs serve
# → http://localhost:4748
\`\`\`
- **Dual-Tab Sidebar**: Browse the Docs Tree and Codebase Tree.
- **Interactive AST Anchors**: Hover over symbols to see relations and definitions.
- **SVG Connection Threads**: Visual lines connecting code tokens to graph nodes.
- **Password-Protected Editing**: Edit documentation notes safely right in your browser.
`,
  },
  {
    id: 'guides/internal/annotations.md',
    title: '🏷️ Marker Syntax & \x40synd Shorthand',
    content: `# 🏷️ Marker Syntax & \x40synd Shorthand

SynDocs supports both the standard \`\x40syndocs\` syntax and concise \`\x40synd\` shorthand across all popular programming languages.

---

## 1. Whole-File & Auto-Scoped Annotations

Place \`\x40synd\` at the top of a file or above a code element:

| Language | Comment Style | Marker Syntax |
|----------|---------------|---------------|
| TypeScript, JavaScript, Java, C#, C++, Go, Rust, PHP, Swift, Kotlin | \`//\` | \`// \x40synd\` or \`// \x40syndocs\` |
| Python, Ruby, YAML, Bash, Shell, Dockerfile | \`#\` | \`# \x40synd\` or \`# \x40syndocs\` |
| HTML, XML, Markdown, Svelte, Vue | \`<!--\` | \`<!-- \x40synd -->\` or \`<!-- \x40syndocs -->\` |
| CSS, SCSS, Less | \`/*\` | \`/* \x40synd */\` or \`/* \x40syndocs */\` |
| SQL, Lua, Haskell | \`--\` | \`-- \x40synd\` or \`-- \x40syndocs\` |

---

## 2. Named Micro-Doc Annotations

To document a specific function, class, algorithm, or block:

\`\`\`ts
// \x40synd: validate-jwt
export function validateToken(token: string): boolean {
  ...
}
\`\`\`

Python:
\`\`\`python
# \x40synd: calculate-hash
def compute_hash(data: bytes) -> str:
    ...
\`\`\`

---

## 3. Trailing Inline Annotations

Place \`// \x40synd\` on the right side of a line:

\`\`\`ts
export const DB_PORT = 5432; // \x40synd
const retryLimit = 3; // \x40synd
\`\`\`

SynDocs automatically scopes the annotation to that specific line, variable, field, or schema declaration.

---

## 4. Composed Embeds in Guides (\`.syndocs/guides/\`)

Embed code documentation directly into your guides and tutorials:

\`\`\`markdown
# Authentication Guide

Here is our login flow:
\x40synd-embed: packages/core/src/auth.ts

Here is the password hashing routine:
\x40synd-embed: packages/core/src/auth.ts#hash-password
\`\`\`

Run \`syndocs lint-embeds\` to verify that all embeds point to existing files and labels!
`,
  },
  {
    id: 'guides/internal/embedded-microdocs.md',
    title: '🔬 Notion-like Embedded Micro-Docs',
    content: `# 🔬 Notion-like Embedded Micro-Docs

SynDocs uses a **Notion-like block architecture** for documentation: all micro-docs are embedded directly within their parent mirror doc file.

---

## Why Embedded Micro-Docs?

- **Single Source of Truth**: One mirror doc (\`.syndocs/docs/<path>.md\`) per source file contains all documentation for that file.
- **No File Clutter**: Eliminates separate \`.syndocs/microdocs/\` directories and dozens of tiny files.
- **Independent Tracking**: Each section carries its own hash stamp, code snippet, breadcrumb metadata, and human notes.
- **Unified Navigation**: In the Web UI and \`syndocs tree\`, micro-docs appear neatly nested under their parent file node.

---

## Mirror Doc Format

A mirror doc with embedded micro-docs looks like this:

\`\`\`markdown
# hash.ts
<!-- syndocs-hash: 9e09b3aa564a -->

\`\`\`ts
// Whole file code copy...
\`\`\`

## Notes
Documentation for hash.ts as a whole.

---

## \x40synd: compute-hash
> 🔍 function · \`computeHash\` · lines 30–34
<!-- syndocs-hash: 499c9e05f803 -->

\`\`\`ts
export function computeHash(content: string): string {
  const norm = normalise(content);
  return createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 12);
}
\`\`\`

### Notes
Explanation of why 12-char SHA-256 fingerprints are chosen for collision resistance.
\`\`\`

---

## Automatic AST & Structural Scope Detection

When you write \`// \x40synd\` above a function or inline at the end of a line, SynDocs resolves the exact scope boundaries:
1. **With CodeGraph**: Queries Tree-sitter AST nodes to find the exact start and end line of the declaration.
2. **Without CodeGraph**: Uses regex declaration matching and brace/indentation scanning across 11+ languages.
`,
  },
  {
    id: 'guides/internal/cli-reference.md',
    title: '🛠️ CLI Commands & Options',
    content: `# 🛠️ CLI Commands & Options Reference

Comprehensive guide to all commands available in the \`syndocs\` CLI.

---

### \`syndocs init [access-code] [--access-code <code>] [--dry-run]\`
Initializes SynDocs in a repository.
- Sets up \`.syndocs/\` directory structure and \`syndocs.config.json\`.
- Prompts for Web UI editing access code (stored safely with PBKDF2 hash in \`.syndocs/auth.json\`).
- Generates initial mirror docs for all annotated files.
- Runs \`codegraph init\` automatically if CodeGraph is installed.

---

### \`syndocs check [targets...] [--docs] [--microdocs] [--fail] [--no-blast-radius]\`
Strictly read-only inspection command.
- Compares live source code against stored mirror doc hashes.
- Never modifies or creates files on disk.
- \`--fail\`: Exits with code 1 if any docs are stale or missing (ideal for CI pipelines).
- \`[targets...]\`: Limits checking to specific files or directories (e.g. \`syndocs check packages/core/\`).

---

### \`syndocs update [targets...] [--docs] [--microdocs] [--dry-run] [--prune]\`
Refreshes documentation hashes and code copies.
- Auto-creates mirror docs and embedded micro-doc blocks for newly annotated code.
- Clears pending diff blocks after human review.
- Always preserves your human notes.
- Use \`--prune\` to simultaneously clean up removed annotations.

---

### \`syndocs tree [targets...] [--docs] [--microdocs] [--stale]\`
Visualizes the documentation hierarchy tree.
- Displays Unicode tree branches with status badges (\`[ok]\`, \`[stale]\`, \`[missing]\`), line counts, and hashes.
- Micro-docs appear nested directly under their parent files.
- Displays downstream blast radius counters (\`⚡ N deps\`).

---

### \`syndocs prune [targets...] [--dry-run]\`
Safely removes orphaned mirror docs and embedded micro-doc sections whose annotations were removed from source code.

---

### \`syndocs serve [--port <n>]\`
Starts the local Web UI Documentation Studio (defaults to port 4748).
- D3 force-directed code graph and connected files list.
- Interactive AST symbol anchors and dynamic SVG connection threads.
- Built-in documentation guides and notes editor.

---

### \`syndocs auth [code]\`
Sets or updates the Web UI editing access code.

---

### \`syndocs lint-embeds\`
Validates that all \`\x40synd-embed:\` and \`\x40syndocs-embed:\` references in \`.syndocs/guides/\` resolve to existing files and valid labels.

---

### \`syndocs install | reinstall | self-update | uninstall\`
Manages the SynDocs installation directly via the CLI:
- \`install\`: Runs installer setup and verifies dependencies.
- \`reinstall\`: Clean re-clone and rebuild from origin.
- \`self-update\`: Pulls latest main branch and rebuilds packages.
- \`uninstall\`: Removes binary symlink and installation directory.
`,
  },
  {
    id: 'guides/internal/codegraph.md',
    title: '🕸️ CodeGraph & AST Connections',
    content: `# 🕸️ CodeGraph & AST Connections

SynDocs integrates seamlessly with **CodeGraph** to provide structural intelligence and blast-radius analysis.

---

## What CodeGraph Enables

1. **AST-Exact Micro-Doc Boundaries**:
   CodeGraph indexes your code with Tree-sitter parsers into a local SQLite database (\`.codegraph/codegraph.db\`). When you annotate a function with \`// \x40synd\`, CodeGraph identifies the exact AST start and end line.

2. **Symbol Blast Radius & Impact Analysis**:
   When \`syndocs check\` detects that a file has drifted, CodeGraph queries the dependency graph to list which downstream modules depend on that file:
   \`\`\`
   ~ stale packages/core/src/anchor-parser.ts
     ⚡ downstream docs may be affected:
        packages/cli/src/commands/check.ts
        packages/cli/src/commands/update.ts
   \`\`\`

3. **In-Code Keyword Anchors & Graph Threads**:
   In the Web Studio, CodeGraph edges highlight function calls, imports, and references directly inside the code viewer with interactive hover cards and SVG thread lines connecting to graph nodes.

4. **Obsidian Wiki-Links**:
   Running \`syndocs graph-link\` writes Obsidian-compatible \`[[wiki-links]]\` directly into mirror docs from call and import edges.
`,
  },
];
