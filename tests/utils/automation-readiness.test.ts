import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkDevToolsRunning, waitForWebSocketReady } from '../../src/core/connection.js';

import { automationServer } from './automation-server.js';

describe('automation protocol readiness regressions F1/F2', () => {
  const servers: Awaited<ReturnType<typeof automationServer>>[] = [];
  afterEach(async () => { vi.restoreAllMocks(); for (const server of servers.splice(0)) await server.close(); });

  function expireAfterInfo(server: Awaited<ReturnType<typeof automationServer>>) {
    const startedAt = Date.now();
    // End the budget only after the fixture has answered, avoiding a final near-zero socket probe.
    vi.spyOn(Date, 'now').mockImplementation(() => startedAt + (server.methods.length ? 5000 : 0));
  }

  it('F2 recognizes a valid automation WebSocket despite HTTP 426', async () => {
    const server = await automationServer(); servers.push(server);
    expect(await checkDevToolsRunning(server.port)).toBe(true);
    expect(server.methods).toContain('Tool.getInfo');
  });

  it('F1 waits for SDKVersion and current page, not just a listening socket', async () => {
    let infoReads = 0;
    const server = await automationServer(method => method === 'Tool.getInfo'
      ? (++infoReads < 3 ? { version: '2.02.2607271' } : { version: '2.02.2607271', SDKVersion: '3.0.0' })
      : { pageId: 'ready-page', path: 'pages/home/index', query: {} });
    servers.push(server);
    await waitForWebSocketReady(server.port, 3000);
    expect(infoReads).toBeGreaterThanOrEqual(3);
    expect(server.methods).toContain('App.getCurrentPage');
  });

  it('F1 reports runtime readiness timeout when SDKVersion remains absent', async () => {
    const server = await automationServer(() => ({ version: '2.02.2607271' })); servers.push(server);
    expireAfterInfo(server);
    await expect(waitForWebSocketReady(server.port, 2000)).rejects.toThrow(/SDKVersion/);
  });

  it('accepts numeric page IDs returned by real DevTools, including zero', async () => {
    const server = await automationServer(method => method === 'Tool.getInfo'
      ? { version: '2.02.2607271', SDKVersion: '3.0.0' }
      : { pageId: 0, path: 'pages/home/index', query: {} });
    servers.push(server);
    await expect(waitForWebSocketReady(server.port, 2000)).resolves.toBeUndefined();
  });

  it('does not identify an ordinary HTTP 200 service as DevTools', async () => {
    const server = createServer((_request, response) => { response.end('hello'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing port');
    try { expect(await checkDevToolsRunning(address.port, 200)).toBe(false); }
    finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('closes probe transports after success and failed readiness', async () => {
    const server = await automationServer(); servers.push(server);
    await waitForWebSocketReady(server.port, 2000);
    await vi.waitFor(() => expect(server.wire.clients.size).toBe(0));
    const pending = await automationServer(() => ({ version: '2.02.2607271' })); servers.push(pending);
    expireAfterInfo(pending);
    await expect(waitForWebSocketReady(pending.port, 2000)).rejects.toThrow('SDKVersion');
    vi.restoreAllMocks();
    await vi.waitFor(() => expect(pending.wire.clients.size).toBe(0));
  });

  it('rejects unrelated WebSocket services', async () => {
    const server = await automationServer(() => ({ hello: 'world' })); servers.push(server);
    expect(await checkDevToolsRunning(server.port)).toBe(false);
  });
});
