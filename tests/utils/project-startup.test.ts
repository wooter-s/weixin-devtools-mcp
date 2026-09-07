import type * as ChildProcessModule from 'node:child_process';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { PassThrough } from 'node:stream';

import automator from 'miniprogram-automator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectStartup } from '../../src/connection/project-startup.js';
import { connectDevtools } from '../../src/core/connection.js';

import { automationServer } from './automation-server.js';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), close: vi.fn() }));
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof ChildProcessModule>(),
  spawn: mocks.spawn,
  execFile: mocks.close,
}));
vi.mock('miniprogram-automator', () => ({ default: { connect: vi.fn(), launch: vi.fn() } }));

async function freePort() {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

describe('owned project startup', () => {
  const servers: Awaited<ReturnType<typeof automationServer>>[] = [];
  let infos = 0;
  let exitCode = 0;
  let ready = true;
  beforeEach(() => {
    vi.clearAllMocks(); infos = 0; exitCode = 0; ready = true;
    mocks.close.mockImplementation((_file, _args, _options, callback) => callback(null, '', ''));
    mocks.spawn.mockImplementation((_file, args: string[]) => {
      const child = Object.assign(new EventEmitter(), {
        pid: 123, stdout: new PassThrough(), stderr: new PassThrough(),
        exitCode: null as number | null, signalCode: null as string | null,
        kill: vi.fn(() => { child.signalCode = 'SIGTERM'; child.emit('exit', null, 'SIGTERM'); return true; }),
      });
      void (async () => {
        if (exitCode === 0) {
          const server = await automationServer(method => method === 'Tool.getInfo'
            ? (++infos >= 3 && ready ? { version: '2.02.2607271', SDKVersion: '3.0.0' } : { version: '2.02.2607271' })
            : { pageId: 'p', path: 'pages/home/index', query: {} }, Number(args.at(-1)));
          servers.push(server);
        }
        child.stderr.write(exitCode ? 'fixture CLI failure' : '');
        child.exitCode = exitCode;
        child.emit('exit', exitCode, null);
      })();
      return child;
    });
  });
  afterEach(async () => { vi.restoreAllMocks(); for (const server of servers.splice(0)) await server.close(); });

  it('waits for runtime readiness before SDK connect; never installs collectors', async () => {
    const page = { path: 'pages/home/index' };
    const mini = { currentPage: vi.fn(async () => page), evaluate: vi.fn(), mockWxMethod: vi.fn(), disconnect: vi.fn() };
    vi.mocked(automator.connect).mockImplementation(async () => { expect(infos).toBeGreaterThanOrEqual(3); return mini as never; });
    const result = await connectDevtools({ projectPath: process.cwd(), cliPath: 'fixture-cli', port: await freePort(), timeout: 2000 });
    expect(result.pagePath).toBe(page.path);
    expect(automator.launch).not.toHaveBeenCalled();
    expect(mini.evaluate).not.toHaveBeenCalled(); expect(mini.mockWxMethod).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('disconnects a candidate whose current page disappears', async () => {
    const mini = { currentPage: vi.fn(async () => null), disconnect: vi.fn() };
    vi.mocked(automator.connect).mockResolvedValue(mini as never);
    await expect(connectDevtools({ projectPath: process.cwd(), cliPath: 'fixture-cli', port: await freePort(), timeout: 2000 })).rejects.toThrow('无法获取当前页面');
    expect(mini.disconnect).toHaveBeenCalledOnce(); expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('keeps owned endpoint across launch/connect attempts after an SDK failure', async () => {
    const startup = new ProjectStartup();
    const options = { projectPath: process.cwd(), cliPath: 'fixture-cli', autoPort: await freePort(), timeout: 2000 };
    vi.mocked(automator.connect).mockRejectedValueOnce(new Error('transient SDK failure'))
      .mockResolvedValueOnce({ currentPage: async () => ({ path: 'pages/home/index' }) } as never);
    try {
      await expect(startup.connect({ ...options, mode: 'launch' })).rejects.toThrow('transient SDK failure');
      expect((await startup.connect({ ...options, mode: 'connect' })).connectionMode).toBe('connect');
      expect(mocks.spawn).toHaveBeenCalledOnce(); startup.commit();
    } finally { await startup.dispose(); }
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('disconnects a late SDK candidate without closing a later project again', async () => {
    const startup = new ProjectStartup();
    const mini = { currentPage: vi.fn(async () => ({ path: 'pages/home/index' })), disconnect: vi.fn() };
    let finishConnect!: (value: never) => void;
    vi.mocked(automator.connect).mockImplementationOnce(() => new Promise(resolve => { finishConnect = resolve; }));
    const connecting = startup.connect({ projectPath: process.cwd(), cliPath: 'fixture-cli', autoPort: await freePort(), timeout: 2000 });
    const rejected = expect(connecting).rejects.toThrow('项目启动总预算已耗尽');
    await vi.waitFor(() => expect(automator.connect).toHaveBeenCalledOnce());
    await startup.dispose();
    expect(mocks.close).toHaveBeenCalledOnce();
    finishConnect(mini as never);
    await rejected;
    expect(mini.disconnect).toHaveBeenCalledOnce();
    expect(mini.currentPage).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('preserves CLI failure and does not claim an unsuccessful launch', async () => {
    exitCode = 1;
    await expect(connectDevtools({ projectPath: process.cwd(), cliPath: 'fixture-cli', port: await freePort(), timeout: 500 })).rejects.toThrow('fixture CLI failure');
    expect(automator.connect).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled();
  });

  it('reports missing SDKVersion and closes only the owned project on timeout', async () => {
    ready = false;
    const now = Date.now.bind(Date);
    // Expire the budget only after a real protocol response, not during socket startup.
    vi.spyOn(Date, 'now').mockImplementation(() => now() + (infos > 0 ? 5000 : 0));
    await expect(connectDevtools({ projectPath: process.cwd(), cliPath: 'fixture-cli', port: await freePort(), timeout: 2000 })).rejects.toThrow('SDKVersion');
    expect(infos).toBeGreaterThan(0);
    expect(automator.connect).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledOnce();
  });
});
