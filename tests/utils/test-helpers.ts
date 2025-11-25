/**
 * 测试辅助工具
 *
 * 提供通用的测试辅助函数和Mock对象工厂
 */

import path from 'path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import automator from 'miniprogram-automator';
import { vi } from 'vitest';

import type { ToolContext} from '../src/tools/ToolDefinition.js';
import { SimpleToolResponse } from '../src/tools/ToolDefinition.js';

// ============================================================================
// MCP Protocol Testing Helpers
// ============================================================================

/**
 * 辅助函数：创建 MCP 客户端并执行回调
 * 用于 MCP 协议层 E2E 测试
 *
 * @example
 * await withMcpClient(async (client) => {
 *   const { tools } = await client.listTools();
 *   expect(tools).toHaveLength(31);
 * });
 */
export async function withMcpClient(cb: (client: Client) => Promise<void>) {
  const serverPath = path.join(__dirname, '../build/server.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    await cb(client);
  } finally {
    await client.close();
  }
}

// ============================================================================
// Mock Object Factories (Unit Testing)
// ============================================================================

/**
 * 创建 Mock 的 ToolContext
 * 用于工具单元测试，不需要真实的微信开发者工具环境
 */
export function createMockContext(): ToolContext {
  return {
    miniProgram: null,
    currentPage: null,
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
}

/**
 * 创建 Mock 的 MiniProgram 对象
 */
export function createMockMiniProgram() {
  return {
    currentPage: vi.fn().mockResolvedValue(createMockPage()),
    close: vi.fn().mockResolvedValue(undefined)
  };
}

/**
 * 创建 Mock 的 Page 对象
 */
export function createMockPage() {
  return {
    path: '/pages/index/index',
    $: vi.fn(),
    $$: vi.fn().mockResolvedValue([]),
    waitFor: vi.fn().mockResolvedValue(undefined),
    data: vi.fn().mockResolvedValue({}),
  };
}

/**
 * 创建 Mock 的 Element 对象
 *
 * @param options - 元素配置选项
 * @param options.tagName - 标签名（默认: 'view'）
 * @param options.text - 文本内容
 * @param options.className - 类名
 *
 * @example
 * const button = createMockElement({
 *   tagName: 'button',
 *   text: 'Click me',
 *   className: 'btn-primary'
 * });
 */
export function createMockElement(options: {
  tagName?: string;
  text?: string;
  className?: string;
} = {}) {
  return {
    tagName: options.tagName || 'view',
    text: vi.fn().mockResolvedValue(options.text || ''),
    attribute: vi.fn().mockImplementation((attr: string) => {
      if (attr === 'class') return Promise.resolve(options.className || '');
      return Promise.resolve('');
    }),
    tap: vi.fn().mockResolvedValue(undefined),
    input: vi.fn().mockResolvedValue(undefined),
    size: vi.fn().mockResolvedValue({ width: 100, height: 50 }),
    offset: vi.fn().mockResolvedValue({ left: 10, top: 20 }),
  };
}

// ============================================================================
// Real Environment Testing Helpers (Integration Testing)
// ============================================================================

// 环境变量控制
const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true';

// 测试项目路径
const TEST_PROJECT_PATH = path.resolve(process.cwd(), 'playground/wx');

/**
 * 辅助函数：创建真实的微信小程序环境
 * 参考 chrome-devtools-mcp 的 withBrowser 模式
 * 用于真实环境集成测试
 *
 * @example
 * await withMiniProgram(async (response, context) => {
 *   await getPageSnapshotTool.handler({ params: {} }, response, context);
 *   expect(context.elementMap.size).toBeGreaterThan(0);
 * });
 */
export async function withMiniProgram(
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

/**
 * 导出环境变量控制标志
 * 用于根据环境决定是否跳过集成测试
 */
export { RUN_INTEGRATION_TESTS, TEST_PROJECT_PATH };
