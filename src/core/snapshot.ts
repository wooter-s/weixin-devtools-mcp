/** 页面快照核心逻辑。 */

import type { Element, Page } from 'miniprogram-automator';

import { createElementRef, createSnapshotId } from '../elements/index.js';
import type { ElementFingerprint, LocatorStability } from '../elements/index.js';
import { extractErrorMessage } from '../utils/error.js';

import type { ElementMapInfo, ElementSnapshot, PageSnapshot } from './types.js';

const MAX_METADATA_CONCURRENCY = 8;

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
  /** 提交前复核时沿用首轮已确认可用的拓扑收集策略。 */
  preferredStrategy?: SnapshotCollectionStrategy;
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

type SnapshotElement = Element & {
  size?: () => Promise<{ width: number | string; height: number | string }>;
  offset?: () => Promise<{ left: number | string; top: number | string }>;
};

type SnapshotPage = Omit<Page, '$$'> & {
  $$(selector: string): Promise<SnapshotElement[]>;
};

type AsyncLimiter = <T>(task: () => Promise<T>) => Promise<T>;

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

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function attributeSelector(name: string, value: string): string {
  return `[${name}="${escapeAttributeValue(value)}"]`;
}

function buildLocator(metadata: ElementMetadata): {
  selector: string;
  stability: LocatorStability;
  fingerprint: ElementFingerprint;
} {
  const { tagName, testId, id, dataId, className, text } = metadata;
  const fingerprint: ElementFingerprint = { tagName };

  if (testId) {
    fingerprint.testId = testId;
    return {
      selector: `${tagName}${attributeSelector('data-testid', testId)}`,
      stability: 'stable',
      fingerprint,
    };
  }
  if (id) {
    fingerprint.id = id;
    return {
      selector: `${tagName}${attributeSelector('id', id)}`,
      stability: 'stable',
      fingerprint,
    };
  }
  if (dataId) {
    fingerprint.dataId = dataId;
    return {
      selector: `${tagName}${attributeSelector('data-id', dataId)}`,
      stability: 'stable',
      fingerprint,
    };
  }

  const firstClass = className.split(/\s+/).find(Boolean);
  if (firstClass) {
    fingerprint.className = firstClass;
    if (text) fingerprint.text = text;
    return {
      selector: `${tagName}${attributeSelector('class~', firstClass)}`,
      stability: 'contextual',
      fingerprint,
    };
  }

  if (text) fingerprint.text = text;
  return { selector: tagName, stability: 'positional', fingerprint };
}

function fulfilledOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

async function readMetadata(
  element: SnapshotElement,
  limit: AsyncLimiter
): Promise<ElementMetadata> {
  const readRect = (): Promise<{
    left: number;
    top: number;
    width: number;
    height: number;
  }> => element.boundingClientRect();
  const [text, className, id, testId, dataId, size, offset] = await Promise.allSettled([
    limit<string>(() => element.text()),
    limit<string | null>(() => element.attribute('class')),
    limit<string | null>(() => element.attribute('id')),
    limit<string | null>(() => element.attribute('data-testid')),
    limit<string | null>(() => element.attribute('data-id')),
    limit<{ width: number; height: number }>(async () =>
      element.size
        ? element
            .size()
            .then((value) => ({ width: Number(value.width), height: Number(value.height) }))
        : readRect().then((rect) => ({ width: rect.width, height: rect.height }))
    ),
    limit<{ left: number; top: number }>(async () =>
      element.offset
        ? element.offset().then((value) => ({ left: Number(value.left), top: Number(value.top) }))
        : readRect().then((rect) => ({ left: rect.left, top: rect.top }))
    ),
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

async function collectElements(
  page: SnapshotPage,
  limit: AsyncLimiter,
  preferredStrategy?: SnapshotCollectionStrategy
): Promise<{
  elements: SnapshotElement[];
  strategy: SnapshotCollectionStrategy;
}> {
  if (preferredStrategy === 'wildcard(*)') {
    return {
      elements: await limit<SnapshotElement[]>(() => page.$$('*')),
      strategy: preferredStrategy,
    };
  }

  if (preferredStrategy === 'common-selectors') {
    const groups = await Promise.all(
      COMMON_SELECTORS.map(async (selector) => {
        try {
          return await limit(() => page.$$(selector));
        } catch {
          return [];
        }
      })
    );
    return { elements: groups.flat(), strategy: preferredStrategy };
  }

  if (preferredStrategy === 'hierarchical(page>*)') {
    return {
      elements: await limit(() => page.$$('page > *')),
      strategy: preferredStrategy,
    };
  }

  // none 表示首次扫描未找到节点；复核时重新执行完整探测，才能识别新出现的节点。
  try {
    const wildcardElements = await limit<SnapshotElement[]>(() => page.$$('*'));
    if (wildcardElements.length > 0) {
      return { elements: wildcardElements, strategy: 'wildcard(*)' };
    }
  } catch (error) {
    console.warn('通配符快照查询失败，尝试组件选择器', error);
  }

  const groups = await Promise.all(
    COMMON_SELECTORS.map(async (selector) => {
      try {
        return await limit(() => page.$$(selector));
      } catch {
        return [];
      }
    })
  );
  const commonElements = groups.flat();
  if (commonElements.length > 0) {
    return { elements: commonElements, strategy: 'common-selectors' };
  }

  try {
    const rootElements = await limit(() => page.$$('page > *'));
    return rootElements.length > 0
      ? { elements: rootElements, strategy: 'hierarchical(page>*)' }
      : { elements: [], strategy: 'none' };
  } catch (error) {
    console.warn('层级快照查询失败', error);
    return { elements: [], strategy: 'none' };
  }
}

/**
 * 仅收集元素拓扑，不读取文本、属性或布局元数据。
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
  const { elements, strategy } = await collectElements(page, limit, options.preferredStrategy);
  return { topology: elements, strategy };
}

/** 获取页面元素快照，不再包含固定等待。 */
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
    const { topology: childElements, strategy } = await collectPageTopology(page, options);
    const limit = createLimiter(normalizeConcurrency(options.concurrency));
    const metadataEntries = await Promise.all(
      childElements.map(async (element, index) => {
        try {
          const metadata = await readMetadata(element, limit);
          const { selector, stability, fingerprint } = buildLocator(metadata);
          return { element, index, metadata, selector, stability, fingerprint };
        } catch (error) {
          console.warn(`处理快照元素 ${index} 失败`, error);
          return null;
        }
      })
    );

    const snapshots: ElementSnapshot[] = [];
    const elementMap = new Map<string, ElementMapInfo>();
    const selectorIndexMap = new Map<string, number>();
    for (const entry of metadataEntries) {
      if (!entry) continue;
      const selectorIndex = selectorIndexMap.get(entry.selector) ?? 0;
      selectorIndexMap.set(entry.selector, selectorIndex + 1);
      const ref = createElementRef(snapshotId, entry.index);
      const attributes: Record<string, string> = {};
      if (entry.metadata.className) attributes.class = entry.metadata.className;
      if (entry.metadata.id) attributes.id = entry.metadata.id;
      if (entry.metadata.testId) attributes['data-testid'] = entry.metadata.testId;
      if (entry.metadata.dataId) attributes['data-id'] = entry.metadata.dataId;

      const snapshot: ElementSnapshot = {
        ref,
        tagName: entry.metadata.tagName,
        locatorStability: entry.stability,
      };
      if (entry.metadata.text) snapshot.text = entry.metadata.text;
      if (Object.keys(attributes).length > 0) snapshot.attributes = attributes;
      if (entry.metadata.size && entry.metadata.offset) {
        snapshot.position = {
          left: entry.metadata.offset.left,
          top: entry.metadata.offset.top,
          width: entry.metadata.size.width,
          height: entry.metadata.size.height,
        };
      }

      snapshots.push(snapshot);
      elementMap.set(ref, {
        selector: entry.selector,
        index: selectorIndex,
        generationKind: 'snapshot',
        snapshotId,
        pageRevision,
        pagePath,
        element: entry.element,
        fingerprint: entry.fingerprint,
      });
    }

    console.error(`页面快照完成：${snapshots.length} 个元素（${strategy}）`);
    return {
      snapshot: {
        snapshotId,
        pageRevision,
        path: pagePath,
        elements: snapshots,
      },
      elementMap,
      topology: childElements,
      collectionStrategy: strategy,
    };
  } catch (error) {
    throw new Error(`获取页面快照失败: ${extractErrorMessage(error)}`);
  }
}

/**
 * 生成与 snapshotId/pageRevision 无关的 DOM epoch 签名。
 *
 * topology 中的运行时元素身份可识别“结构与文本完全相同、但节点已整体
 * 重建”的情况；快照字段则覆盖 locator 依赖的文本和属性变化。位置与尺寸
 * 不参与签名，避免动画和布局抖动无意义地推进 pageRevision。
 */
export function createPageSnapshotDomSignature(
  capture: PageSnapshotCapture,
  resolveElementIdentity: ElementIdentityResolver
): string {
  const topology = pageTopologyEntries(capture.topology, resolveElementIdentity);
  const metadata = capture.snapshot.elements.map((element) => ({
    tagName: element.tagName,
    text: element.text ?? null,
    attributes: Object.entries(element.attributes ?? {}).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
    locatorStability: element.locatorStability ?? null,
  }));

  return JSON.stringify({ topology, metadata });
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
  const elements: ElementSnapshot[] = [];
  const elementMap = new Map<string, ElementMapInfo>();

  for (let index = 0; index < capture.snapshot.elements.length; index += 1) {
    const previousElement = capture.snapshot.elements[index];
    if (!previousElement) continue;
    const previousInfo = capture.elementMap.get(previousElement.ref);
    if (!previousInfo) {
      throw new Error(`快照元素 ${previousElement.ref} 缺少对应映射`);
    }

    const ref = createElementRef(snapshotId, index);
    elements.push({ ...previousElement, ref });
    elementMap.set(ref, {
      ...previousInfo,
      generationKind: 'snapshot',
      snapshotId,
      pageRevision,
    });
  }

  return {
    snapshot: {
      ...capture.snapshot,
      snapshotId,
      pageRevision,
      elements,
    },
    elementMap,
    topology: capture.topology,
    collectionStrategy: capture.collectionStrategy,
  };
}
