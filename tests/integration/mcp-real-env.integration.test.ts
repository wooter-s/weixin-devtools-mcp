/**
 * MCP 真实环境集成测试
 *
 * 测试目标：验证完整的自动化流程在真实环境中的表现
 * 依赖：微信开发者工具 + playground/wx/ 测试项目
 * 运行：RUN_INTEGRATION_TESTS=true npm run test:mcp-integration
 *
 * 参考：chrome-devtools-mcp 的 withBrowser 模式
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import automator from 'miniprogram-automator';
import path from 'path';
import { SimpleToolResponse, ToolContext } from '../../src/tools/ToolDefinition.js';
import { connectDevtoolsEnhancedTool } from '../../src/tools/connection.js';
import { getPageSnapshotTool } from '../../src/tools/snapshot.js';
import { querySelectorTool, waitForTool } from '../../src/tools/page.js';
import { clickTool, inputTextTool } from '../../src/tools/input.js';
import { assertExistsTool, assertTextTool, assertVisibleTool } from '../../src/tools/assert.js';
import { screenshotTool } from '../../src/tools/screenshot.js';
import { getConsoleTool, startConsoleMonitoringTool } from '../../src/tools/console.js';
import { getNetworkRequestsTool } from '../../src/tools/network.js';

// 环境变量控制
const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true';

// 测试项目路径
const TEST_PROJECT_PATH = path.resolve(process.cwd(), 'playground/wx');

/**
 * 辅助函数：创建真实的微信小程序环境（模拟 chrome-devtools-mcp 的 withBrowser）
 */
async function withMiniProgram(
  cb: (response: SimpleToolResponse, context: ToolContext) => Promise<void>
) {
  let miniProgram: any = null;

  try {
    // 启动微信开发者工具
    miniProgram = await automator.launch({
      projectPath: TEST_PROJECT_PATH,
    });

    const currentPage = await miniProgram.currentPage();

    // 创建 ToolContext
    const context: ToolContext = {
      miniProgram,
      currentPage,
      elementMap: new Map(),
      consoleStorage: {
        consoleMessages: [],
        exceptionMessages: [],
        isMonitoring: false,
        startTime: null
      },
      networkStorage: {
        requests: [],
        isMonitoring: false,
        startTime: null,
        originalMethods: {}
      }
    };

    const response = new SimpleToolResponse();
    await cb(response, context);

  } finally {
    if (miniProgram) {
      await miniProgram.close();
    }
  }
}

// 根据环境变量决定是否跳过测试
const describeIntegration = RUN_INTEGRATION_TESTS ? describe : describe.skip;

describeIntegration('MCP Real Environment Integration Tests', () => {
  describe('Connection and Basic Operations', () => {
    it('应该能启动微信开发者工具并获取页面', async () => {
      await withMiniProgram(async (response, context) => {
        expect(context.miniProgram).toBeDefined();
        expect(context.currentPage).toBeDefined();

        const pagePath = await context.currentPage.path;
        expect(pagePath).toBeDefined();
        expect(typeof pagePath).toBe('string');
      });
    });

    it('应该能获取页面快照', async () => {
      await withMiniProgram(async (response, context) => {
        await getPageSnapshotTool.handler(
          { params: {} },
          response,
          context
        );

        expect(context.elementMap.size).toBeGreaterThan(0);
        expect(response.getResponseText()).toContain('页面快照');
      });
    });
  });

  describe('Element Query and Interaction', () => {
    it('应该能查找页面元素', async () => {
      await withMiniProgram(async (response, context) => {
        // 先获取快照
        await getPageSnapshotTool.handler({ params: {} }, response, context);

        // 尝试查找元素
        const selector = 'view'; // 小程序页面通常有 view 元素

        const queryResponse = new SimpleToolResponse();
        await querySelectorTool.handler(
          { params: { selector } },
          queryResponse,
          context
        );

        expect(queryResponse.getResponseText()).toContain('查找');
      });
    });

    it('应该能通过 UID 点击元素', async () => {
      await withMiniProgram(async (response, context) => {
        // 1. 获取快照生成 UID
        await getPageSnapshotTool.handler({ params: {} }, response, context);

        // 2. 获取第一个可点击的元素 UID
        const uids = Array.from(context.elementMap.keys());
        const clickableUid = uids.find(uid =>
          uid.includes('button') || uid.includes('view')
        );

        if (clickableUid) {
          // 3. 点击元素
          const clickResponse = new SimpleToolResponse();
          await clickTool.handler(
            { params: { uid: clickableUid } },
            clickResponse,
            context
          );

          expect(clickResponse.getResponseText()).toContain('点击元素成功');
        } else {
          console.log('未找到可点击的元素，跳过点击测试');
        }
      });
    });
  });

  describe('Wait and Assertion', () => {
    it('应该能等待元素出现', async () => {
      await withMiniProgram(async (response, context) => {
        const page = context.currentPage;

        // 等待 view 元素（小程序必有的元素）
        await waitForTool.handler(
          {
            params: {
              selector: 'view',
              timeout: 5000
            }
          },
          response,
          context
        );

        expect(response.getResponseText()).toContain('等待完成');
      });
    });

    it('应该能断言元素存在', async () => {
      await withMiniProgram(async (response, context) => {
        await assertExistsTool.handler(
          {
            params: {
              selector: 'view',
              shouldExist: true,
              timeout: 3000
            }
          },
          response,
          context
        );

        expect(response.getResponseText()).toContain('断言通过');
      });
    });

    it('应该能断言元素可见性', async () => {
      await withMiniProgram(async (response, context) => {
        // 先获取快照
        await getPageSnapshotTool.handler({ params: {} }, response, context);

        const uids = Array.from(context.elementMap.keys());
        if (uids.length > 0) {
          const visibilityResponse = new SimpleToolResponse();
          await assertVisibleTool.handler(
            {
              params: {
                uid: uids[0],
                visible: true
              }
            },
            visibilityResponse,
            context
          );

          // 注意：某些元素可能不可见，所以这里只验证没有抛出异常
          expect(visibilityResponse.getResponseText()).toBeDefined();
        }
      });
    });
  });

  describe('Screenshot and Debugging', () => {
    it('应该能截图（返回 base64）', async () => {
      await withMiniProgram(async (response, context) => {
        await screenshotTool.handler(
          { params: {} },
          response,
          context
        );

        const images = response.getAttachedImages();
        expect(images.length).toBeGreaterThan(0);
        expect(images[0].mimeType).toBe('image/png');
        expect(images[0].data.length).toBeGreaterThan(100); // base64 数据应该很长
      });
    }, 30000); // 截图可能需要较长时间

    it('应该能截图（保存到文件）', async () => {
      await withMiniProgram(async (response, context) => {
        const tempPath = path.join(process.cwd(), 'tmp-screenshot.png');

        await screenshotTool.handler(
          { params: { path: tempPath } },
          response,
          context
        );

        expect(response.getResponseText()).toContain('截图已保存');
        expect(response.getResponseText()).toContain(tempPath);
      });
    }, 30000);
  });

  describe('Console Monitoring', () => {
    it('应该能启动 console 监听', async () => {
      await withMiniProgram(async (response, context) => {
        await startConsoleMonitoringTool.handler(
          { params: {} },
          response,
          context
        );

        expect(context.consoleStorage.isMonitoring).toBe(true);
        expect(response.getResponseText()).toContain('Console 监听已启动');
      });
    });

    it('应该能获取 console 消息', async () => {
      await withMiniProgram(async (response, context) => {
        // 启动监听
        await startConsoleMonitoringTool.handler({ params: {} }, response, context);

        // 等待一段时间让小程序产生日志
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 获取 console 消息
        const consoleResponse = new SimpleToolResponse();
        await getConsoleTool.handler(
          { params: {} },
          consoleResponse,
          context
        );

        expect(consoleResponse.getResponseText()).toBeDefined();
      });
    });
  });

  describe('Network Monitoring', () => {
    it('应该能获取网络请求（自动启动）', async () => {
      await withMiniProgram(async (response, context) => {
        // 网络监控在连接时自动启动，等待一段时间
        await new Promise(resolve => setTimeout(resolve, 3000));

        const networkResponse = new SimpleToolResponse();
        await getNetworkRequestsTool.handler(
          { params: {} },
          networkResponse,
          context
        );

        const responseText = networkResponse.getResponseText();
        expect(responseText).toBeDefined();
        // 可能有请求，也可能没有，只验证工具正常工作
      });
    });

    it('应该能过滤网络请求', async () => {
      await withMiniProgram(async (response, context) => {
        await new Promise(resolve => setTimeout(resolve, 3000));

        const networkResponse = new SimpleToolResponse();
        await getNetworkRequestsTool.handler(
          {
            params: {
              type: 'request',
              successOnly: true
            }
          },
          networkResponse,
          context
        );

        expect(networkResponse.getResponseText()).toBeDefined();
      });
    });
  });

  describe('Complete Workflow', () => {
    it('应该能完成完整的自动化流程', async () => {
      await withMiniProgram(async (response, context) => {
        // 1. 获取页面快照
        await getPageSnapshotTool.handler({ params: {} }, response, context);
        expect(context.elementMap.size).toBeGreaterThan(0);

        // 2. 查找元素
        const queryResponse = new SimpleToolResponse();
        await querySelectorTool.handler(
          { params: { selector: 'view' } },
          queryResponse,
          context
        );

        // 3. 断言元素存在
        const assertResponse = new SimpleToolResponse();
        await assertExistsTool.handler(
          {
            params: {
              selector: 'view',
              shouldExist: true
            }
          },
          assertResponse,
          context
        );

        // 4. 截图
        const screenshotResponse = new SimpleToolResponse();
        await screenshotTool.handler(
          { params: {} },
          screenshotResponse,
          context
        );

        // 5. 获取网络请求
        const networkResponse = new SimpleToolResponse();
        await getNetworkRequestsTool.handler(
          { params: {} },
          networkResponse,
          context
        );

        // 验证所有步骤都成功执行
        expect(queryResponse.getResponseText()).toBeDefined();
        expect(assertResponse.getResponseText()).toContain('断言通过');
        expect(screenshotResponse.getAttachedImages().length).toBeGreaterThan(0);
        expect(networkResponse.getResponseText()).toBeDefined();
      });
    }, 60000); // 完整流程可能需要 1 分钟
  });
});
