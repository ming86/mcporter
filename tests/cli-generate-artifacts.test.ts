import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bundleOutput } from '../src/cli/generate/artifacts.js';

const TMP_PREFIX = path.join(os.tmpdir(), 'mcporter-artifacts-test-');

describe('bundleOutput', () => {
  it('resolves mcporter dependencies even without local node_modules', async () => {
    const tempDir = await fs.mkdtemp(TMP_PREFIX);
    const entryPath = path.join(tempDir, 'entry.ts');
    const content = `import { Command } from 'commander';\nimport { createRuntime } from 'mcporter';\nconsole.log(typeof Command, typeof createRuntime);\n`;
    await fs.writeFile(entryPath, content, 'utf8');
    const outputPath = path.join(tempDir, 'bundle.js');

    const result = await bundleOutput({
      sourcePath: entryPath,
      targetPath: outputPath,
      runtimeKind: 'node',
      minify: false,
    });

    const stats = await fs.stat(result);
    expect(stats.isFile()).toBe(true);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
});
