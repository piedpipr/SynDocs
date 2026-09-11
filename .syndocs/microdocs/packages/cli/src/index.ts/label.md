# @syndocs: label
> Source: `packages/cli/src/index.ts`
<!-- syndocs-hash: 558317e21db8 -->

```ts
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

  const isInstallerCmd = ['install', 'reinstall', 'uninstall', 'self-update'].includes(parsed.command)
    || (parsed.command === 'update' && (parsed.flags.self || parsed.targets.includes('self')));
  if ((parsed.flags.help && !isInstallerCmd) || !parsed.command) {
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
      if (parsed.flags.self || parsed.targets.includes('self')) {
        const extraArgs = process.argv.slice(3).filter(a => a !== '--self' && a !== 'self');
        await runInstallerAction('update', extraArgs);
        break;
      }
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

    case 'self-update': {
      await runInstallerAction('update', process.argv.slice(3));
      break;
    }

    case 'install': {
      await runInstallerAction('install', process.argv.slice(3));
      break;
    }

    case 'reinstall': {
      await runInstallerAction('reinstall', process.argv.slice(3));
      break;
    }

    case 'uninstall': {
      await runInstallerAction('uninstall', process.argv.slice(3));
      break;
    }

    case 'prune': {
      await runPrune({
        cwd,
        config,
        targets,
        collection,
```

## Notes

> _Add documentation notes here._
