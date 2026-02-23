/**
 * MCP 协议测试
 *
 * 测试目标：验证 MCP 服务器协议实现与工具 profile 过滤机制。
 */

import path from 'path';
import { fileURLToPath } from 'url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WithClientOptions {
  serverArgs?: string[];
  env?: Record<string, string>;
}

function getSpawnEnv(overrides?: Record<string, string>): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      environment[key] = value;
    }
  }

  delete environment.WEIXIN_MCP_TOOLS_PROFILE;
  delete environment.WEIXIN_MCP_ENABLE_CATEGORIES;
  delete environment.WEIXIN_MCP_DISABLE_CATEGORIES;

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      environment[key] = value;
    }
  }

  return environment;
}

/**
 * 辅助函数：创建 MCP 客户端并执行回调
 */
async function withClient(
  cb: (client: Client) => Promise<void>,
  options?: WithClientOptions
) {
  const serverPath = path.join(__dirname, '../../build/server.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath, ...(options?.serverArgs ?? [])],
    env: getSpawnEnv(options?.env),
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
        expect(client).toBeDefined();
      });
    });

    it('应该返回正确的服务器信息', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        expect(tools).toBeDefined();
      });
    });
  });

  describe('Tools Registration', () => {
    it('默认 profile(core) 应该注册 20 个工具', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();

        expect(tools).toHaveLength(20);
        tools.forEach(tool => {
          expect(tool.name).toMatch(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/);
        });
      });
    });

    it('core profile 应该包含核心工具并排除 debug/network/console', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('connect_devtools');
        expect(toolNames).toContain('reconnect_devtools');
        expect(toolNames).toContain('disconnect_devtools');
        expect(toolNames).toContain('get_connection_status');
        expect(toolNames).toContain('get_current_page');
        expect(toolNames).toContain('query_selector');
        expect(toolNames).toContain('wait_for');
        expect(toolNames).toContain('get_page_snapshot');
        expect(toolNames).toContain('click');
        expect(toolNames).toContain('input_text');
        expect(toolNames).toContain('set_form_control');
        expect(toolNames).toContain('assert_state');
        expect(toolNames).toContain('assert_text');
        expect(toolNames).toContain('assert_attribute');
        expect(toolNames).toContain('navigate_to');
        expect(toolNames).toContain('navigate_back');
        expect(toolNames).toContain('evaluate_script');

        expect(toolNames).not.toContain('diagnose_connection');
        expect(toolNames).not.toContain('list_console_messages');
        expect(toolNames).not.toContain('list_network_requests');
      });
    });

    it('full profile 应该注册所有 31 个工具', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(31);
      }, {
        serverArgs: ['--tools-profile=full'],
      });
    });

    it('core profile 启用 network 类别后应暴露 network 工具', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('list_network_requests');
        expect(toolNames).toContain('get_network_request');
        expect(toolNames).toContain('stop_network_monitoring');
        expect(toolNames).toContain('clear_network_requests');
      }, {
        serverArgs: ['--enable-categories=network'],
      });
    });

    it('每个工具应该有完整的定义', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();

        tools.forEach(tool => {
          expect(tool.name).toBeDefined();
          expect(tool.description).toBeDefined();
          expect(tool.inputSchema).toBeDefined();
          expect(tool.description.length).toBeGreaterThan(0);
          expect(tool.inputSchema.type).toBe('object');
          expect(tool.inputSchema.properties).toBeDefined();
        });
      });
    });
  });

  describe('Tool Schema Validation', () => {
    it('connect_devtools 应该有正确的 schema', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === 'connect_devtools');

        expect(tool).toBeDefined();
        expect(tool!.inputSchema.properties.strategy).toBeDefined();
        expect(tool!.inputSchema.properties.projectPath).toBeDefined();
        const required = tool!.inputSchema.required || [];
        expect(required).not.toContain('projectPath');

        const strategySchema = tool!.inputSchema.properties.strategy;
        expect(strategySchema.enum).toEqual(['auto', 'launch', 'connect', 'wsEndpoint', 'browserUrl', 'discover']);
      });
    });

    it('query_selector 工具应该有正确的 schema', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === 'query_selector');

        expect(tool).toBeDefined();
        expect(tool!.inputSchema.properties.selector).toBeDefined();
        expect(tool!.inputSchema.required).toContain('selector');
      });
    });

    it('wait_for 工具应该有正确的 schema', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === 'wait_for');

        expect(tool).toBeDefined();
        const props = tool!.inputSchema.properties;

        expect(props.selector).toBeDefined();
        expect(props.delay).toBeDefined();
        expect(props.timeout).toBeDefined();
        expect(props.disappear).toBeDefined();
        expect(props.text).toBeDefined();
      });
    });
  });

  describe('Tool Invocation', () => {
    it('full profile 下应该能调用 diagnose_connection 工具（无需连接）', async () => {
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
      }, {
        serverArgs: ['--tools-profile=full'],
      });
    });

    it('full profile 下应该能调用 check_environment 工具', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'check_environment',
          arguments: {}
        });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('环境检查');
      }, {
        serverArgs: ['--tools-profile=full'],
      });
    });

    it('调用被 profile 禁用的工具应该返回可读错误', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'diagnose_connection',
          arguments: {
            projectPath: '/tmp/test-project',
          }
        });

        expect(result.isError).toBe(true);

        const text = result.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('\n');
        expect(text).toContain('当前未启用');
        expect(text).toContain('enable-categories=debug');
      });
    });

    it('调用需要连接的工具应该返回错误', async () => {
      await withClient(async (client) => {
        try {
          await client.callTool({
            name: 'get_page_snapshot',
            arguments: {}
          });
          expect.fail('应该抛出错误');
        } catch (error) {
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
            name: 'connect_devtools',
            arguments: {
              projectPath: 123,
              strategy: 'auto'
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
            arguments: {}
          });
          expect.fail('应该抛出错误');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });
  });
});
