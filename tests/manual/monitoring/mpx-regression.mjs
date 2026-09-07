/* global process, setTimeout */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mpxSamples } from './samples.mjs';

const endpoint = process.env.INTEGRATION_MPX_WS_ENDPOINT;
if (!endpoint) throw new Error('Set INTEGRATION_MPX_WS_ENDPOINT to a real Mpx project exposing getApp().$xfetch; this check is separate from native release validation.');
const output = path.resolve(process.env.MONITORING_REPORT_DIR || 'artifacts/mpx-validation');
await mkdir(output, { recursive: true });
const checks = [];
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/failure')) { req.socket.destroy(); return; }
  if (req.url.startsWith('/slow')) await new Promise(resolve => setTimeout(resolve, 800));
  if (!res.destroyed) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let client;
async function call(name, args = {}) {
  const raw = await client.callTool({ name, arguments: args });
  assert.equal(raw.structuredContent?.ok, true, `${name}: ${raw.structuredContent?.error?.message}`);
  return raw.structuredContent;
}
try {
  let baseline;
  for (const phase of ['before', 'during', 'after']) {
    if (phase !== 'after') {
      if (client) { await call('disconnect_devtools'); await client.close(); }
      client = new Client({ name: 'mpx-compatibility', version: '1.0.0' });
      const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => typeof value === 'string' && !key.startsWith('WEIXIN_MCP_')));
      await client.connect(new StdioClientTransport({ command: process.execPath, args: ['build/server.js', `--tools-profile=${phase === 'before' ? 'core' : 'full'}`], env, stderr: 'pipe' }));
      await call('connect_devtools', { target: { kind: 'wsEndpoint', endpoint }, healthCheck: false });
    } else await call('stop_network_monitoring');
    const result = (await call('evaluate_script', { function: `(...args) => (${mpxSamples.toString()})(...args)`, args: [base, phase] })).data.result;
    assert.deepEqual(result.map(row => row.ok), [true, false, false]);
    assert.equal(result[2].cancel, true);
    const normalized = result.map(row => ({ ...row, error: undefined }));
    if (phase === 'before') baseline = normalized; else assert.deepEqual(normalized, baseline);
    checks.push({ phase, status: 'passed' });
  }
} catch (error) { checks.push({ phase: 'runtime', status: 'failed', evidence: error.message }); }
finally {
  if (client) {
    try { await call('disconnect_devtools'); } catch (error) { checks.push({ phase: 'cleanup', status: 'failed', evidence: error.message }); }
    await client.close();
  }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  const passed = checks.length >= 3 && checks.every(check => check.status === 'passed');
  await writeFile(path.join(output, 'mpx.json'), JSON.stringify({ recordedAt: new Date().toISOString(), status: passed ? 'passed' : 'failed', checks }, null, 2) + '\n');
  process.exitCode = passed ? 0 : 1;
}
