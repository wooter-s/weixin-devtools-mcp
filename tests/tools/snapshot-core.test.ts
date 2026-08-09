import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPageSnapshotDomSignature,
  getPageSnapshot,
  rebasePageSnapshotCapture,
} from '../../src/core/snapshot.js';

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
});
