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
