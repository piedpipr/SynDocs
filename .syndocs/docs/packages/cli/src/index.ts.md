# index.ts
<!-- syndocs-hash: 87ae2255a1e2 -->

```ts
#!/usr/bin/env -S node --no-warnings=ExperimentalWarning
// @syndocs

import path from 'path';
import { loadConfig, parseCliArgs, c } from './utils';
import { runInit }       from './commands/init';
import { runCheck }      from './commands/check';
import { runUpdate }     from './commands/update';
import { runPrune }      from './commands/prune';
import { runTree }       from './commands/tree';
import { runLintEmbeds } from './commands/lint-embeds';
import { runGraphLink }  from './commands/graph-link';
import { runServe }      from './commands/serve';
import { runAuth }       from './commands/auth';

const VERSION = '0.2.0';

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

${c.bold('Options:')}
  --cwd <path>     Run as if in this directory
  --version, -v    Print version
  --help, -h       Print this help
`.trimStart();

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.flags.version) {
    console.log('syndocs v' + VERSION);
    process.exit(0);
  }

  if (parsed.flags.help || !parsed.command) {
    console.log(HELP);
    process.exit(0);
  }

  const cwd = parsed.flags.cwd ? path.resolve(parsed.flags.cwd) : process.cwd();
  const config = loadConfig(cwd);
  const targets = parsed.targets;

  const collection: 'all' | 'docs' | 'microdocs' = parsed.flags.docs
    ? 'docs'
    : parsed.flags.microdocs
      ? 'microdocs'
      : 'all';

  switch (parsed.command) {
    case 'init': {
      await runInit({
        cwd,
        config,
        dryRun: parsed.flags.dryRun,
        skipCodegraph: parsed.flags.skipCodegraph,
        accessCode: parsed.flags.accessCode || (parsed.targets.length > 0 ? parsed.targets[0] : undefined),
      });
      break;
    }

    case 'check': {
      const code = await runCheck({
        cwd,
        config,
        targets,
        collection,
        failOnStale: parsed.flags.fail,
        blastRadius: parsed.flags.blastRadius,
      });
      process.exit(code);
      break;
    }

    case 'update': {
      await runUpdate({
        cwd,
        config,
        targets,
        collection,
        dryRun: parsed.flags.dryRun,
        prune: parsed.flags.prune,
      });
      break;
    }

    case 'prune': {
      await runPrune({
        cwd,
        config,
        targets,
        collection,
        dryRun: parsed.flags.dryRun,
      });
      break;
    }

    case 'tree': {
      await runTree({
        cwd,
        config,
        targets,
        collection,
        staleOnly: parsed.flags.stale,
        orphansOnly: parsed.flags.orphans,
      });
      break;
    }

    case 'graph-link': {
      await runGraphLink({
        cwd,
        config,
        dryRun: parsed.flags.dryRun,
      });
      break;
    }

    case 'serve': {
      await runServe({
        cwd,
        config,
        port: parsed.flags.port,
      });
      break;
    }

    case 'auth': {
      await runAuth({
        cwd,
        code: targets[0],
      });
      break;
    }

    case 'lint-embeds': {
      const code = await runLintEmbeds({ cwd, config });
      process.exit(code);
      break;
    }

    default:
      console.error(c.red('Error:') + ' unknown command "' + parsed.command + '"');
      console.log('Run ' + c.bold('syndocs --help') + ' to see available commands.');
      process.exit(1);
  }
}

main().catch(err => {
  console.error(c.red('Fatal:') + ' ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
```

## Notes

> _Add documentation notes here._
