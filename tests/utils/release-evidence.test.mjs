import { describe, expect, it } from 'vitest';
import { requiredCommands, requiredScenarios, validateEvidence } from '../../scripts/release/evidence.mjs';

function evidence() {
  return {
    schemaVersion: 1, packageVersion: '0.7.0', sourceFingerprint: 'fingerprint', status: 'passed',
    commands: requiredCommands.map(name => ({ name, exitCode: 0 })),
    native: {
      projectLaunchValidated: true, sourceFingerprint: 'fingerprint', environment: { devtoolsVersion: 'fixture', sdkVersion: 'fixture' },
      checks: requiredScenarios.map(name => ({ name, status: 'passed' })),
    },
  };
}
const validate = report => validateEvidence(report, '0.7.0', 'fingerprint');
describe('release evidence gate', () => {
  it('accepts complete matching evidence', () => expect(() => validate(evidence())).not.toThrow());
  it('rejects a missing required command even if overall status says passed', () => {
    const report = evidence(); report.commands.pop(); expect(() => validate(report)).toThrow('Missing/duplicate command');
  });
  it('rejects a blocked native scenario', () => {
    const report = evidence(); report.native.checks[0].status = 'blocked'; expect(() => validate(report)).toThrow('Failed scenario');
  });
  it('rejects missing native coverage', () => {
    const report = evidence(); report.native.checks.pop(); expect(() => validate(report)).toThrow('Missing/duplicate scenario');
  });
  it('rejects reports from a different source snapshot', () => {
    const report = evidence(); report.sourceFingerprint = 'old'; expect(() => validate(report)).toThrow('Code changed');
  });
  it('rejects endpoint-only validation and missing runtime versions', () => {
    const report = evidence(); report.native.projectLaunchValidated = false;
    expect(() => validate(report)).toThrow('project startup');
    report.native.projectLaunchValidated = true; report.native.environment.sdkVersion = null;
    expect(() => validate(report)).toThrow('Missing real runtime');
  });
});
