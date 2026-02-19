/**
 * 导航功能集成测试（基于新连接入口）
 */

import type { MiniProgram } from 'miniprogram-automator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MiniProgramContext } from '../../src/MiniProgramContext.js';

import { IntegrationHarness } from './helpers/integration-harness.js';

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!shouldRunIntegration)('导航功能集成测试', () => {
  const harness = new IntegrationHarness({
    portCount: 4,
    connectRetries: 3,
    connectTimeoutMs: 60_000,
  });

  let context: MiniProgramContext | null = null;
  let miniProgram: MiniProgram | null = null;
  let runtimeReady = false;

  async function ensureMiniProgram(): Promise<MiniProgram | null> {
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

    miniProgram = context.miniProgram;
    return miniProgram;
  }

  beforeAll(async () => {
    const state = await harness.prepare();
    if (!state.ready) {
      console.warn(`[integration] 跳过导航测试: ${state.reason ?? '环境未就绪'}`);
      return;
    }

    context = MiniProgramContext.create();

    try {
      const result = await harness.connect(context, {
        strategy: 'auto',
        timeoutMs: 60_000,
        healthCheck: false,
      });
      context = result.context;
      miniProgram = result.context.miniProgram;
      runtimeReady = miniProgram !== null;
    } catch (error) {
      runtimeReady = false;
      console.warn(
        `[integration] 导航测试初始连接失败: ${error instanceof Error ? error.message : String(error)}`
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

  it('应该能使用 navigateTo 跳转页面', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    const targetUrl = '/subpackages/login/pages/login/login-wechat';
    await app.navigateTo(targetUrl);
    await new Promise(resolve => setTimeout(resolve, 1200));

    const currentPage = await app.currentPage();
    const currentPath = await currentPage.path;
    expect(currentPath).toContain('login-wechat');
  }, 45_000);

  it('应该能使用 navigateBack 返回上一页', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    const originalPage = await app.currentPage();
    const originalPath = await originalPage.path;

    await app.navigateTo('/subpackages/login/pages/login/login-wechat');
    await new Promise(resolve => setTimeout(resolve, 800));

    await app.navigateBack(1);
    await new Promise(resolve => setTimeout(resolve, 800));

    const currentPage = await app.currentPage();
    const currentPath = await currentPage.path;
    expect(currentPath).toBe(originalPath);
  }, 45_000);

  it('应该能使用 reLaunch 重新启动到指定页面', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    await app.reLaunch('/pages/home/index');
    await new Promise(resolve => setTimeout(resolve, 1200));

    const currentPage = await app.currentPage();
    const currentPath = await currentPage.path;
    expect(currentPath).toContain('pages/home/index');
  }, 45_000);

  it('应该能处理带查询参数的跳转', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    await app.navigateTo('/subpackages/login/pages/login/login-wechat?from=test&id=123');
    await new Promise(resolve => setTimeout(resolve, 1200));

    const currentPage = await app.currentPage();
    const currentPath = await currentPage.path;
    expect(currentPath).toContain('login-wechat');
  }, 45_000);

  it('navigateTo 不应接受对象参数', async () => {
    const app = await ensureMiniProgram();
    if (!app) {
      return;
    }

    try {
      await app.navigateTo({ url: 'pages/home/index' } as never);
      expect.fail('navigateTo 不应该接受对象参数');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/parameter.*should be String/i);
    }
  }, 30_000);
});
