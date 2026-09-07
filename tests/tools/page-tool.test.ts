import type { Element } from 'miniprogram-automator';
import { describe, expect, it, vi } from 'vitest';

import type { PageStateOperation, ToolContext } from '../../src/tools/ToolDefinition.js';
import { findElementsTool, waitForTool } from '../../src/tools/page.js';
import type { ElementMapInfo, PageStateCommit } from '../../src/tools.js';
import {
  createMockContext,
  createMockElement,
  createMockPage,
  createMockResponse,
} from '../utils/test-factories.js';

const refTarget = { kind: 'ref', ref: 'ref_result' } as const;

function createPageStateCommit(pageRevision: number, domChanged: boolean): PageStateCommit {
  const snapshot = {
    snapshotId: `snap_${pageRevision}`,
    pageRevision,
    path: 'pages/index/index',
    elements: [],
  };
  return {
    snapshot,
    elementMap: new Map(),
    pagePath: snapshot.path,
    pageRevision,
    domChanged,
    previousSnapshot: null,
  };
}

describe('find_elements', () => {
  it('使用 locator schema 并移除旧 selector 参数', () => {
    expect(findElementsTool.name).toBe('find_elements');
    expect(
      findElementsTool.schema.safeParse({ locator: { kind: 'selector', value: 'button' } }).success
    ).toBe(true);
    expect(findElementsTool.schema.safeParse({ locator: refTarget }).success).toBe(false);
    expect(findElementsTool.schema.safeParse({ selector: 'button' }).success).toBe(false);
  });

  it('Page 根 locator 查询返回结构化结果', async () => {
    const element = createMockElement({
      tagName: 'button',
      text: vi.fn(async () => '提交'),
    });
    const page = createMockPage({ $$: vi.fn(async () => [element]) });
    const context = createMockContext({
      currentPage: page,
      getPageRevision: vi.fn(() => 5),
    });
    const response = createMockResponse();

    await findElementsTool.handler(
      { params: { locator: { kind: 'selector', value: 'button' } } },
      response,
      context
    );

    expect(page.$$).toHaveBeenCalledWith('button');
    expect(response.getStructuredContent()).toMatchObject({
      pageRevision: 5,
      count: 1,
      elements: [{ ref: expect.any(String), tagName: 'button', text: '提交' }],
    });
  });

  it('首次查询前建立 baseline，查询后重建时重试且不返回旧 ref', async () => {
    const original = createMockElement({ tagName: 'button', text: vi.fn(async () => '旧节点') });
    const replacement = createMockElement({ tagName: 'button', text: vi.fn(async () => '新节点') });
    let queryCount = 0;
    const query = vi.fn(async () => {
      queryCount += 1;
      return queryCount === 1 ? [original] : [replacement];
    });
    const page = createMockPage({ $$: query });
    const commits = [
      createPageStateCommit(5, false),
      createPageStateCommit(6, true),
      createPageStateCommit(6, false),
      createPageStateCommit(6, false),
    ];
    let currentRevision = 5;
    const synchronizePageState = vi.fn(async () => {
      const commit = commits.shift();
      if (!commit) throw new Error('unexpected synchronizePageState call');
      currentRevision = commit.pageRevision;
      return commit;
    });
    const elementMap = new Map<string, ElementMapInfo>();
    const registerElementMap = vi.fn(
      (
        nextMap: Map<string, ElementMapInfo>,
        _expectations?: { expectedRevision?: number; expectedPath?: string }
      ) => {
        for (const [ref, info] of nextMap) elementMap.set(ref, info);
      }
    );
    const context = createMockContext({
      currentPage: page,
      elementMap,
      getPageRevision: vi.fn(() => currentRevision),
      registerElementMap,
      synchronizePageState,
    });
    const response = createMockResponse();

    await findElementsTool.handler(
      { params: { locator: { kind: 'selector', value: 'button' } } },
      response,
      context
    );

    expect(synchronizePageState).toHaveBeenCalledTimes(4);
    expect(query).toHaveBeenCalledTimes(2);
    expect(synchronizePageState.mock.invocationCallOrder[0]).toBeLessThan(
      query.mock.invocationCallOrder[0]!
    );
    expect(registerElementMap.mock.calls.map((call) => call[1])).toEqual([
      { expectedRevision: 5, expectedPath: 'pages/index/index' },
      { expectedRevision: 6, expectedPath: 'pages/index/index' },
    ]);
    expect(response.getStructuredContent()).toMatchObject({
      pageRevision: 6,
      count: 1,
      elements: [{ tagName: 'button', text: '新节点' }],
    });
    expect(response.getStructuredContent()).not.toMatchObject({
      elements: [{ text: '旧节点' }],
    });
  });

  it('生产上下文将 query、ref 注册和 observation 放在同一页面状态事务', async () => {
    const element = createMockElement({ tagName: 'button', text: vi.fn(async () => '提交') });
    const page = createMockPage({ $$: vi.fn(async () => [element]) });
    const synchronizePageState = vi.fn(async () => createPageStateCommit(3, false));
    const registerElementMap = vi.fn();
    const pageState: PageStateOperation = {
      synchronizePageState,
      registerElementMap,
      withElementByTargetOperation: vi.fn(async () => {
        throw new Error('selector 查询不应解析 ref');
      }),
    };
    const withPageStateOperation = vi.fn(async (operation) => operation(pageState)) as NonNullable<
      ToolContext['withPageStateOperation']
    >;
    const context = createMockContext({
      currentPage: page,
      withPageStateOperation,
      synchronizePageState: vi.fn(async () => {
        throw new Error('事务内不应再次进入 page-state 队列');
      }),
      registerElementMap: vi.fn(() => {
        throw new Error('事务内应使用 transaction register');
      }),
      getPageRevision: vi.fn(() => 3),
    });

    await findElementsTool.handler(
      {
        params: { locator: { kind: 'selector', value: 'button' } },
      },
      createMockResponse(),
      context
    );

    expect(withPageStateOperation).toHaveBeenCalledOnce();
    expect(synchronizePageState).toHaveBeenCalledTimes(2);
    expect(registerElementMap).toHaveBeenCalledOnce();
    expect(context.synchronizePageState).not.toHaveBeenCalled();
    expect(context.registerElementMap).not.toHaveBeenCalled();
  });
});

describe('wait_for target API', () => {
  it('schema 接受 delay 或 target，并移除 selector', () => {
    expect(waitForTool.schema.safeParse({ delay: 10 }).success).toBe(true);
    expect(waitForTool.schema.safeParse({ target: refTarget }).success).toBe(true);
    expect(
      waitForTool.schema.safeParse({
        target: { kind: 'selector', value: 'button' },
      }).success
    ).toBe(false);
    const legacyResult = waitForTool.schema.safeParse({ selector: 'button' });
    expect(legacyResult.success).toBe(true);
    if (legacyResult.success) {
      expect(legacyResult.data).not.toHaveProperty('selector');
    }
  });

  it('target 匹配后返回页面版本', async () => {
    const element = {
      tagName: 'button',
      text: vi.fn(async () => '提交订单'),
      size: vi.fn(async () => ({ width: 100, height: 40 })),
    };
    const context = createMockContext({
      currentPage: createMockPage(),
      getElementByTarget: vi.fn(async () => element as unknown as Element),
      getPageRevision: vi.fn(() => 9),
    });
    const response = createMockResponse();

    await waitForTool.handler(
      {
        params: {
          target: refTarget,
          timeout: 100,
          text: '提交',
          visible: true,
          disappear: false,
        },
      },
      response,
      context
    );

    expect(response.getStructuredContent()).toMatchObject({
      matched: true,
      pageRevision: 9,
    });
  });

  it('target 读取与成功 observation 位于同一页面状态事务', async () => {
    const element = {
      tagName: 'button',
      text: vi.fn(async () => '提交订单'),
      size: vi.fn(async () => ({ width: 100, height: 40 })),
    };
    const commit = createPageStateCommit(11, false);
    const pageState: PageStateOperation = {
      synchronizePageState: vi.fn(async () => commit),
      registerElementMap: vi.fn(),
      withElementByTargetOperation: vi.fn(async (_target, operation) =>
        operation(element as unknown as Element)
      ),
    };
    const withPageStateOperation = vi.fn(async (operation) => operation(pageState)) as NonNullable<
      ToolContext['withPageStateOperation']
    >;
    const context = createMockContext({
      currentPage: createMockPage(),
      withPageStateOperation,
      getElementByTarget: vi.fn(async () => {
        throw new Error('事务内不应释放队列后再读取');
      }),
    });
    const response = createMockResponse();

    await waitForTool.handler(
      {
        params: {
          target: refTarget,
          timeout: 100,
          text: '提交',
          visible: true,
          disappear: false,
        },
      },
      response,
      context
    );

    expect(withPageStateOperation).toHaveBeenCalledOnce();
    expect(pageState.withElementByTargetOperation).toHaveBeenCalledOnce();
    expect(pageState.synchronizePageState).toHaveBeenCalledOnce();
    expect(context.getElementByTarget).not.toHaveBeenCalled();
    expect(response.getStructuredContent()).toMatchObject({
      matched: true,
      pageRevision: 11,
    });
  });

  it('disappear 不会把定位歧义误判为元素已消失', async () => {
    const ambiguous = Object.assign(new Error('匹配到多个元素'), {
      code: 'AMBIGUOUS_ELEMENT',
    });
    const context = createMockContext({
      currentPage: createMockPage(),
      getElementByTarget: vi.fn(async () => {
        throw ambiguous;
      }),
    });

    await expect(
      waitForTool.handler(
        {
          params: {
            target: {
              kind: 'path',
              path: [{ kind: 'selector', value: '.repeated' }],
            },
            timeout: 100,
            disappear: true,
          },
        },
        createMockResponse(),
        context
      )
    ).rejects.toBe(ambiguous);
  });

  it('disappear 不会把 stale ref 误判为元素已消失', async () => {
    const stale = Object.assign(new Error('ref 已失效'), { code: 'STALE_ELEMENT' });
    const context = createMockContext({
      currentPage: createMockPage(),
      getElementByTarget: vi.fn(async () => {
        throw stale;
      }),
    });

    await expect(
      waitForTool.handler(
        {
          params: { target: refTarget, timeout: 100, disappear: true },
        },
        createMockResponse(),
        context
      )
    ).rejects.toBe(stale);
  });
});
