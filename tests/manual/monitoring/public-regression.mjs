/* global wx, getCurrentPages, process, console, Buffer, WebSocket, setTimeout, clearTimeout */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { defaultCliPath } from '../../../build/connection/project-startup.js';
import { requiredScenarios, sourceFingerprint } from '../../../scripts/release/evidence.mjs';
import { networkSamples } from './samples.mjs';

const directory = path.resolve(process.env.MONITORING_REPORT_DIR || 'artifacts/native-validation');
await mkdir(directory, { recursive: true });
const scratch = await mkdtemp(path.join(os.tmpdir(), 'weixin-public-'));
const project = path.join(scratch, 'app');
await cp(path.resolve(process.env.INTEGRATION_PROJECT_PATH || 'tests/fixtures/monitoring-app'), project, { recursive: true, filter: file => !file.endsWith('project.private.config.json') });
if (process.env.INTEGRATION_APPID) {
  const configPath = path.join(project, 'project.config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.appid = process.env.INTEGRATION_APPID;
  await writeFile(configPath, JSON.stringify(config, null, 2));
}
const cli = process.env.INTEGRATION_CLI_PATH || defaultCliPath();
const external = process.env.INTEGRATION_FIXTURE_WS_ENDPOINT;
const checks = [];
const clients = new Set();
let owned = false;
let endpoint;
const environment = { platform: os.platform(), arch: os.arch(), node: process.version, devtoolsVersion: null, sdkVersion: null };
const fingerprint = sourceFingerprint();
const payload = 'MCP-file-content-中文-2026';
const http = createServer(async (req, res) => {
  if (req.url === '/json/version') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ webSocketDebuggerUrl: endpoint })); return; }
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  if (req.url.startsWith('/failure')) { req.socket.destroy(); return; }
  if (req.url.startsWith('/slow')) await new Promise(resolve => setTimeout(resolve, 800));
  if (res.destroyed) return;
  if (req.url.startsWith('/download')) { res.end(payload); return; }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(req.url.startsWith('/upload') ? { payloadMatched: Buffer.concat(chunks).includes(Buffer.from(payload)), formMatched: Buffer.concat(chunks).includes(Buffer.from('mcp-upload')) } : { ok: true, text: 'mcp-response' }));
});
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${http.address().port}`;
async function open(profile) {
  const client = new Client({ name: 'public-fixture-validation', version: '1.0.0' });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => typeof value === 'string' && !key.startsWith('WEIXIN_MCP_')));
  clients.add(client);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['build/server.js', `--tools-profile=${profile}`], env, stderr: 'pipe' }));
  return client;
}
async function call(client, name, args = {}, failure = false) {
  const raw = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  const e = raw.structuredContent;
  assert.equal(e?.schemaVersion, '2.0');
  assert.deepEqual(Object.keys(e).sort(), ['schemaVersion', 'ok', 'code', 'data', 'error', 'partialData', 'observation', 'warnings', 'nextActions', 'meta'].sort());
  assert.equal(e.ok, !failure, `${name}: ${e.code} ${e.error?.message || ''}`);
  assert.equal(raw.isError === true, failure);
  return { ...e, raw };
}
const target = (...ids) => ({ kind: 'path', path: ids.map(value => ({ kind: 'id', value })) });
const evaluate = async (client, fn, ...args) => (await call(client, 'evaluate_script', { function: `(...args) => (${fn.toString()})(...args)`, args })).data.result;
async function check(name, action) {
  try { const evidence = await action(); checks.push({ name, status: 'passed', evidence: evidence ?? null }); }
  catch (error) { checks.push({ name, status: name === 'project-startup' ? 'blocked' : 'failed', evidence: error.message.replaceAll(scratch, '<fixture>') }); }
  console.log(JSON.stringify(checks.at(-1)));
}
async function disconnect(client) { await call(client, 'disconnect_devtools'); await client.close(); clients.delete(client); }
let client;
try {
  await check('profiles', async () => {
    for (const [profile, count] of [['minimal', 10], ['core', 20], ['full', 31]]) {
      const c = await open(profile); assert.equal((await c.listTools()).tools.length, count); await c.close(); clients.delete(c);
    }
  });
  client = await open('core');
  await check('project-startup', async () => {
    // A copied public fixture makes project cleanup independent of the maintainer's existing projects.
    await call(client, 'connect_devtools', { target: external ? { kind: 'wsEndpoint', endpoint: external } : { kind: 'project', projectPath: project, cliPath: cli }, timeoutMs: 45000, healthCheck: false });
    owned = !external;
    endpoint = (await call(client, 'get_connection_status')).data.endpoint;
    const info = await evaluate(client, () => wx.getSystemInfoSync());
    environment.sdkVersion = info.SDKVersion;
    const socket = new WebSocket(endpoint);
    environment.devtoolsVersion = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('Tool.getInfo timeout')); }, 5000);
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 'release-version', method: 'Tool.getInfo', params: {} })));
      socket.addEventListener('message', event => { const reply = JSON.parse(event.data); if (reply.id === 'release-version') { clearTimeout(timer); socket.close(); resolve(reply.result?.version); } });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Tool.getInfo failed')); });
    });
    assert.ok(environment.devtoolsVersion && environment.sdkVersion);
  });
  if (!checks.find(check => check.name === 'project-startup' && check.status === 'passed')) throw new Error('Public fixture runtime unavailable');
  const baseline = await evaluate(client, networkSamples, base, 'before');
  await disconnect(client); client = await open('full');
  await call(client, 'connect_devtools', { target: { kind: 'wsEndpoint', endpoint }, healthCheck: false });
  await call(client, 'relaunch', { url: '/pages/home/index' });
  await check('resources', async () => {
    assert.equal((await client.listResources()).resources.length, 2);
    assert.equal(JSON.parse((await client.readResource({ uri: 'weixin://connection/status' })).contents[0].text).connected, true);
  });
  await check('snapshot-scopes', async () => {
    const e = await call(client, 'get_page_snapshot'); assert.ok(e.observation);
    const snapshot = JSON.parse((await client.readResource({ uri: 'weixin://page/snapshot' })).contents[0].text);
    assert.ok(snapshot.scopes.length > 1 && snapshot.edges.length > 0);
    await call(client, 'assert_text', { target: target('card', 'inside'), text: 'Scoped content' });
  });
  let ref;
  await check('ref-path', async () => {
    const e = await call(client, 'find_elements', { locator: { kind: 'id', value: 'increment' } });
    ref = e.data.elements[0].ref; assert.ok(ref);
    assert.equal((await call(client, 'get_value', { target: { kind: 'ref', ref }, attribute: 'id' })).data.value, 'increment');
  });
  await check('click', async () => {
    await call(client, 'click', { target: target('increment') });
    await call(client, 'assert_text', { target: target('count'), text: '1' });
  });
  await check('input', async () => {
    for (const [mode, text, expected] of [['replace', 'hello', 'hello'], ['append', ' world', 'hello world'], ['clear', undefined, '']]) {
      await call(client, 'input_text', { target: target('input'), mode, ...(text ? { text } : {}) });
      assert.equal((await call(client, 'get_value', { target: target('input') })).data.value, expected);
    }
  });
  await check('controls', async () => {
    for (const [id, value, field] of [['switch', true, 'checked'], ['slider', 42, 'slider'], ['picker', 1, 'picker']]) {
      await call(client, 'set_form_control', { target: target(id), value });
      const data = await evaluate(client, () => getCurrentPages().at(-1).data); assert.equal(String(data[field]), String(value));
    }
  });
  await check('assertions', async () => {
    await call(client, 'assert_attribute', { target: target('title'), attributeKey: 'class', attributeValue: 'fixture-title' });
    await call(client, 'assert_state', { target: target('increment'), enabled: true });
    await call(client, 'assert_text', { target: target('title'), text: 'deliberately incorrect' }, true);
    await call(client, 'assert_attribute', { target: target('title'), attributeKey: 'class', attributeValue: 'incorrect' }, true);
    await call(client, 'assert_state', { target: target('disabled'), enabled: true }, true);
  });
  await check('wait', async () => {
    await call(client, 'wait_for', { target: target('title'), timeout: 2000 });
    const missing = await call(client, 'wait_for', { target: target('not-present'), timeout: 200 }, true); assert.equal(missing.code, 'TIMEOUT');
  });
  await check('navigation', async () => {
    await call(client, 'navigate_to', { url: '/subpackages/test/pages/detail/index?from=validation' });
    await call(client, 'assert_text', { target: target('subpackage-title'), text: 'Public subpackage' });
    await call(client, 'navigate_back');
    await call(client, 'navigate_to', { url: '/pages/detail/index' });
    await call(client, 'navigate_back');
    await call(client, 'switch_tab', { url: '/pages/tab/index' });
    await call(client, 'relaunch', { url: '/pages/home/index' });
  });
  await check('stale-ref', async () => {
    assert.ok(ref); assert.equal((await call(client, 'get_value', { target: { kind: 'ref', ref } }, true)).code, 'STALE_ELEMENT');
  });
  await check('script', async () => {
    assert.equal(await evaluate(client, () => 42), 42);
    assert.equal((await call(client, 'evaluate_script', { function: 'async function test() { return await Promise.resolve(42); }' })).data.result, 42);
    await call(client, 'evaluate_script', { function: '() => { throw new Error("fixture-error"); }' }, true);
  });
  await check('screenshot', async () => {
    const e = await call(client, 'screenshot'); const image = e.raw.content.find(content => content.type === 'image');
    const bytes = Buffer.from(image.data, 'base64'); assert.ok(bytes.length > 100); assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    await writeFile(path.join(directory, 'fixture.png'), bytes); return { mimeType: image.mimeType, bytes: bytes.length };
  });
  await check('network', async () => {
    for (const row of baseline) assert.deepEqual(row.callbacks, [[['success', 'upload', 'download'].includes(row.name) ? 'success' : 'fail', 1], ['complete', 1]]);
    assert.equal(baseline.find(row => row.name === 'download').content, payload);
    assert.equal(baseline.find(row => row.name === 'upload').data.payloadMatched, true);
    for (const phase of ['during', 'after']) {
      if (phase === 'after') await call(client, 'stop_network_monitoring');
      const rows = await evaluate(client, networkSamples, base, phase);
      const normalize = values => values.map(row => ({ ...row, error: undefined }));
      assert.deepEqual(normalize(rows), normalize(baseline));
      const requests = (await call(client, 'list_network_requests', { pageSize: 100, urlPattern: `case=${phase}-` })).data.requests;
      assert.equal(requests.length, phase === 'during' ? 6 : 0);
      if (requests.length) assert.ok((await call(client, 'get_network_request', { reqid: requests[0].reqid })).data);
    }
    await call(client, 'clear_network_requests', { clearRemote: true });
    assert.equal((await call(client, 'list_network_requests')).data.requests.length, 0);
  });
  await check('console-reconnect', async () => {
    for (let i = 0; i < 5; i++) {
      await call(client, 'reconnect_devtools');
      const marker = `fixture-reconnect-${i}`;
      await evaluate(client, text => { console.log(text); console.log(text); }, marker);
      const rows = (await call(client, 'list_console_messages', { pageSize: 100 })).data.messages.filter(row => row.args?.[0] === marker);
      assert.equal(rows.length, 2);
      assert.equal((await call(client, 'get_console_message', { msgid: rows[0].msgid })).data.message.args[0], marker);
    }
  });
  await check('diagnostics', async () => {
    for (const [name, args] of [['diagnose_connection', { projectPath: project }], ['check_environment', {}], ['debug_page_elements', {}], ['debug_connection_flow', { projectPath: project, dryRun: true }]]) {
      assert.ok((await call(client, name, args)).raw.content.some(item => item.type === 'text' && item.text.length));
    }
  });
  await check('endpoint-reconnect', async () => {
    await call(client, 'disconnect_devtools');
    assert.equal((await call(client, 'connect_devtools', { target: { kind: 'browserUrl', url: base } })).data.method, 'browserUrl');
    assert.equal((await call(client, 'reconnect_devtools', { target: { kind: 'wsEndpoint', endpoint } })).data.method, 'wsEndpoint');
  });
} catch (error) {
  console.error(error.message.replaceAll(scratch, '<fixture>'));
} finally {
  await check('cleanup', async () => {
    const failures = [];
    for (const c of clients) { try { await disconnect(c); } catch (error) { failures.push(error.message); try { await c.close(); } catch { /* Continue releasing resources. */ } } }
    if (owned) {
      try { await promisify(execFile)(cli, ['close', '--project', project], { timeout: 10000 }); } catch (error) { failures.push(error.message); }
    }
    http.closeAllConnections(); await new Promise(resolve => http.close(resolve));
    await rm(scratch, { recursive: true, force: true });
    assert.equal(failures.length, 0, failures.join('; '));
  });
  for (const name of requiredScenarios) if (!checks.some(check => check.name === name)) checks.push({ name, status: 'not-run', evidence: 'Prerequisite failed' });
  const report = { schemaVersion: 1, recordedAt: new Date().toISOString(), sourceFingerprint: fingerprint, projectLaunchValidated: owned, environment, status: checks.every(check => check.status === 'passed') ? 'passed' : 'failed', checks };
  await writeFile(path.join(directory, 'native.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
