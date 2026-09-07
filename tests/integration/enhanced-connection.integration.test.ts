/**
 * 新连接层集成测试
 *
 * 覆盖 connect/reconnect/disconnect/status 的核心行为，
 * 同时验证关键参数校验逻辑。
 */

import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MiniProgramContext } from '../../src/MiniProgramContext.js';
import { connectDevtoolsTool } from '../../src/tools/connection.js';

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

describe.skipIf(!shouldRun)('连接架构集成测试', () => {
  const harness = new IntegrationHarness({
    portCount: 8,
    connectRetries: 3,
    connectTimeoutMs: 60_000,
  });

  let context: MiniProgramContext | null = null;
  let runtimeReady = false;

  async function ensureConnected(): Promise<boolean> {
    if (!runtimeReady || !context) {
      handleIntegrationUnavailable('连接架构运行时不可用', '初始连接未建立');
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
      handleIntegrationUnavailable('连接架构重连失败', error);
      return false;
    }
  }

  beforeAll(async () => {
    const state = await harness.prepare();
    if (!state.ready) {
      console.warn(`[integration] 跳过连接架构测试: ${state.reason ?? '环境未就绪'}`);
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
      handleIntegrationUnavailable('连接架构初始连接失败', error);
    }
  }, 180_000);

  afterAll(async () => {
    if (!context) {
      return;
    }
    await harness.disconnect(context);
    context = null;
  }, 120_000);

  it('project 目标独立验证启动，不能由显式端点覆盖', async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'weixin-launch-test-'));
    const projectPath = path.join(scratch, 'app');
    await cp(harness.projectPath, projectPath, { recursive: true, filter: file => !file.endsWith('project.private.config.json') });
    let launched = false;
    const isolated = createIntegrationContext();
    try {
      await runTool(isolated, connectDevtoolsTool.handler, {
        target: { kind: 'project', projectPath, cliPath: harness.cliPath, autoPort: 9431 },
        timeoutMs: 15_000,
        healthCheck: false,
      });
      launched = true;
      expect(isolated.connectionStatus.connected).toBe(true);
      expect(isolated.connectionStatus.strategyUsed).toMatch(/launch|connect/);
    } finally {
      await isolated.disconnectDevtools();
      if (launched) await promisify(execFile)(harness.cliPath, ['close', '--project', projectPath]);
      await rm(scratch, { recursive: true, force: true });
    }
  }, 90_000);

  it('reconnect_devtools 应该复用历史参数重连', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const reconnectResponse = await harness.reconnect(context);
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
      timeoutMs: 60_000,
      healthCheck: false,
    });
    context = connected.context;

    const restored = await context.getConnectionStatus({ refreshHealth: false });
    expect(restored.connected).toBe(true);
  }, 120_000);

  it('project 目标缺少 projectPath 时应返回参数错误', async () => {
    const isolatedContext = createIntegrationContext();

    await expect(
      runTool(isolatedContext, connectDevtoolsTool.handler, {
        target: { kind: 'project', projectPath: '' },
        timeoutMs: 5_000,
      })
    ).rejects.toThrow(/projectPath/i);
  });

  it('timeoutMs 非法值应被拒绝', async () => {
    const isolatedContext = createIntegrationContext();

    await expect(
      runTool(isolatedContext, connectDevtoolsTool.handler, {
        target: { kind: 'project', projectPath: harness.projectPath },
        timeoutMs: 0,
      })
    ).rejects.toThrow(/timeoutMs 必须是正数/);
  });
});
