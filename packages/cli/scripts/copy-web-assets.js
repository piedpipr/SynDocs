#!/usr/bin/env node
// Copies packages/cli/src/web/assets/* -> packages/cli/dist/web/assets/*
// (tsc only compiles .ts files, so the plain .css/.js/.html UI assets need
// a manual copy step to end up next to the compiled html.js at runtime.)
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'web', 'assets');
const DEST = path.join(__dirname, '..', 'dist', 'web', 'assets');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(SRC, DEST);
console.log('  \u2713 copied web/assets ->', path.relative(process.cwd(), DEST));
