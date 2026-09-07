import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, it } from 'vitest';

import { shouldRunIntegrationTests } from './helpers/integration-mode.js';

const execute = promisify(execFile);

describe.skipIf(!shouldRunIntegrationTests())('monitoring and capability regression over real MCP stdio', () => {
  it('verifies public fixture behavior and records every capability without accepting skipped/empty results', async () => {
    await execute(process.execPath, ['tests/manual/monitoring/public-regression.mjs'], {
      env: process.env,
      timeout: 600_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  }, 610_000);
});
