/** 页面快照核心逻辑。 */

import type { Element, Page } from 'miniprogram-automator';

import {
  createElementRef,
  createSnapshotId,
  isCustomComponentElement,
} from '../elements/index.js';
import type {
  ElementAddressSegment,
  ElementFingerprint,
  LocatorSegment,
  LocatorStability,
} from '../elements/index.js';
import { extractErrorMessage } from '../utils/error.js';

import type {
  ElementMapInfo,
  ElementSnapshot,
  PageSnapshot,
  SnapshotBudget,
  SnapshotScope,
  SnapshotScopeReason,
} from './types.js';

const MAX_METADATA_CONCURRENCY = 8;

const DEFAULT_BUDGET: SnapshotBudget = {
  maxDepth: 4,
  maxExpandedScopes: 64,
  maxElements: 1000,
};

const COMMON_SELECTORS = [
  'view',
  'text',
  'button',
  'image',
  'input',
  'textarea',
  'picker',
  'switch',
  'slider',
  'scroll-view',
  'swiper',
  'icon',
  'rich-text',
  'progress',
  'navigator',
  'form',
  'checkbox',
  'radio',
  'cover-view',
  'cover-image',
] as const;

export interface GetPageSnapshotOptions {
  snapshotId?: string;
  pageRevision?: number;
  /** 仅允许降低并发，生产上限固定为 8。 */
  concurrency?: number;
  /** 提交前复核时沿用首轮已确认可用的 Page 根作用域收集策略。 */
  preferredStrategy?: SnapshotCollectionStrategy;
  includePosition?: boolean;
  includeAttributes?: boolean;
  budget?: Partial<SnapshotBudget>;
  /** 从已唯一解析的自定义组件开始扫描；address 用于生成可重放的后代 ref。 */
  root?: {
    element: SnapshotElement & SnapshotQueryRoot;
    ref?: string;
    address: ElementAddressSegment[];
  };
}

export type SnapshotCollectionStrategy =
  | 'wildcard(*)'
  | 'common-selectors'
  | 'hierarchical(page>*)'
  | 'none';

export interface PageTopologyCapture {
  topology: readonly Element[];
  strategy: SnapshotCollectionStrategy;
}

/** 页面扫描 draft；topology 仅用于 Context 内的 DOM epoch 判定。 */
export interface PageSnapshotCapture {
  snapshot: PageSnapshot;
  elementMap: Map<string, ElementMapInfo>;
  topology: readonly Element[];
  collectionStrategy: SnapshotCollectionStrategy;
}

export type ElementIdentityResolver = (element: Element) => string | number;

interface ElementMetadata {
  tagName: string;
  text: string;
  className: string;
  id: string;
  testId: string;
  dataId: string;
  size: { width: number; height: number } | null;
  offset: { left: number; top: number } | null;
}

interface BuiltLocator {
  locator: LocatorSegment;
  selector: string;
  stability: LocatorStability;
  fingerprint: ElementFingerprint;
}

type SnapshotElement = Element & {
  size?: () => Promise<{ width: number | string; height: number | string }>;
  offset?: () => Promise<{ left: number | string; top: number | string }>;
};

interface SnapshotQueryRoot {
  $$(selector: string): Promise<SnapshotElement[]>;
}

type SnapshotPage = Omit<Page, '$$'> & SnapshotQueryRoot;

type AsyncLimiter = <T>(task: () => Promise<T>) => Promise<T>;

interface CollectedElements {
  elements: SnapshotElement[];
  strategy: SnapshotCollectionStrategy;
  reason?: 'QUERY_UNSUPPORTED' | 'QUERY_FAILED';
  partialReason?: 'QUERY_FAILED';
}

interface ScopeQueueEntry {
  scope: SnapshotScope;
  root: SnapshotQueryRoot;
  address: ElementAddressSegment[];
  isPage: boolean;
}

function createLimiter(limit: number): AsyncLimiter {
  let active = 0;
  const queue: Array<() => void> = [];

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = (): void => {
        active += 1;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            queue.shift()?.();
          });
      };

      if (active < limit) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

function normalizeConcurrency(value = MAX_METADATA_CONCURRENCY): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error('concurrency 必须是大于等于 1 的数字');
  }
  return Math.min(MAX_METADATA_CONCURRENCY, Math.floor(value));
}

function normalizeInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string
): number {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new Error(`${label} 必须是 ${minimum} 到 ${maximum} 之间的安全整数`);
  }
  return normalized;
}

function normalizeBudget(input: Partial<SnapshotBudget> = {}): SnapshotBudget {
  return {
    maxDepth: normalizeInteger(input.maxDepth, DEFAULT_BUDGET.maxDepth, 0, 8, 'maxDepth'),
    maxExpandedScopes: normalizeInteger(
      input.maxExpandedScopes,
      DEFAULT_BUDGET.maxExpandedScopes,
      1,
      256,
      'maxExpandedScopes'
    ),
    maxElements: normalizeInteger(
      input.maxElements,
      DEFAULT_BUDGET.maxElements,
      1,
      5000,
      'maxElements'
    ),
  };
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function attributeSelector(name: string, value: string): string {
  return `[${name}="${escapeAttributeValue(value)}"]`;
}

function buildLocator(metadata: ElementMetadata): BuiltLocator {
  const { tagName, testId, id, dataId, className, text } = metadata;
  const fingerprint: ElementFingerprint = { tagName };

  if (testId) {
    fingerprint.testId = testId;
    return {
      locator: { kind: 'testId', value: testId },
      selector: `${tagName}${attributeSelector('data-testid', testId)}`,
      stability: 'stable',
      fingerprint,
    };
  }
  if (id) {
    fingerprint.id = id;
    return {
      locator: { kind: 'id', value: id },
      selector: `${tagName}${attributeSelector('id', id)}`,
      stability: 'stable',
      fingerprint,
    };
  }
  if (dataId) {
    fingerprint.dataId = dataId;
    return {
      locator: { kind: 'dataId', value: dataId },
      selector: `${tagName}${attributeSelector('data-id', dataId)}`,
      stability: 'stable',
      fingerprint,
    };
  }

  const firstClass = className.split(/\s+/).find(Boolean);
  if (firstClass) {
    fingerprint.className = firstClass;
    if (text) fingerprint.text = text;
    const selector = `${tagName}${attributeSelector('class~', firstClass)}`;
    return {
      locator: { kind: 'selector', value: selector },
      selector,
      stability: 'contextual',
      fingerprint,
    };
  }

  if (text) {
    fingerprint.text = text;
    return {
      locator: { kind: 'text', value: text, exact: true, tagName },
      selector: tagName,
      stability: 'contextual',
      fingerprint,
    };
  }
  return {
    locator: { kind: 'selector', value: tagName },
    selector: tagName,
    stability: 'positional',
    fingerprint,
  };
}

function fulfilledOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

async function readMetadata(
  element: SnapshotElement,
  limit: AsyncLimiter,
  includePosition: boolean
): Promise<ElementMetadata> {
  const readRect = (): Promise<{
    left: number;
    top: number;
    width: number;
    height: number;
  }> => element.boundingClientRect();
  const sizePromise: Promise<{ width: number; height: number } | null> = includePosition
    ? limit(async () => element.size
      ? element.size().then(value => ({ width: Number(value.width), height: Number(value.height) }))
      : readRect().then(rect => ({ width: rect.width, height: rect.height })))
    : Promise.resolve(null);
  const offsetPromise: Promise<{ left: number; top: number } | null> = includePosition
    ? limit(async () => element.offset
      ? element.offset().then(value => ({ left: Number(value.left), top: Number(value.top) }))
      : readRect().then(rect => ({ left: rect.left, top: rect.top })))
    : Promise.resolve(null);
  const [text, className, id, testId, dataId, size, offset] = await Promise.allSettled([
    limit<string>(() => element.text()),
    limit<string | null>(() => element.attribute('class')),
    limit<string | null>(() => element.attribute('id')),
    limit<string | null>(() => element.attribute('data-testid')),
    limit<string | null>(() => element.attribute('data-id')),
    sizePromise,
    offsetPromise,
  ]);

  return {
    tagName: element.tagName || 'unknown',
    text: fulfilledOr(text, '').trim(),
    className: fulfilledOr(className, '') ?? '',
    id: fulfilledOr(id, '') ?? '',
    testId: fulfilledOr(testId, '') ?? '',
    dataId: fulfilledOr(dataId, '') ?? '',
    size: fulfilledOr(size, null),
    offset: fulfilledOr(offset, null),
  };
}

function hasQueryCapability(root: object): root is SnapshotQueryRoot {
  return '$$' in root && typeof root.$$ === 'function';
}

async function collectElements(
  root: SnapshotQueryRoot,
  limit: AsyncLimiter,
  options: {
    preferredStrategy?: SnapshotCollectionStrategy;
    isPage: boolean;
  }
): Promise<CollectedElements> {
  if (!hasQueryCapability(root)) {
    return { elements: [], strategy: 'none', reason: 'QUERY_UNSUPPORTED' };
  }

  const runQuery = async (selector: string): Promise<SnapshotElement[] | null> => {
    try {
      return await limit(() => root.$$(selector));
    } catch {
      return null;
    }
  };

  if (options.preferredStrategy && options.preferredStrategy !== 'none') {
    const selectors = options.preferredStrategy === 'wildcard(*)'
      ? ['*']
      : options.preferredStrategy === 'hierarchical(page>*)'
        ? ['page > *']
        : [...COMMON_SELECTORS];
    const groups = await Promise.all(selectors.map(runQuery));
    const successfulGroups = groups.filter((group): group is SnapshotElement[] => group !== null);
    return successfulGroups.length > 0
      ? {
          elements: successfulGroups.flat(),
          strategy: options.preferredStrategy,
          ...(options.preferredStrategy === 'wildcard(*)'
            ? {}
            : { partialReason: 'QUERY_FAILED' as const }),
        }
      : { elements: [], strategy: options.preferredStrategy, reason: 'QUERY_FAILED' };
  }

  let anyQuerySucceeded = false;
  let fallbackQueryFailed = false;
  const wildcardElements = await runQuery('*');
  if (wildcardElements !== null) {
    anyQuerySucceeded = true;
    if (wildcardElements.length > 0) {
      return { elements: wildcardElements, strategy: 'wildcard(*)' };
    }
  } else {
    fallbackQueryFailed = true;
  }

  const groups = await Promise.all(COMMON_SELECTORS.map(runQuery));
  const successfulGroups = groups.filter((group): group is SnapshotElement[] => group !== null);
  fallbackQueryFailed ||= successfulGroups.length < groups.length;
  anyQuerySucceeded ||= successfulGroups.length > 0;
  const commonElements = successfulGroups.flat();
  if (commonElements.length > 0) {
    return {
      elements: commonElements,
      strategy: 'common-selectors',
      partialReason: 'QUERY_FAILED',
    };
  }

  if (options.isPage) {
    const rootElements = await runQuery('page > *');
    if (rootElements !== null) {
      anyQuerySucceeded = true;
      if (rootElements.length > 0) {
        return {
          elements: rootElements,
          strategy: 'hierarchical(page>*)',
          partialReason: 'QUERY_FAILED',
        };
      }
    } else {
      fallbackQueryFailed = true;
    }
  }

  return anyQuerySucceeded
    ? {
        elements: [],
        strategy: 'none',
        ...(fallbackQueryFailed ? { partialReason: 'QUERY_FAILED' as const } : {}),
      }
    : { elements: [], strategy: 'none', reason: 'QUERY_FAILED' };
}

/**
 * 仅收集 Page 根作用域拓扑，不读取文本、属性或布局元数据。
 * preferredStrategy 用于提交前复用完整快照实际采用的收集路径。
 */
export async function collectPageTopology(
  page: SnapshotPage,
  options: Pick<GetPageSnapshotOptions, 'concurrency'> & {
    preferredStrategy?: SnapshotCollectionStrategy;
  } = {}
): Promise<PageTopologyCapture> {
  if (!page) {
    throw new Error('页面对象是必需的');
  }

  const limit = createLimiter(normalizeConcurrency(options.concurrency));
  const result = await collectElements(page, limit, {
    preferredStrategy: options.preferredStrategy,
    isPage: true,
  });
  if (result.reason) {
    throw new Error(`页面拓扑查询失败：${result.reason}`);
  }
  return { topology: result.elements, strategy: result.strategy };
}

function locatorKey(locator: LocatorSegment): string {
  switch (locator.kind) {
    case 'testId':
    case 'id':
    case 'dataId':
      return `${locator.kind}:${locator.value}`;
    case 'selector':
      return `selector:${locator.value}`;
    case 'text':
      return `text:${locator.tagName ?? '*'}:${locator.exact === false ? 'contains' : 'exact'}:${locator.value}`;
  }
}

function locatorWithOccurrence(
  locator: LocatorSegment,
  occurrence: number,
  count: number
): LocatorSegment {
  if (count <= 1) return locator;
  switch (locator.kind) {
    case 'selector':
    case 'text':
      return { ...locator, index: occurrence };
    case 'testId':
    case 'id':
    case 'dataId':
      // 重复的“强”属性不能再视为稳定，转成显式位置 selector。
      return locator;
  }
}

function snapshotAttributes(
  metadata: ElementMetadata,
  includeAttributes: boolean
): Record<string, string> | undefined {
  if (!includeAttributes) return undefined;
  const attributes: Record<string, string> = {};
  if (metadata.className) attributes.class = metadata.className;
  if (metadata.id) attributes.id = metadata.id;
  if (metadata.testId) attributes['data-testid'] = metadata.testId;
  if (metadata.dataId) attributes['data-id'] = metadata.dataId;
  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function setScopeFailure(scope: SnapshotScope, reason: SnapshotScopeReason): void {
  scope.reason = reason;
  scope.status = reason === 'QUERY_FAILED' || reason === 'QUERY_UNSUPPORTED'
    ? 'unavailable'
    : reason === 'ELEMENT_READ_FAILED'
      ? 'partial'
      : 'truncated';
}

function setScopePartial(scope: SnapshotScope, reason: SnapshotScopeReason): void {
  if (scope.status !== 'complete') return;
  scope.status = 'partial';
  scope.reason = reason;
}

/** 获取页面和自定义组件作用域图快照，不包含固定等待。 */
export async function getPageSnapshot(
  page: SnapshotPage,
  options: GetPageSnapshotOptions = {}
): Promise<PageSnapshotCapture> {
  if (!page) {
    throw new Error('页面对象是必需的');
  }

  try {
    const pageRevision = options.pageRevision ?? 0;
    if (!Number.isSafeInteger(pageRevision) || pageRevision < 0) {
      throw new Error('pageRevision 必须是非负安全整数');
    }
    const snapshotId = options.snapshotId ?? createSnapshotId(pageRevision);
    const pagePath = await page.path;
    const budget = normalizeBudget(options.budget);
    const includePosition = options.includePosition ?? true;
    const includeAttributes = options.includeAttributes ?? false;
    const limit = createLimiter(normalizeConcurrency(options.concurrency));
    const elementMap = new Map<string, ElementMapInfo>();
    const topology: Element[] = [];
    const scopedRoot = options.root;
    const scopes: SnapshotScope[] = [{
      scopeId: 'scope_0',
      kind: scopedRoot ? 'custom-component' : 'page',
      ...(scopedRoot?.ref ? { rootRef: scopedRoot.ref } : {}),
      depth: 0,
      status: 'complete',
      elements: [],
    }];
    const edges: NonNullable<PageSnapshot['edges']> = [];
    const queue: ScopeQueueEntry[] = [{
      scope: scopes[0]!,
      root: scopedRoot?.element ?? page,
      address: scopedRoot?.address ?? [],
      isPage: scopedRoot === undefined,
    }];
    const usage = { expandedScopes: 0, elements: 0 };
    let scheduledExpandedScopes = 1;
    let nextScopeIndex = 1;
    let nextRefIndex = 0;
    let rootStrategy: SnapshotCollectionStrategy = 'none';
    let elementBudgetExhausted = false;
    const owners = new WeakMap<Element, string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      if (elementBudgetExhausted) {
        setScopeFailure(current.scope, 'MAX_ELEMENTS');
        continue;
      }

      usage.expandedScopes += 1;
      const collection = await collectElements(current.root, limit, {
        preferredStrategy: current.isPage ? options.preferredStrategy : undefined,
        isPage: current.isPage,
      });
      if (current.isPage) rootStrategy = collection.strategy;
      topology.push(...collection.elements);
      if (collection.reason) {
        setScopeFailure(current.scope, collection.reason);
        continue;
      }
      if (collection.partialReason) {
        setScopePartial(current.scope, collection.partialReason);
      }

      const remaining = budget.maxElements - usage.elements;
      const selectedElements = collection.elements.slice(0, remaining);
      if (selectedElements.length < collection.elements.length) {
        setScopeFailure(current.scope, 'MAX_ELEMENTS');
        elementBudgetExhausted = true;
      }

      const metadataEntries = await Promise.all(
        selectedElements.map(async (element, index) => {
          try {
            const metadata = await readMetadata(element, limit, includePosition);
            return { element, index, metadata, built: buildLocator(metadata) };
          } catch {
            return null;
          }
        })
      );
      if (metadataEntries.some(entry => entry === null) && current.scope.status === 'complete') {
        setScopeFailure(current.scope, 'ELEMENT_READ_FAILED');
      }

      const validEntries = metadataEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      const overlapsAnotherScope = validEntries.some((entry) => {
        const owner = owners.get(entry.element);
        return owner !== undefined && owner !== current.scope.scopeId;
      });
      if (overlapsAnotherScope) {
        // 整个 scope 必须原子提交；预检失败时不能遗留此前 entry 的 ref、usage 或边。
        setScopeFailure(current.scope, 'QUERY_FAILED');
        continue;
      }

      const locatorCounts = new Map<string, number>();
      const selectorCounts = new Map<string, number>();
      for (const entry of validEntries) {
        const key = locatorKey(entry.built.locator);
        locatorCounts.set(key, (locatorCounts.get(key) ?? 0) + 1);
        selectorCounts.set(
          entry.built.selector,
          (selectorCounts.get(entry.built.selector) ?? 0) + 1
        );
      }
      const locatorOccurrences = new Map<string, number>();
      const selectorOccurrences = new Map<string, number>();

      for (const entry of validEntries) {
        owners.set(entry.element, current.scope.scopeId);

        const key = locatorKey(entry.built.locator);
        const occurrence = locatorOccurrences.get(key) ?? 0;
        locatorOccurrences.set(key, occurrence + 1);
        const count = locatorCounts.get(key) ?? 1;
        const selectorOccurrence = selectorOccurrences.get(entry.built.selector) ?? 0;
        selectorOccurrences.set(entry.built.selector, selectorOccurrence + 1);
        const selectorCount = selectorCounts.get(entry.built.selector) ?? 1;
        let locator = locatorWithOccurrence(entry.built.locator, occurrence, count);
        let stability = entry.built.stability;
        let selectorIndex = selectorOccurrence;
        if (stability === 'stable' && count > 1) {
          locator = {
            kind: 'selector',
            value: entry.built.selector,
            ...(selectorCount > 1 ? { index: selectorOccurrence } : {}),
          };
          stability = 'positional';
        } else if (locator.kind !== 'selector' && locator.kind !== 'text') {
          selectorIndex = 0;
        }

        const addressSegment: ElementAddressSegment = {
          locator,
          selector: entry.built.selector,
          index: selectorIndex,
          stability,
          fingerprint: entry.built.fingerprint,
        };
        const address = { segments: [...current.address, addressSegment] };
        const ref = createElementRef(snapshotId, nextRefIndex);
        nextRefIndex += 1;
        usage.elements += 1;
        const componentBoundary = isCustomComponentElement(entry.element);
        const snapshot: ElementSnapshot = {
          ref,
          tagName: entry.metadata.tagName,
          locatorStability: stability,
          componentBoundary,
        };
        if (entry.metadata.text) snapshot.text = entry.metadata.text;
        const attributes = snapshotAttributes(entry.metadata, includeAttributes);
        if (attributes) snapshot.attributes = attributes;
        if (entry.metadata.size && entry.metadata.offset) {
          snapshot.position = {
            left: entry.metadata.offset.left,
            top: entry.metadata.offset.top,
            width: entry.metadata.size.width,
            height: entry.metadata.size.height,
          };
        }

        current.scope.elements.push(snapshot);
        elementMap.set(ref, {
          selector: entry.built.selector,
          index: selectorIndex,
          generationKind: 'snapshot',
          snapshotId,
          pageRevision,
          pagePath,
          element: entry.element,
          fingerprint: entry.built.fingerprint,
          address,
        });

        if (!componentBoundary) continue;
        const childScope: SnapshotScope = {
          scopeId: `scope_${nextScopeIndex}`,
          kind: 'custom-component',
          rootRef: ref,
          depth: current.scope.depth + 1,
          status: 'complete',
          elements: [],
        };
        nextScopeIndex += 1;
        scopes.push(childScope);
        edges.push({
          fromScopeId: current.scope.scopeId,
          boundaryRef: ref,
          toScopeId: childScope.scopeId,
        });

        if (childScope.depth > budget.maxDepth) {
          setScopeFailure(childScope, 'MAX_DEPTH');
        } else if (scheduledExpandedScopes >= budget.maxExpandedScopes) {
          setScopeFailure(childScope, 'MAX_SCOPES');
        } else if (usage.elements >= budget.maxElements) {
          setScopeFailure(childScope, 'MAX_ELEMENTS');
          elementBudgetExhausted = true;
        } else {
          scheduledExpandedScopes += 1;
          queue.push({
            scope: childScope,
            root: entry.element as SnapshotElement & SnapshotQueryRoot,
            address: address.segments,
            isPage: false,
          });
        }
      }

      if (usage.elements >= budget.maxElements && queue.length > 0) {
        elementBudgetExhausted = true;
      }
    }

    const rootScope = scopes[0]!;
    const complete = scopes.every(scope => scope.status === 'complete');
    return {
      snapshot: {
        snapshotId,
        pageRevision,
        path: pagePath,
        elements: rootScope.elements,
        rootScopeId: rootScope.scopeId,
        complete,
        budget,
        usage,
        scopes,
        edges,
      },
      elementMap,
      topology,
      collectionStrategy: rootStrategy,
    };
  } catch (error) {
    throw new Error(`获取页面快照失败: ${extractErrorMessage(error)}`);
  }
}

/**
 * 生成与 snapshotId/pageRevision 无关的 DOM epoch 签名。
 * 位置与尺寸不参与签名，避免动画和布局抖动无意义地推进 pageRevision。
 */
export function createPageSnapshotDomSignature(
  capture: PageSnapshotCapture,
  resolveElementIdentity: ElementIdentityResolver
): string {
  const topology = pageTopologyEntries(capture.topology, resolveElementIdentity);
  const scopes = (capture.snapshot.scopes ?? [{
    scopeId: 'scope_0',
    kind: 'page' as const,
    depth: 0,
    status: 'complete' as const,
    elements: capture.snapshot.elements,
  }]).map(scope => ({
    scopeId: scope.scopeId,
    kind: scope.kind,
    depth: scope.depth,
    status: scope.status,
    reason: scope.reason ?? null,
    elements: scope.elements.map(element => {
      const mapInfo = capture.elementMap.get(element.ref);
      return {
        identity: mapInfo?.element
          ? resolveElementIdentity(mapInfo.element)
          : null,
        tagName: element.tagName,
        text: element.text ?? null,
        fingerprint: mapInfo?.fingerprint ?? null,
        locatorStability: element.locatorStability ?? null,
        componentBoundary: element.componentBoundary ?? false,
      };
    }),
  }));
  const edges = (capture.snapshot.edges ?? []).map(edge => {
    const boundary = capture.elementMap.get(edge.boundaryRef)?.element;
    return {
      fromScopeId: edge.fromScopeId,
      toScopeId: edge.toScopeId,
      boundaryIdentity: boundary ? resolveElementIdentity(boundary) : null,
    };
  });

  return JSON.stringify({ topology, scopes, edges });
}

function pageTopologyEntries(
  topology: readonly Element[],
  resolveElementIdentity: ElementIdentityResolver
): Array<[string | number, string]> {
  return topology.map((element) => [resolveElementIdentity(element), element.tagName || 'unknown']);
}

/** 生成包含完整运行时身份、tag 与顺序的拓扑签名。 */
export function createPageTopologySignature(
  topology: readonly Element[],
  resolveElementIdentity: ElementIdentityResolver
): string {
  return JSON.stringify(pageTopologyEntries(topology, resolveElementIdentity));
}

/**
 * 将已完成的扫描 draft 本地重标记到新的 revision，避免 DOM 变化时再次执行
 * 一轮昂贵的远端元数据读取。
 */
export function rebasePageSnapshotCapture(
  capture: PageSnapshotCapture,
  pageRevision: number
): PageSnapshotCapture {
  if (!Number.isSafeInteger(pageRevision) || pageRevision < 0) {
    throw new Error('pageRevision 必须是非负安全整数');
  }

  const snapshotId = createSnapshotId(pageRevision);
  const elementMap = new Map<string, ElementMapInfo>();
  const refMap = new Map<string, string>();
  let nextRefIndex = 0;
  const sourceScopes = capture.snapshot.scopes ?? [{
    scopeId: 'scope_0',
    kind: 'page' as const,
    depth: 0,
    status: 'complete' as const,
    elements: capture.snapshot.elements,
  }];
  const scopes = sourceScopes.map(scope => ({
    ...scope,
    elements: scope.elements.map(previousElement => {
      const previousInfo = capture.elementMap.get(previousElement.ref);
      if (!previousInfo) {
        throw new Error(`快照元素 ${previousElement.ref} 缺少对应映射`);
      }
      const ref = createElementRef(snapshotId, nextRefIndex);
      nextRefIndex += 1;
      refMap.set(previousElement.ref, ref);
      elementMap.set(ref, {
        ...previousInfo,
        generationKind: 'snapshot' as const,
        snapshotId,
        pageRevision,
      });
      return { ...previousElement, ref };
    }),
  }));
  for (const scope of scopes) {
    if (scope.rootRef) scope.rootRef = refMap.get(scope.rootRef) ?? scope.rootRef;
  }
  const edges = (capture.snapshot.edges ?? []).map(edge => ({
    ...edge,
    boundaryRef: refMap.get(edge.boundaryRef) ?? edge.boundaryRef,
  }));
  const rootScopeId = capture.snapshot.rootScopeId ?? 'scope_0';
  const elements = scopes.find(scope => scope.scopeId === rootScopeId)?.elements ?? [];

  return {
    snapshot: {
      ...capture.snapshot,
      snapshotId,
      pageRevision,
      elements,
      rootScopeId,
      scopes,
      edges,
    },
    elementMap,
    topology: capture.topology,
    collectionStrategy: capture.collectionStrategy,
  };
}
