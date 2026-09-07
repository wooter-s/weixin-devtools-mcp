import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildToolFailure, buildToolSuccess, startToolInvocation } from '../../src/protocol/tool-result.js';
import { defineTool, SimpleToolResponse, ToolCategory } from '../../src/tools/ToolDefinition.js';
import { serializeToolDiagnostic } from '../../src/tools/result.js';

const tool = defineTool({
  name: 'example',
  description: 'example',
  schema: z.object({}),
  outputSchema: z.object({ value: z.number() }),
  annotations: { category: ToolCategory.CORE },
  handler: async () => undefined,
});

const invalidHandlerOutputTool = defineTool({
  name: 'invalid-handler-output',
  description: 'invalid handler output',
  schema: z.object({}),
  outputSchema: z.object({ value: z.number() }),
  annotations: { category: ToolCategory.CORE },
  handler: async (_request, response) => {
    response.mergeStructuredContent({ value: 'not-a-number' });
  },
});

const publicPayloadTool = defineTool({
  name: 'public-payload',
  description: 'public payload',
  schema: z.object({}),
  outputSchema: z.object({
    message: z.string(),
    url: z.string(),
  }),
  annotations: { category: ToolCategory.CORE },
  handler: async () => undefined,
});

describe('结构化工具结果', () => {
  it('按工具 outputSchema 校验成功结果', () => {
    const result = buildToolSuccess(tool, startToolInvocation(tool.name), { value: 1 });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ value: 1 });
    expect(result.meta.tool).toBe('example');
    expect(result).toMatchObject({
      schemaVersion: '2.0',
      error: null,
      partialData: null,
      observation: null,
    });
  });

  it('普通成功结果保留业务 token 文本与 URL query', () => {
    const result = buildToolSuccess(
      publicPayloadTool,
      startToolInvocation(publicPayloadTool.name),
      {
        message: '业务正文 token=not-a-credential',
        url: 'https://example.test/api?token=business-value#section',
      },
    );

    expect(result.data).toEqual({
      message: '业务正文 token=not-a-credential',
      url: 'https://example.test/api?token=business-value#section',
    });
  });

  it('拒绝与工具 outputSchema 不一致的数据', () => {
    expect(() => buildToolSuccess(tool, startToolInvocation(tool.name), { value: 'bad' }))
      .toThrow();
  });

  it('handler 输出与 dataSchema 不匹配时归类为 INTERNAL_ERROR', async () => {
    const response = new SimpleToolResponse();
    await invalidHandlerOutputTool.handler({ params: {} }, response, null as never);

    const invocation = startToolInvocation(invalidHandlerOutputTool.name);
    let validationError: Error | undefined;
    try {
      buildToolSuccess(
        invalidHandlerOutputTool,
        invocation,
        response.getStructuredContent(),
      );
    } catch (error) {
      if (error instanceof Error) validationError = error;
    }
    if (!validationError) throw new Error('预期输出 schema 校验失败');

    const failure = buildToolFailure(invocation, validationError);
    expect(failure).toMatchObject({
      schemaVersion: '2.0',
      ok: false,
      code: 'INTERNAL_ERROR',
      data: null,
      error: {
        retryable: false,
        diagnostic: { kind: 'validation' },
      },
      partialData: null,
      observation: null,
    });
  });

  it('调用边界可将输入 ZodError 显式归类为 INVALID_ARGUMENT', () => {
    const parsed = z.object({ value: z.number() }).safeParse({ value: 'bad' });
    if (parsed.success) throw new Error('预期输入 schema 校验失败');

    const failure = buildToolFailure(
      startToolInvocation(tool.name),
      parsed.error,
      { code: 'INVALID_ARGUMENT' },
    );
    expect(failure.code).toBe('INVALID_ARGUMENT');
  });

  it('将可恢复的页面错误转换为稳定错误码', () => {
    const result = buildToolFailure(
      startToolInvocation(tool.name),
      new Error('当前页面已失效 stale element'),
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'STALE_ELEMENT',
      error: { retryable: true },
    });
    expect(result.nextActions[0]?.tool).toBe('get_page_snapshot');
    expect(() => tool.outputSchema.parse(result)).not.toThrow();
  });

  it('失败结果保留白名单内的部分结果、观察与提示', () => {
    const result = buildToolFailure(
      startToolInvocation(tool.name),
      new Error('操作失败'),
      {
        code: 'DEVTOOLS_OPERATION_FAILED',
        partialData: { actual: 1 },
        observation: {
          pagePath: '/pages/home/index',
          pageRevision: 2,
          generatedAt: '2026-08-10T00:00:00.000Z',
        },
        warnings: [{ code: 'PARTIAL', message: '已返回部分数据' }],
      },
    );

    expect(result).toMatchObject({
      partialData: { actual: 1 },
      observation: { pageRevision: 2 },
      warnings: [{ code: 'PARTIAL' }],
    });
    expect(() => tool.outputSchema.parse(result)).not.toThrow();
  });

  it('诊断序列化只保留白名单字段并清除端点凭据', () => {
    const diagnostic = serializeToolDiagnostic({
      kind: 'connection',
      phase: 'connect',
      suggestions: ['检查 token=secret-value'],
      metadata: {
        strategy: 'wsEndpoint',
        wsEndpoint: 'ws://user:pass@127.0.0.1:9420/path?token=secret',
        authorization: 'Bearer secret',
      },
      attempts: [],
      stack: 'sensitive stack',
      cause: new Error('sensitive cause'),
      headers: { authorization: 'Bearer secret' },
    });

    expect(diagnostic).toEqual({
      kind: 'connection',
      phase: 'connect',
      suggestions: ['检查 token=[REDACTED]'],
      metadata: {
        strategy: 'wsEndpoint',
        wsEndpoint: 'ws://127.0.0.1:9420/path',
      },
      attempts: [],
    });
    expect(JSON.stringify(diagnostic)).not.toContain('secret');
    expect(JSON.stringify(diagnostic)).not.toContain('stack');
    expect(JSON.stringify(diagnostic)).not.toContain('headers');
  });

  it('失败主消息也应脱敏并截断，而不只清理 diagnostic', () => {
    const rawError = new Error(
      '连接 ws://user:pass@127.0.0.1:9420/path?token=url-secret ' +
      'Authorization: Bearer bearer-secret password=password-secret, ' +
      'x'.repeat(2_500),
    );
    const result = buildToolFailure(
      startToolInvocation('connect_devtools'),
      rawError,
      { code: 'CONNECTION_FAILED' },
    );
    const serialized = JSON.stringify(result);

    expect(result.error.message).toContain('ws://127.0.0.1:9420/path');
    expect(serialized).not.toMatch(/url-secret|bearer-secret|password-secret|user:pass/u);
    expect(result.error.message.length).toBeLessThanOrEqual(2_000);
    expect(rawError.message).toContain('bearer-secret');
  });

  it('严格拒绝字段缺省的 V1 信封', () => {
    expect(tool.outputSchema.safeParse({
      schemaVersion: '1.0',
      ok: true,
      code: 'OK',
      data: { value: 1 },
      warnings: [],
      nextActions: [],
      meta: { requestId: 'req', tool: tool.name, durationMs: 0 },
    }).success).toBe(false);
  });
});
