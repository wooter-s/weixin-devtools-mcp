/**
 * 网络监听自动启动集成测试（统一 Harness 版）
 */

import type { MiniProgram } from 'miniprogram-automator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MiniProgramContext } from '../../src/MiniProgramContext.js';

import { IntegrationHarness } from './helpers/integration-harness.js';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';

interface NetworkLog {
  id: string;
  type: string;
  url?: string;
  method?: string;
  timestamp?: string;
  success?: boolean;
}

type NetworkMiniProgram = MiniProgram & {
  evaluate: <TResult>(fn: () => TResult | Promise<TResult>) => Promise<TResult>;
};

describe.skipIf(!shouldRun)('Network Auto-Start Integration Tests', () => {
  const harness = new IntegrationHarness({
    portCount: 4,
    connectRetries: 3,
    connectTimeoutMs: 60_000,
  });

  let context: MiniProgramContext | null = null;
  let miniProgram: NetworkMiniProgram | null = null;
  let runtimeReady = false;

  async function ensureMiniProgram(): Promise<NetworkMiniProgram | null> {
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

    const nextMiniProgram = context.miniProgram as NetworkMiniProgram | null;
    miniProgram = nextMiniProgram;
    return nextMiniProgram;
  }

  async function readNetworkLogs(app: NetworkMiniProgram): Promise<NetworkLog[]> {
    return app.evaluate(() => {
      // @ts-expect-error wx 在小程序运行时可用
      const wxObj = typeof wx !== 'undefined' ? wx : null;
      return (wxObj?.__networkLogs || []) as NetworkLog[];
    });
  }

  beforeAll(async () => {
    const state = await harness.prepare();
    if (!state.ready) {
      console.warn(`[integration] 跳过 Network Auto-Start 测试: ${state.reason ?? '环境未就绪'}`);
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
      miniProgram = context.miniProgram as NetworkMiniProgram | null;
      runtimeReady = miniProgram !== null;
    } catch (error) {
      runtimeReady = false;
      console.warn(
        `[integration] Network Auto-Start 初始连接失败，后续用例将跳过: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, 180_000);

  afterAll(async () => {
    if (!context) {
      return;
    }
    await harness.disconnect(context);
    context = null;
    miniProgram = null;
  }, 120_000);

  it('应该在连接后自动捕获请求', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    await app.evaluate(() => {
      // @ts-expect-error wx 在小程序运行时可用
      wx.request({
        url: 'https://httpbin.org/get?source=network-auto-start-bootstrap',
        method: 'GET',
        success: () => undefined,
        fail: () => undefined,
      });
    });

    let logs: NetworkLog[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      logs = await readNetworkLogs(app);
      if (logs.length > 0) {
        break;
      }
    }

    const first = logs[0];
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(first.type).toBe('request');
    expect(first.timestamp).toBeTruthy();
    expect(first.id).toBeTruthy();
  }, 90_000);

  it('应该能持续捕获手动触发的请求', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    await app.evaluate(() => {
      // @ts-expect-error wx 在小程序运行时可用
      wx.request({
        url: 'https://httpbin.org/get?source=network-auto-start',
        method: 'GET',
        success: () => undefined,
        fail: () => undefined,
      });
      // @ts-expect-error wx 在小程序运行时可用
      wx.request({
        url: 'https://httpbin.org/post',
        method: 'POST',
        data: { from: 'network-auto-start' },
        success: () => undefined,
        fail: () => undefined,
      });
    });

    await new Promise(resolve => setTimeout(resolve, 4000));
    const logs = await readNetworkLogs(app);

    const hasGet = logs.some(log => log.method === 'GET' && log.url?.includes('source=network-auto-start'));
    const hasPost = logs.some(log => log.method === 'POST' && log.url?.includes('httpbin.org/post'));

    expect(hasGet).toBe(true);
    expect(hasPost).toBe(true);
  }, 90_000);
});
