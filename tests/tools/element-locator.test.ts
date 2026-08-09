import { describe, expect, it, vi } from 'vitest';

import {
  ElementResolutionError,
  resolveElementTarget,
  type ElementMapInfo,
} from '../../src/tools.js';

function createElement(options: {
  tagName?: string;
  text?: string;
  attributes?: Record<string, string>;
} = {}) {
  const attributes = options.attributes ?? {};
  return {
    tagName: options.tagName ?? 'button',
    text: vi.fn(async () => options.text ?? ''),
    attribute: vi.fn(async (name: string) => attributes[name] ?? null),
  };
}

describe('resolveElementTarget', () => {
  it('同 revision 使用 handle 前仍校验 fingerprint', async () => {
    const element = createElement({ attributes: { id: 'submit' } });
    const map = new Map<string, ElementMapInfo>([[
      'ref_submit',
      {
        selector: 'button[id="submit"]',
        index: 0,
        snapshotId: 'snap_1',
        pageRevision: 1,
        pagePath: 'pages/index/index',
        element: element as any,
        fingerprint: { tagName: 'button', id: 'submit' },
      },
    ]]);
    const page = { $$: vi.fn(), path: 'pages/index/index' };

    const resolved = await resolveElementTarget(
      page as any,
      map,
      { kind: 'ref', ref: 'ref_submit' },
      { snapshotId: 'snap_1', pageRevision: 1, pagePath: 'pages/index/index' }
    );

    expect(resolved.element).toBe(element);
    expect(element.attribute).toHaveBeenCalledWith('id');
    expect(page.$$).not.toHaveBeenCalled();
  });

  it('同 revision 指纹变化时返回 STALE_ELEMENT', async () => {
    const element = createElement({ attributes: { id: 'other' } });
    const map = new Map<string, ElementMapInfo>([[
      'ref_submit',
      {
        selector: 'button[id="submit"]',
        index: 0,
        pageRevision: 1,
        element: element as any,
        fingerprint: { tagName: 'button', id: 'submit' },
      },
    ]]);

    await expect(resolveElementTarget(
      { $$: vi.fn() } as any,
      map,
      { kind: 'ref', ref: 'ref_submit' },
      { pageRevision: 1 }
    )).rejects.toMatchObject({ code: 'STALE_ELEMENT' });
  });

  it('revision 变化后只对唯一强定位执行安全重绑', async () => {
    const previous = createElement({ attributes: { 'data-testid': 'target' } });
    const current = createElement({ attributes: { 'data-testid': 'target' } });
    const page = { $$: vi.fn(async () => [current]) };
    const map = new Map<string, ElementMapInfo>([[
      'ref_target',
      {
        selector: 'button[data-testid="target"]',
        index: 4,
        pageRevision: 1,
        element: previous as any,
        fingerprint: { tagName: 'button', testId: 'target' },
      },
    ]]);

    const resolved = await resolveElementTarget(
      page as any,
      map,
      { kind: 'ref', ref: 'ref_target' },
      { pageRevision: 2 }
    );

    expect(resolved.element).toBe(current);
    expect(resolved.index).toBe(0);
    expect(page.$$).toHaveBeenCalledWith('button[data-testid="target"]');
  });

  it('强定位重绑出现多个候选时拒绝猜测', async () => {
    const candidates = [
      createElement({ attributes: { id: 'duplicate' } }),
      createElement({ attributes: { id: 'duplicate' } }),
    ];
    const map = new Map<string, ElementMapInfo>([[
      'ref_duplicate',
      {
        selector: 'button[id="duplicate"]',
        index: 0,
        pageRevision: 1,
        fingerprint: { tagName: 'button', id: 'duplicate' },
      },
    ]]);

    await expect(resolveElementTarget(
      { $$: vi.fn(async () => candidates) } as any,
      map,
      { kind: 'ref', ref: 'ref_duplicate' },
      { pageRevision: 2 }
    )).rejects.toMatchObject({ code: 'AMBIGUOUS_ELEMENT' });
  });

  it('revision 变化后的弱定位和跨页 ref 都直接失效', async () => {
    const page = { $$: vi.fn() };
    const weakMap = new Map<string, ElementMapInfo>([[
      'ref_weak',
      {
        selector: 'button[class~="item"]',
        index: 0,
        pageRevision: 1,
        pagePath: 'pages/index/index',
        fingerprint: { tagName: 'button', text: '提交' },
      },
    ]]);

    await expect(resolveElementTarget(
      page as any,
      weakMap,
      { kind: 'ref', ref: 'ref_weak' },
      { pageRevision: 2, pagePath: 'pages/index/index' }
    )).rejects.toMatchObject({ code: 'STALE_ELEMENT' });
    await expect(resolveElementTarget(
      page as any,
      weakMap,
      { kind: 'ref', ref: 'ref_weak' },
      { pageRevision: 1, pagePath: 'pages/other/index' }
    )).rejects.toMatchObject({ code: 'STALE_ELEMENT' });
    expect(page.$$).not.toHaveBeenCalled();
  });

  it('text 默认 exact，只有 exact=false 才使用 contains', async () => {
    const exact = createElement({ text: '提交' });
    const contains = createElement({ text: '提交订单' });
    const page = { $$: vi.fn(async () => [exact, contains]) };

    const resolved = await resolveElementTarget(
      page as any,
      new Map(),
      { kind: 'text', value: '提交' }
    );
    expect(resolved.element).toBe(exact);

    await expect(resolveElementTarget(
      page as any,
      new Map(),
      { kind: 'text', value: '提交', exact: false }
    )).rejects.toBeInstanceOf(ElementResolutionError);
  });
});
