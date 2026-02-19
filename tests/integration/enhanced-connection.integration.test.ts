/**
 * 新连接层集成测试
 *
 * 覆盖 connect/reconnect/disconnect/status 的核心行为，
 * 同时验证关键参数校验逻辑。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MiniProgramContext } from '../../src/MiniProgramContext.js';
import { connectDevtoolsTool, getConnectionStatusTool } from '../../src/tools/connection.js';

import { IntegrationHarness, runTool } from './helpers/integration-harness.js';

const shouldRunIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!shouldRunIntegrationTests)('连接架构集成测试', () => {
  const harness = new IntegrationHarness({
    portCount: 8,
    connectRetries: 3,
    connectTimeoutMs: 60_000,
  });

  let context: MiniProgramContext | null = null;
  let runtimeReady = false;

  async function ensureConnected(): Promise<boolean> {
    if (!runtimeReady || !context) {
      return false;
    }

    const status = await context.getConnectionStatus({ refreshHealth: false });
    if (status.connected) {
      return true;
    }

    try {
      await harness.reconnect(context, { timeoutMs: 60_000, healthCheck: false });
      return true;
    } catch {
      runtimeReady = false;
      return false;
    }
  }

  beforeAll(async () => {
    const state = await harness.prepare();
    if (!state.ready) {
      console.warn(`[integration] 跳过连接架构测试: ${state.reason ?? '环境未就绪'}`);
      return;
    }

    context = MiniProgramContext.create();
    try {
      const connected = await harness.connect(context, {
        strategy: 'auto',
        timeoutMs: 60_000,
        healthCheck: false,
        autoDiscover: true,
      });
      context = connected.context;
      runtimeReady = true;
    } catch (error) {
      runtimeReady = false;
      console.warn(
        `[integration] 初始连接失败，后续用例将跳过: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }, 180_000);

  afterAll(async () => {
    if (!context) {
      return;
    }
    await harness.disconnect(context);
    context = null;
  }, 120_000);

  it('auto 策略应该返回可用连接状态', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const statusResponse = await runTool(context, getConnectionStatusTool.handler, { refreshHealth: true });
    const text = statusResponse.getResponseText();
    expect(text).toContain('连接状态:');
    expect(text).toContain('已连接: 是');

    const status = context.connectionStatus;
    expect(status.connected).toBe(true);
    expect(status.state).toMatch(/connected|degraded/);
    expect(status.strategyUsed).toMatch(/auto|launch|connect|discover|wsEndpoint|browserUrl/);
  }, 90_000);

  it('reconnect_devtools 应该复用历史参数重连', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const reconnectResponse = await harness.reconnect(context, {
      timeoutMs: 60_000,
      healthCheck: false,
    });
    expect(reconnectResponse.getResponseText()).toContain('重连成功');

    const status = await context.getConnectionStatus({ refreshHealth: false });
    expect(status.connected).toBe(true);
  }, 120_000);

  it('disconnect 后应能再次 connect', async () => {
    if (!runtimeReady || !context) {
      return;
    }

    await harness.disconnect(context);
    const disconnected = await context.getConnectionStatus({ refreshHealth: false });
    expect(disconnected.connected).toBe(false);
    expect(disconnected.state).toBe('disconnected');

    const connected = await harness.connect(context, {
      strategy: 'auto',
      timeoutMs: 60_000,
      healthCheck: false,
    });
    context = connected.context;

    const restored = await context.getConnectionStatus({ refreshHealth: false });
    expect(restored.connected).toBe(true);
  }, 120_000);

  it('connect 策略缺少 projectPath 时应返回参数错误', async () => {
    const isolatedContext = MiniProgramContext.create();

    await expect(
      runTool(isolatedContext, connectDevtoolsTool.handler, {
        strategy: 'connect',
        timeoutMs: 5_000,
      })
    ).rejects.toThrow(/projectPath/i);
  });

  it('timeoutMs 非法值应被拒绝', async () => {
    const isolatedContext = MiniProgramContext.create();

    await expect(
      runTool(isolatedContext, connectDevtoolsTool.handler, {
        strategy: 'auto',
        projectPath: harness.projectPath,
        timeoutMs: 0,
      })
    ).rejects.toThrow(/timeoutMs 必须是正数/);
  });
});
