# utils.ts
<!-- syndocs-hash: d0bef5df876a -->

```ts
// @syndocs
import fs from 'fs';
import path from 'path';
import { getLangConfig, isUnderDocsRoot } from '@syndocs/core';

// ─── Terminal colours ─────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;

function colour(code: string, text: string): string {
  return isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const c = {
  green:  (t: string) => colour('32', t),
  yellow: (t: string) => colour('33', t),
  red:    (t: string) => colour('31', t),
  cyan:   (t: string) => colour('36', t),
  bold:   (t: string) => colour('1',  t),
  dim:    (t: string) => colour('2',  t),
};

// ─── Config ───────────────────────────────────────────────────────────────────

export interface SynDocsConfig {
  docsRoot: string;
  microdocsRoot: string;
  guidesRoot: string;
  ignore: string[];
}

const DEFAULT_CONFIG: SynDocsConfig = {
  docsRoot: '.syndocs/docs',
  microdocsRoot: '.syndocs/microdocs',
  guidesRoot: '.syndocs/guides',
  ignore: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.syndocs', 'syndocs', '.codegraph', 'graphify-out'],
};

export function loadConfig(cwd: string): SynDocsConfig {
  const cfgPath = path.join(cwd, 'syndocs.config.json');
  if (!fs.existsSync(cfgPath)) return DEFAULT_CONFIG;
  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    process.stderr.write('[syndocs] Warning: could not parse syndocs.config.json — using defaults\n');
    return DEFAULT_CONFIG;
  }
}

// ─── Graph adapter (optional, Node 22.5+) ────────────────────────────────────

export type GraphAdapter = import('@syndocs/graph').CodeGraphAdapter | null;

export async function loadGraphAdapter(cwd: string): Promise<GraphAdapter> {
  try {
    // Dynamic import — gracefully returns null on Node < 22.5 or if
    // .codegraph/ doesn't exist (codegraph init hasn't been run yet).
    const mod = await import('@syndocs/graph') as typeof import('@syndocs/graph');
    return mod.CodeGraphAdapter.open(cwd);
  } catch {
    return null;
  }
}

// ─── File system helpers ──────────────────────────────────────────────────────

export function* walkSourceFiles(
  dir: string,
  config: SynDocsConfig,
  baseDir = dir,
): Iterable<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel  = path.relative(baseDir, full).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (config.ignore.some(p => entry.name === p || rel.startsWith(p + '/'))) continue;
      if (isUnderDocsRoot(rel, config.docsRoot)) continue;
      if (rel.startsWith(config.guidesRoot + '/') || rel === config.guidesRoot) continue;
      if (rel.startsWith(config.microdocsRoot + '/') || rel === config.microdocsRoot) continue;
      if (rel.startsWith('.syndocs/') || rel === '.syndocs') continue;
      yield* walkSourceFiles(full, config, baseDir);
    } else if (entry.isFile()) {
      if (getLangConfig(entry.name)) yield rel;
    }
  }
}

export function* walkGuides(guidesRoot: string, cwd: string): Iterable<string> {
  const full = path.join(cwd, guidesRoot);
  if (!fs.existsSync(full)) return;
  yield* walkMdFiles(full, cwd);
}

function* walkMdFiles(dir: string, base: string): Iterable<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMdFiles(full, base);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      yield path.relative(base, full).split(path.sep).join('/');
    }
  }
}

export function* walkMirrorDocs(docsRoot: string, cwd: string): Iterable<string> {
  const full = path.join(cwd, docsRoot);
  if (!fs.existsSync(full)) return;
  yield* walkMdFiles(full, cwd);
}

export function* walkMicroDocs(microdocsRoot: string, cwd: string): Iterable<string> {
  const full = path.join(cwd, microdocsRoot);
  if (!fs.existsSync(full)) return;
  yield* walkMdFiles(full, cwd);
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readFileSafe(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

export function writeFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

// ─── CLI argument parsing & target resolution ─────────────────────────────────

export interface ParsedArgs {
  command: string;
  targets: string[];
  flags: {
    dryRun?: boolean;
    fail?: boolean;
    blastRadius?: boolean;
    skipCodegraph?: boolean;
    prune?: boolean;
    docs?: boolean;
    microdocs?: boolean;
    all?: boolean;
    stale?: boolean;
    orphans?: boolean;
    cwd?: string;
    port?: number;
    help?: boolean;
    version?: boolean;
    [key: string]: any;
  };
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, any> = {
    blastRadius: true,
  };
  const targets: string[] = [];
  let command = '';

  const optionsWithArgs = new Set(['--cwd', '--port', '-p', '--access-code', '-a']);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }

    if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--fail' || arg === '--fail-on-stale') {
      flags.fail = true;
    } else if (arg === '--no-blast-radius') {
      flags.blastRadius = false;
    } else if (arg === '--blast-radius') {
      flags.blastRadius = true;
    } else if (arg === '--skip-codegraph') {
      flags.skipCodegraph = true;
    } else if (arg === '--prune') {
      flags.prune = true;
    } else if (arg === '--docs') {
      flags.docs = true;
    } else if (arg === '--microdocs') {
      flags.microdocs = true;
    } else if (arg === '--all') {
      flags.all = true;
    } else if (arg === '--stale') {
      flags.stale = true;
    } else if (arg === '--orphans') {
      flags.orphans = true;
    } else if (optionsWithArgs.has(arg)) {
      const next = argv[++i];
      if (arg === '--cwd') flags.cwd = next;
      else if (arg === '--port' || arg === '-p') flags.port = parseInt(next, 10);
      else if (arg === '--access-code' || arg === '-a') flags.accessCode = next;
    } else if (arg.startsWith('--cwd=')) {
      flags.cwd = arg.slice(6);
    } else if (arg.startsWith('--port=')) {
      flags.port = parseInt(arg.slice(7), 10);
    } else if (arg.startsWith('--access-code=')) {
      flags.accessCode = arg.slice(14);
    } else if (!arg.startsWith('-')) {
      targets.push(arg);
    }
  }

  return { command, targets, flags };
}

/**
 * Checks if a given relative file path matches the specified target filters (files or directories).
 * If no targets are provided, returns true.
 */
export function matchesTargets(relPath: string, targets: string[]): boolean {
  if (!targets || targets.length === 0) return true;
  const norm = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  return targets.some(target => {
    const normTarget = target.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    return norm === normTarget || norm.startsWith(normTarget + '/');
  });
}
```

## Notes

> _Add documentation notes here._
