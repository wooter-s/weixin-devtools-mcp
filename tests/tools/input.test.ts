import type { Element } from 'miniprogram-automator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElementTarget } from '../../src/elements/index.js';
import type { PageStateOperation } from '../../src/tools/ToolDefinition.js';
import {
  clickTool,
  getValueTool,
  inputTextTool,
  setFormControlTool,
} from '../../src/tools/input.js';
import { createMockContext, createMockPage, createMockResponse } from '../utils/test-factories.js';

const target = { kind: 'ref', ref: 'ref_input' } as const;

function createInputElement(initialValue = '') {
  let value: unknown = initialValue;
  return {
    tagName: 'input',
    tap: vi.fn(async () => undefined),
    input: vi.fn(async (nextValue: string) => {
      value = nextValue;
    }),
    value: vi.fn(async () => value),
    text: vi.fn(async () => String(value ?? '')),
    attribute: vi.fn(async (name: string) => (name === 'placeholder' ? '请输入内容' : null)),
    trigger: vi.fn(async (_name: string, detail?: { value?: unknown }) => {
      if (detail && 'value' in detail) value = detail.value;
    }),
  };
}

describe('input tools target API', () => {
  let element: ReturnType<typeof createInputElement>;
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    element = createInputElement('已有');
    context = createMockContext({
      currentPage: createMockPage(),
      getElementByTarget: vi.fn(async () => element as unknown as Element),
      getPageRevision: vi.fn(() => 7),
    });
  });

  it('所有元素工具只接受 target，不再接受 uid', () => {
    expect(clickTool.schema.safeParse({ target }).success).toBe(true);
    expect(clickTool.schema.safeParse({ uid: 'input-1' }).success).toBe(false);
    expect(getValueTool.schema.safeParse({ target }).success).toBe(true);
    expect(setFormControlTool.schema.safeParse({ target, value: 1 }).success).toBe(true);
  });

  it('点击后递增页面版本并返回 target', async () => {
    const response = createMockResponse();

    await clickTool.handler({ params: { target, dblClick: false } }, response, context);

    expect(element.tap).toHaveBeenCalledOnce();
    expect(context.markPageMutation).toHaveBeenCalledOnce();
    expect(response.getStructuredContent()).toMatchObject({
      target,
      doubleClick: false,
      pageRevision: 7,
    });
  });

  it('元素读写工具优先使用原子 resolve+I/O API', async () => {
    const operatedTargets: (typeof target)[] = [];
    context.withElementByTargetOperation = async <T>(
      receivedTarget: ElementTarget,
      operation: (resolvedElement: Element) => Promise<T>
    ): Promise<T> => {
      operatedTargets.push(receivedTarget as typeof target);
      return operation(element as unknown as Element);
    };

    await clickTool.handler({ params: { target, dblClick: false } }, createMockResponse(), context);
    await inputTextTool.handler(
      { params: { target, mode: 'replace', text: '原子输入' } },
      createMockResponse(),
      context
    );
    await setFormControlTool.handler(
      { params: { target, value: 2, trigger: 'change' } },
      createMockResponse(),
      context
    );
    await getValueTool.handler({ params: { target } }, createMockResponse(), context);

    expect(operatedTargets).toEqual([target, target, target, target]);
    expect(context.getElementByTarget).not.toHaveBeenCalled();
  });

  it('写操作、revision 推进与 observation 位于同一页面状态事务', async () => {
    const commit = {
      snapshot: {
        snapshotId: 'snap_action',
        pageRevision: 8,
        path: 'pages/index/index',
        elements: [],
      },
      elementMap: new Map(),
      pagePath: 'pages/index/index',
      pageRevision: 8,
      domChanged: false,
      previousSnapshot: null,
    };
    const synchronizePageState = vi.fn(async () => commit);
    const withElementByTargetOperation: PageStateOperation['withElementByTargetOperation'] = async <
      T,
    >(
      receivedTarget: ElementTarget,
      operation: (resolvedElement: Element) => Promise<T>
    ): Promise<T> => {
      expect(receivedTarget).toEqual(target);
      return operation(element as unknown as Element);
    };
    const pageState: PageStateOperation = {
      synchronizePageState,
      registerElementMap: vi.fn(),
      withElementByTargetOperation,
    };
    let transactionCalls = 0;
    context.withPageStateOperation = async <T>(
      operation: (activePageState: PageStateOperation) => Promise<T>
    ): Promise<T> => {
      transactionCalls += 1;
      return operation(pageState);
    };
    context.synchronizePageState = vi.fn(async () => {
      throw new Error('事务内不应再次进入 page-state 队列');
    });
    const response = createMockResponse();

    await clickTool.handler({ params: { target, dblClick: false } }, response, context);

    expect(transactionCalls).toBe(1);
    expect(synchronizePageState).toHaveBeenCalledOnce();
    expect(context.synchronizePageState).not.toHaveBeenCalled();
    expect(context.getElementByTarget).not.toHaveBeenCalled();
    expect(response.getStructuredContent()).toMatchObject({ pageRevision: 8 });
  });

  it('双击执行两次 tap', async () => {
    await clickTool.handler({ params: { target, dblClick: true } }, createMockResponse(), context);

    expect(element.tap).toHaveBeenCalledTimes(2);
  });

  it('input_text 使用判别联合拒绝旧 clear/append 参数', () => {
    expect(inputTextTool.schema.safeParse({ target, mode: 'replace', text: '新值' }).success).toBe(
      true
    );
    expect(inputTextTool.schema.safeParse({ target, mode: 'append', text: '追加' }).success).toBe(
      true
    );
    expect(inputTextTool.schema.safeParse({ target, mode: 'clear' }).success).toBe(true);
    expect(inputTextTool.schema.safeParse({ target, text: '旧协议', clear: true }).success).toBe(
      false
    );
  });

  it('replace/append 模式缺少 text 时返回 INVALID_ARGUMENT，且不解析元素', async () => {
    for (const mode of ['replace', 'append'] as const) {
      await expect(
        inputTextTool.handler({ params: { target, mode } }, createMockResponse(), context)
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    }

    expect(context.getElementByTarget).not.toHaveBeenCalled();
  });

  it.each([
    { mode: 'replace' as const, text: '替换', expected: '替换' },
    { mode: 'append' as const, text: '追加', expected: '已有追加' },
  ])('$mode 模式输入后回读校验', async ({ mode, text, expected }) => {
    const response = createMockResponse();

    await inputTextTool.handler({ params: { target, mode, text } }, response, context);

    expect(element.input).toHaveBeenCalledWith(expected);
    expect(context.markPageMutation).toHaveBeenCalledOnce();
    expect(response.getStructuredContent()).toMatchObject({
      target,
      mode,
      value: expected,
      pageRevision: 7,
    });
  });

  it('clear 模式写入空串并回读', async () => {
    const response = createMockResponse();

    await inputTextTool.handler({ params: { target, mode: 'clear' } }, response, context);

    expect(element.input).toHaveBeenCalledWith('');
    expect(response.getStructuredContent()).toMatchObject({ mode: 'clear', value: '' });
  });

  it('输入已发出但回读不一致时仍推进 revision，避免保留潜在脏状态', async () => {
    element.input.mockImplementation(async () => undefined);

    await expect(
      inputTextTool.handler(
        { params: { target, mode: 'replace', text: '不会生效' } },
        createMockResponse(),
        context
      )
    ).rejects.toThrow('输入后回读校验失败');
    expect(context.markPageMutation).toHaveBeenCalledOnce();
  });

  it('双击第二次 tap 失败时仍推进 revision', async () => {
    element.tap
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('second tap failed'));

    await expect(
      clickTool.handler({ params: { target, dblClick: true } }, createMockResponse(), context)
    ).rejects.toThrow('second tap failed');
    expect(context.markPageMutation).toHaveBeenCalledOnce();
  });

  it('get_value 默认读取 value() 并返回合法 falsy 值', async () => {
    element = createInputElement('');
    vi.mocked(context.getElementByTarget).mockResolvedValue(element as unknown as Element);
    const response = createMockResponse();

    await getValueTool.handler({ params: { target } }, response, context);

    expect(response.getStructuredContent()).toMatchObject({
      target,
      attribute: null,
      value: '',
      pageRevision: 7,
    });
  });

  it('get_value 可读取指定属性', async () => {
    const response = createMockResponse();

    await getValueTool.handler({ params: { target, attribute: 'placeholder' } }, response, context);

    expect(element.attribute).toHaveBeenCalledWith('placeholder');
    expect(response.getStructuredContent()).toMatchObject({
      attribute: 'placeholder',
      value: '请输入内容',
    });
  });

  it('set_form_control 触发事件、标记 mutation 并返回结构化结果', async () => {
    const response = createMockResponse();

    await setFormControlTool.handler(
      { params: { target, value: 2, trigger: 'change' } },
      response,
      context
    );

    expect(element.trigger).toHaveBeenCalledWith('change', { value: 2 });
    expect(context.markPageMutation).toHaveBeenCalledOnce();
    expect(response.getStructuredContent()).toMatchObject({
      target,
      value: 2,
      trigger: 'change',
      pageRevision: 7,
    });
  });

  it('set_form_control 事件未真正写值时拒绝假成功', async () => {
    element.trigger.mockImplementation(async () => undefined);

    await expect(
      setFormControlTool.handler(
        { params: { target, value: 2, trigger: 'change' } },
        createMockResponse(),
        context
      )
    ).rejects.toMatchObject({ code: 'ELEMENT_NOT_INTERACTABLE' });
    expect(context.markPageMutation).toHaveBeenCalledOnce();
  });

  it('没有当前页面时读取和表单操作均提前失败', async () => {
    const contextWithoutPage = createMockContext({ currentPage: null });

    await expect(
      getValueTool.handler({ params: { target } }, createMockResponse(), contextWithoutPage)
    ).rejects.toThrow('请先获取当前页面');
    await expect(
      setFormControlTool.handler(
        { params: { target, value: true, trigger: 'change' } },
        createMockResponse(),
        contextWithoutPage
      )
    ).rejects.toThrow('请先获取当前页面');
  });
});
