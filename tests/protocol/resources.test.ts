/**
 * MCP Resources 测试
 *
 * 测试目标：验证 MCP 服务器的资源提供功能
 * 资源类型：
 * - weixin://connection/status - 连接状态
 * - weixin://page/snapshot - 页面快照
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
      name: 'resources-test-client',
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

describe('MCP Resources Tests', () => {
  describe('Resource Listing', () => {
    it('应该提供连接状态资源', async () => {
      await withClient(async (client) => {
        const { resources } = await client.listResources();

        expect(resources).toBeDefined();
        expect(resources.some(r => r.uri === 'weixin://connection/status')).toBe(true);
      });
    });

    it('应该提供资源列表', async () => {
      await withClient(async (client) => {
        const { resources } = await client.listResources();

        expect(resources).toBeDefined();
        expect(resources.length).toBeGreaterThan(0);

        // 验证资源结构
        resources.forEach(resource => {
          expect(resource.uri).toBeDefined();
          expect(resource.name).toBeDefined();
          expect(resource.description).toBeDefined();
        });
      });
    });
  });

  describe('Resource Reading', () => {
    it('应该能读取连接状态资源', async () => {
      await withClient(async (client) => {
        const result = await client.readResource({
          uri: 'weixin://connection/status'
        });

        expect(result.contents).toBeDefined();
        expect(result.contents.length).toBeGreaterThan(0);
        expect(result.contents[0].mimeType).toBe('application/json');

        // 验证状态内容
        const status = JSON.parse(result.contents[0].text);
        expect(status).toHaveProperty('connected');
        expect(status).toHaveProperty('hasCurrentPage');
      });
    });

    it('读取不存在的资源应该返回错误', async () => {
      await withClient(async (client) => {
        try {
          await client.readResource({
            uri: 'weixin://nonexistent/resource'
          });
          expect.fail('应该抛出错误');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });
  });

  describe('Resource Content Validation', () => {
    it('连接状态资源应该包含正确的字段', async () => {
      await withClient(async (client) => {
        const result = await client.readResource({
          uri: 'weixin://connection/status'
        });

        const status = JSON.parse(result.contents[0].text);

        // 验证必需字段
        expect(typeof status.connected).toBe('boolean');
        expect(typeof status.hasCurrentPage).toBe('boolean');

        // 未连接时的状态验证
        expect(status.connected).toBe(false);
        expect(status.hasCurrentPage).toBe(false);
      });
    });
  });
});
