/**
 * Console 功能集成测试（统一 Harness 版）
 */

import type { MiniProgram } from 'miniprogram-automator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MiniProgramContext } from '../../src/MiniProgramContext.js';

import { IntegrationHarness } from './helpers/integration-harness.js';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';

interface ConsoleEvent {
  type?: string;
  args?: unknown[];
}

interface ExceptionEvent {
  message?: string;
  stack?: string;
}

type ConsoleMiniProgram = MiniProgram & {
  on: (event: 'console', listener: (event: ConsoleEvent) => void) => void;
  on: (event: 'exception', listener: (event: ExceptionEvent) => void) => void;
  removeListener: (
    event: 'console' | 'exception',
    listener: ((event: ConsoleEvent) => void) | ((event: ExceptionEvent) => void)
  ) => void;
  removeAllListeners: (event?: 'console' | 'exception') => void;
  listenerCount: (event: 'console' | 'exception') => number;
  evaluate: <TResult>(fn: () => TResult | Promise<TResult>) => Promise<TResult>;
};

describe.skipIf(!shouldRun)('Console Integration Tests', () => {
  const harness = new IntegrationHarness({
    portCount: 4,
    connectRetries: 3,
    connectTimeoutMs: 60_000,
  });

  let context: MiniProgramContext | null = null;
  let miniProgram: ConsoleMiniProgram | null = null;
  let runtimeReady = false;

  async function ensureMiniProgram(): Promise<ConsoleMiniProgram | null> {
    if (!runtimeReady || !context) {
      return null;
    }

    const status = await context.getConnectionStatus({ refreshHealth: false });
    if (!status.connected) {
      try {
        await harness.reconnect(context, { timeoutMs: 60_000, healthCheck: false });
      } catch {
        runtimeReady = false;
        return null;
      }
    }

    const nextMiniProgram = context.miniProgram as ConsoleMiniProgram | null;
    miniProgram = nextMiniProgram;
    return nextMiniProgram;
  }

  beforeAll(async () => {
    const state = await harness.prepare();
    if (!state.ready) {
      console.warn(`[integration] 跳过 Console 测试: ${state.reason ?? '环境未就绪'}`);
      return;
    }

    context = MiniProgramContext.create();
    try {
      const connected = await harness.connect(context, {
        strategy: 'auto',
        timeoutMs: 60_000,
        healthCheck: false,
      });
      context = connected.context;
      miniProgram = context.miniProgram as ConsoleMiniProgram | null;
      runtimeReady = miniProgram !== null;
    } catch (error) {
      runtimeReady = false;
      console.warn(
        `[integration] Console 初始连接失败，后续用例将跳过: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, 180_000);

  afterAll(async () => {
    if (!context) {
      return;
    }

    if (miniProgram) {
      miniProgram.removeAllListeners('console');
      miniProgram.removeAllListeners('exception');
    }

    await harness.disconnect(context);
    context = null;
    miniProgram = null;
  }, 120_000);

  it('应该能够监听 console 日志', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    const messages: Array<{ type: string; args: unknown[] }> = [];
    const onConsole = (event: ConsoleEvent) => {
      messages.push({
        type: event.type ?? 'log',
        args: event.args ?? [],
      });
    };

    app.on('console', onConsole);
    try {
      await app.evaluate(() => {
        console.log('integration-console-log');
        console.warn('integration-console-warn');
        console.error('integration-console-error');
      });
      await new Promise(resolve => setTimeout(resolve, 1200));
      expect(messages.length).toBeGreaterThanOrEqual(1);
    } finally {
      app.removeListener('console', onConsole);
    }
  }, 90_000);

  it('应该能够监听 exception 异常', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    const exceptions: Array<{ message: string; stack?: string }> = [];
    const onException = (event: ExceptionEvent) => {
      exceptions.push({
        message: event.message ?? '',
        stack: event.stack,
      });
    };

    app.on('exception', onException);
    try {
      await app.evaluate(() => {
        setTimeout(() => {
          throw new Error('integration-exception-check');
        }, 50);
      });
      await new Promise(resolve => setTimeout(resolve, 1200));
      expect(exceptions.length).toBeGreaterThanOrEqual(1);
      expect(exceptions[0].message).toContain('integration-exception-check');
    } finally {
      app.removeListener('exception', onException);
    }
  }, 90_000);

  it('应该能够正确设置和清理多个监听器', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    const h1 = (_event: ConsoleEvent) => undefined;
    const h2 = (_event: ConsoleEvent) => undefined;
    const h3 = (_event: ExceptionEvent) => undefined;

    const initialConsoleCount = app.listenerCount('console');
    const initialExceptionCount = app.listenerCount('exception');

    app.on('console', h1);
    app.on('console', h2);
    app.on('exception', h3);

    expect(app.listenerCount('console')).toBe(initialConsoleCount + 2);
    expect(app.listenerCount('exception')).toBe(initialExceptionCount + 1);

    app.removeListener('console', h1);
    expect(app.listenerCount('console')).toBe(initialConsoleCount + 1);

    app.removeAllListeners('console');
    app.removeAllListeners('exception');

    expect(app.listenerCount('console')).toBe(0);
    expect(app.listenerCount('exception')).toBe(0);
  }, 60_000);

  it('应该支持两阶段查询（list -> get 详情）', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    let nextMsgId = 1;
    const messageMap = new Map<number, { type: string; args: unknown[] }>();
    const onConsole = (event: ConsoleEvent) => {
      const msgid = nextMsgId;
      nextMsgId += 1;
      messageMap.set(msgid, {
        type: event.type ?? 'log',
        args: event.args ?? [],
      });
    };

    app.on('console', onConsole);
    try {
      await app.evaluate(() => {
        console.log('two-phase-list');
        console.warn('two-phase-warn');
        console.error('two-phase-error');
      });
      await new Promise(resolve => setTimeout(resolve, 1200));

      const listRows = Array.from(messageMap.entries()).map(([msgid, payload]) => ({
        msgid,
        type: payload.type,
        preview: String(payload.args[0] ?? ''),
      }));

      expect(listRows.length).toBeGreaterThanOrEqual(1);
      const selected = listRows[0];
      const detail = messageMap.get(selected.msgid);
      expect(detail).toBeDefined();
      expect(Array.isArray(detail?.args)).toBe(true);
    } finally {
      app.removeListener('console', onConsole);
    }
  }, 90_000);
});
