import type { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it, vi } from 'vitest';

import { createToolRuntimeLoader } from '../../src/tools/runtime-loader.js';

describe('工具运行时懒加载', () => {
  it('首次 load 前不导入工具实现，并发首调只导入一次', async () => {
    const importer = vi.fn(() => import('../../src/tools/index.js'));
    const loader = createToolRuntimeLoader(importer);

    expect(importer).not.toHaveBeenCalled();
    const first = loader.load();
    const second = loader.load();

    expect(first).toBe(second);
    const runtime = await first;
    expect(importer).toHaveBeenCalledOnce();
    expect(runtime.allTools).toHaveLength(31);
    expect(new runtime.SimpleToolResponse().getResponseText()).toBe('');
  });

  it('载入失败后清除 Promise，允许下一次调用重试', async () => {
    const runtime = await import('../../src/tools/index.js');
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error('temporary import failure'))
      .mockResolvedValue(runtime);
    const loader = createToolRuntimeLoader(importer);

    await expect(loader.load()).rejects.toThrow('temporary import failure');
    await expect(loader.load()).resolves.toMatchObject({ allTools: runtime.allTools });
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('stdio initialize/list 不加载工具实现与结果信封模块', async () => {
    const environment = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => (
        typeof entry[1] === 'string'
      )),
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['build/server.js'],
      cwd: process.cwd(),
      env: { ...environment, NODE_DEBUG: 'esm' },
      stderr: 'pipe',
    });
    const stderr = transport.stderr;
    let moduleTrace = '';
    stderr?.on('data', chunk => {
      moduleTrace += String(chunk);
    });
    const client = new Client(
      { name: 'lazy-import-test', version: '1.0.0' },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
      await expect(client.listTools()).resolves.toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'get_connection_status' }),
        ]),
      });
    } finally {
      await client.close();
      if (stderr) await finished(stderr as PassThrough).catch(() => undefined);
    }

    expect(moduleTrace).toContain('[ToolProfile] profile=core, active=20, disabled=11');
    expect(moduleTrace).not.toMatch(/build\/tools\/(?:tools|index|ToolDefinition)\.js/);
    expect(moduleTrace).not.toContain('/build/protocol/tool-result.js');
    expect(moduleTrace).not.toContain('/build/tools/result.js');
  });
});
