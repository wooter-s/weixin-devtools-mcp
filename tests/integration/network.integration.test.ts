/**
 * 网络监听功能集成测试
 * 测试微信开发者工具网络请求拦截和监听功能
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

describe.skipIf(!shouldRun)('Network Monitoring Integration Tests', () => {
  let miniProgram: any = null;
  let currentPage: any = null;
  let testPort: number = 0;
  let environmentReady = false;

  beforeAll(async () => {
    console.log('🔧 检查网络监听集成测试环境...');

    // 检查环境是否满足测试要求
    const envCheck = await checkIntegrationTestEnvironment(TEST_PROJECT_PATH, TEST_CLI_PATH);

    if (!envCheck.isReady) {
      console.error('❌ 网络监听集成测试环境不满足要求:');
      envCheck.issues.forEach(issue => console.error(`  • ${issue}`));
      console.log('\n💡 解决方案:');
      console.log('  1. 确保微信开发者工具已安装并可通过CLI访问');
      console.log('  2. 检查项目路径是否正确且包含app.json和project.config.json');
      console.log('  3. 确保开发者工具的自动化权限已开启');

      // 环境不满足时，标记为未准备好但不抛出错误
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
      testPort = await findAvailablePort(9430);
      console.log(`✅ 已分配端口: ${testPort}`);

      console.log('正在连接微信开发者工具...');
      const result = await withTimeout(
        connectDevtools({
          projectPath: TEST_PROJECT_PATH,
          port: testPort,
        }),
        30000,
        '网络监听测试连接超时'
      );

      miniProgram = result.miniProgram;
      currentPage = result.currentPage;

      console.log('连接成功，当前页面:', result.pagePath);
    } catch (error) {
      console.error('连接失败:', error);
      environmentReady = false;
      // 不抛出错误，让测试优雅地跳过
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

  it('应该能够捕获wx.request网络请求', async () => {
    if (!environmentReady || !miniProgram) {
      console.log('⏭️ 跳过测试：环境未准备就绪');
      return;
    }

    expect(miniProgram).toBeTruthy();

    try {
      // 清空现有的网络日志
      await miniProgram.evaluate(function() {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (wxObj) {
          wxObj.__networkLogs = [];
        }
      });

      // 设置拦截器
      console.log('设置wx.request拦截器...');
      await miniProgram.mockWxMethod('request', function(options: any) {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = typeof wx !== 'undefined' ? wx : null;

        if (!wxObj) {
          return this.origin(options);
        }

        if (!wxObj.__networkLogs) {
          wxObj.__networkLogs = [];
        }

        const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const startTime = Date.now();

        const originalSuccess = options.success;
        options.success = function(res: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'request',
            url: options.url,
            method: options.method || 'GET',
            statusCode: res.statusCode,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            success: true
          });
          if (originalSuccess) originalSuccess(res);
        };

        const originalFail = options.fail;
        options.fail = function(err: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'request',
            url: options.url,
            method: options.method || 'GET',
            error: err.errMsg || String(err),
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            success: false
          });
          if (originalFail) originalFail(err);
        };

        return this.origin(options);
      });

      // 等待拦截器设置完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 触发网络请求
      console.log('触发测试网络请求...');
      await miniProgram.evaluate(() => {
        // @ts-ignore
        wx.request({
          url: 'https://httpbin.org/get?test=1',
          method: 'GET',
          success: (res: any) => {
            console.log('请求成功:', res.statusCode);
          },
          fail: (err: any) => {
            console.log('请求失败:', err.errMsg);
          }
        });

        // 再发送一个POST请求
        // @ts-ignore
        wx.request({
          url: 'https://httpbin.org/post',
          method: 'POST',
          data: { test: 'data' },
          success: (res: any) => {
            console.log('POST请求成功:', res.statusCode);
          },
          fail: (err: any) => {
            console.log('POST请求失败:', err.errMsg);
          }
        });
      });

      // 等待请求完成
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 读取捕获的网络请求
      console.log('读取捕获的网络请求...');
      const logs = await miniProgram.evaluate(function() {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        return wxObj?.__networkLogs || [];
      });

      console.log('捕获到的网络请求数量:', logs.length);
      console.log('网络请求详情:', JSON.stringify(logs, null, 2));

      // 验证捕获到了网络请求
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toHaveProperty('type', 'request');
      expect(logs[0]).toHaveProperty('url');
      expect(logs[0]).toHaveProperty('timestamp');

    } finally {
      // 清理拦截器
      try {
        await miniProgram.restoreWxMethod('request');
      } catch (error) {
        console.log('清理request拦截器失败:', error);
      }
    }
  });

  it('应该能够区分成功和失败的请求', async () => {
    if (!environmentReady || !miniProgram) {
      console.log('⏭️ 跳过测试：环境未准备就绪');
      return;
    }

    expect(miniProgram).toBeTruthy();

    try {
      // 清空现有的网络日志
      await miniProgram.evaluate(function() {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (wxObj) {
          wxObj.__networkLogs = [];
        }
      });

      // 设置拦截器（同上）
      await miniProgram.mockWxMethod('request', function(options: any) {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;

        if (!wxObj) {
          return this.origin(options);
        }

        if (!wxObj.__networkLogs) {
          wxObj.__networkLogs = [];
        }

        const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const startTime = Date.now();

        const originalSuccess = options.success;
        options.success = function(res: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'request',
            url: options.url,
            success: true,
            statusCode: res.statusCode,
            timestamp: new Date().toISOString()
          });
          if (originalSuccess) originalSuccess(res);
        };

        const originalFail = options.fail;
        options.fail = function(err: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'request',
            url: options.url,
            success: false,
            error: err.errMsg || String(err),
            timestamp: new Date().toISOString()
          });
          if (originalFail) originalFail(err);
        };

        return this.origin(options);
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // 触发一个会失败的请求（无效URL）
      console.log('触发会失败的网络请求...');
      await miniProgram.evaluate(() => {
        // @ts-ignore
        wx.request({
          url: 'https://invalid-domain-that-does-not-exist-12345.com',
          method: 'GET',
          success: () => {},
          fail: () => {}
        });
      });

      // 等待请求完成
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 读取捕获的网络请求
      const logs = await miniProgram.evaluate(function() {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        return wxObj?.__networkLogs || [];
      });

      console.log('捕获到的请求数量:', logs.length);
      console.log('请求详情:', JSON.stringify(logs, null, 2));

      // 验证至少有一个失败的请求
      const failedRequests = logs.filter((log: any) => log.success === false);
      expect(failedRequests.length).toBeGreaterThan(0);
      expect(failedRequests[0]).toHaveProperty('error');

    } finally {
      try {
        await miniProgram.restoreWxMethod('request');
      } catch (error) {
        console.log('清理request拦截器失败:', error);
      }
    }
  });

  it('应该能够记录请求的详细信息', async () => {
    if (!environmentReady || !miniProgram) {
      console.log('⏭️ 跳过测试：环境未准备就绪');
      return;
    }

    expect(miniProgram).toBeTruthy();

    try {
      // 清空现有的网络日志
      await miniProgram.evaluate(function() {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (wxObj) {
          wxObj.__networkLogs = [];
        }
      });

      // 设置拦截器
      await miniProgram.mockWxMethod('request', function(options: any) {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;

        if (!wxObj) {
          return this.origin(options);
        }

        if (!wxObj.__networkLogs) {
          wxObj.__networkLogs = [];
        }

        const requestId = 'req_' + Date.now();
        const startTime = Date.now();

        const originalSuccess = options.success;
        options.success = function(res: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'request',
            url: options.url,
            method: options.method || 'GET',
            headers: options.header,
            data: options.data,
            statusCode: res.statusCode,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            success: true
          });
          if (originalSuccess) originalSuccess(res);
        };

        const originalFail = options.fail;
        options.fail = function(err: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'request',
            url: options.url,
            method: options.method || 'GET',
            error: err.errMsg || String(err),
            timestamp: new Date().toISOString(),
            success: false
          });
          if (originalFail) originalFail(err);
        };

        return this.origin(options);
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // 触发一个带详细参数的请求
      console.log('触发带详细参数的网络请求...');
      await miniProgram.evaluate(() => {
        // @ts-ignore
        wx.request({
          url: 'https://httpbin.org/post',
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            'X-Custom-Header': 'test-value'
          },
          data: {
            userId: 123,
            action: 'test',
            timestamp: Date.now()
          },
          success: () => {},
          fail: () => {}
        });
      });

      // 等待请求完成
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 读取捕获的网络请求
      const logs = await miniProgram.evaluate(function() {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        return wxObj?.__networkLogs || [];
      });

      console.log('捕获到的请求:', JSON.stringify(logs, null, 2));

      // 验证请求详细信息
      expect(logs.length).toBeGreaterThan(0);
      const request = logs[0];
      expect(request).toHaveProperty('method', 'POST');
      expect(request).toHaveProperty('headers');
      expect(request).toHaveProperty('data');
      expect(request).toHaveProperty('duration');
      expect(request.duration).toBeGreaterThan(0);

    } finally {
      try {
        await miniProgram.restoreWxMethod('request');
      } catch (error) {
        console.log('清理request拦截器失败:', error);
      }
    }
  });
});
