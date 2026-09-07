import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

export const requiredCommands = ['typecheck', 'typecheck:test', 'test', 'lint', 'build', 'lint:links', 'test:coverage', 'test:package', 'test:integration', 'test:integration:public'];
export const requiredScenarios = ['project-startup', 'profiles', 'resources', 'snapshot-scopes', 'ref-path', 'click', 'input', 'controls', 'assertions', 'wait', 'navigation', 'stale-ref', 'script', 'screenshot', 'network', 'console-reconnect', 'diagnostics', 'endpoint-reconnect', 'cleanup'];

// Hash the checked-out runtime and verification inputs; report/docs commits do not invalidate identical tested code.
export function sourceFingerprint() {
  const names = execFileSync('git', ['ls-files', '-z', 'src', 'tests', 'scripts', '.github/workflows', 'package.json', 'package-lock.json', 'vitest.config.ts', 'tsconfig.json', 'tsconfig.test.json', 'eslint.config.mjs'], { encoding: 'utf8' }).split('\0').filter(name => name && !name.endsWith('.md')).sort();
  assert.ok(names.includes('src/server.ts'), 'Run from the repository root');
  const hash = createHash('sha256');
  for (const name of names) hash.update(name).update('\0').update(fs.readFileSync(name)).update('\0');
  return hash.digest('hex');
}

export function validateEvidence(report, version, fingerprint) {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.packageVersion, version);
  assert.equal(report.sourceFingerprint, fingerprint, 'Code changed since validation');
  assert.equal(report.status, 'passed', 'Real validation has not passed');
  for (const name of requiredCommands) {
    const checks = report.commands.filter(check => check.name === name);
    assert.equal(checks.length, 1, `Missing/duplicate command: ${name}`);
    assert.equal(checks[0].exitCode, 0, `Failed command: ${name}`);
  }
  assert.ok(report.commands.every(check => check.exitCode === 0), 'A validation command failed');
  assert.equal(report.native.projectLaunchValidated, true, 'An existing endpoint cannot validate project startup');
  for (const name of requiredScenarios) {
    const checks = report.native.checks.filter(check => check.name === name);
    assert.equal(checks.length, 1, `Missing/duplicate scenario: ${name}`);
    assert.equal(checks[0].status, 'passed', `Failed scenario: ${name}`);
  }
  assert.ok(report.native.checks.every(check => check.status === 'passed'));
  assert.equal(report.native.sourceFingerprint, fingerprint);
  assert.ok(report.native.environment.devtoolsVersion && report.native.environment.sdkVersion, 'Missing real runtime versions');
}
