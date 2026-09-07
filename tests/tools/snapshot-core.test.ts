import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPageSnapshotDomSignature,
  getPageSnapshot,
  rebasePageSnapshotCapture,
} from '../../src/core/snapshot.js';
import { resolveElementTarget } from '../../src/elements/index.js';

function createElement(overrides: {
  tagName?: string;
  text?: string;
  attributes?: Record<string, string>;
  onOperation?: <T>(value: T) => Promise<T>;
} = {}) {
  const attributes = overrides.attributes ?? {};
  const run = overrides.onOperation ?? (async <T>(value: T) => value);
  return {
    tagName: overrides.tagName ?? 'view',
    text: vi.fn(() => run(overrides.text ?? '')),
    attribute: vi.fn((name: string) => run(attributes[name] ?? '')),
    size: vi.fn(() => run({ width: 100, height: 20 })),
    offset: vi.fn(() => run({ left: 0, top: 0 })),
    boundingClientRect: vi.fn(() => run({ left: 0, top: 0, width: 100, height: 20 })),
  };
}

function createComponent(
  children: ReturnType<typeof createElement>[],
  overrides: Parameters<typeof createElement>[0] = {}
) {
  return {
    ...createElement({ tagName: 'mcp-component', ...overrides }),
    $: vi.fn(async () => children[0] ?? null),
    $$: vi.fn(async (selector: string) => selector === '*' ? children : []),
    data: vi.fn(async () => ({})),
    setData: vi.fn(async () => undefined),
    callMethod: vi.fn(async () => undefined),
  };
}

describe('getPageSnapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('不再执行固定等待，并生成带页面版本的 opaque ref', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const elements = [
      createElement({ text: '重复项', attributes: { class: 'item' } }),
      createElement({ text: '重复项', attributes: { class: 'item' } }),
    ];
    const page = { path: 'pages/benchmark/index', $$: vi.fn(async () => elements) };

    const result = await getPageSnapshot(page as any, {
      snapshotId: 'snap_7_testtoken',
      pageRevision: 7,
    });

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(result.snapshot).toMatchObject({
      snapshotId: 'snap_7_testtoken',
      pageRevision: 7,
      path: 'pages/benchmark/index',
    });
    expect(result.snapshot.elements.map(element => element.ref)).toEqual([
      'ref_snap7testtoken_0',
      'ref_snap7testtoken_1',
    ]);
    expect(new Set(result.snapshot.elements.map(element => element.ref)).size).toBe(2);
    expect(result.elementMap.size).toBe(2);
    expect([...result.elementMap.values()].map(info => info.index)).toEqual([0, 1]);
    expect([...result.elementMap.values()].every(info => info.element !== undefined)).toBe(true);
  });

  it('将所有元数据读取的全局并发限制为 8', async () => {
    let active = 0;
    let maxActive = 0;
    const delayed = async <T>(value: T): Promise<T> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>(resolve => setImmediate(resolve));
      active -= 1;
      return value;
    };
    const elements = Array.from({ length: 12 }, (_, index) => createElement({
      text: `item-${index}`,
      attributes: { 'data-testid': `item-${index}` },
      onOperation: delayed,
    }));
    const page = { path: 'pages/benchmark/index', $$: vi.fn(async () => elements) };

    const result = await getPageSnapshot(page as any, {
      snapshotId: 'snap_concurrency',
      concurrency: 8,
    });

    expect(result.snapshot.elements).toHaveLength(12);
    expect(maxActive).toBe(8);
  });

  it('DOM signature 忽略 snapshot generation，但能识别特征相同的新节点', async () => {
    const firstElement = createElement({ text: '相同内容', attributes: { class: 'item' } });
    const replacement = createElement({ text: '相同内容', attributes: { class: 'item' } });
    const activeElements = { value: [firstElement] };
    const page = {
      path: 'pages/benchmark/index',
      $$: vi.fn(async () => activeElements.value),
    };
    const identities = new WeakMap<object, number>();
    let nextIdentity = 1;
    const identify = (element: object): number => {
      const existing = identities.get(element);
      if (existing !== undefined) return existing;
      const identity = nextIdentity;
      nextIdentity += 1;
      identities.set(element, identity);
      return identity;
    };

    const first = await getPageSnapshot(page as any, { snapshotId: 'snap_first' });
    const sameNodes = await getPageSnapshot(page as any, { snapshotId: 'snap_second' });
    activeElements.value = [replacement];
    const rebuilt = await getPageSnapshot(page as any, { snapshotId: 'snap_third' });

    const firstSignature = createPageSnapshotDomSignature(first, identify as any);
    expect(createPageSnapshotDomSignature(sameNodes, identify as any)).toBe(firstSignature);
    expect(createPageSnapshotDomSignature(rebuilt, identify as any)).not.toBe(firstSignature);
  });

  it('本地 rebase 同步更新 snapshot、ref 与 elementMap revision', async () => {
    const element = createElement({
      tagName: 'button',
      text: '保存',
      attributes: { 'data-testid': 'save' },
    });
    const page = { path: 'pages/benchmark/index', $$: vi.fn(async () => [element]) };
    const original = await getPageSnapshot(page as any, {
      snapshotId: 'snap_original',
      pageRevision: 3,
    });

    const rebased = rebasePageSnapshotCapture(original, 4);
    const [rebasedElement] = rebased.snapshot.elements;
    const rebasedInfo = rebasedElement
      ? rebased.elementMap.get(rebasedElement.ref)
      : undefined;

    expect(original.snapshot).toMatchObject({ snapshotId: 'snap_original', pageRevision: 3 });
    expect(rebased.snapshot.pageRevision).toBe(4);
    expect(rebased.snapshot.snapshotId).toMatch(/^snap_4_/);
    expect(rebasedElement?.ref).not.toBe(original.snapshot.elements[0]?.ref);
    expect(rebasedInfo).toMatchObject({
      snapshotId: rebased.snapshot.snapshotId,
      pageRevision: 4,
      element,
    });
    expect(rebased.topology).toBe(original.topology);
  });

  it('按 BFS 生成嵌套自定义组件 scopes/edges 与完整地址链', async () => {
    const submit = createElement({
      tagName: 'button',
      text: '提交',
      attributes: { 'data-testid': 'submit' },
    });
    const inner = createComponent([submit], {
      attributes: { 'data-testid': 'inner' },
    });
    const outer = createComponent([inner], {
      attributes: { 'data-testid': 'outer' },
    });
    const page = { path: 'pages/fixture/index', $$: vi.fn(async () => [outer]) };

    const result = await getPageSnapshot(page as any, {
      snapshotId: 'snap_nested',
      includeAttributes: true,
    });

    expect(result.snapshot).toMatchObject({
      rootScopeId: 'scope_0',
      complete: true,
      usage: { expandedScopes: 3, elements: 3 },
    });
    expect(result.snapshot.scopes?.map(scope => [scope.kind, scope.depth, scope.status])).toEqual([
      ['page', 0, 'complete'],
      ['custom-component', 1, 'complete'],
      ['custom-component', 2, 'complete'],
    ]);
    expect(result.snapshot.edges).toHaveLength(2);
    const addressDepths = [...result.elementMap.values()].map(info => info.address?.segments.length);
    expect(addressDepths).toEqual([1, 2, 3]);
  });

  it('跨 scope 重叠出现在第二项时不会遗留此前 entry 的 orphan ref 或 edge', async () => {
    const shared = createElement({
      tagName: 'view',
      attributes: { 'data-testid': 'shared' },
    });
    const inner = createComponent([], {
      attributes: { 'data-testid': 'inner' },
    });
    const outer = createComponent([inner, shared], {
      attributes: { 'data-testid': 'outer' },
    });
    const page = {
      path: 'pages/fixture/index',
      $$: vi.fn(async () => [outer, shared]),
    };

    const result = await getPageSnapshot(page as any);

    expect(result.snapshot).toMatchObject({
      complete: false,
      usage: { expandedScopes: 2, elements: 2 },
    });
    expect(result.snapshot.scopes).toHaveLength(2);
    expect(result.snapshot.scopes?.[1]).toMatchObject({
      status: 'unavailable',
      reason: 'QUERY_FAILED',
      elements: [],
    });
    expect(result.snapshot.edges).toHaveLength(1);
    expect(result.elementMap.size).toBe(2);
    expect([...result.elementMap.values()].some(info => Object.is(info.element, inner))).toBe(false);
    expect(inner.$$).not.toHaveBeenCalled();
  });

  it('达到深度预算时保留边界 scope，并用固定 reason 标记截断', async () => {
    const leaf = createElement({ attributes: { 'data-testid': 'leaf' } });
    const inner = createComponent([leaf], { attributes: { 'data-testid': 'inner' } });
    const outer = createComponent([inner], { attributes: { 'data-testid': 'outer' } });
    const page = { path: 'pages/fixture/index', $$: vi.fn(async () => [outer]) };

    const result = await getPageSnapshot(page as any, {
      budget: { maxDepth: 1, maxExpandedScopes: 64, maxElements: 1000 },
    });

    expect(result.snapshot.complete).toBe(false);
    expect(result.snapshot.usage).toEqual({ expandedScopes: 2, elements: 2 });
    expect(result.snapshot.scopes?.[2]).toMatchObject({
      kind: 'custom-component',
      depth: 2,
      status: 'truncated',
      reason: 'MAX_DEPTH',
      elements: [],
    });
  });

  it('达到 scope 数量预算时不会继续查询组件内部', async () => {
    const child = createElement({ attributes: { 'data-testid': 'child' } });
    const outer = createComponent([child], { attributes: { 'data-testid': 'outer' } });
    const page = { path: 'pages/fixture/index', $$: vi.fn(async () => [outer]) };

    const result = await getPageSnapshot(page as any, {
      budget: { maxDepth: 4, maxExpandedScopes: 1, maxElements: 1000 },
    });

    expect(result.snapshot.usage).toEqual({ expandedScopes: 1, elements: 1 });
    expect(result.snapshot.scopes?.[1]).toMatchObject({
      status: 'truncated',
      reason: 'MAX_SCOPES',
    });
    expect(outer.$$).not.toHaveBeenCalled();
  });

  it('预算截断时返回的 ref 在同 revision 仍优先使用已校验 handle', async () => {
    const elements = [
      createElement({ text: '重复项', attributes: { class: 'item' } }),
      createElement({ text: '重复项', attributes: { class: 'item' } }),
    ];
    const page = {
      path: 'pages/fixture/index',
      $$: vi.fn(async (selector: string) =>
        selector === '*' || selector === 'view[class~="item"]' ? elements : []),
    };
    const result = await getPageSnapshot(page as any, {
      budget: { maxDepth: 4, maxExpandedScopes: 64, maxElements: 1 },
    });
    const ref = result.snapshot.elements[0]?.ref;
    page.$$.mockClear();

    const resolved = await resolveElementTarget(
      page as any,
      result.elementMap,
      { kind: 'ref', ref: ref! },
      { pageRevision: 0, pagePath: page.path }
    );

    expect(resolved.element).toBe(elements[0]);
    expect(page.$$).not.toHaveBeenCalled();
  });

  it('重复 strong 属性跨 tag 时按最终 selector 独立计算 occurrence', async () => {
    const button = createElement({
      tagName: 'button',
      attributes: { 'data-testid': 'duplicate' },
    });
    const view = createElement({
      tagName: 'view',
      attributes: { 'data-testid': 'duplicate' },
    });
    const elements = [button, view];
    const page = {
      path: 'pages/fixture/index',
      $$: vi.fn(async (selector: string) => {
        if (selector === '*') return elements;
        if (selector === 'button[data-testid="duplicate"]') return [button];
        if (selector === 'view[data-testid="duplicate"]') return [view];
        return [];
      }),
    };
    const result = await getPageSnapshot(page as any);
    const secondRef = result.snapshot.elements[1]?.ref;
    const replayMap = new Map(
      [...result.elementMap].map(([ref, info]) => {
        const { element: _element, ...replayInfo } = info;
        return [ref, replayInfo] as const;
      })
    );

    const resolved = await resolveElementTarget(
      page as any,
      replayMap,
      { kind: 'ref', ref: secondRef! },
      { pageRevision: 0, pagePath: page.path }
    );

    expect(resolved.element).toBe(view);
    expect(result.elementMap.get(secondRef!)?.address?.segments[0]).toMatchObject({
      locator: { kind: 'selector', value: 'view[data-testid="duplicate"]' },
      index: 0,
    });
  });

  it('wildcard 回退无法保证发现自定义组件时标记 partial', async () => {
    const ordinary = createElement({ tagName: 'view' });
    const component = createComponent([], {
      attributes: { 'data-testid': 'mcp-card' },
    });
    const page = {
      path: 'pages/fixture/index',
      $$: vi.fn(async (selector: string) => {
        if (selector === '*') throw new Error('wildcard unsupported');
        if (selector === 'view') return [ordinary];
        if (selector === 'mcp-component') return [component];
        return [];
      }),
    };

    const result = await getPageSnapshot(page as any);

    expect(result.snapshot.complete).toBe(false);
    expect(result.snapshot.scopes?.[0]).toMatchObject({
      status: 'partial',
      reason: 'QUERY_FAILED',
      elements: [{ tagName: 'view' }],
    });
    expect(result.snapshot.scopes).toHaveLength(1);
  });
});
