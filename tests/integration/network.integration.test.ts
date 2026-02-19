/**
 * 网络监听功能集成测试（统一 Harness 版）
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
  statusCode?: number;
  timestamp?: string;
  success?: boolean;
  headers?: Record<string, string>;
  data?: Record<string, string> | string;
  error?: string;
}

type NetworkMiniProgram = MiniProgram & {
  evaluate: <TResult>(fn: () => TResult | Promise<TResult>) => Promise<TResult>;
};

describe.skipIf(!shouldRun)('Network Monitoring Integration Tests', () => {
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

  async function clearNetworkLogs(app: NetworkMiniProgram): Promise<void> {
    await app.evaluate(() => {
      // @ts-expect-error wx 在小程序运行时可用
      const wxObj = typeof wx !== 'undefined' ? wx : null;
      if (wxObj && wxObj.__networkLogs) {
        wxObj.__networkLogs = [];
      }
    });
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
      console.warn(`[integration] 跳过 Network 测试: ${state.reason ?? '环境未就绪'}`);
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
        `[integration] Network 初始连接失败，后续用例将跳过: ${
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

  it('应该能够捕获 wx.request 网络请求', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    await clearNetworkLogs(app);

    await app.evaluate(() => {
      // @ts-expect-error wx 在小程序运行时可用
      wx.request({
        url: 'https://httpbin.org/get?integration=network',
        method: 'GET',
        success: () => undefined,
        fail: () => undefined,
      });
      // @ts-expect-error wx 在小程序运行时可用
      wx.request({
        url: 'https://httpbin.org/post',
        method: 'POST',
        data: { source: 'integration-network' },
        success: () => undefined,
        fail: () => undefined,
      });
    });

    await new Promise(resolve => setTimeout(resolve, 3500));
    const logs = await readNetworkLogs(app);

    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.some(log => log.url?.includes('httpbin.org/get'))).toBe(true);
    expect(logs.some(log => log.url?.includes('httpbin.org/post'))).toBe(true);
  }, 90_000);

  it('应该能够区分成功和失败的请求', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    await clearNetworkLogs(app);

    await app.evaluate(() => {
      // @ts-expect-error wx 在小程序运行时可用
      wx.request({
        url: 'https://invalid-domain-that-does-not-exist-12345.com',
        method: 'GET',
        success: () => undefined,
        fail: () => undefined,
      });
    });

    await new Promise(resolve => setTimeout(resolve, 3500));
    const logs = await readNetworkLogs(app);

    const failed = logs.filter(log => log.success === false);
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(typeof failed[0].error).toBe('string');
  }, 90_000);

  it('应该能够记录请求的关键信息', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    await clearNetworkLogs(app);

    await app.evaluate(() => {
      // @ts-expect-error wx 在小程序运行时可用
      wx.request({
        url: 'https://httpbin.org/post',
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'X-Integration-Test': 'network-details',
        },
        data: {
          operation: 'details-check',
        },
        success: () => undefined,
        fail: () => undefined,
      });
    });

    await new Promise(resolve => setTimeout(resolve, 3500));
    const logs = await readNetworkLogs(app);
    const matched = logs.find(log => log.url?.includes('httpbin.org/post'));

    expect(matched).toBeDefined();
    expect(matched?.type).toBe('request');
    expect(matched?.timestamp).toBeTruthy();
    expect(matched?.id).toBeTruthy();
  }, 90_000);
});
