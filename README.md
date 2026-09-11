# SynDocs

**Code-synced documentation with a connected graph.** Drop one comment into a source file. SynDocs keeps a matching mirror doc alongside it, detects drift when the code changes, and — with CodeGraph — wires every doc to the files it depends on so you can browse the whole codebase as a connected graph in Obsidian or the built-in web UI.

---

## Quick start

```bash
# Install (once published to npm)
npm install -g syndocs

# Or run without installing
npx syndocs --help
```

### 1. Mark a file as documented

```js
// @syndocs
```
```python
# @syndocs
```
```php
// @syndocs: rate-limit-check
public function checkRateLimit(string $email): void { ... }
```

One bare `@syndocs` per file = whole-file mirror doc.
`@syndocs: label` above a function or block = micro-doc for that specific piece.

### 2. Create mirror docs

```bash
syndocs init
```

Creates `syndocs/src/auth/Login.php.md` for every marked file, with the current
code copy and a hash fingerprint. Also runs `codegraph init` if CodeGraph is
installed (builds the code graph for wiki-links and blast-radius).

### 3. Check for drift

```bash
syndocs check
```

Compares the live file hash against the stored hash. On a mismatch, writes the
diff directly into the mirror doc:

```markdown
<!-- syndocs-pending-start -->
## ⚠ Pending changes
```diff
-    if ($attempts > 5) {
+    if ($attempts >= $this->maxAttempts) {
```
<!-- syndocs-pending-end -->
```

With CodeGraph: also warns which other documented files depend on the stale one.

### 4. Resolve

Write your Notes update, then:

```bash
syndocs update src/auth/Login.php
```

Refreshes the hash, updates the code copy, and removes the pending-diff block.

### 5. Wire the graph

```bash
syndocs graph-link
```

Reads CodeGraph edges (calls, imports, extends) and writes Obsidian-compatible
`[[wiki-links]]` into each mirror doc. Each link row also has a **Why** column
you fill in to explain the reason for the connection.

### 6. Browse

**Obsidian:** Open `syndocs/` as a vault. The graph view maps your code
dependency structure. Click any node to read its mirror doc.

**Web UI:**

```bash
syndocs serve
# → http://localhost:4748
```

Force-directed graph, rendered markdown, drift status badges, live reload as
you edit docs.

---

## Marker syntax

### In source files

| Syntax | Meaning |
|--------|---------|
| `// @syndocs` | Whole-file mirror doc (JS/TS/PHP/Go/Rust/Java/…) |
| `# @syndocs` | Whole-file mirror doc (Python/Ruby/YAML/…) |
| `// @syndocs: label` | Micro-doc for the immediately following block |
| `<!-- @syndocs -->` | Whole-file mirror doc (HTML/XML) |
| `/* @syndocs: label */` | Micro-doc (CSS/SCSS) |

### In composed guides (`guides/`)

```markdown
@syndocs-embed: src/auth/Login.php
@syndocs-embed: src/auth/Login.php#rate-limit-check
```

Each embed carries its own `<!-- syndocs-synced: hash -->` stamp and gets its
own independent drift check.

---

## Commands

```
syndocs init [--dry-run] [--skip-codegraph]
  Scan for @syndocs markers, create missing mirror docs.
  Runs codegraph init automatically if CodeGraph is on PATH.

syndocs check [--no-annotate] [--fail] [--no-blast-radius]
  Detect drift. Use --fail in CI to exit 1 when anything is stale.
  --no-annotate: read-only, no writes to mirror docs (good for CI).

syndocs update [file …] [--dry-run]
  Refresh hash + code copy, clear pending diffs.
  Uses CodeGraph for AST-exact micro-doc boundaries when available.
  Omit files to update everything stale.

syndocs graph-link [--dry-run]
  Write [[wiki-links]] into mirror docs from CodeGraph call/import edges.
  Rerun after any syndocs init or codegraph index to keep links current.

syndocs serve [--port <n>]
  Start the web UI at http://localhost:4748
  D3 force graph, rendered markdown, drift badges, live reload.

syndocs lint-embeds
  Validate all @syndocs-embed references in guides/ files.
```

---

## Mirror doc format

```markdown
# Login.php
<!-- syndocs-hash: 345a1c0b7eca -->

```php
...current contents of Login.php...
```

<!-- syndocs-graph-start -->
| Line | Symbol | Links to | Edge | Why |
|------|--------|----------|------|-----|
| 4 | `use App\Auth\Session` | [[Session.php]] | imports | |
| 18 | `$session->validate()` | [[Session.php#validate-token]] | calls | Token validation here not middleware — prevents timing attacks |
<!-- syndocs-graph-end -->

## Notes
Explain decisions, gotchas, non-obvious behaviour here.
```

The `<!-- syndocs-graph-start/end -->` block is written by `syndocs graph-link`
and updated on each rerun. The **Why** column is yours to fill in. Everything
else is managed automatically.

---

## Connection docs — the Why column

When CodeGraph finds that `Login.php` calls `Session::validate()`, it creates
the table row. The Why cell starts empty. Fill it in to explain the design
decision at that call site:

```markdown
| 18 | `$session->validate()` | [[Session.php#validate-token]] | calls | Validation here not in middleware — prevents timing attacks that could reveal whether a session token exists |
```

For connections where no rationale exists yet, run:

```bash
syndocs explain-connections src/auth/Login.php
```

*(Phase 6 — calls Claude to draft Why cells as a starting point for review.)*

---

## CI integration

```yaml
# .github/workflows/syndocs.yml
name: SynDocs — Docs Drift Check
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
      - run: node packages/cli/dist/index.js check --no-annotate --fail --no-blast-radius
      - run: node packages/cli/dist/index.js lint-embeds
```

A PR that changes a documented file without updating its mirror doc will fail
the `check` step. The reviewer sees which file drifted; the author runs
`syndocs update` to resolve it.

---

## Graph features — CodeGraph integration

Graph features (wiki-links, blast-radius, AST-exact boundaries) require
[CodeGraph](https://github.com/colbymchenry/codegraph):

```bash
npm install -g @colbymchenry/codegraph
```

After installing, `syndocs init` handles `codegraph init` automatically.
CodeGraph writes to `.codegraph/` (its own directory). SynDocs writes to
`syndocs/`. They share nothing — CodeGraph is read-only from SynDocs' side.

**Without CodeGraph:** all core features (drift detection, mirror docs, guides,
web UI) work normally. Graph-specific features degrade gracefully to no-ops.

---

## Requirements

| Feature | Node version |
|---------|-------------|
| Core (drift detection, mirror docs) | Node ≥ 18 |
| Graph features (wiki-links, blast-radius) | Node ≥ 22.5 |
| Web UI (`syndocs serve`) | Node ≥ 18 |

---

## Project layout

```
syndocs/               ← mirror docs and guides (SynDocs)
  src/auth/Login.php.md
  src/auth/Session.php.md
guides/                ← hand-written composed docs
  auth.md
.codegraph/            ← CodeGraph's SQLite index (CodeGraph)
syndocs.config.json    ← optional config
```

### Config (`syndocs.config.json`)

```json
{
  "docsRoot":   "syndocs",
  "guidesRoot": "guides",
  "ignore":     ["node_modules", "dist", ".next"]
}
```

Set `"docsRoot": "docs"` to use the older folder name if migrating from v0.1.

---

## Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 0–1 | Drift detection, mirror docs, hash | ✅ Done |
| 2 | CI enforcement, pre-commit hook | ✅ Done |
| 3 | Composed docs, @syndocs-embed | ✅ Done |
| 4 | CodeGraph adapter, graph-link, blast-radius | ✅ Done |
| 5 | Web UI with force graph | ✅ Done |
| 6 | AI-generated Why column drafts | Backlog |
| 6 | VS Code extension | Backlog |
| 6 | Notion publish (one-way) | Backlog |
