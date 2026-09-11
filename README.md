# SynDocs

**Code-synced documentation with a connected knowledge graph.** Drop a concise comment into any source file. SynDocs creates a matching mirror doc alongside it, tracks code drift with cryptographic hash stamps, embeds scoped micro-docs directly into parent mirror docs (Notion-style), and — with CodeGraph — maps every doc to its dependencies so you can explore your entire codebase as an interactive connected graph in Obsidian or the built-in Web Studio.

---

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/piedpipr/SynDocs/main/install.sh | bash
```

Or install specific management operations:
```bash
./install.sh install      # Install or sync
./install.sh reinstall    # Clean reinstall from scratch
./install.sh update       # Update from git origin and rebuild
./install.sh uninstall    # Remove binary symlink and directory
```

Once installed, you can also manage SynDocs directly from the CLI:
```bash
syndocs install
syndocs reinstall
syndocs self-update
syndocs uninstall
```

---

## Quickstart

### 1. Annotate your code
Add a marker to any source file:

```ts
// @synd
export class AuthService { ... }
```
```python
# @synd
class PaymentProcessor: ...
```
Or annotate a specific function, class, or block:
```ts
// @synd: rate-limit-check
export function checkRateLimit(email: string): void { ... }
```
Or use **trailing inline annotations** on fields, variables, or constants:
```ts
const MAX_ATTEMPTS = 5; // @synd
```

Both `@synd` (concise shorthand) and `@syndocs` are supported across all languages.

---

### 2. Create mirror docs
```bash
syndocs init
```
- Sets up `.syndocs/` directory structure and `syndocs.config.json`.
- Prompts for a Web UI editing access code (stored with PBKDF2 hashing in `.syndocs/auth.json`).
- Creates `.syndocs/docs/<path>.md` for every marked file with initial code snapshots, hash fingerprints, and embedded micro-doc sections.
- Seeds an introductory guide in `.syndocs/guides/architecture.md`.
- Automatically initializes CodeGraph if installed.

---

### 3. Check for code drift (Strictly Read-Only)
```bash
syndocs check
```
- Compares live source code against stored mirror doc hashes.
- Never modifies files on disk (safe for CI pipelines with `--fail`).
- Displays colored diffs for stale sections.
- Shows downstream blast-radius: which other documented modules depend on the drifted code.

---

### 4. Update documentation
```bash
syndocs update
# Or target specific paths:
syndocs update packages/core/
```
- Refreshes hashes and code copies.
- Preserves all your human-written documentation notes.
- Automatically creates embedded blocks for newly added annotations.
- Use `syndocs update --prune` to clean up deleted annotations simultaneously.

---

### 5. Visualize hierarchy tree
```bash
syndocs tree
```
- Displays an interactive Unicode tree hierarchy.
- Micro-docs appear neatly nested under their parent files (`#rate-limit-check [ok]`).
- Shows line counts, hash fingerprints, status badges (`[ok]`, `[stale]`, `[missing]`), and blast-radius dependency counters (`⚡ N deps`).

---

### 6. Connect the graph
```bash
syndocs graph-link
```
Reads CodeGraph edges (calls, imports, extends) and writes Obsidian-compatible `[[wiki-links]]` with editable **Why** rationale columns into your mirror docs.

---

### 7. Launch the Web Studio
```bash
syndocs serve
# → http://localhost:4748
```
Opens the interactive Documentation Studio:
- **Dual-Tab Sidebar**: Browse the Docs Tree and Codebase Tree.
- **Built-in Internal Guides**: SynDocs user guide and references are built right into the studio.
- **Interactive AST Anchors**: Hover over symbols to inspect relations and definitions.
- **Dynamic SVG Threads**: Visual spline curves connecting code tokens to graph nodes.
- **Password-Protected Notes Editor**: Edit documentation notes safely right in your browser.

---

## Marker Syntax & `@synd` Shorthand

### In source files

| Language Family | Comment Style | Whole-File / Scoped | Explicit Micro-Doc | Trailing Inline Annotation |
|-----------------|---------------|---------------------|--------------------|----------------------------|
| TS, JS, Java, C#, C++, Go, Rust, PHP, Swift, Kotlin | `//` | `// @synd` | `// @synd: label` | `code... // @synd` |
| Python, Ruby, YAML, Bash, Shell, Dockerfile | `#` | `# @synd` | `# @synd: label` | `code... # @synd` |
| HTML, XML, Markdown, Svelte, Vue | `<!--` | `<!-- @synd -->` | `<!-- @synd: label -->` | `code... <!-- @synd -->` |
| CSS, SCSS, Less | `/*` | `/* @synd */` | `/* @synd: label */` | `code... /* @synd */` |
| SQL, Lua, Haskell | `--` | `-- @synd` | `-- @synd: label` | `code... -- @synd` |

*(Both `@synd` and `@syndocs` prefixes are fully supported)*

### Trailing Inline Annotations & Auto-Scoping
When an annotation is placed on the right side of a line (`const PORT = 3000; // @synd`), SynDocs automatically identifies the declaration type (variable, constant, field, schema element) and scopes the micro-doc to that specific line or block.

When placed above a declaration, SynDocs uses Tree-sitter AST queries via CodeGraph (or regex indentation/brace boundary parsing) to detect the element name and exact boundary lines automatically.

### In composed guides (`.syndocs/guides/`)

```markdown
# System Architecture

Here is the authentication entrypoint:
@synd-embed: packages/core/src/auth.ts

Here is the token validation routine:
@synd-embed: packages/core/src/auth.ts#validate-token
```
*(Both `@synd-embed:` and `@syndocs-embed:` are supported)*

Run `syndocs lint-embeds` anytime to validate that all embed references point to existing files and labels.

---

## Notion-like Embedded Micro-Doc Architecture

All micro-docs are embedded directly inside their parent mirror doc file (`.syndocs/docs/<path>.md`). There are no separate `microdocs/` directories or scattered files.

### Mirror Doc Format

```markdown
# Login.php
<!-- syndocs-hash: 345a1c0b7eca -->

\`\`\`php
...whole-file contents...
\`\`\`

<!-- syndocs-graph-start -->
| Line | Symbol | Links to | Edge | Why |
|------|--------|----------|------|-----|
| 4 | \`use App\\Auth\\Session\` | [[Session.php]] | imports | |
| 18 | \`$session->validate()\` | [[Session.php#validate-token]] | calls | Token validation here not middleware — prevents timing attacks |
<!-- syndocs-graph-end -->

## Notes
High-level architectural notes for Login.php.

---

## @synd: rate-limit-check
> 🔍 function · \`checkRateLimit\` · lines 30–42
<!-- syndocs-hash: 8f31b2e04a11 -->

\`\`\`php
public function checkRateLimit(string $email): void {
    if ($attempts >= $this->maxAttempts) {
        throw new TooManyRequestsException();
    }
}
\`\`\`

### Notes
Explain specific algorithmic decisions, rate limiting buckets, or gotchas here.
```

- Each section has an independent hash fingerprint and code copy.
- The `> 🔍` breadcrumb shows the auto-detected code element and line range.
- Human notes in all sections are completely preserved across `syndocs update` runs.

---

## Commands Reference

```
syndocs init [access-code] [--access-code <code>] [--dry-run] [--skip-codegraph]
  One-time repository setup. Creates .syndocs/ structure, sets up auth.json,
  generates mirror docs for all annotated files, and runs codegraph init.

syndocs check [targets...] [--docs] [--microdocs] [--fail] [--no-blast-radius]
  Strictly read-only drift inspection. Compares live file hashes with stored
  hashes without touching files. Use --fail in CI to exit 1 on drift.

syndocs update [targets...] [--docs] [--microdocs] [--dry-run] [--prune] [--self]
  Refresh hashes and code copies, auto-create embedded sections for new
  annotations, and preserve human notes. Use --prune to clean up removed anchors.

syndocs prune [targets...] [--docs] [--microdocs] [--dry-run]
  Safely removes orphaned mirror docs and embedded micro-doc sections whose
  annotations were deleted from source code.

syndocs tree [targets...] [--docs] [--microdocs] [--stale]
  Visualizes documentation hierarchy tree with micro-docs nested under parent
  files, line counts, status badges, and blast-radius counters.

syndocs graph-link [--dry-run]
  Writes Obsidian-compatible [[wiki-links]] into mirror docs from CodeGraph edges.

syndocs serve [--port <n>]
  Launches the Web UI Documentation Studio at http://localhost:4748 with
  force graph, dual tree, SVG connection threads, live reload, and built-in guides.

syndocs auth [code]
  Sets or updates the Web UI editing access code.

syndocs lint-embeds
  Validates all @synd-embed / @syndocs-embed references in .syndocs/guides/.

syndocs install | reinstall | self-update | uninstall
  Manages SynDocs installation and binaries directly via the CLI.
```

---

## Web Studio

Start the web studio anytime:
```bash
syndocs serve
```

### Key Features:
- **Built-in Internal Guides**: Access complete SynDocs reference guides directly in the studio even in fresh or uninitialized projects.
- **Dual-Tab Tree Sidebar**: Switch seamlessly between the **Docs Tree** (`.syndocs/docs/` and `.syndocs/guides/`) and the full **Codebase Tree**.
- **Interactive AST Anchors**: Code tokens are wrapped in interactive badges linking to dependencies with hover cards.
- **Dynamic SVG Connection Threads**: Real-time Bézier curves connect code symbols to graph nodes (modes: *Always*, *Hover*, or *Off*).
- **Safe Note Editing**: Authenticate with your access code to edit notes in markdown. Code snapshots, hashes, and AST metadata remain strictly immutable.
- **Live Reload via SSE**: Edits to documentation or source files automatically reload the web studio.

---

## CodeGraph Integration

SynDocs integrates with [CodeGraph](https://github.com/colbymchenry/codegraph) for deep AST intelligence:

```bash
npm install -g @colbymchenry/codegraph
```

When CodeGraph is present:
- **AST-Exact Micro-Doc Scopes**: Uses Tree-sitter AST nodes to find the exact beginning and end of classes, functions, and blocks.
- **Downstream Blast Radius**: When code drifts, `syndocs check` and `syndocs tree` report which other files depend on that code (`⚡ N deps`).
- **Graph Threads & Wiki-Links**: Auto-wires dependency edges and in-code SVG connections.

*Without CodeGraph, SynDocs degrades gracefully using built-in structural regex boundary detection.*

---

## Project Layout

```
.syndocs/
  docs/                    ← mirror docs with embedded micro-doc sections
    packages/core/src/hash.ts.md
  guides/                  ← composed guides & tutorials
    architecture.md
  auth.json                ← salted PBKDF2 hash for Web UI editing (gitignored)
.codegraph/                ← CodeGraph SQLite database (optional)
syndocs.config.json        ← project configuration
```

### Configuration (`syndocs.config.json`)

```json
{
  "docsRoot": ".syndocs/docs",
  "guidesRoot": ".syndocs/guides",
  "ignore": ["node_modules", ".git", "dist", "build", ".next", "coverage", ".syndocs"]
}
```

---

## CI Integration

Add SynDocs drift checking to GitHub Actions:

```yaml
# .github/workflows/syndocs.yml
name: SynDocs Drift Check
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run build --workspaces --if-present
      - run: node packages/cli/dist/index.js check --fail --no-blast-radius
      - run: node packages/cli/dist/index.js lint-embeds
```

A pull request that alters code without updating the corresponding mirror doc section will fail CI. Authors can simply run `syndocs update` to resolve drift before merging.
