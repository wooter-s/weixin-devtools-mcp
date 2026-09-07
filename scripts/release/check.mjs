import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sourceFingerprint, validateEvidence } from './evidence.mjs';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(process.env.GITHUB_REF_NAME ?? `v${pkg.version}`, `v${pkg.version}`, 'Tag must match package version');
const report = JSON.parse(await readFile(`docs/releases/v${pkg.version}.json`, 'utf8'));
validateEvidence(report, pkg.version, sourceFingerprint());
console.log(`PASS release evidence for ${pkg.version}`);
