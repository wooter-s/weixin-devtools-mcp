import vm from 'node:vm';

import type { MiniProgram } from 'miniprogram-automator';
import { vi } from 'vitest';

export function runtime() {
  const task = { abort: vi.fn(), onHeadersReceived: vi.fn(), onProgressUpdate: vi.fn() };
  const native = vi.fn(function(options: { success?: ((...args: any[]) => any); complete?: ((...args: any[]) => any) }) {
    options.success?.call(task, { statusCode: 200, data: 'ok' }, 'extra');
    options.complete?.call(task, { errMsg: 'ok' });
    return task;
  });
  const wx = {};
  for (const name of ['request', 'uploadFile', 'downloadFile']) {
    Object.defineProperty(wx, name, { value: native, configurable: true, enumerable: true, writable: false });
  }
  const remoteConsole = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const sandbox = vm.createContext({ wx, console: remoteConsole, getApp: () => ({}) });
  const mini = {
    evaluate: vi.fn(async (fn: ((...args: any[]) => any), ...args: object[]) => {
      sandbox.__args = args;
      return vm.runInContext(`(${fn.toString()})(...__args)`, sandbox);
    }),
    mockWxMethod: vi.fn(async () => { throw new Error('SDK mock changes request semantics'); }),
    restoreWxMethod: vi.fn(async () => {}),
    on: vi.fn((_event: string, _handler: ((...args: any[]) => any)) => {}), off: vi.fn(), disconnect: vi.fn(), currentPage: vi.fn(async () => null),
  };
  return { mini: mini as unknown as MiniProgram, calls: mini, sandbox, wx, task, native, remoteConsole };
}

