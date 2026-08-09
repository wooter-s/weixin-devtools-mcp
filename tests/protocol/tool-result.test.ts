import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildToolFailure, buildToolSuccess, startToolInvocation } from '../../src/protocol/tool-result.js';
import { defineTool, SimpleToolResponse, ToolCategory } from '../../src/tools/ToolDefinition.js';

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

describe('结构化工具结果', () => {
  it('按工具 outputSchema 校验成功结果', () => {
    const result = buildToolSuccess(tool, startToolInvocation(tool.name), { value: 1 });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ value: 1 });
    expect(result.meta.tool).toBe('example');
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
      ok: false,
      code: 'INTERNAL_ERROR',
      data: null,
      error: { retryable: false },
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
});
