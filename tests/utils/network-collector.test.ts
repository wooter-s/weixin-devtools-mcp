import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import { NetworkCollector } from '../../src/collectors/NetworkCollector.js';
import { networkRuntime } from '../../src/collectors/network-runtime.js';

import { runtime } from './runtime-fixture.js';

describe('NetworkCollector remote lifecycle', () => {
  it('repeated install is idempotent and stop restores all descriptors', async () => {
    const r = runtime();
    const before = Object.getOwnPropertyDescriptors(r.wx);
    const collector = new NetworkCollector();
    await collector.startRemoteMonitoring(r.mini);
    const wrapped = Object.getOwnPropertyDescriptors(r.wx);
    await collector.startRemoteMonitoring(r.mini);
    expect(Object.getOwnPropertyDescriptor(r.wx, 'request')).toEqual(wrapped.request);
    expect(r.calls.evaluate).toHaveBeenCalledOnce();
    vm.runInContext("wx.request({ url: 'local' }); wx.uploadFile({ url: 'local' })", r.sandbox);
    expect(await collector.stopRemoteMonitoring({ clearLogs: true })).toBe(2);
    for (const name of Object.keys(before)) expect(Object.getOwnPropertyDescriptor(r.wx, name)).toEqual(before[name]);
    expect(collector.isMonitoring()).toBe(false);
  });

  it('partial install failure rolls back previously installed methods', async () => {
    const r = runtime();
    Object.defineProperty(r.wx, 'uploadFile', { configurable: false });
    const collector = new NetworkCollector();
    await expect(collector.startRemoteMonitoring(r.mini)).rejects.toThrow();
    expect(Object.getOwnPropertyDescriptor(r.wx, 'request')?.value).toBe(r.native);
    expect(collector.isMonitoring()).toBe(false);
  });

  it('aborted late installation rolls back and excludes another start until settled', async () => {
    const r = runtime();
    const execute = r.calls.evaluate.getMockImplementation()!;
    let release!: () => void;
    r.calls.evaluate.mockImplementationOnce(async (...args) => {
      await new Promise<void>(resolve => { release = resolve; });
      return execute(...args);
    });
    const collector = new NetworkCollector();
    const abort = new AbortController();
    const start = collector.startRemoteMonitoring(r.mini, { signal: abort.signal });
    abort.abort(new Error('deadline'));
    await expect(collector.startRemoteMonitoring(r.mini)).rejects.toThrow('尚未收敛');
    release();
    await expect(start).rejects.toThrow('deadline');
    expect(Object.getOwnPropertyDescriptor(r.wx, 'request')?.value).toBe(r.native);
    await collector.startRemoteMonitoring(r.mini);
    expect(collector.isMonitoring()).toBe(true);
    await collector.stopRemoteMonitoring();
  });

  it('failed restoration can be retried', async () => {
    const r = runtime();
    const collector = new NetworkCollector();
    await collector.startRemoteMonitoring(r.mini);
    r.calls.evaluate.mockRejectedValueOnce(new Error('restore failed'));
    await expect(collector.stopRemoteMonitoring()).rejects.toThrow('restore failed');
    expect(collector.isMonitoring()).toBe(false);
    await collector.stopRemoteMonitoring();
    expect(Object.getOwnPropertyDescriptor(r.wx, 'request')?.value).toBe(r.native);
  });

  it('late stop cannot remove a new runtime owner or third-party replacement', async () => {
    const r = runtime();
    await r.mini.evaluate(networkRuntime, { action: 'install', owner: 'old' });
    await r.mini.evaluate(networkRuntime, { action: 'install', owner: 'new' });
    const current = Object.getOwnPropertyDescriptor(r.wx, 'request')?.value;
    await r.mini.evaluate(networkRuntime, { action: 'stop', owner: 'old' });
    expect(Object.getOwnPropertyDescriptor(r.wx, 'request')?.value).toBe(current);
    const thirdParty = vi.fn();
    Object.defineProperty(r.wx, 'request', { value: thirdParty });
    await r.mini.evaluate(networkRuntime, { action: 'stop', owner: 'new' });
    expect(Object.getOwnPropertyDescriptor(r.wx, 'request')?.value).toBe(thirdParty);
  });

  it('stop during a pending start restores the completed installation', async () => {
    const r = runtime();
    const execute = r.calls.evaluate.getMockImplementation()!;
    let release!: () => void;
    r.calls.evaluate.mockImplementationOnce(async (...args) => {
      await new Promise<void>(resolve => { release = resolve; });
      return execute(...args);
    });
    const collector = new NetworkCollector();
    const start = collector.startRemoteMonitoring(r.mini);
    const stop = collector.stopRemoteMonitoring();
    release();
    await start;
    await stop;
    expect(Object.getOwnPropertyDescriptor(r.wx, 'request')?.value).toBe(r.native);
  });

  it('remote read errors propagate and request ids update in place', async () => {
    const r = runtime();
    const collector = new NetworkCollector();
    await collector.startRemoteMonitoring(r.mini);
    r.calls.evaluate.mockRejectedValueOnce(new Error('connection lost'));
    await expect(collector.syncFromRemote(true)).rejects.toThrow('connection lost');
    const row = { id: 'one', type: 'request' as const, url: 'local', timestamp: new Date().toISOString(), success: false };
    const id = collector.addRequest(row);
    expect(collector.addRequest({ ...row, success: true })).toBe(id);
    expect(collector.getCurrentCount()).toBe(1);
    await collector.stopRemoteMonitoring();
  });
});

it('retains rollback ownership when install response and rollback transport both fail', async () => {
  const r = runtime();
  const execute = r.calls.evaluate.getMockImplementation()!;
  r.calls.evaluate.mockImplementationOnce(async (...args) => {
    await execute(...args);
    throw new Error('install response lost');
  }).mockRejectedValueOnce(new Error('rollback transport lost'));
  const collector = new NetworkCollector();
  await expect(collector.startRemoteMonitoring(r.mini)).rejects.toThrow('回滚未完成');
  expect(collector.isMonitoring()).toBe(false);
  await collector.stopRemoteMonitoring();
  expect(Object.getOwnPropertyDescriptor(r.wx, 'request')?.value).toBe(r.native);
});
