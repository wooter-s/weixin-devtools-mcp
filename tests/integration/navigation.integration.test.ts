/**
 * 导航功能集成测试
 *
 * 测试真实的页面导航功能，验证 API 修复是否正确工作
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import automator from 'miniprogram-automator';

// 仅在设置了 RUN_INTEGRATION_TESTS 环境变量时运行集成测试
const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!shouldRunIntegration)('导航功能集成测试', () => {
  let miniProgram: any;
  const projectPath = '/Users/didi/workspace/wooPro/weixin-devtools-mcp/playground/wx';

  beforeAll(async () => {
    try {
      // 连接到微信开发者工具
      miniProgram = await automator.connect({
        wsEndpoint: 'ws://localhost:9422',
      });

      console.log('✅ 已连接到微信开发者工具');
    } catch (error) {
      console.error('❌ 连接失败:', error);
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    if (miniProgram) {
      await miniProgram.disconnect();
      console.log('✅ 已断开连接');
    }
  });

  it('应该能使用 navigateTo 跳转页面', async () => {
    // 跳转到子包页面
    const targetUrl = '/subpackages/login/pages/login/login-wechat';

    await miniProgram.navigateTo(targetUrl);

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 验证当前页面
    const currentPage = await miniProgram.currentPage();
    const currentPath = await currentPage.path;

    expect(currentPath).toContain('login-wechat');
  }, 15000);

  it('应该能使用 navigateBack 返回上一页', async () => {
    // 先确保在子页面
    await miniProgram.navigateTo('/subpackages/login/pages/login/login-wechat');
    await new Promise(resolve => setTimeout(resolve, 500));

    // 返回上一页
    await miniProgram.navigateBack(1);
    await new Promise(resolve => setTimeout(resolve, 500));

    // 验证返回到首页
    const currentPage = await miniProgram.currentPage();
    const currentPath = await currentPage.path;

    expect(currentPath).toContain('pages/home/index');
  }, 15000);

  it('应该能使用 reLaunch 重新启动到指定页面', async () => {
    const targetUrl = 'pages/home/index';

    await miniProgram.reLaunch(targetUrl);

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 验证当前页面
    const currentPage = await miniProgram.currentPage();
    const currentPath = await currentPage.path;

    expect(currentPath).toBe('pages/home/index');
  }, 15000);

  it('应该能正确处理带查询参数的跳转', async () => {
    const targetUrl = '/subpackages/login/pages/login/login-wechat?from=test&id=123';

    await miniProgram.navigateTo(targetUrl);

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 验证当前页面
    const currentPage = await miniProgram.currentPage();
    const currentPath = await currentPage.path;

    expect(currentPath).toContain('login-wechat');
  }, 15000);

  it('应该能验证 API 不再接受对象参数', async () => {
    // 这个测试验证旧的错误调用方式会失败
    try {
      // @ts-expect-error - 故意使用错误的 API 调用
      await miniProgram.navigateTo({ url: 'pages/home/index' });

      // 如果没有抛出错误，说明 API 还在接受错误的调用方式
      expect.fail('API 不应该接受对象参数');
    } catch (error: any) {
      // 期望抛出错误
      expect(error.message).toMatch(/parameter.*should be String/i);
    }
  }, 15000);
});