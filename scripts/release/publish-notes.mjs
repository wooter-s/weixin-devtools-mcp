/* global fetch, AbortSignal */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
let published;
for (let attempt = 0; attempt < 6; attempt++) {
  const response = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`, { signal: AbortSignal.timeout(10000) });
  if (response.ok) published = await response.json();
  if (published?.version === pkg.version) break;
  await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.equal(published?.version, pkg.version, 'Registry latest differs; npm may have published, inspect before retrying');
await execute('gh', ['release', 'create', `v${pkg.version}`, `docs/releases/v${pkg.version}.json`, '--verify-tag', '--title', `v${pkg.version}`, '--notes-file', 'docs/releases/notes.md']);
