# @syndocs: label
> Source: `packages/cli/src/index.ts`
<!-- syndocs-hash: a66d2c14955e -->

```ts
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
