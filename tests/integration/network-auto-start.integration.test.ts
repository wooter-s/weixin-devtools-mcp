/**
 * 网络监听自动启动功能集成测试
 * 验证连接时网络监听是否自动启动并正确捕获请求
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDevtools } from '../../src/tools.js';
import {
  findAvailablePort,
  checkIntegrationTestEnvironment,
  cleanupConflictingWeChatInstances,
  safeCleanup,
  withTimeout
} from '../utils/test-utils.js';

// 只在环境变量RUN_INTEGRATION_TESTS为true时运行
const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';

// 测试配置
const TEST_PROJECT_PATH = '/Users/didi/workspace/wooPro/weixin-devtools-mcp/playground/wx';
const TEST_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

describe.skipIf(!shouldRun)('Network Auto-Start Integration Tests', () => {
  let miniProgram: any = null;
  let currentPage: any = null;
  let testPort: number = 0;
  let environmentReady = false;

  beforeAll(async () => {
    console.log('🔧 检查网络自动启动集成测试环境...');

    // 检查环境是否满足测试要求
    const envCheck = await checkIntegrationTestEnvironment(TEST_PROJECT_PATH, TEST_CLI_PATH);

    if (!envCheck.isReady) {
      console.error('❌ 网络自动启动集成测试环境不满足要求:');
      envCheck.issues.forEach(issue => console.error(`  • ${issue}`));
      environmentReady = false;
      return;
    }

    console.log('✅ 环境检查通过');

    // 显示警告信息（如端口冲突）
    if (envCheck.warnings && envCheck.warnings.length > 0) {
      console.log('⚠️ 检测到潜在问题:');
      envCheck.warnings.forEach(warning => console.log(`  • ${warning}`));
    }

    // 尝试清理冲突的微信开发者工具实例
    console.log('🧹 检查并清理冲突实例...');
    const cleanupSuccess = await cleanupConflictingWeChatInstances(TEST_PROJECT_PATH, TEST_CLI_PATH);
    if (!cleanupSuccess) {
      console.log('⚠️ 清理未完全成功，测试可能遇到端口冲突');
    }

    environmentReady = true;

    try {
      // 分配一个可用端口
      console.log('🔌 分配测试端口...');
      testPort = await findAvailablePort(9435);
      console.log(`✅ 已分配端口: ${testPort}`);

      console.log('正在连接微信开发者工具（不手动启动网络监听）...');
      const result = await withTimeout(
        connectDevtools({
          projectPath: TEST_PROJECT_PATH,
          port: testPort,
        }),
        30000,
        '网络自动启动测试连接超时'
      );

      miniProgram = result.miniProgram;
      currentPage = result.currentPage;

      console.log('✅ 连接成功，当前页面:', result.pagePath);
      console.log('📝 注意：未手动调用 start_network_monitoring，测试自动启动功能');
    } catch (error) {
      console.error('❌ 连接失败:', error);
      environmentReady = false;
    }
  });

  afterAll(async () => {
    if (miniProgram) {
      await safeCleanup(async () => {
        // 清理拦截器
        try {
          await miniProgram.restoreWxMethod('request');
          await miniProgram.restoreWxMethod('uploadFile');
          await miniProgram.restoreWxMethod('downloadFile');
        } catch (error) {
          console.log('清理拦截器时出错（可能已清理）:', error);
        }
        await miniProgram.close();
        console.log('微信开发者工具连接已关闭');
      });
    }
  });

  it('应该在连接时自动启动网络监听并捕获请求', async () => {
    if (!environmentReady || !miniProgram) {
      console.log('⏭️ 跳过测试：环境未准备就绪');
      return;
    }

    expect(miniProgram).toBeTruthy();

    try {
      // 等待一段时间，让小程序的自动请求（如日志上报）被捕获
      console.log('⏱️ 等待小程序自动请求被捕获...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 读取自动捕获的网络请求
      console.log('📊 读取自动捕获的网络请求...');
      const logs = await miniProgram.evaluate(function() {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        return wxObj?.__networkLogs || [];
      });

      console.log(`✅ 捕获到 ${logs.length} 个网络请求`);
      if (logs.length > 0) {
        console.log('首个网络请求详情:', JSON.stringify(logs[0], null, 2));
      }

      // 验证核心功能：自动捕获到了网络请求（不需要手动启动监听）
      expect(logs.length).toBeGreaterThan(0);

      // 验证请求数据结构正确
      const firstRequest = logs[0];
      expect(firstRequest).toBeDefined();
      expect(firstRequest).toHaveProperty('type', 'request');
      expect(firstRequest).toHaveProperty('url');
      expect(firstRequest).toHaveProperty('timestamp');
      expect(firstRequest).toHaveProperty('success');
      expect(firstRequest).toHaveProperty('id');
      expect(firstRequest).toHaveProperty('method');

      console.log('🎉 测试成功：网络监听已自动启动并正确捕获请求！');

    } catch (error) {
      console.error('❌ 测试失败:', error);
      throw error;
    }
  });

  it('应该能够同时捕获多个不同类型的网络请求', async () => {
    if (!environmentReady || !miniProgram) {
      console.log('⏭️ 跳过测试：环境未准备就绪');
      return;
    }

    expect(miniProgram).toBeTruthy();

    try {
      // 清空之前的日志
      await miniProgram.evaluate(function() {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (wxObj && wxObj.__networkLogs) {
          wxObj.__networkLogs = [];
        }
      });

      console.log('🚀 触发多个不同类型的网络请求...');

      // 触发 GET 请求
      await miniProgram.evaluate(() => {
        // @ts-ignore
        wx.request({
          url: 'https://httpbin.org/get?type=get_test',
          method: 'GET',
          success: () => {},
          fail: () => {}
        });
      });

      // 触发 POST 请求
      await miniProgram.evaluate(() => {
        // @ts-ignore
        wx.request({
          url: 'https://httpbin.org/post',
          method: 'POST',
          data: { test: 'auto_start_post' },
          success: () => {},
          fail: () => {}
        });
      });

      // 等待所有请求完成
      await new Promise(resolve => setTimeout(resolve, 4000));

      // 读取捕获的网络请求
      const logs = await miniProgram.evaluate(function() {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        return wxObj?.__networkLogs || [];
      });

      console.log(`✅ 捕获到 ${logs.length} 个网络请求`);

      // 验证捕获到了多个请求
      expect(logs.length).toBeGreaterThanOrEqual(2);

      // 验证 GET 请求
      const getRequest = logs.find((log: any) =>
        log.method === 'GET' && log.url && log.url.includes('type=get_test')
      );
      expect(getRequest).toBeDefined();

      // 验证 POST 请求
      const postRequest = logs.find((log: any) =>
        log.method === 'POST' && log.url && log.url.includes('httpbin.org/post')
      );
      expect(postRequest).toBeDefined();

      console.log('🎉 测试成功：成功捕获多种类型的网络请求！');

    } catch (error) {
      console.error('❌ 测试失败:', error);
      throw error;
    }
  });
});
