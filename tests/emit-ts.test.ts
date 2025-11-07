import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ServerDefinition } from '../src/config.js';
import type { Runtime, ServerToolInfo } from '../src/runtime.js';
import { handleEmitTs, __test as emitTsTestInternals } from '../src/cli/emit-ts-command.js';
import { renderClientModule, renderTypesModule } from '../src/cli/emit-ts-templates.js';

const sampleDefinition: ServerDefinition = {
  name: 'integration',
  description: 'Integration test server',
  command: { kind: 'http', url: 'https://example.com/mcp' },
  transport: 'stdio',
};

const sampleTool: ServerToolInfo = {
  name: 'list_comments',
  description: 'List comments for an issue',
  inputSchema: {
    type: 'object',
    properties: {
      issueId: { type: 'string', description: 'Issue identifier' },
      limit: { type: 'number', description: 'Limit results', default: 10 },
    },
    required: ['issueId'],
  },
  outputSchema: { title: 'CommentList' },
};

function createRuntimeStub(): Runtime {
  return {
    listServers: () => ['integration'],
    getDefinitions: () => [sampleDefinition],
    getDefinition: () => sampleDefinition,
    registerDefinition: () => {},
    listTools: async () => [sampleTool],
    callTool: async () => ({}),
    listResources: async () => ({}),
    connect: async () => {
      throw new Error('not implemented');
    },
    close: async () => {},
  } as unknown as Runtime;
}

describe('emit-ts templates', () => {
  it('renders type declarations with CallResult returns', () => {
    const docs = emitTsTestInternals.buildDocEntries('integration', [sampleTool], false);
    const metadata = {
      server: sampleDefinition,
      generatorLabel: 'mcporter@test',
      generatedAt: new Date('2025-11-07T00:00:00Z'),
    };
    const source = renderTypesModule({ interfaceName: 'IntegrationTools', docs, metadata });
    expect(source).toContain('export interface IntegrationTools');
    expect(source).toContain('Promise<CommentList>');
    expect(source).toContain('Issue identifier');
  });

  it('renders client module that wraps proxy calls', () => {
    const docs = emitTsTestInternals.buildDocEntries('integration', [sampleTool], true);
    const metadata = {
      server: sampleDefinition,
      generatorLabel: 'mcporter@test',
      generatedAt: new Date('2025-11-07T00:00:00Z'),
    };
    const source = renderClientModule({
      interfaceName: 'IntegrationTools',
      docs,
      metadata,
      typesImportPath: './integration-client',
    });
    expect(source).toContain('createIntegrationClient');
    expect(source).toContain('createCallResult');
    expect(source).toContain('proxy.listComments');
  });
});

describe('handleEmitTs', () => {
  it('writes client and types files to disk', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emit-ts-'));
    const runtime = createRuntimeStub();
    const clientPath = path.join(tmpDir, 'integration-client.ts');
    await handleEmitTs(runtime, ['integration', '--out', clientPath, '--mode', 'client']);
    const typesPath = path.join(tmpDir, 'integration-client.d.ts');
    const clientSource = await fs.readFile(clientPath, 'utf8');
    const typesSource = await fs.readFile(typesPath, 'utf8');
    expect(clientSource).toContain('createIntegrationClient');
    expect(typesSource).toContain('export interface IntegrationTools');
  });
});
