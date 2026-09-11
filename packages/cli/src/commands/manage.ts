// @syndocs
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { c } from '../utils';

export type InstallerAction = 'install' | 'reinstall' | 'update' | 'uninstall';

/**
 * Resolves the location of install.sh:
 * 1. Checks repository root relative to current process (if developing in SynDocs repo)
 * 2. Checks repository root relative to CLI dist (packages/cli/dist/../../.. -> root)
 * 3. Checks ~/.syndocs/install.sh (or $SYNDOCS_DIR/install.sh)
 * 4. Falls back to GitHub raw URL via curl if local script is missing
 */
export function resolveInstallerScript(): { type: 'local'; scriptPath: string } | { type: 'remote'; url: string } {
  // 1. Current working directory if inside SynDocs repo
  const cwdScript = path.join(process.cwd(), 'install.sh');
  if (fs.existsSync(cwdScript) && fs.existsSync(path.join(process.cwd(), 'packages', 'cli'))) {
    return { type: 'local', scriptPath: cwdScript };
  }

  // 2. Relative to this module (packages/cli/dist/commands -> root)
  const repoRoot = path.resolve(__dirname, '../../..');
  const localScript = path.join(repoRoot, 'install.sh');
  if (fs.existsSync(localScript)) {
    return { type: 'local', scriptPath: localScript };
  }

  // 3. ~/.syndocs/install.sh (or $SYNDOCS_DIR)
  const installDir = process.env.SYNDOCS_DIR || path.join(process.env.HOME || '', '.syndocs');
  const homeScript = path.join(installDir, 'install.sh');
  if (fs.existsSync(homeScript)) {
    return { type: 'local', scriptPath: homeScript };
  }

  // 4. Remote fallback
  return {
    type: 'remote',
    url: 'https://raw.githubusercontent.com/piedpipr/SynDocs/main/install.sh',
  };
}

export async function runInstallerAction(action: InstallerAction, extraArgs: string[] = []): Promise<void> {
  const target = resolveInstallerScript();

  return new Promise<void>((resolve, reject) => {
    let child;

    if (target.type === 'local') {
      child = spawn('bash', [target.scriptPath, action, ...extraArgs], {
        stdio: 'inherit',
        env: process.env,
      });
    } else {
      console.log(c.dim(`Fetching latest installer script from ${target.url}...`));
      const escapedArgs = [action, ...extraArgs].map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
      const cmd = `curl -fsSL ${target.url} | bash -s -- ${escapedArgs}`;
      child = spawn('bash', ['-c', cmd], {
        stdio: 'inherit',
        env: process.env,
      });
    }

    child.on('error', (err) => {
      console.error(c.red(`Failed to execute installer:`), err.message);
      reject(err);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        process.exit(code ?? 1);
      }
    });
  });
}
