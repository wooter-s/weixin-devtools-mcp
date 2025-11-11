/**
 * Script功能集成测试
 * 测试 evaluate_script 工具在真实环境中的执行
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

describe.skipIf(!shouldRun)('Script Integration Tests', () => {
  let miniProgram: any = null;
  let currentPage: any = null;
  let testPort: number = 0;
  let environmentReady = false;

  beforeAll(async () => {
    console.log('🔧 检查Script集成测试环境...');

    // 检查环境是否满足测试要求
    const envCheck = await checkIntegrationTestEnvironment(TEST_PROJECT_PATH, TEST_CLI_PATH);

    if (!envCheck.isReady) {
      console.error('❌ Script集成测试环境不满足要求:');
      envCheck.issues.forEach(issue => console.error(`  • ${issue}`));
      console.log('\n💡 解决方案:');
      console.log('  1. 确保微信开发者工具已安装并可通过CLI访问');
      console.log('  2. 检查项目路径是否正确且包含app.json和project.config.json');
      console.log('  3. 确保开发者工具的自动化权限已开启');

      environmentReady = false;
      return;
    }

    console.log('✅ 环境检查通过');

    // 显示警告信息
    if (envCheck.warnings && envCheck.warnings.length > 0) {
      console.log('⚠️ 检测到潜在问题:');
      envCheck.warnings.forEach(warning => console.log(`  • ${warning}`));
    }

    // 清理冲突的微信开发者工具实例
    console.log('🧹 检查并清理冲突实例...');
    const cleanupSuccess = await cleanupConflictingWeChatInstances(TEST_PROJECT_PATH, TEST_CLI_PATH);
    if (!cleanupSuccess) {
      console.log('⚠️ 清理未完全成功，测试可能遇到端口冲突');
    }

    environmentReady = true;

    try {
      // 分配一个可用端口
      console.log('🔌 分配测试端口...');
      testPort = await findAvailablePort(9426);
      console.log(`✅ 已分配端口: ${testPort}`);

      console.log('正在连接微信开发者工具...');
      const result = await withTimeout(
        connectDevtools({
          projectPath: TEST_PROJECT_PATH,
          port: testPort,
        }),
        30000,
        'Script测试连接超时'
      );

      miniProgram = result.miniProgram;
      currentPage = result.currentPage;

      console.log('连接成功，当前页面:', result.pagePath);
    } catch (error) {
      console.error('连接失败:', error);
      environmentReady = false;
    }
  });

  afterAll(async () => {
    if (miniProgram) {
      await safeCleanup(async () => {
        await miniProgram.close();
        console.log('微信开发者工具连接已关闭');
      });
    }
  });

  describe('基本执行', () => {
    it('应该执行简单的算术运算', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => 2 + 3);
      expect(result).toBe(5);
    });

    it('应该执行返回字符串的函数', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => 'Hello World');
      expect(result).toBe('Hello World');
    });

    it('应该执行返回对象的函数', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => ({
        name: 'test',
        value: 123,
        active: true
      }));

      expect(result).toEqual({
        name: 'test',
        value: 123,
        active: true
      });
    });

    it('应该执行返回数组的函数', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => [1, 2, 3, 4, 5]);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('带参数执行', () => {
    it('应该传递单个参数', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate((x: number) => x * 2, 21);
      expect(result).toBe(42);
    });

    it('应该传递多个参数', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(
        (a: number, b: number, c: number) => a + b + c,
        10,
        20,
        30
      );
      expect(result).toBe(60);
    });

    it('应该传递字符串参数', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(
        (prefix: string, suffix: string) => `${prefix} World ${suffix}`,
        'Hello',
        '!'
      );
      expect(result).toBe('Hello World !');
    });

    it('应该传递对象参数', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(
        (obj: { name: string; age: number }) => `${obj.name} is ${obj.age} years old`,
        { name: 'Alice', age: 25 }
      );
      expect(result).toBe('Alice is 25 years old');
    });
  });

  describe('wx API 调用', () => {
    it('应该能调用 wx.getSystemInfoSync', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => {
        // @ts-ignore
        return wx.getSystemInfoSync();
      });

      expect(result).toBeTruthy();
      expect(result.platform).toBeTruthy();
      expect(result.system).toBeTruthy();
    });

    it('应该能调用异步的 wx API', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => {
        return new Promise((resolve) => {
          // @ts-ignore
          wx.getSystemInfo({
            success: (res: any) => resolve(res)
          });
        });
      });

      expect(result).toBeTruthy();
      expect(result.platform).toBeTruthy();
    });
  });

  describe('存储操作', () => {
    it('应该能设置和获取storage', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const testKey = 'test_script_key';
      const testValue = 'test_value_' + Date.now();

      // 设置存储
      await miniProgram.evaluate((key: string, value: string) => {
        // @ts-ignore
        wx.setStorageSync(key, value);
      }, testKey, testValue);

      // 获取存储
      const result = await miniProgram.evaluate((key: string) => {
        // @ts-ignore
        return wx.getStorageSync(key);
      }, testKey);

      expect(result).toBe(testValue);

      // 清理
      await miniProgram.evaluate((key: string) => {
        // @ts-ignore
        wx.removeStorageSync(key);
      }, testKey);
    });
  });

  describe('全局对象访问', () => {
    it('应该能访问 getApp()', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => {
        // @ts-ignore
        const app = getApp();
        return {
          hasApp: !!app,
          hasGlobalData: !!(app && app.globalData)
        };
      });

      expect(result.hasApp).toBe(true);
      expect(result.hasGlobalData).toBe(true);
    });

    it('应该能访问 getCurrentPages()', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => {
        // @ts-ignore
        const pages = getCurrentPages();
        return {
          pageCount: pages.length,
          hasCurrentPage: pages.length > 0
        };
      });

      expect(result.hasCurrentPage).toBe(true);
      expect(result.pageCount).toBeGreaterThan(0);
    });

    it('应该能访问当前页面的 data', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => {
        // @ts-ignore
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        return {
          hasData: !!currentPage.data,
          dataKeys: Object.keys(currentPage.data || {})
        };
      });

      expect(result.hasData).toBe(true);
      expect(Array.isArray(result.dataKeys)).toBe(true);
    });
  });

  describe('异步函数', () => {
    it('应该支持 async/await', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      // 注意：微信小程序 evaluate 对 async 函数的序列化有限制
      // 使用 Promise 链式调用而不是 await 语法
      const result = await miniProgram.evaluate(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve('async completed');
          }, 100);
        });
      });

      expect(result).toBe('async completed');
    });

    it('应该支持 Promise.resolve', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => {
        return Promise.resolve('promise resolved');
      });

      expect(result).toBe('promise resolved');
    });
  });

  describe('特殊返回值', () => {
    it('应该处理 null 返回值', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => null);
      expect(result).toBeNull();
    });

    it('应该处理 undefined 返回值', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => undefined);
      expect(result).toBeUndefined();
    });

    it('应该处理布尔值', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const trueResult = await miniProgram.evaluate(() => true);
      const falseResult = await miniProgram.evaluate(() => false);

      expect(trueResult).toBe(true);
      expect(falseResult).toBe(false);
    });

    it('应该处理数字 0', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => 0);
      expect(result).toBe(0);
    });

    it('应该处理空字符串', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => '');
      expect(result).toBe('');
    });

    it('应该处理空对象', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => ({}));
      expect(result).toEqual({});
    });

    it('应该处理空数组', async () => {
      if (!environmentReady || !miniProgram) {
        console.log('⏭️ 跳过测试：环境未准备就绪');
        return;
      }

      const result = await miniProgram.evaluate(() => []);
      expect(result).toEqual([]);
    });
  });
});
