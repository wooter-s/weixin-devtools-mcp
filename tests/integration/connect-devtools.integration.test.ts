/**
 * connect_devtools 集成测试（新连接架构）
 *
 * 目标：
 * 1. 覆盖 connect/reconnect/disconnect/status 基础链路
 * 2. 避免硬编码端口与旧接口依赖
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MiniProgramContext } from '../../src/MiniProgramContext.js';
import { getConnectionStatusTool, getCurrentPageTool } from '../../src/tools/connection.js';

import {
  createIntegrationContext,
  IntegrationHarness,
  runTool,
} from './helpers/integration-harness.js';
import {
  handleIntegrationUnavailable,
  shouldRunIntegrationTests,
} from './helpers/integration-mode.js';

const shouldRun = shouldRunIntegrationTests();

describe.skipIf(!shouldRun)('connect_devtools 集成测试', () => {
  const harness = new IntegrationHarness({
    portCount: 6,
    connectRetries: 3,
    connectTimeoutMs: 60_000,
  });

  let context: MiniProgramContext | null = null;
  let runtimeReady = false;

  async function ensureConnected(): Promise<boolean> {
    if (!runtimeReady || !context) {
      handleIntegrationUnavailable('connect_devtools 运行时不可用', '初始连接未建立');
      return false;
    }

    const status = await context.getConnectionStatus({ refreshHealth: false });
    if (status.connected) {
      return true;
    }

    try {
      await harness.reconnect(context);
      return true;
    } catch (error) {
      runtimeReady = false;
      handleIntegrationUnavailable('connect_devtools 重连失败', error);
      return false;
    }
  }

  beforeAll(async () => {
    const state = await harness.prepare();
    if (!state.ready) {
      console.warn(`[integration] 跳过 connect_devtools 测试: ${state.reason ?? '环境未就绪'}`);
      return;
    }

    context = createIntegrationContext();
    try {
      const connected = await harness.connect(context, {
        timeoutMs: 60_000,
        healthCheck: false,
      });
      context = connected.context;
      runtimeReady = true;
    } catch (error) {
      runtimeReady = false;
      handleIntegrationUnavailable('connect_devtools 初始连接失败', error);
    }
  }, 180_000);

  afterAll(async () => {
    if (!context) {
      return;
    }
    if (process.env.INTEGRATION_FORCE_DISCONNECT_AFTER_EACH_SUITE === 'true') {
      await harness.disconnect(context);
    }
    context = null;
  }, 120_000);

  it('应该建立连接并返回结构化状态', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const response = await runTool(context, getConnectionStatusTool.handler, { refreshHealth: true });
    const text = response.getResponseText();
    expect(text).toContain('连接状态:');
    expect(text).toContain('已连接: 是');
    expect(context.connectionStatus.connected).toBe(true);
    expect(context.connectionStatus.pagePath).toBeTruthy();
  }, 90_000);

  it('应该能刷新并获取当前页面', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const response = await runTool(context, getCurrentPageTool.handler, {});
    const text = response.getResponseText();
    expect(text).toContain('当前页面:');
    expect(context.currentPage).toBeTruthy();
  }, 90_000);

  it('应该支持重连并保持可用状态', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const response = await harness.reconnect(context);
    expect(response.getResponseText()).toContain('重连成功');

    const status = await context.getConnectionStatus({ refreshHealth: false });
    expect(status.connected).toBe(true);
    expect(status.state).toMatch(/connected|degraded/);
  }, 120_000);

  it('同一测试内重复 connect 应优先复用会话', async () => {
    if (!runtimeReady || !context) {
      return;
    }

    const connected = await harness.connect(context, {
      timeoutMs: 60_000,
      healthCheck: false,
    });
    expect(connected.response.getResponseText()).toContain('复用已有连接会话');

    const status = await context.getConnectionStatus({ refreshHealth: false });
    expect(status.connected).toBe(true);

    await harness.disconnect(context);
  }, 120_000);
});
