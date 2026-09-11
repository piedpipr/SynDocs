# @syndocs: label
> Source: `packages/cli/src/index.ts`
<!-- syndocs-hash: 6a13fd960ab2 -->

```ts
const HELP = `
${c.bold('SynDocs')} v${VERSION} — code-synced documentation with graph connections

${c.bold('Usage:')}

  syndocs init [access-code] [--access-code <code>] [--dry-run] [--skip-codegraph]
    One-time initialization for a repository.
    Prompts for web UI edit access code (or pass directly).
    Creates .syndocs/ structure (docs, microdocs, guides) and initial documentation.
    Runs codegraph init automatically if CodeGraph is installed.

  syndocs check [targets...] [--docs] [--microdocs] [--fail] [--no-blast-radius]
    Strictly read-only inspection. Detects drift, missing docs, and removed annotations.
    Accepts files or directories as targets (e.g. syndocs check src/).
    --fail exits 1 when stale or missing (CI mode).

  syndocs update [targets...] [--docs] [--microdocs] [--dry-run] [--prune]
    Refresh hashes + code copy, and auto-create docs for new annotations.
    Accepts files or directories as targets (e.g. syndocs update packages/core/).
    Keeps orphaned docs safe by default. Use --prune to clean up removed annotations.

  syndocs prune [targets...] [--docs] [--microdocs] [--dry-run]
    Remove orphaned mirror docs and micro-docs whose annotations were removed.

  syndocs tree [targets...] [--docs] [--microdocs] [--stale]
    Visualize documentation hierarchy tree with status badges, line counts, and stats.

  syndocs graph-link [--dry-run]
    Write [[wiki-links]] into mirror docs from CodeGraph edges.
    Open .syndocs/ as an Obsidian vault for the connected graph view.

  syndocs serve [--port <n>]
    Start the web UI at http://localhost:4748
    Force-directed graph, rendered markdown, live reload, drift badges.

  syndocs auth [code]
    Set or update the Web UI edit access code.

  syndocs lint-embeds
    Validate @syndocs-embed references in .syndocs/guides/.

${c.bold('Collections & Filtering:')}
  [targets...]     Filter by file or directory path (e.g. src/ or packages/core/src/types.ts)
  --docs           Only whole-file mirror docs (.syndocs/docs/)
  --microdocs      Only micro-docs (.syndocs/microdocs/)
  --all            Both docs and micro-docs (default)

${c.bold('Markers:')}
  // @syndocs                whole-file doc  (JS/TS/PHP/Go/...)
  # @syndocs                 whole-file doc  (Python/Ruby/YAML/...)
  // @syndocs: label          micro-doc for a specific block
  @syndocs-embed: path        embed in a composed guide
  @syndocs-embed: path#label  embed one specific micro-doc
```

## Notes

> _Add documentation notes here._
