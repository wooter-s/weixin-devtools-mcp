/**
 * MCP 协议测试
 *
 * 测试目标：验证 MCP 服务器协议实现与工具 profile 过滤机制。
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect } from 'vitest';

// 通过 createRequire 读取 package.json，避免 import attributes（Node16 module 不支持）
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { name: string; version: string };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WithClientOptions {
  serverArgs?: string[];
  env?: Record<string, string>;
}

const V2_ENVELOPE_KEYS = [
  'code',
  'data',
  'error',
  'meta',
  'nextActions',
  'observation',
  'ok',
  'partialData',
  'schemaVersion',
  'warnings',
].sort();

function expectV2Envelope(
  structuredContent: unknown,
  expected: { ok: boolean; code: string },
): Record<string, unknown> {
  expect(structuredContent).toBeDefined();
  const envelope = structuredContent as Record<string, unknown>;

  expect(Object.keys(envelope).sort()).toEqual(V2_ENVELOPE_KEYS);
  expect(envelope).toMatchObject({
    schemaVersion: '2.0',
    ok: expected.ok,
    code: expected.code,
    warnings: expect.any(Array),
    nextActions: expect.any(Array),
    meta: expect.objectContaining({
      requestId: expect.any(String),
      tool: expect.any(String),
      durationMs: expect.any(Number),
    }),
  });

  if (expected.ok) {
    expect(envelope.error).toBeNull();
    expect(envelope.partialData).toBeNull();
  } else {
    expect(envelope.data).toBeNull();
    expect(envelope.error).toEqual(expect.objectContaining({
      message: expect.any(String),
      retryable: expect.any(Boolean),
    }));
  }

  return envelope;
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

    it('应该返回与 package.json 一致的服务器信息', async () => {
      await withClient(async (client) => {
        const serverInfo = client.getServerVersion();

        expect(serverInfo).toBeDefined();
        expect(serverInfo?.name).toBe(packageJson.name);
        expect(serverInfo?.version).toBe(packageJson.version);
      });
    });
  });

  describe('Resources', () => {
    it('断开连接时仍应列出页面资源，但读取页面快照应返回协议错误', async () => {
      await withClient(async (client) => {
        const { resources } = await client.listResources();
        expect(resources.map(resource => resource.uri)).toEqual([
          'weixin://connection/status',
          'weixin://page/snapshot',
        ]);

        const read = client.readResource({
          uri: 'weixin://page/snapshot',
        });
        await expect(read).rejects.toMatchObject({ code: ErrorCode.InvalidRequest });
        await expect(read).rejects.toThrow('获取页面快照失败: 请先连接微信开发者工具');
      });
    });

    it('连接状态资源应该返回 V2 profile 与监听状态', async () => {
      await withClient(async (client) => {
        const result = await client.readResource({
          uri: 'weixin://connection/status',
        });
        const content = result.contents[0] as { text?: string };
        expect(content.text).toBeDefined();

        const status = JSON.parse(content.text ?? '{}') as Record<string, unknown>;
        expect(status).toMatchObject({
          schemaVersion: '2.0',
          state: 'disconnected',
          connected: false,
          method: null,
          toolProfile: {
            profile: 'core',
            activeToolCount: 20,
            disabledToolCount: 11,
            activeCategories: ['core'],
            inactiveCategories: ['console', 'network', 'debug'],
          },
          monitoring: {
            console: { enabled: false, state: 'disabled' },
            network: { enabled: false, state: 'disabled' },
          },
        });
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
        expect(toolNames).toContain('find_elements');
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
          expect((tool.description ?? '').length).toBeGreaterThan(0);
          expect(tool.inputSchema.type).toBe('object');
          expect(tool.inputSchema.properties).toBeDefined();
        });
      });
    });
  });

  describe('Tool Schema Validation', () => {
    it('connect_devtools 应该只暴露 V2 判别式 target schema', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === 'connect_devtools');

        expect(tool).toBeDefined();
        if (!tool) {
          throw new Error('connect_devtools tool not found');
        }

        const props = tool.inputSchema.properties ?? {};
        expect(props.target).toBeDefined();
        expect(props.strategy).toBeUndefined();
        expect(props.projectPath).toBeUndefined();

        const required = tool.inputSchema.required || [];
        expect(required).toEqual(['target']);

        const targetSchema = props.target as {
          anyOf?: Array<{
            properties?: Record<string, { const?: string }>;
            required?: string[];
            additionalProperties?: boolean;
          }>;
        };
        const variants = targetSchema.anyOf ?? [];
        expect(variants.map(variant => variant.properties?.kind?.const)).toEqual([
          'project',
          'wsEndpoint',
          'browserUrl',
          'discover',
        ]);
        expect(variants.map(variant => variant.required)).toEqual([
          ['kind', 'projectPath'],
          ['kind', 'endpoint'],
          ['kind', 'url'],
          ['kind'],
        ]);
        expect(variants.every(variant => variant.additionalProperties === false)).toBe(true);
      });
    });

    it('元素动作 target 应该只接受 ref 或 locator path', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === 'click');

        expect(tool).toBeDefined();
        if (!tool) {
          throw new Error('click tool not found');
        }

        const targetSchema = tool.inputSchema.properties?.target as {
          anyOf?: Array<{ properties?: Record<string, { const?: string }> }>;
        };
        const kinds = (targetSchema.anyOf ?? [])
          .map(variant => variant.properties?.kind?.const);

        expect(kinds).toEqual(['ref', 'path']);
        expect(kinds).not.toContain('selector');
        expect(kinds).not.toContain('id');
        expect(kinds).not.toContain('text');
      });
    });

    it('find_elements 工具应该有正确的 locator schema', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === 'find_elements');

        expect(tool).toBeDefined();
        if (!tool) {
          throw new Error('find_elements tool not found');
        }

        const props = tool.inputSchema.properties ?? {};
        expect(props.locator).toBeDefined();
        expect(tool.inputSchema.required).toContain('locator');
      });
    });

    it('wait_for 工具应该有正确的 schema', async () => {
      await withClient(async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find(t => t.name === 'wait_for');

        expect(tool).toBeDefined();
        if (!tool) {
          throw new Error('wait_for tool not found');
        }

        const props = tool.inputSchema.properties ?? {};
        expect(props.target).toBeDefined();
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

        const content = result.content as Array<{ type: string; text?: string }>;

        expect(content).toBeDefined();
        expect(content.length).toBeGreaterThan(0);
        expect(content[0].type).toBe('text');
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

        const content = result.content as Array<{ type: string; text?: string }>;

        expect(content).toBeDefined();
        expect(content[0].type).toBe('text');
        expect(content[0].text).toContain('环境检查');
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
        expectV2Envelope(result.structuredContent, { ok: false, code: 'TOOL_DISABLED' });

        const content = result.content as Array<{ type: string; text?: string }>;
        const text = content
          .filter((item: { type: string }) => item.type === 'text')
          .map((item: { text?: string }) => item.text ?? '')
          .join('\n');
        expect(text).toContain('当前未启用');
        expect(text).toContain('enable-categories=debug');
      });
    });

    it('get_connection_status 应该返回统一成功信封以及 profile/monitoring', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'get_connection_status',
          arguments: { refreshHealth: false },
        });

        expect(result.isError).toBe(false);
        const envelope = expectV2Envelope(result.structuredContent, { ok: true, code: 'OK' });
        expect(envelope.data).toMatchObject({
          state: 'disconnected',
          connected: false,
          method: null,
          toolProfile: {
            profile: 'core',
            activeToolCount: 20,
            disabledToolCount: 11,
            activeCategories: ['core'],
            inactiveCategories: ['console', 'network', 'debug'],
          },
          monitoring: {
            console: {
              enabled: false,
              state: 'disabled',
              startedAt: null,
              lastError: null,
            },
            network: {
              enabled: false,
              state: 'disabled',
              startedAt: null,
              lastError: null,
            },
          },
        });
      });
    });

    it('handler 失败时应该保留原始文本、isError 和统一失败信封', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'get_page_snapshot',
          arguments: {},
        });

        expect(result.isError).toBe(true);
        const envelope = expectV2Envelope(result.structuredContent, {
          ok: false,
          code: 'NOT_CONNECTED',
        });
        expect(envelope.partialData).toBeNull();
        expect(envelope.observation).toBeNull();

        const text = (result.content as Array<{ type: string; text?: string }>)
          .filter(item => item.type === 'text')
          .map(item => item.text ?? '')
          .join('\n');
        expect(text).toContain('[NOT_CONNECTED] 请先连接微信开发者工具');
        expect(text).toContain('❌ 获取页面快照失败: 请先连接微信开发者工具');
        expect(text).toContain('💡 检查连接状态、root target 和快照预算后重试');
      });
    });
  });

  describe('Error Handling', () => {
    it('官方 SDK 客户端缓存 outputSchema 后仍能读取结构化工具错误', async () => {
      await withClient(async (client) => {
        await client.listTools();
        const result = await client.callTool({
          name: 'get_current_page',
          arguments: {},
        });

        expect(result.isError).toBe(true);
        expectV2Envelope(result.structuredContent, { ok: false, code: 'NOT_CONNECTED' });
      });
    });

    it('调用不存在的工具应该返回错误', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'non_existent_tool',
          arguments: {},
        });

        expect(result.isError).toBe(true);
        expectV2Envelope(result.structuredContent, { ok: false, code: 'UNKNOWN_TOOL' });
      });
    });

    it('V2 连接 target 参数类型错误应该返回 INVALID_ARGUMENT', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'connect_devtools',
          arguments: {
            target: {
              kind: 'project',
              projectPath: 123,
            },
          },
        });

        expect(result.isError).toBe(true);
        expectV2Envelope(result.structuredContent, { ok: false, code: 'INVALID_ARGUMENT' });
      });
    });

    it('input_text 的 replace 模式缺少 text 时返回 INVALID_ARGUMENT', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'input_text',
          arguments: {
            target: {
              kind: 'path',
              path: [{ kind: 'selector', value: 'input' }],
            },
            mode: 'replace',
          },
        });

        expect(result.isError).toBe(true);
        expectV2Envelope(result.structuredContent, { ok: false, code: 'INVALID_ARGUMENT' });
      });
    });

    it('缺少必需参数应该返回错误', async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'click',
          arguments: {},
        });

        expect(result.isError).toBe(true);
        expectV2Envelope(result.structuredContent, { ok: false, code: 'INVALID_ARGUMENT' });
      });
    });
  });
});
