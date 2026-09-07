import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requiredCommands, sourceFingerprint, validateEvidence } from './evidence.mjs';

if (!process.env.npm_execpath) throw new Error('Run npm run release:validate');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const fingerprint = sourceFingerprint();
const output = path.resolve('artifacts/release-validation');
mkdirSync(output, { recursive: true });
mkdirSync('docs/releases', { recursive: true });
const report = { schemaVersion: 1, packageVersion: pkg.version, sourceFingerprint: fingerprint, recordedAt: new Date().toISOString(), environment: { platform: os.platform(), arch: os.arch(), node: process.version }, status: 'failed', commands: [], native: null };
for (const name of requiredCommands) {
  console.log(`Validating ${name}...`);
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', name], {
    env: { ...process.env, MONITORING_REPORT_DIR: output, INTEGRATION_WS_ENDPOINT: '', INTEGRATION_FIXTURE_WS_ENDPOINT: '' },
    encoding: 'utf8', timeout: 1200000, maxBuffer: 16 * 1024 * 1024,
  });
  writeFileSync(path.join(output, `${name.replaceAll(':', '-')}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`);
  report.commands.push({ name, exitCode: result.status ?? 1 });
  console.log(`${name}: ${result.status === 0 ? 'passed' : 'failed'}`);
}
try { report.native = JSON.parse(readFileSync(path.join(output, 'native.json'), 'utf8')); } catch { /* Missing evidence fails validation below. */ }
try {
  report.status = 'passed';
  if (sourceFingerprint() !== fingerprint) throw new Error('Verification inputs changed while tests ran');
  validateEvidence(report, pkg.version, fingerprint);
} catch (error) { report.status = 'failed'; report.reason = error.message; }
writeFileSync(`docs/releases/v${pkg.version}.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Validation ${report.status}; raw local logs: artifacts/release-validation/`);
process.exitCode = report.status === 'passed' ? 0 : 1;
