// @syndocs
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { hashPassword } from '@syndocs/core';
import { c, ensureDir } from '../utils';

export interface AuthOptions {
  cwd: string;
  code?: string;
}

export async function runAuth(opts: AuthOptions): Promise<void> {
  const { cwd } = opts;
  let code = opts.code?.trim();

  if (!code) {
    if (process.stdin.isTTY) {
      code = await promptPassword('Enter new Web UI edit access code (default "syndocs"): ');
      if (!code.trim()) code = 'syndocs';
    } else {
      code = 'syndocs';
    }
  }

  const { hash, salt } = hashPassword(code);
  const authDir = path.join(cwd, '.syndocs');
  ensureDir(authDir);

  const authFile = path.join(authDir, 'auth.json');
  fs.writeFileSync(
    authFile,
    JSON.stringify(
      {
        hash,
        salt,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(c.green('\u2713') + ' Web UI edit access code set successfully.');
  console.log('  ' + c.dim('Stored in .syndocs/auth.json (salted & hashed)'));
}

function promptPassword(promptText: string): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(promptText, answer => {
      rl.close();
      resolve(answer);
    });
  });
}
