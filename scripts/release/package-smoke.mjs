import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const execute = promisify(execFile);
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run with npm run test:package');
const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'weixin-package-'));
const runNpm = (args, cwd) => execute(process.execPath, [npmCli, ...args], { cwd, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
try {
  const packedOutput = (await runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], root)).stdout;
  // npm may print prepare output before the pack JSON, even with --ignore-scripts.
  const jsonStart = packedOutput.search(/^\[\s*$/m);
  assert.ok(jsonStart >= 0, 'npm pack did not return a JSON file list');
  const packed = JSON.parse(packedOutput.slice(jsonStart))[0];
  for (const required of ['build/server.js', 'build/protocol/tool-descriptors.generated.json', 'README.md', 'README.zh-CN.md', 'LICENSE']) {
    assert.ok(packed.files.some(file => file.path === required), `Missing packed file: ${required}`);
  }
  assert.ok(packed.files.every(file => !/^(tests|tasks|playground|\.github)\//.test(file.path)), 'Unexpected development files in package');
  await writeFile(path.join(temporary, 'package.json'), '{"private":true}\n');
  await runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', path.join(temporary, packed.filename)], temporary);
  const entry = path.join(temporary, 'node_modules', pkg.name, 'build/server.js');
  for (const [profile, count] of [['minimal', 10], ['core', 20], ['full', 31]]) {
    const client = new Client({ name: 'package-smoke', version: '1.0.0' });
    const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => typeof value === 'string' && !key.startsWith('WEIXIN_MCP_')));
    const transport = new StdioClientTransport({ command: process.execPath, args: [entry, `--tools-profile=${profile}`], cwd: temporary, env, stderr: 'pipe' });
    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion()?.version, pkg.version);
      assert.equal((await client.listTools()).tools.length, count);
      assert.equal((await client.listResources()).resources.length, 2);
      const status = await client.callTool({ name: 'get_connection_status', arguments: {} });
      assert.equal(status.structuredContent?.schemaVersion, '2.0');
      assert.equal(status.structuredContent?.ok, true);
      const resource = await client.readResource({ uri: 'weixin://connection/status' });
      assert.equal(JSON.parse(resource.contents[0].text).connected, false);
      console.log(`PASS packed ${pkg.version}: ${profile}=${count}, disconnected status, resources`);
    } finally { await client.close(); }
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
