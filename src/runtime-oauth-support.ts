import os from 'node:os';
import path from 'node:path';
import type { ServerDefinition } from './config.js';
import { analyzeConnectionError } from './error-classifier.js';
import type { Logger } from './logging.js';

export function maybeEnableOAuth(definition: ServerDefinition, logger: Logger): ServerDefinition | undefined {
  if (definition.auth === 'oauth') {
    return undefined;
  }
  if (definition.command.kind !== 'http') {
    return undefined;
  }
  const isAdHocSource = definition.source && definition.source.kind === 'local' && definition.source.path === '<adhoc>';
  if (!isAdHocSource) {
    return undefined;
  }
  const tokenCacheDir = definition.tokenCacheDir ?? path.join(os.homedir(), '.mcporter', definition.name);
  logger.info(`Detected OAuth requirement for '${definition.name}'. Launching browser flow...`);
  return {
    ...definition,
    auth: 'oauth',
    tokenCacheDir,
  };
}

export function isUnauthorizedError(error: unknown): boolean {
  const issue = analyzeConnectionError(error);
  return issue.kind === 'auth';
}
