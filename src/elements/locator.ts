import type { Element, Page } from 'miniprogram-automator';

import type { ElementMapInfo } from '../core/types.js';

import {
  isCustomComponentElement,
  type CustomComponentElement,
} from './component.js';
import type {
  ElementAddress,
  ElementAddressSegment,
  ElementFingerprint,
  ElementResolutionErrorCode,
  ElementTarget,
  LocatorSegment,
  LocatorStability,
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
  isRetiredRef?: (ref: string) => boolean;
  snapshotId?: string;
  pageRevision?: number;
  pagePath?: string;
}

export interface ResolvedElement {
  element: Element;
  selector: string;
  index: number;
  address: ElementAddress;
}

interface ElementQueryRoot {
  $$(selector: string): Promise<Element[]>;
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

export function elementTargetToSelector(
  locator: Exclude<LocatorSegment, { kind: 'text' }>
): string {
  switch (locator.kind) {
    case 'testId':
      return `[data-testid="${escapeAttributeValue(requireNonEmpty(locator.value, 'testId'))}"]`;
    case 'id':
      return `[id="${escapeAttributeValue(requireNonEmpty(locator.value, 'id'))}"]`;
    case 'dataId':
      return `[data-id="${escapeAttributeValue(requireNonEmpty(locator.value, 'dataId'))}"]`;
    case 'selector':
      requireIndex(locator.index);
      return requireNonEmpty(locator.value, 'selector');
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

function locatorStability(locator: LocatorSegment): LocatorStability {
  switch (locator.kind) {
    case 'testId':
    case 'id':
    case 'dataId':
      return 'stable';
    case 'text':
      return 'contextual';
    case 'selector':
      return locator.index === undefined ? 'contextual' : 'positional';
  }
}

async function fingerprintElement(element: Element): Promise<ElementFingerprint> {
  const fingerprint: ElementFingerprint = {
    tagName: element.tagName || 'unknown',
  };
  const [id, testId, dataId, className, text] = await Promise.allSettled([
    element.attribute('id'),
    element.attribute('data-testid'),
    element.attribute('data-id'),
    element.attribute('class'),
    element.text(),
  ]);

  if (id.status === 'fulfilled' && id.value) fingerprint.id = id.value;
  if (testId.status === 'fulfilled' && testId.value) fingerprint.testId = testId.value;
  if (dataId.status === 'fulfilled' && dataId.value) fingerprint.dataId = dataId.value;
  if (className.status === 'fulfilled' && className.value) {
    const firstClass = className.value.split(/\s+/).find(Boolean);
    if (firstClass) fingerprint.className = firstClass;
  }
  if (text.status === 'fulfilled' && text.value.trim()) {
    fingerprint.text = text.value.trim();
  }
  return fingerprint;
}

async function queryLocatorSegment(
  root: ElementQueryRoot,
  locator: LocatorSegment
): Promise<{ element: Element; selector: string; index: number }> {
  if (locator.kind !== 'text') {
    const selector = elementTargetToSelector(locator);
    const candidates = await root.$$(selector) as Element[];
    const index = locator.kind === 'selector' ? locator.index : undefined;
    const selected = await selectOne(candidates, index, selector);
    return { ...selected, selector };
  }

  requireIndex(locator.index);
  const text = requireNonEmpty(locator.value, 'text');
  const selector = locator.tagName
    ? requireNonEmpty(locator.tagName, 'tagName')
    : '*';
  const candidates = await root.$$(selector) as Element[];
  const matches: Element[] = [];
  for (const element of candidates) {
    try {
      const elementText = (await element.text()).trim();
      if (locator.exact === false ? elementText.includes(text) : elementText === text) {
        matches.push(element);
      }
    } catch {
      // 单个节点不支持 text() 时跳过，不影响其他候选。
    }
  }
  const selected = await selectOne(matches, locator.index, `text=${JSON.stringify(text)}`);
  return { ...selected, selector };
}

function requireQueryableComponent(
  element: Element,
  segmentIndex: number
): asserts element is CustomComponentElement {
  if (!isCustomComponentElement(element)) {
    throw new ElementResolutionError(
      'INVALID_ELEMENT_TARGET',
      `path[${segmentIndex}] 命中的 ${element.tagName || 'unknown'} 不是可查询的自定义组件`
    );
  }
}

async function createAddressSegment(
  locator: LocatorSegment,
  resolved: { element: Element; selector: string; index: number },
  stability = locatorStability(locator)
): Promise<ElementAddressSegment> {
  return {
    locator,
    selector: resolved.selector,
    index: resolved.index,
    stability,
    fingerprint: await fingerprintElement(resolved.element),
  };
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

function addressCanRebind(address: ElementAddress): boolean {
  return address.segments.length > 0 && address.segments.every(
    segment => segment.stability === 'stable'
  );
}

async function resolveAddress(
  page: Page,
  address: ElementAddress,
  ref: string
): Promise<ResolvedElement> {
  if (address.segments.length === 0) {
    throw new ElementResolutionError('STALE_ELEMENT', `ref ${ref} 缺少地址链`);
  }

  let root: ElementQueryRoot = page;
  let leaf: { element: Element; selector: string; index: number } | undefined;
  for (let index = 0; index < address.segments.length; index += 1) {
    const segment = address.segments[index];
    if (!segment) continue;
    leaf = await queryLocatorSegment(root, segment.locator);
    await ensureFingerprint(leaf.element, segment.fingerprint, ref);
    if (index < address.segments.length - 1) {
      requireQueryableComponent(leaf.element, index);
      root = leaf.element;
    }
  }

  if (!leaf) {
    throw new ElementResolutionError('STALE_ELEMENT', `ref ${ref} 缺少可解析地址`);
  }
  return { ...leaf, address };
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
      options.isRetiredRef?.(normalizedRef) ? 'STALE_ELEMENT' : 'ELEMENT_NOT_FOUND',
      options.isRetiredRef?.(normalizedRef) ? `ref ${normalizedRef} 已失效，请重新查询` : `找不到 ref：${normalizedRef}`
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

  if (!versionChanged && mapInfo.element) {
    await ensureFingerprint(mapInfo.element, mapInfo.fingerprint, normalizedRef);
    return {
      element: mapInfo.element,
      selector: mapInfo.selector,
      index: mapInfo.index,
      address: mapInfo.address ?? {
        segments: [{
          locator: { kind: 'selector', value: mapInfo.selector, index: mapInfo.index },
          selector: mapInfo.selector,
          index: mapInfo.index,
          stability: 'positional',
          fingerprint: mapInfo.fingerprint ?? { tagName: mapInfo.element.tagName || 'unknown' },
        }],
      },
    };
  }

  if (mapInfo.address) {
    if (versionChanged && !addressCanRebind(mapInfo.address)) {
      throw new ElementResolutionError(
        'STALE_ELEMENT',
        `ref ${normalizedRef} 的作用域地址包含弱定位，页面变化后不能自动重绑`
      );
    }
    return resolveAddress(page, mapInfo.address, normalizedRef);
  }

  // 仅供尚未迁移到 address-chain 的内部 query generation 使用。
  if (versionChanged) {
    const stableFingerprint = mapInfo.fingerprint !== undefined && (
      mapInfo.fingerprint.id !== undefined ||
      mapInfo.fingerprint.testId !== undefined ||
      mapInfo.fingerprint.dataId !== undefined
    );
    if (!stableFingerprint) {
      throw new ElementResolutionError(
        'STALE_ELEMENT',
        `ref ${normalizedRef} 使用弱定位，页面变化后不能自动重绑`
      );
    }
    const candidates = await page.$$(mapInfo.selector);
    const rebound = await selectOne(candidates, undefined, mapInfo.selector);
    await ensureFingerprint(rebound.element, mapInfo.fingerprint, normalizedRef);
    return {
      ...rebound,
      selector: mapInfo.selector,
      address: {
        segments: [{
          locator: { kind: 'selector', value: mapInfo.selector },
          selector: mapInfo.selector,
          index: rebound.index,
          stability: 'stable',
          fingerprint: mapInfo.fingerprint!,
        }],
      },
    };
  }

  const candidates = await page.$$(mapInfo.selector);
  const resolved = await selectOne(candidates, mapInfo.index, mapInfo.selector);
  await ensureFingerprint(resolved.element, mapInfo.fingerprint, normalizedRef);
  return {
    ...resolved,
    selector: mapInfo.selector,
    address: {
      segments: [{
        locator: { kind: 'selector', value: mapInfo.selector, index: resolved.index },
        selector: mapInfo.selector,
        index: resolved.index,
        stability: 'positional',
        fingerprint: mapInfo.fingerprint ?? { tagName: resolved.element.tagName || 'unknown' },
      }],
    },
  };
}

/** 逐级解析 locator path，并验证所有非叶子节点都是 CustomElement。 */
export async function resolveLocatorPath(
  page: Page,
  path: readonly LocatorSegment[]
): Promise<ResolvedElement> {
  if (path.length < 1 || path.length > 16) {
    throw new ElementResolutionError(
      'INVALID_ELEMENT_TARGET',
      'path 长度必须在 1 到 16 之间'
    );
  }

  let root: ElementQueryRoot = page;
  let leaf: { element: Element; selector: string; index: number } | undefined;
  const segments: ElementAddressSegment[] = [];
  for (let index = 0; index < path.length; index += 1) {
    const locator = path[index];
    if (!locator) continue;
    leaf = await queryLocatorSegment(root, locator);
    segments.push(await createAddressSegment(locator, leaf));
    if (index < path.length - 1) {
      requireQueryableComponent(leaf.element, index);
      root = leaf.element;
    }
  }

  if (!leaf) {
    throw new ElementResolutionError('ELEMENT_NOT_FOUND', 'path 未解析到元素');
  }
  return { ...leaf, address: { segments } };
}

export async function resolveElementTarget(
  page: Page,
  elementMap: ReadonlyMap<string, ElementMapInfo>,
  target: ElementTarget,
  options: ResolveElementOptions = {}
): Promise<ResolvedElement> {
  return target.kind === 'ref'
    ? resolveRef(page, elementMap, target.ref, options)
    : resolveLocatorPath(page, target.path);
}
