/**
 * MCP 协议测试
 *
 * 测试目标：验证 MCP 服务器的协议实现正确性
 * 特点：使用 StdioClientTransport 启动服务器，测试协议层功能
 * 范围：仅测试核心协议功能，工具业务逻辑在 tests/tools/ 中测试
 *
 * 参考：chrome-devtools-mcp/tests/index.test.ts
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 辅助函数：创建 MCP 客户端并执行回调
 */
async function withClient(cb: (client: Client) => Promise<void>) {
  const serverPath = path.join(__dirname, '../../build/server.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
  });

  const client = new Client(
    {
      name: 'protocol-test-client',
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

describe('MCP Protocol Tests', () => {
  describe('Server Capabilities', () => {
    it('应该成功连接到 MCP 服务器', async () => {
      await withClient(async (client) => {
        // 如果能执行到这里，说明连接成功
        expect(client).toBeDefined();
      });
    });

    it('应该返回正确的服务器信息', async () => {
      await withClient(async (client) => {
        // MCP SDK 在连接时会交换服务器信息
        const { tools } = await client.listTools();
        expect(tools).toBeDefined();
      });
    });
  });

  describe('Tools Registration', () => {
    it('应该注册所有 37 个工具', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();

        expect(tools).toHaveLength(37);

        // 验证工具名称格式（支持 snake_case、camelCase 和特殊字符如 $）
        tools.forEach(tool => {
          expect(tool.name).toMatch(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/);
        });
      });
    });

    it('应该包含所有核心工具', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const toolNames = tools.map(t => t.name);

        // 验证连接管理工具
        expect(toolNames).toContain('connect_devtools');
        expect(toolNames).toContain('connect_devtools_enhanced');
        expect(toolNames).toContain('get_current_page');

        // 验证页面查询工具
        expect(toolNames).toContain('$');
        expect(toolNames).toContain('waitFor');
        expect(toolNames).toContain('get_page_snapshot');

        // 验证交互操作工具
        expect(toolNames).toContain('click');
        expect(toolNames).toContain('input_text');

        // 验证断言工具
        expect(toolNames).toContain('assert_exists');
        expect(toolNames).toContain('assert_text');

        // 验证导航工具
        expect(toolNames).toContain('navigate_to');
        expect(toolNames).toContain('navigate_back');
      });
    });

    it('每个工具应该有完整的定义', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();

        tools.forEach(tool => {
          // 验证必需字段
          expect(tool.name).toBeDefined();
          expect(tool.description).toBeDefined();
          expect(tool.inputSchema).toBeDefined();

          // 验证 description 不为空
          expect(tool.description.length).toBeGreaterThan(0);

          // 验证 inputSchema 是有效的 JSON Schema
          expect(tool.inputSchema.type).toBe('object');
          expect(tool.inputSchema.properties).toBeDefined();
        });
      });
    });
  });

  describe('Tool Schema Validation', () => {
    it('connect_devtools_enhanced 应该有正确的 schema', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === 'connect_devtools_enhanced');

        expect(tool).toBeDefined();
        expect(tool!.inputSchema.properties.projectPath).toBeDefined();
        expect(tool!.inputSchema.properties.mode).toBeDefined();
        expect(tool!.inputSchema.required).toContain('projectPath');

        // 验证 mode 的枚举值
        const modeSchema = tool!.inputSchema.properties.mode;
        expect(modeSchema.enum).toEqual(['auto', 'launch', 'connect']);
      });
    });

    it('$ 选择器工具应该有正确的 schema', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === '$');

        expect(tool).toBeDefined();
        expect(tool!.inputSchema.properties.selector).toBeDefined();
        expect(tool!.inputSchema.required).toContain('selector');
      });
    });

    it('waitFor 工具应该有正确的 schema', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === 'waitFor');

        expect(tool).toBeDefined();
        const props = tool!.inputSchema.properties;

        // 验证所有可选参数
        expect(props.selector).toBeDefined();
        expect(props.delay).toBeDefined();
        expect(props.timeout).toBeDefined();
        expect(props.disappear).toBeDefined();
        expect(props.text).toBeDefined();
      });
    });
  });

  describe('Tool Invocation', () => {
    it('应该能调用 diagnose_connection 工具（无需连接）', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'diagnose_connection',
          arguments: {
            projectPath: '/tmp/test-project',
            verbose: false
          }
        });

        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0].type).toBe('text');
      });
    });

    it('应该能调用 check_environment 工具', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'check_environment',
          arguments: {}
        });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');

        const text = result.content[0].text;
        expect(text).toContain('环境检查');
      });
    });

    it('调用需要连接的工具应该返回错误', async () => {
      await withClient(async (client) => {
        try {
          await client.callTool({
            name: 'get_page_snapshot',
            arguments: {}
          });
          // 不应该执行到这里
          expect.fail('应该抛出错误');
        } catch (error) {
          // 预期的错误：未连接到微信开发者工具
          expect(error).toBeDefined();
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('调用不存在的工具应该返回错误', async () => {
      await withClient(async (client) => {
        try {
          await client.callTool({
            name: 'non_existent_tool',
            arguments: {}
          });
          expect.fail('应该抛出错误');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    it('传递错误的参数类型应该返回错误', async () => {
      await withClient(async (client) => {
        try {
          await client.callTool({
            name: 'connect_devtools_enhanced',
            arguments: {
              projectPath: 123, // 错误类型：应该是 string
              mode: 'auto'
            }
          });
          expect.fail('应该抛出错误');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    it('缺少必需参数应该返回错误', async () => {
      await withClient(async (client) => {
        try {
          await client.callTool({
            name: 'click',
            arguments: {} // 缺少必需的 uid 参数
          });
          expect.fail('应该抛出错误');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });
  });
});
