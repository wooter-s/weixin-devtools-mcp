import type { Element } from 'miniprogram-automator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElementTarget } from '../../src/elements/index.js';
import { assertAttributeTool, assertStateTool, assertTextTool } from '../../src/tools/assert.js';
import { createMockContext, createMockPage, createMockResponse } from '../utils/test-factories.js';

const target = { kind: 'ref', ref: 'ref_button' } as const;

function createElement() {
  return {
    tagName: 'button',
    text: vi.fn(async () => '提交订单'),
    attribute: vi.fn(async (name: string) => {
      if (name === 'role') return 'primary';
      if (name === 'disabled') return null;
      if (name === 'checked') return 'true';
      if (name === 'focus') return 'true';
      return null;
    }),
    size: vi.fn(async () => ({ width: 100, height: 40 })),
  };
}

describe('assert tools target API', () => {
  let element: ReturnType<typeof createElement>;
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    element = createElement();
    context = createMockContext({
      currentPage: createMockPage(),
      getElementByTarget: vi.fn(async () => element as unknown as Element),
    });
  });

  it('只接受 target，不再接受 uid', () => {
    expect(assertTextTool.schema.safeParse({ target, text: '提交订单' }).success).toBe(true);
    expect(assertTextTool.schema.safeParse({ uid: 'button-1', text: '提交订单' }).success).toBe(
      false
    );
    expect(
      assertAttributeTool.schema.safeParse({
        target,
        attributeKey: 'role',
        attributeValue: 'primary',
      }).success
    ).toBe(true);
    expect(assertStateTool.schema.safeParse({ target, visible: true }).success).toBe(true);
  });

  it('支持精确文本、包含文本和正则文本断言', async () => {
    for (const params of [
      { target, text: '提交订单' },
      { target, textContains: '提交' },
      { target, textMatches: '^提交.*$' },
    ]) {
      const response = createMockResponse();
      await assertTextTool.handler({ params }, response, context);
      expect(response.getStructuredContent()).toMatchObject({
        passed: true,
        actual: '提交订单',
      });
    }

    expect(context.getElementByTarget).toHaveBeenCalledWith(target);
  });

  it('元素断言在原子 target 操作内完成全部读取', async () => {
    const operatedTargets: (typeof target)[] = [];
    context.withElementByTargetOperation = async <T>(
      receivedTarget: ElementTarget,
      operation: (resolvedElement: Element) => Promise<T>
    ): Promise<T> => {
      operatedTargets.push(receivedTarget as typeof target);
      return operation(element as unknown as Element);
    };

    await assertTextTool.handler(
      { params: { target, text: '提交订单' } },
      createMockResponse(),
      context
    );
    await assertAttributeTool.handler(
      { params: { target, attributeKey: 'role', attributeValue: 'primary' } },
      createMockResponse(),
      context
    );
    await assertStateTool.handler(
      { params: { target, visible: true, enabled: true } },
      createMockResponse(),
      context
    );

    expect(operatedTargets).toEqual([target, target, target]);
    expect(context.getElementByTarget).not.toHaveBeenCalled();
  });

  it('文本不匹配时返回结构化失败并抛错', async () => {
    const response = createMockResponse();

    await expect(
      assertTextTool.handler({ params: { target, text: '取消' } }, response, context)
    ).rejects.toThrow('文本断言失败');

    expect(response.getStructuredContent()).toMatchObject({
      passed: false,
      expected: '取消',
      actual: '提交订单',
    });
  });

  it('断言元素属性并输出结构化结果', async () => {
    const response = createMockResponse();

    await assertAttributeTool.handler(
      { params: { target, attributeKey: 'role', attributeValue: 'primary' } },
      response,
      context
    );

    expect(element.attribute).toHaveBeenCalledWith('role');
    expect(response.getStructuredContent()).toMatchObject({
      passed: true,
      expected: 'primary',
      actual: 'primary',
    });
  });

  it('缺失属性不能与期望空字符串误判为相等', async () => {
    const response = createMockResponse();

    await expect(
      assertAttributeTool.handler(
        { params: { target, attributeKey: 'missing', attributeValue: '' } },
        response,
        context
      )
    ).rejects.toThrow('断言失败');
    expect(response.getStructuredContent()).toMatchObject({
      passed: false,
      expected: '',
      actual: null,
    });
  });

  it('非法文本正则返回 INVALID_ARGUMENT', async () => {
    await expect(
      assertTextTool.handler(
        { params: { target, textMatches: '[' } },
        createMockResponse(),
        context
      )
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('支持 visible、enabled、checked、focused 的组合断言', async () => {
    const response = createMockResponse();

    await assertStateTool.handler(
      {
        params: {
          target,
          visible: true,
          enabled: true,
          checked: true,
          focused: true,
        },
      },
      response,
      context
    );

    expect(response.getStructuredContent()).toMatchObject({
      passed: true,
      total: 4,
      passedCount: 4,
      failedCount: 0,
    });
  });

  it('focus 缺失时回退读取 focused 属性', async () => {
    element.attribute.mockImplementation(async (name) => {
      if (name === 'focus') return null;
      if (name === 'focused') return 'true';
      return null;
    });
    const response = createMockResponse();

    await assertStateTool.handler({ params: { target, focused: true } }, response, context);

    expect(element.attribute).toHaveBeenCalledWith('focused');
    expect(response.getStructuredContent()).toMatchObject({ passed: true });
  });

  it('状态属性读取失败时向上抛错，不会把异常当成属性缺失', async () => {
    const cases = [
      { params: { target, enabled: true }, attribute: 'disabled' },
      { params: { target, checked: false }, attribute: 'checked' },
      { params: { target, focused: false }, attribute: 'focus' },
    ];

    for (const testCase of cases) {
      const readError = new Error(`${testCase.attribute} read failed`);
      element.attribute.mockRejectedValueOnce(readError);

      await expect(
        assertStateTool.handler({ params: testCase.params }, createMockResponse(), context)
      ).rejects.toBe(readError);
    }
  });

  it('状态不匹配时保留每项结果并抛错', async () => {
    element.size.mockResolvedValue({ width: 0, height: 0 });
    const response = createMockResponse();

    await expect(
      assertStateTool.handler({ params: { target, visible: true } }, response, context)
    ).rejects.toThrow('状态断言失败');

    expect(response.getStructuredContent()).toMatchObject({
      passed: false,
      total: 1,
      failedCount: 1,
    });
  });

  it('没有当前页面时在解析 target 前失败', async () => {
    const contextWithoutPage = createMockContext({ currentPage: null });

    await expect(
      assertTextTool.handler(
        { params: { target, text: '提交订单' } },
        createMockResponse(),
        contextWithoutPage
      )
    ).rejects.toThrow('请先获取当前页面');
    expect(contextWithoutPage.getElementByTarget).not.toHaveBeenCalled();
  });
});
