/**
 * Collector 基类 - 通用数据收集器
 * 参考 chrome-devtools-mcp 的 PageCollector 设计模式
 *
 * 特点：
 * - 按导航会话分组存储
 * - Stable ID 标识
 * - 支持分页和过滤
 */

import { createIdGenerator, stableIdSymbol, type WithStableId } from '../utils/idGenerator.js';

/**
 * 导航会话数据结构
 */
export interface NavigationSession<T> {
  /** 会话中的数据项 */
  items: Array<WithStableId<T>>;
  /** 会话开始时间 */
  timestamp: string;
}

/**
 * Collector 配置选项
 */
export interface CollectorOptions {
  /** 最大保留的导航会话数 */
  maxNavigations?: number;
  /** 单个会话最大条目数（环形缓冲区），默认 1000 */
  maxItemsPerSession?: number;
  /** 是否启用详细日志 */
  verbose?: boolean;
}

/**
 * 分页和过滤选项
 */
export interface QueryOptions<T> {
  /** 是否包含历史导航会话的数据 */
  includePreserved?: boolean;
  /** 过滤函数 */
  filter?: (item: T) => boolean;
  /** 每页数量 */
  pageSize?: number;
  /** 页码（从 0 开始） */
  pageIdx?: number;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<CollectorOptions> = {
  maxNavigations: 3,
  maxItemsPerSession: 1000,
  verbose: false,
};

/**
 * 通用数据收集器基类
 *
 * @template T 收集的数据类型
 */
export class Collector<T> {
  /** 按导航分组的存储 */
  #navigations: Array<NavigationSession<T>> = [];

  /** ID 到数据项的映射（用于快速查找） */
  #idMap = new Map<number, WithStableId<T>>();

  /** ID 生成器 */
  #idGenerator: () => number;

  /** 配置选项 */
  #options: Required<CollectorOptions>;

  /** 是否正在监听 */
  #isMonitoring = false;

  /** 监听开始时间 */
  #startTime: string | null = null;

  constructor(options: CollectorOptions = {}) {
    this.#options = { ...DEFAULT_OPTIONS, ...options };
    this.#idGenerator = createIdGenerator();

    // 初始化第一个导航会话
    this.#navigations.push({
      items: [],
      timestamp: new Date().toISOString(),
    });
  }

  // ============ 监听状态管理 ============

  /**
   * 开始监听
   */
  startMonitoring(): void {
    this.#isMonitoring = true;
    this.#startTime = new Date().toISOString();
  }

  /**
   * 停止监听
   */
  stopMonitoring(): void {
    this.#isMonitoring = false;
  }

  /**
   * 检查是否正在监听
   */
  isMonitoring(): boolean {
    return this.#isMonitoring;
  }

  /**
   * 获取监听开始时间
   */
  getStartTime(): string | null {
    return this.#startTime;
  }

  // ============ 数据收集 ============

  /**
   * 添加数据项（自动分配 Stable ID）
   * 使用环形缓冲区，超出 maxItemsPerSession 时移除最旧的条目
   * @returns 分配的 ID
   */
  collect(item: T): number {
    const id = this.#idGenerator();
    const withId = item as WithStableId<T>;
    withId[stableIdSymbol] = id;

    // 添加到当前导航会话
    const currentSession = this.#navigations[0];

    // 环形缓冲区：超出限制时移除最旧的条目
    if (currentSession.items.length >= this.#options.maxItemsPerSession) {
      const removed = currentSession.items.shift();
      if (removed) {
        const removedId = this.getIdForItem(removed);
        if (removedId !== -1) {
          this.#idMap.delete(removedId);
        }
      }
      if (this.#options.verbose) {
        console.error(`[Collector] 环形缓冲区已满，移除最旧条目`);
      }
    }

    currentSession.items.push(withId);

    // 添加到 ID 映射
    this.#idMap.set(id, withId);

    if (this.#options.verbose) {
      console.error(`[Collector] 收集数据项，ID: ${id}，当前会话条目数: ${currentSession.items.length}`);
    }

    return id;
  }

  /**
   * 在导航后分割存储（保留历史）
   */
  splitAfterNavigation(): void {
    // 添加新的导航会话到开头
    this.#navigations.unshift({
      items: [],
      timestamp: new Date().toISOString(),
    });

    // 限制保留的导航数量
    if (this.#navigations.length > this.#options.maxNavigations) {
      const removed = this.#navigations.splice(this.#options.maxNavigations);
      // 清理被移除会话中的 ID 映射
      for (const session of removed) {
        for (const item of session.items) {
          const id = this.getIdForItem(item);
          if (id !== -1) {
            this.#idMap.delete(id);
          }
        }
      }
    }

    if (this.#options.verbose) {
      console.error(`[Collector] 导航分割，当前会话数: ${this.#navigations.length}`);
    }
  }

  // ============ 数据查询 ============

  /**
   * 获取数据项的 Stable ID
   */
  getIdForItem(item: WithStableId<T>): number {
    return item[stableIdSymbol] ?? -1;
  }

  /**
   * 通过 ID 获取数据项
   */
  getById(id: number): T | undefined {
    return this.#idMap.get(id);
  }

  /**
   * 获取数据（支持分页和过滤）
   */
  getData(options: QueryOptions<T> = {}): T[] {
    const { includePreserved = false, filter, pageSize, pageIdx = 0 } = options;

    // 收集数据
    let result: T[] = [];

    if (includePreserved) {
      // 从旧到新收集所有会话的数据
      for (let i = this.#navigations.length - 1; i >= 0; i--) {
        result.push(...this.#navigations[i].items);
      }
    } else {
      // 只收集当前会话的数据
      result = [...this.#navigations[0].items];
    }

    // 应用过滤
    if (filter) {
      result = result.filter(filter);
    }

    // 应用分页
    if (pageSize !== undefined && pageSize > 0) {
      const start = pageIdx * pageSize;
      result = result.slice(start, start + pageSize);
    }

    return result;
  }

  /**
   * 查找符合条件的数据项
   */
  find(predicate: (item: T) => boolean): T | undefined {
    for (const session of this.#navigations) {
      const found = session.items.find(predicate);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  /**
   * 查找所有符合条件的数据项
   */
  findAll(predicate: (item: T) => boolean): T[] {
    const result: T[] = [];
    for (const session of this.#navigations) {
      result.push(...session.items.filter(predicate));
    }
    return result;
  }

  // ============ 统计信息 ============

  /**
   * 获取当前会话的数据数量
   */
  getCurrentCount(): number {
    return this.#navigations[0]?.items.length ?? 0;
  }

  /**
   * 获取所有会话的数据总数
   */
  getTotalCount(): number {
    return this.#idMap.size;
  }

  /**
   * 获取导航会话数量
   */
  getNavigationCount(): number {
    return this.#navigations.length;
  }

  // ============ 清理操作 ============

  /**
   * 清空所有数据
   */
  clear(): void {
    this.#navigations = [{
      items: [],
      timestamp: new Date().toISOString(),
    }];
    this.#idMap.clear();
    this.#idGenerator = createIdGenerator();
  }

  /**
   * 清空当前会话的数据
   */
  clearCurrentSession(): void {
    const currentSession = this.#navigations[0];
    for (const item of currentSession.items) {
      const id = this.getIdForItem(item);
      if (id !== -1) {
        this.#idMap.delete(id);
      }
    }
    currentSession.items = [];
  }

  // ============ 导出/兼容接口 ============

  /**
   * 获取原始导航数据（用于兼容旧接口）
   */
  getNavigations(): Array<NavigationSession<T>> {
    return this.#navigations;
  }

  /**
   * 获取 ID 映射表（用于兼容旧接口）
   */
  getIdMap(): Map<number, WithStableId<T>> {
    return this.#idMap;
  }
}
