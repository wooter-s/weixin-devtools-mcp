import type { Element, Page } from 'miniprogram-automator';

import type { ElementMapInfo } from '../core/types.js';

import type {
  ElementFingerprint,
  ElementResolutionErrorCode,
  ElementTarget,
} from './types.js';

export class ElementResolutionError extends Error {
  constructor(
    readonly code: ElementResolutionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ElementResolutionError';
  }
}

export interface ResolveElementOptions {
  snapshotId?: string;
  pageRevision?: number;
  pagePath?: string;
}

export interface ResolvedElement {
  element: Element;
  selector: string;
  index: number;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ElementResolutionError(
      'INVALID_ELEMENT_TARGET',
      `${label} 不能为空`
    );
  }
  return normalized;
}

function requireIndex(index: number | undefined): void {
  if (index !== undefined && (!Number.isSafeInteger(index) || index < 0)) {
    throw new ElementResolutionError(
      'INVALID_ELEMENT_TARGET',
      'index 必须是非负安全整数'
    );
  }
}

export function elementTargetToSelector(target: Exclude<ElementTarget, { kind: 'ref' | 'text' }>): string {
  switch (target.kind) {
    case 'testId':
      return `[data-testid="${escapeAttributeValue(requireNonEmpty(target.value, 'testId'))}"]`;
    case 'id':
      return `[id="${escapeAttributeValue(requireNonEmpty(target.value, 'id'))}"]`;
    case 'selector':
      requireIndex(target.index);
      return requireNonEmpty(target.value, 'selector');
  }
}

async function selectOne(
  elements: Element[],
  index: number | undefined,
  description: string
): Promise<{ element: Element; index: number }> {
  requireIndex(index);
  if (elements.length === 0) {
    throw new ElementResolutionError(
      'ELEMENT_NOT_FOUND',
      `未找到元素：${description}`
    );
  }

  if (index === undefined && elements.length > 1) {
    throw new ElementResolutionError(
      'AMBIGUOUS_ELEMENT',
      `${description} 匹配到 ${elements.length} 个元素，请提供 index`
    );
  }

  const selectedIndex = index ?? 0;
  const element = elements[selectedIndex];
  if (!element) {
    throw new ElementResolutionError(
      'ELEMENT_NOT_FOUND',
      `${description} 的 index=${selectedIndex} 超出范围（共 ${elements.length} 个）`
    );
  }

  return { element, index: selectedIndex };
}

async function matchesFingerprint(
  element: Element,
  fingerprint: ElementFingerprint | undefined
): Promise<boolean> {
  if (!fingerprint || element.tagName !== fingerprint.tagName) {
    return fingerprint === undefined;
  }

  const checks: Array<Promise<boolean>> = [];
  if (fingerprint.id !== undefined) {
    checks.push(element.attribute('id').then(value => value === fingerprint.id));
  }
  if (fingerprint.testId !== undefined) {
    checks.push(element.attribute('data-testid').then(value => value === fingerprint.testId));
  }
  if (fingerprint.dataId !== undefined) {
    checks.push(element.attribute('data-id').then(value => value === fingerprint.dataId));
  }
  if (fingerprint.className !== undefined) {
    const expectedClassName = fingerprint.className;
    checks.push(element.attribute('class').then(value =>
      (value ?? '').split(/\s+/).includes(expectedClassName)
    ));
  }
  if (
    fingerprint.text !== undefined &&
    fingerprint.id === undefined &&
    fingerprint.testId === undefined &&
    fingerprint.dataId === undefined
  ) {
    checks.push(element.text().then(value => value.trim() === fingerprint.text));
  }

  const results = await Promise.all(checks);
  return results.every(Boolean);
}

function hasStableFingerprint(fingerprint: ElementFingerprint | undefined): boolean {
  return fingerprint !== undefined && (
    fingerprint.id !== undefined ||
    fingerprint.testId !== undefined ||
    fingerprint.dataId !== undefined
  );
}

async function ensureFingerprint(
  element: Element,
  fingerprint: ElementFingerprint | undefined,
  ref: string
): Promise<void> {
  try {
    if (await matchesFingerprint(element, fingerprint)) {
      return;
    }
  } catch {
    // 读取失败通常表示旧 handle 已失效，统一映射为 STALE_ELEMENT。
  }

  throw new ElementResolutionError(
    'STALE_ELEMENT',
    `ref ${ref} 指向的元素特征已变化`
  );
}

async function resolveRef(
  page: Page,
  elementMap: ReadonlyMap<string, ElementMapInfo>,
  ref: string,
  options: ResolveElementOptions
): Promise<ResolvedElement> {
  const normalizedRef = requireNonEmpty(ref, 'ref');
  const mapInfo = elementMap.get(normalizedRef);
  if (!mapInfo) {
    throw new ElementResolutionError(
      'ELEMENT_NOT_FOUND',
      `找不到 ref：${normalizedRef}`
    );
  }

  const pageChanged =
    options.pagePath !== undefined &&
    mapInfo.pagePath !== undefined &&
    options.pagePath !== mapInfo.pagePath;
  if (pageChanged) {
    throw new ElementResolutionError(
      'STALE_ELEMENT',
      `ref ${normalizedRef} 不属于当前页面`
    );
  }

  const versionChanged =
    (options.snapshotId !== undefined && mapInfo.snapshotId !== undefined && options.snapshotId !== mapInfo.snapshotId) ||
    (options.pageRevision !== undefined && mapInfo.pageRevision !== undefined && options.pageRevision !== mapInfo.pageRevision);
  if (versionChanged) {
    if (!hasStableFingerprint(mapInfo.fingerprint)) {
      throw new ElementResolutionError(
        'STALE_ELEMENT',
        `ref ${normalizedRef} 使用弱定位，页面变化后不能自动重绑`
      );
    }

    const candidates = await page.$$(mapInfo.selector);
    const rebound = await selectOne(candidates, undefined, mapInfo.selector);
    await ensureFingerprint(rebound.element, mapInfo.fingerprint, normalizedRef);
    return { ...rebound, selector: mapInfo.selector };
  }

  if (mapInfo.element) {
    await ensureFingerprint(mapInfo.element, mapInfo.fingerprint, normalizedRef);
    return { element: mapInfo.element, selector: mapInfo.selector, index: mapInfo.index };
  }

  const candidates = await page.$$(mapInfo.selector);
  const { element, index } = await selectOne(candidates, mapInfo.index, mapInfo.selector);
  await ensureFingerprint(element, mapInfo.fingerprint, normalizedRef);
  return { element, selector: mapInfo.selector, index };
}

export async function resolveElementTarget(
  page: Page,
  elementMap: ReadonlyMap<string, ElementMapInfo>,
  target: ElementTarget,
  options: ResolveElementOptions = {}
): Promise<ResolvedElement> {
  if (target.kind === 'ref') {
    return resolveRef(page, elementMap, target.ref, options);
  }

  if (target.kind === 'text') {
    requireIndex(target.index);
    const text = requireNonEmpty(target.value, 'text');
    const selector = target.tagName
      ? requireNonEmpty(target.tagName, 'tagName')
      : '*';
    const candidates = await page.$$(selector);
    const matches: Element[] = [];
    for (const element of candidates) {
      try {
        const elementText = (await element.text()).trim();
        if (target.exact === false ? elementText.includes(text) : elementText === text) {
          matches.push(element);
        }
      } catch {
        // 单个节点不支持 text() 时跳过，不影响其他候选。
      }
    }
    const selected = await selectOne(matches, target.index, `text=${JSON.stringify(text)}`);
    return { ...selected, selector };
  }

  const selector = elementTargetToSelector(target);
  const candidates = await page.$$(selector);
  const index = target.kind === 'selector' ? target.index : undefined;
  const selected = await selectOne(candidates, index, selector);
  return { ...selected, selector };
}
