# index.ts
<!-- syndocs-hash: 60cb5d5fc862 -->

```ts
#!/usr/bin/env -S node --no-warnings=ExperimentalWarning
// @syndocs

import path from 'path';
import { loadConfig, c } from './utils';
import { runInit }       from './commands/init';
import { runCheck }      from './commands/check';
import { runUpdate }     from './commands/update';
import { runLintEmbeds } from './commands/lint-embeds';
import { runGraphLink }  from './commands/graph-link';
import { runServe }      from './commands/serve';

const VERSION = '0.2.0';

const HELP = `
${c.bold('SynDocs')} v${VERSION} — code-synced documentation with graph connections

${c.bold('Usage:')}

  syndocs init [--dry-run] [--skip-codegraph]
    Create mirror docs for every @syndocs-marked file.
    Runs codegraph init automatically if CodeGraph is installed.

  syndocs check [--no-annotate] [--fail] [--no-blast-radius]
    Detect drift. --fail exits 1 when stale (CI mode).
    --no-annotate keeps check read-only (no writes to mirror docs).

  syndocs update [file ...] [--dry-run]
    Refresh hash + code copy, clear pending diffs.
    Uses CodeGraph for AST-exact micro-doc boundaries when available.

  syndocs graph-link [--dry-run]
    Write [[wiki-links]] into mirror docs from CodeGraph edges.
    Open syndocs/ as an Obsidian vault for the connected graph view.

  syndocs serve [--port <n>]
    Start the web UI at http://localhost:4748
    Force-directed graph, rendered markdown, live reload, drift badges.

  syndocs lint-embeds
    Validate @syndocs-embed references in guides/.

${c.bold('Markers:')}

  // @syndocs                whole-file doc  (JS/TS/PHP/Go/...)
  # @syndocs                 whole-file doc  (Python/Ruby/YAML/...)
  // @syndocs: label          micro-doc for a specific block
  @syndocs-embed: path        embed in a composed guide
  @syndocs-embed: path#label  embed one specific micro-doc

${c.bold('Graph features')} need CodeGraph (npm i -g @colbymchenry/codegraph):
  syndocs init     — also runs codegraph init
  syndocs graph-link — writes [[wiki-links]] for Obsidian or web UI

${c.bold('Config')} — syndocs.config.json:
  { "docsRoot": "syndocs", "guidesRoot": "guides", "ignore": ["node_modules"] }

${c.bold('Options:')}
  --cwd <path>     Run as if in this directory
  --version, -v    Print version
  --help, -h       Print this help
`.trimStart();

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    console.log('syndocs v' + VERSION); process.exit(0);
  }
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(HELP); process.exit(0);
  }

  const cwdFlag = args.includes('--cwd') ? args[args.indexOf('--cwd') + 1] : undefined;
  const cwd     = cwdFlag ? path.resolve(cwdFlag) : process.cwd();
  const config  = loadConfig(cwd);
  const command = args[0];

  switch (command) {
    case 'init':
      await runInit({
        cwd, config,
        dryRun:        args.includes('--dry-run'),
        skipCodegraph: args.includes('--skip-codegraph'),
      });
      break;

    case 'check': {
      const code = await runCheck({
        cwd, config,
        annotate:    !args.includes('--no-annotate'),
        failOnStale:  args.includes('--fail'),
        blastRadius: !args.includes('--no-blast-radius'),
      });
      process.exit(code);
    }

    case 'update':
      await runUpdate({
        cwd, config,
        dryRun: args.includes('--dry-run'),
        files:  args.slice(1).filter(a => !a.startsWith('--')),
      });
      break;

    case 'graph-link':
      await runGraphLink({
        cwd, config,
        dryRun: args.includes('--dry-run'),
      });
      break;

    case 'serve': {
      const portFlag = args.includes('--port') ? parseInt(args[args.indexOf('--port') + 1], 10) : undefined;
      await runServe({ cwd, config, port: portFlag });
      break;
    }

    case 'lint-embeds': {
      const code = await runLintEmbeds({ cwd, config });
      process.exit(code);
    }

    default:
      console.error(c.red('Error:') + ' unknown command "' + command + '"');
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
