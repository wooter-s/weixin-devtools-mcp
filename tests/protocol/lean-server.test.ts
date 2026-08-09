import { spawnSync } from 'node:child_process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  EmptyResultSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod/v4';

import { LeanServer } from '../../src/protocol/lean-server.js';

function createLinkedPeers() {
  const server = new LeanServer(
    { name: 'lean-test-server', version: '1.0.0' },
    { capabilities: { resources: {}, tools: {} } },
  );
  const client = new Client(
    { name: 'lean-test-client', version: '1.0.0' },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  return { client, clientTransport, server, serverTransport };
}

async function closePeers(client: Client, server: LeanServer): Promise<void> {
  await Promise.allSettled([client.close(), server.close()]);
}

describe('LeanServer', () => {
  it('与官方 Client 完成初始化、ping 及 resources/tools 请求，且不广告 tasks', async () => {
    const { client, clientTransport, server, serverTransport } = createLinkedPeers();
    const initialized = vi.fn();
    server.oninitialized = initialized;
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [{ uri: 'test://status', name: 'status' }],
    }));
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{
        name: 'echo',
        description: 'Echo input',
        inputSchema: { type: 'object', properties: {} },
      }],
    }));

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      expect(client.getServerVersion()).toMatchObject({
        name: 'lean-test-server',
        version: '1.0.0',
      });
      expect(client.getServerCapabilities()).toEqual({ resources: {}, tools: {} });
      expect(client.getServerCapabilities()?.tasks).toBeUndefined();
      expect(server.getClientVersion()).toMatchObject({ name: 'lean-test-client' });
      expect(server.getClientCapabilities()).toEqual({});
      expect(initialized).toHaveBeenCalledOnce();

      await expect(client.ping()).resolves.toEqual({});
      await expect(client.listResources()).resolves.toMatchObject({
        resources: [{ uri: 'test://status' }],
      });
      await expect(client.listTools()).resolves.toMatchObject({
        tools: [{ name: 'echo' }],
      });
    } finally {
      await closePeers(client, server);
    }
  });

  it('校验 tools/call 请求与 CallToolResult，并保留标准 McpError', async () => {
    const { client, clientTransport, server, serverTransport } = createLinkedPeers();
    const handler = vi.fn(async (request: z.infer<typeof CallToolRequestSchema>) => {
      if (request.params.name === 'invalid-result') {
        return { content: [{ type: 'text' }] } as never;
      }
      return { content: [{ type: 'text' as const, text: 'ok' }] };
    });
    server.setRequestHandler(CallToolRequestSchema, handler);

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      await expect(client.callTool({ name: 'valid-result' })).resolves.toMatchObject({
        content: [{ type: 'text', text: 'ok' }],
      });

      const invalidResultError = await client.callTool({ name: 'invalid-result' })
        .then(() => undefined, error => error);
      expect(invalidResultError).toBeInstanceOf(McpError);
      expect(invalidResultError).toMatchObject({ code: ErrorCode.InvalidParams });
      expect(String(invalidResultError)).toContain('Invalid tools/call result');

      const callsBeforeMalformedRequest = handler.mock.calls.length;
      const malformedRequestError = await client.request(
        { method: 'tools/call', params: {} } as never,
        CallToolResultSchema,
      ).then(() => undefined, error => error);
      expect(malformedRequestError).toBeInstanceOf(McpError);
      expect(handler).toHaveBeenCalledTimes(callsBeforeMalformedRequest);

      const taskError = await client.request(
        {
          method: 'tools/call',
          params: { name: 'valid-result', task: { ttl: 1_000 } },
        } as never,
        CallToolResultSchema,
      ).then(() => undefined, error => error);
      expect(taskError).toMatchObject({ code: ErrorCode.InvalidRequest });
      expect(String(taskError)).toContain('tasks are not supported');
      expect(handler).toHaveBeenCalledTimes(callsBeforeMalformedRequest);

      const missingMethodError = await client.request(
        { method: 'not-supported' } as never,
        EmptyResultSchema,
      ).then(() => undefined, error => error);
      expect(missingMethodError).toMatchObject({ code: ErrorCode.MethodNotFound });
    } finally {
      await closePeers(client, server);
    }
  });

  it('构建产物的导入图不加载高层 Server 或 Ajv', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "await import('./build/protocol/lean-server.js')",
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, NODE_DEBUG: 'esm' },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('/shared/protocol.js');
    expect(result.stderr).not.toMatch(/@modelcontextprotocol\/sdk\/dist\/(?:esm|cjs)\/server\/index\.js/);
    expect(result.stderr).not.toMatch(/node_modules\/ajv(?:\/|$)/);
  });

  it('通过 Protocol 对已注册通知执行 schema 校验', async () => {
    const { client, clientTransport, server, serverTransport } = createLinkedPeers();
    const notificationSchema = z.object({
      method: z.literal('notifications/test'),
      params: z.object({ value: z.string() }),
    });
    const notificationHandler = vi.fn();
    const onerror = vi.fn();
    server.onerror = onerror;
    server.setNotificationHandler(notificationSchema, notificationHandler);

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await client.notification({
        method: 'notifications/test',
        params: { value: 42 },
      } as never);
      await new Promise(resolve => setImmediate(resolve));

      expect(notificationHandler).not.toHaveBeenCalled();
      expect(onerror).toHaveBeenCalledOnce();
      expect(onerror.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    } finally {
      await closePeers(client, server);
    }
  });
});
