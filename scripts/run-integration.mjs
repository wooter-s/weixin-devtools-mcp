import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultCliPath } from '../build/connection/project-startup.js';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'weixin-integration-'));
const project = path.join(scratch, 'app');
cpSync(path.resolve(process.env.INTEGRATION_PROJECT_PATH || 'tests/fixtures/monitoring-app'), project, { recursive: true, filter: file => !file.endsWith('project.private.config.json') });
if (process.env.INTEGRATION_APPID) {
  const configPath = path.join(project, 'project.config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8')); config.appid = process.env.INTEGRATION_APPID;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}
const env = { ...process.env, RUN_INTEGRATION_TESTS: 'true', INTEGRATION_STRICT: 'true', INTEGRATION_PROJECT_PATH: project, INTEGRATION_CLEANUP_MODE: process.env.INTEGRATION_CLEANUP_MODE || 'reuse' };
try {
  // Fail once on a missing runtime instead of spending a full startup timeout in every suite.
  const preflight = spawnSync(process.execPath, ['tests/manual/monitoring/public-regression.mjs'], { env, stdio: 'inherit' });
  if (preflight.status !== 0) {
    console.error('Public fixture preflight failed; strict integration suites were not executed. See native.json.');
    process.exitCode = 1;
  } else {
    const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', '--run', 'tests/integration/'], { env, stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  }
} finally {
  try { execFileSync(process.env.INTEGRATION_CLI_PATH || defaultCliPath(), ['close', '--project', project], { timeout: 10000, stdio: 'ignore' }); } catch { /* Only this disposable project can be closed. */ }
  rmSync(scratch, { recursive: true, force: true });
}
