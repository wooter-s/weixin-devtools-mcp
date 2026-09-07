import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import { MiniProgramContext } from '../../src/MiniProgramContext.js';
import { ConsoleCollector } from '../../src/collectors/ConsoleCollector.js';
import { NetworkCollector } from '../../src/collectors/NetworkCollector.js';
import { consoleRuntime } from '../../src/collectors/console-runtime.js';
import { ToolCategory } from '../../src/config/tool-category.js';

import { runtime } from './runtime-fixture.js';

describe('runtime monitoring transparency', () => {
  it('installs configurable read-only methods without SDK mock and returns the native task', async () => {
    const r = runtime();
    const collector = new NetworkCollector();
    await collector.startRemoteMonitoring(r.mini);
    const success = vi.fn();
    const complete = vi.fn();
    r.sandbox.options = { url: 'http://local/test', success, complete };
    expect(vm.runInContext('wx.request(options)', r.sandbox)).toBe(r.task);
    expect(success).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith({ statusCode: 200, data: 'ok' }, 'extra');
    expect(success.mock.instances[0]).toBe(r.task);
    expect(complete).toHaveBeenCalledOnce();
    await collector.syncFromRemote(true);
    expect(collector.getCurrentCount()).toBe(1);
    await collector.stopRemoteMonitoring();
    expect(Object.getOwnPropertyDescriptor(r.wx, 'request')?.value).toBe(r.native);
    expect(r.calls.mockWxMethod).not.toHaveBeenCalled();
  });

  it('automatic console collection does not subscribe to SDK console events', async () => {
    const r = runtime();
    const context = MiniProgramContext.create({ toolProfile: {
      profile: 'full', activeToolCount: 31, disabledToolCount: 0,
      activeCategories: [ToolCategory.CORE, ToolCategory.CONSOLE], inactiveCategories: [],
    } });
    await context.setMiniProgram(r.mini);
    await context.startAutomaticMonitoring();
    expect(r.calls.on.mock.calls.map(call => call[0])).not.toContain('console');
    await context.disconnectDevtools();
  });
});


describe('network callback and Mpx contracts', () => {
  for (const name of ['request', 'uploadFile', 'downloadFile']) {
    for (const outcome of ['success', 'fail']) {
      it(`${name} preserves ${outcome}, complete, task methods and options in three phases`, async () => {
        const r = runtime();
        r.sandbox.methodName = name;
        r.sandbox.outcome = outcome;
        vm.runInContext(`
          globalThis.result = { statusCode: 200, data: 'bytes', errMsg: 'test', tempFilePath: '/download' };
          globalThis.task = { abort() { return this; }, onProgressUpdate() { return this; }, onHeadersReceived() { return this; } };
          Object.defineProperty(wx, methodName, { value: function(options) {
            options[outcome].call(task, result, result);
            options.complete.call(task, result);
            return task;
          } });
        `, r.sandbox);
        const collector = new NetworkCollector();
        for (const phase of ['before', 'during', 'after']) {
          if (phase === 'during') await collector.startRemoteMonitoring(r.mini);
          if (phase === 'after') await collector.stopRemoteMonitoring();
          const result = vm.runInContext(`(() => {
            const calls = [];
            const callback = function(...args) { calls.push({ same: this === task, args: args.every(a => a === result), count: args.length }); };
            const options = Object.freeze({ url: 'local/${name}', data: 'body', success: callback, fail: callback, complete: callback });
            const returned = wx[methodName](options);
            return { calls, sameTask: returned === task, abort: returned.abort() === task, progress: returned.onProgressUpdate() === task, unchanged: options.success === callback };
          })()`, r.sandbox);
          expect(result).toEqual({ calls: [{ same: true, args: true, count: 2 }, { same: true, args: true, count: 1 }], sameTask: true, abort: true, progress: true, unchanged: true });
        }
        expect(collector.getRequests()).toHaveLength(1);
        expect(collector.getRequests()[0].success).toBe(outcome === 'success');
      });
    }
  }

  it('callback exceptions propagate once and collection errors do not prevent callbacks', async () => {
    const r = runtime();
    const collector = new NetworkCollector();
    await collector.startRemoteMonitoring(r.mini);
    const error = new Error('business callback');
    const callback = vi.fn(() => { throw error; });
    r.sandbox.options = { url: 'local', success: callback };
    expect(() => vm.runInContext('wx.request(options)', r.sandbox)).toThrow(error);
    expect(callback).toHaveBeenCalledOnce();
    vm.runInContext('wx.__networkLogs = Object.freeze([])', r.sandbox);
    const good = vi.fn();
    r.sandbox.options = { url: 'local', success: good };
    expect(vm.runInContext('wx.request(options)', r.sandbox)).toBe(r.task);
    expect(good).toHaveBeenCalledOnce();
    await collector.stopRemoteMonitoring();
  });

  for (const cached of [true, false]) {
    it(`Mpx adapter preserves original Promise and deduplicates layers (cached=${cached})`, async () => {
      const r = runtime();
      vm.runInContext(`
        const cachedRequest = wx.request;
        globalThis.app = { $xfetch: { requestAdapter(config) {
          globalThis.originalPromise = new Promise((resolve, reject) => {
            const success = config.success;
            config.success = function(res) { success?.call(this, res); resolve(res); };
            config.fail = reject;
            (${cached ? 'cachedRequest' : 'wx.request'})(config);
          });
          return originalPromise;
        } } };
        globalThis.getApp = () => app;
      `, r.sandbox);
      const collector = new NetworkCollector();
      await collector.startRemoteMonitoring(r.mini);
      const promise = vm.runInContext("app.$xfetch.requestAdapter({ url: 'local/mpx' })", r.sandbox);
      expect(promise).toBe(r.sandbox.originalPromise);
      await expect(promise).resolves.toMatchObject({ data: 'ok' });
      await collector.syncFromRemote(true);
      expect(collector.getRequests()).toHaveLength(1);
      await collector.stopRemoteMonitoring();
    });
  }
});

describe('console queue semantics', () => {
  it('five reconnects collect each call once, retaining identical texts and stable ids', async () => {
    const r = runtime();
    const collector = new ConsoleCollector();
    for (let round = 0; round < 5; round++) {
      await collector.startRemoteMonitoring(r.mini);
      await collector.startRemoteMonitoring(r.mini);
      vm.runInContext("console.log('same'); console.log('same'); console.warn('warn'); console.error('error')", r.sandbox);
      await Promise.all([collector.syncFromRemote(), collector.syncFromRemote()]);
      expect(collector.getMessages()).toHaveLength(4);
      expect(collector.getMessages({ types: ['log'] })).toHaveLength(2);
      const row = collector.getMessages()[0];
      expect(collector.getMessageById(row.msgid!)).toBe(row);
      await collector.stopRemoteMonitoring();
      collector.splitAfterNavigation();
      expect(r.remoteConsole.log).toHaveBeenCalledTimes((round + 1) * 2);
    }
    expect(collector.getMessages({ includePreserved: true }).length).toBeGreaterThan(0);
    expect(r.calls.on).not.toHaveBeenCalled();
    expect(vm.runInContext('console.log', r.sandbox)).toBe(r.remoteConsole.log);
  });

  it('stop flushes remaining records, native exceptions propagate, and queues are bounded', async () => {
    const r = runtime();
    const collector = new ConsoleCollector();
    await collector.startRemoteMonitoring(r.mini);
    vm.runInContext("for (let i=0;i<1005;i++) console.log(i)", r.sandbox);
    await collector.syncFromRemote();
    expect(collector.getMessages()).toHaveLength(1000);
    expect(collector.getConsoleMessagesOnly()[0].args).toEqual([5]);
    vm.runInContext("console.warn('remaining')", r.sandbox);
    await collector.stopRemoteMonitoring();
    expect(collector.getMessages({ types: ['warn'] })).toHaveLength(1);
    r.remoteConsole.log.mockImplementationOnce(() => { throw new Error('native console'); });
    await collector.startRemoteMonitoring(r.mini);
    expect(() => vm.runInContext("console.log('throws')", r.sandbox)).toThrow('native console');
    await collector.stopRemoteMonitoring();
  });

  it('rollback and ownership checks preserve original and third-party methods', async () => {
    const r = runtime();
    Object.defineProperty(r.remoteConsole, 'warn', { configurable: false, writable: false });
    await expect(r.mini.evaluate(consoleRuntime, { action: 'install', owner: 'failure' })).rejects.toThrow();
    expect(vm.runInContext('console.log', r.sandbox)).toBe(r.remoteConsole.log);
    const next = runtime();
    await next.mini.evaluate(consoleRuntime, { action: 'install', owner: 'old' });
    await next.mini.evaluate(consoleRuntime, { action: 'install', owner: 'new' });
    const installed = vm.runInContext('console.log', next.sandbox);
    await next.mini.evaluate(consoleRuntime, { action: 'stop', owner: 'old' });
    expect(vm.runInContext('console.log', next.sandbox)).toBe(installed);
    const replacement = vi.fn();
    next.sandbox.replacement = replacement;
    vm.runInContext('console.log = replacement', next.sandbox);
    await next.mini.evaluate(consoleRuntime, { action: 'stop', owner: 'new' });
    expect(vm.runInContext('console.log', next.sandbox)).toBe(replacement);
  });
});

it('console late read after transport abandonment cannot repopulate cleared history', async () => {
  const r = runtime();
  const collector = new ConsoleCollector();
  await collector.startRemoteMonitoring(r.mini);
  vm.runInContext("console.log('old session')", r.sandbox);
  const execute = r.calls.evaluate.getMockImplementation()!;
  let release!: () => void;
  r.calls.evaluate.mockImplementationOnce(async (...args) => {
    const rows = await execute(...args);
    await new Promise<void>(resolve => { release = resolve; });
    return rows;
  });
  const sync = collector.syncFromRemote();
  await vi.waitFor(() => expect(release).toBeDefined());
  collector.abandonRemoteMonitoring();
  collector.clear();
  release();
  expect(await sync).toBe(0);
  expect(collector.getTotalCount()).toBe(0);
  await collector.startRemoteMonitoring(r.mini);
  await collector.stopRemoteMonitoring();
});
