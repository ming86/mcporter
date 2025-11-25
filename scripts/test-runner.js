#!/usr/bin/env node
// Lightweight wrapper to translate `--filter foo` into Vitest include globs so
// callers can run `pnpm test --filter my-test` without hitting the Vitest CLI
// "Unknown option --filter" error.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const translated = [];
const positional = [];

for (let i = 0; i < args.length; i += 1) {
  const token = args[i];
  if (token === '--filter' || token === '-f') {
    const pattern = args[i + 1];
    if (!pattern) {
      console.error('[test-runner] --filter requires a pattern');
      process.exit(1);
    }
    positional.push(pattern);
    i += 1; // skip pattern
    continue;
  }
  translated.push(token);
}

const bin = path.join(process.cwd(), 'node_modules', '.bin', 'vitest');
const result = spawnSync(bin, ['run', ...positional, ...translated], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
