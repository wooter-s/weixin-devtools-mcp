/**
 * MiniProgramContext - 小程序自动化上下文管理类
 *
 * 参考 chrome-devtools-mcp 的 McpContext 设计模式
 * 统一管理所有状态，提供类型安全的访问方法
 *
 * 使用 Collector 模式管理 Console 和 Network 数据
 */

import type { MiniProgram, Page, Element } from 'miniprogram-automator';

import {
  ConsoleCollector,
  NetworkCollector,
  isConsoleMessage,
  isExceptionMessage,
} from './collectors/index.js';
import type { ConsoleEntry, NetworkRequest } from './collectors/index.js';
import {
  ConnectionManager,
  createDisconnectedStatus,
  type ConnectionConnectResult,
  type ConnectionRequest,
  type ConnectionStatusSnapshot,
} from './connection/index.js';
import type {
  ToolContext,
  ConsoleStorage,
  NetworkStorage,
  ConsoleMessage,
  ExceptionMessage,
  ConsoleMessageType,
} from './tools/ToolDefinition.js';
import { getPageSnapshot, type ElementMapInfo, type PageSnapshot } from './tools.js';

/**
 * MiniProgramContext 配置选项
 */
export interface MiniProgramContextOptions {
  /** 最大保留的导航会话数 */
  maxNavigations?: number;
  /** 是否启用详细日志 */
  verbose?: boolean;
  /** 快照缓存 TTL（毫秒），默认 5000ms */
  snapshotCacheTtl?: number;
}

/**
 * 快照缓存结构
 */
interface SnapshotCache {
  /** 缓存的快照数据 */
  snapshot: PageSnapshot | null;
  /** 元素映射 */
  elementMap: Map<string, ElementMapInfo> | null;
  /** 缓存时的页面路径 */
  path: string;
  /** 缓存时间戳 */
  timestamp: number;
}

interface MiniProgramListenerState {
  consoleHandler: ((msg: { type?: string; args?: unknown[] }) => void) | null;
  exceptionHandler: ((err: { message?: string; stack?: string }) => void) | null;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<MiniProgramContextOptions> = {
  maxNavigations: 3,
  verbose: false,
  snapshotCacheTtl: 5000,
};

/**
 * MiniProgramContext 类
 *
 * 统一管理小程序自动化的所有状态：
 * - miniProgram 实例
 * - currentPage 当前页面
 * - elementMap 元素映射
 * - consoleCollector Console 数据收集器
 * - networkCollector 网络请求收集器
 */
export class MiniProgramContext implements ToolContext {
  // 私有状态
  #miniProgram: MiniProgram | null = null;
  #currentPage: Page | null = null;
  #elementMap: Map<string, ElementMapInfo> = new Map();
  #options: Required<MiniProgramContextOptions>;
  #connectionManager: ConnectionManager;
  #connectionStatus: ConnectionStatusSnapshot = createDisconnectedStatus();

  // 监听器所有权状态（谁注册谁解绑）
  #listenerState: MiniProgramListenerState = {
    consoleHandler: null,
    exceptionHandler: null,
  };

  // 使用 Collector 模式管理数据
  #consoleCollector: ConsoleCollector;
  #networkCollector: NetworkCollector;

  // 快照缓存
  #snapshotCache: SnapshotCache = {
    snapshot: null,
    elementMap: null,
    path: '',
    timestamp: 0,
  };

  /**
   * 私有构造函数，使用工厂方法创建实例
   */
  private constructor(options: MiniProgramContextOptions = {}) {
    this.#options = { ...DEFAULT_OPTIONS, ...options };
    this.#connectionManager = new ConnectionManager();

    // 初始化 Console 收集器
    this.#consoleCollector = new ConsoleCollector({
      maxNavigations: this.#options.maxNavigations,
      verbose: this.#options.verbose,
    });

    // 初始化网络收集器
    this.#networkCollector = new NetworkCollector({
      maxNavigations: this.#options.maxNavigations,
      verbose: this.#options.verbose,
    });
  }

  /**
   * 工厂方法：创建 MiniProgramContext 实例
   */
  static create(options?: MiniProgramContextOptions): MiniProgramContext {
    return new MiniProgramContext(options);
  }

  /**
   * 工厂方法：从已有的 MiniProgram 实例创建上下文
   */
  static async from(
    miniProgram: MiniProgram,
    options?: MiniProgramContextOptions
  ): Promise<MiniProgramContext> {
    const context = new MiniProgramContext(options);
    await context.setMiniProgram(miniProgram);
    return context;
  }

  // ============ MiniProgram 相关方法 ============

  /**
   * 获取 MiniProgram 实例
   * @throws 如果未连接则抛出错误
   */
  getMiniProgram(): MiniProgram {
    if (!this.#miniProgram) {
      throw new Error('请先连接微信开发者工具');
    }
    return this.#miniProgram;
  }

  #detachOwnedListeners(): void {
    if (!this.#miniProgram) {
      this.#listenerState.consoleHandler = null;
      this.#listenerState.exceptionHandler = null;
      return;
    }

    if (this.#listenerState.consoleHandler) {
      this.#miniProgram.off('console', this.#listenerState.consoleHandler);
      this.#listenerState.consoleHandler = null;
    }

    if (this.#listenerState.exceptionHandler) {
      this.#miniProgram.off('exception', this.#listenerState.exceptionHandler);
      this.#listenerState.exceptionHandler = null;
    }
  }

  bindConsoleAndExceptionListeners(
    handlers: {
      consoleHandler: (msg: { type?: string; args?: unknown[] }) => void;
      exceptionHandler: (err: { message?: string; stack?: string }) => void;
    }
  ): void {
    if (!this.#miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    this.#detachOwnedListeners();
    this.#miniProgram.on('console', handlers.consoleHandler);
    this.#miniProgram.on('exception', handlers.exceptionHandler);
    this.#listenerState = {
      consoleHandler: handlers.consoleHandler,
      exceptionHandler: handlers.exceptionHandler,
    };
  }

  /**
   * 设置 MiniProgram 实例
   */
  async setMiniProgram(miniProgram: MiniProgram): Promise<void> {
    this.#detachOwnedListeners();
    this.#miniProgram = miniProgram;
    this.#networkCollector.setMiniProgram(miniProgram);

    // 自动获取当前页面
    try {
      const page = await miniProgram.currentPage();
      if (page) {
        this.#currentPage = page;
        const pagePath = await page.path;
        this.#connectionStatus = {
          ...this.#connectionStatus,
          state: 'connected',
          connected: true,
          hasCurrentPage: true,
          pagePath,
        };
      }
    } catch (error) {
      if (this.#options.verbose) {
        console.warn('[MiniProgramContext] 获取当前页面失败:', error);
      }
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.#connectionStatus.connected;
  }

  /**
   * 断开连接，重置状态
   */
  disconnect(): void {
    this.#detachOwnedListeners();
    this.#miniProgram = null;
    this.#networkCollector.setMiniProgram(null);
    this.#currentPage = null;
    this.#elementMap.clear();
    this.#consoleCollector.clear();
    this.#consoleCollector.stopMonitoring();
    this.#networkCollector.reset();
    this.invalidateSnapshotCache();
    this.#connectionStatus = createDisconnectedStatus();
  }

  async connectDevtools(request: ConnectionRequest): Promise<ConnectionConnectResult> {
    const result = await this.#connectionManager.connect(request);
    this.#detachOwnedListeners();
    this.#miniProgram = result.miniProgram;
    this.#networkCollector.setMiniProgram(result.miniProgram);
    this.#currentPage = result.currentPage;
    this.#elementMap.clear();
    this.#connectionStatus = this.#connectionManager.getStatusSnapshot();
    return result;
  }

  async reconnectDevtools(request?: ConnectionRequest): Promise<ConnectionConnectResult> {
    const result = await this.#connectionManager.reconnect(request);
    this.#detachOwnedListeners();
    this.#miniProgram = result.miniProgram;
    this.#networkCollector.setMiniProgram(result.miniProgram);
    this.#currentPage = result.currentPage;
    this.#elementMap.clear();
    this.#connectionStatus = this.#connectionManager.getStatusSnapshot();
    return result;
  }

  async disconnectDevtools(): Promise<ConnectionStatusSnapshot> {
    await this.#connectionManager.disconnect();
    this.disconnect();
    return this.#connectionStatus;
  }

  async getConnectionStatus(options?: { refreshHealth?: boolean }): Promise<ConnectionStatusSnapshot> {
    const refreshHealth = options?.refreshHealth ?? true;
    this.#connectionStatus = refreshHealth
      ? await this.#connectionManager.refreshHealth()
      : this.#connectionManager.getStatusSnapshot();

    if (!this.#connectionStatus.connected) {
      this.#detachOwnedListeners();
      this.#miniProgram = null;
      this.#networkCollector.setMiniProgram(null);
      this.#currentPage = null;
      this.#elementMap.clear();
      return this.#connectionStatus;
    }

    const session = this.#connectionManager.getSession();
    if (session) {
      if (this.#miniProgram !== session.miniProgram) {
        this.#detachOwnedListeners();
      }
      this.#miniProgram = session.miniProgram;
      this.#networkCollector.setMiniProgram(session.miniProgram);
      this.#currentPage = session.currentPage;
    }

    return this.#connectionStatus;
  }

  // ============ 页面相关方法 ============

  /**
   * 获取当前页面
   * @throws 如果未连接或没有当前页面则抛出错误
   */
  getCurrentPage(): Page {
    if (!this.#currentPage) {
      throw new Error('请先连接微信开发者工具并获取当前页面');
    }
    return this.#currentPage;
  }

  /**
   * 设置当前页面
   */
  setCurrentPage(page: Page): void {
    this.#currentPage = page;
  }

  /**
   * 刷新当前页面引用
   */
  async refreshCurrentPage(): Promise<Page> {
    const miniProgram = this.getMiniProgram();
    const page = await miniProgram.currentPage();
    if (!page) {
      throw new Error('无法获取当前页面');
    }
    this.#currentPage = page;
    return page;
  }

  // ============ 元素映射相关方法 ============

  /**
   * 获取元素映射表（只读）
   */
  getElementMap(): ReadonlyMap<string, ElementMapInfo> {
    return this.#elementMap;
  }

  /**
   * 设置元素映射
   */
  setElementMapEntry(uid: string, info: ElementMapInfo): void {
    this.#elementMap.set(uid, info);
  }

  /**
   * 批量设置元素映射
   */
  setElementMap(map: Map<string, ElementMapInfo>): void {
    this.#elementMap = map;
  }

  /**
   * 清空元素映射
   */
  clearElementMap(): void {
    this.#elementMap.clear();
  }

  /**
   * 通过 UID 获取元素
   * 统一处理：连接检查、快照检查、元素查找、索引定位
   */
  async getElementByUid(uid: string): Promise<Element> {
    // 1. 检查页面是否已连接
    const page = this.getCurrentPage();

    // 2. 检查 UID 是否存在于 elementMap
    const mapInfo = this.#elementMap.get(uid);
    if (!mapInfo) {
      throw new Error(
        `找不到 UID: ${uid}\n` +
        `请先调用 get_page_snapshot 工具获取页面快照`
      );
    }

    if (this.#options.verbose) {
      console.error(`[getElementByUid] UID: ${uid}, Selector: ${mapInfo.selector}, Index: ${mapInfo.index}`);
    }

    // 3. 使用选择器获取所有匹配元素
    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(
        `选择器 "${mapInfo.selector}" 未找到任何元素\n` +
        `页面可能已发生变化，请重新获取快照`
      );
    }

    // 4. 检查索引是否有效
    if (mapInfo.index >= elements.length) {
      throw new Error(
        `元素索引 ${mapInfo.index} 超出范围（选择器 "${mapInfo.selector}" 共找到 ${elements.length} 个元素）\n` +
        `页面可能已发生变化，请重新获取快照`
      );
    }

    // 5. 返回目标元素
    const element = elements[mapInfo.index];
    if (!element) {
      throw new Error(`无法获取索引 ${mapInfo.index} 的元素`);
    }

    return element;
  }

  // ============ 快照缓存相关方法 ============

  /**
   * 获取页面快照（带缓存）
   *
   * 缓存策略：
   * - 在 TTL 内返回缓存的快照（避免重复调用 getPageSnapshot）
   * - 页面路径变化时自动刷新缓存
   * - 支持强制刷新
   *
   * @param options.forceRefresh 强制刷新缓存
   * @param options.ttl 覆盖默认 TTL（毫秒）
   * @returns 页面快照和元素映射
   */
  async getPageSnapshotCached(options?: {
    forceRefresh?: boolean;
    ttl?: number;
  }): Promise<{ snapshot: PageSnapshot; elementMap: Map<string, ElementMapInfo> }> {
    const { forceRefresh = false, ttl = this.#options.snapshotCacheTtl } = options || {};

    const page = this.getCurrentPage();
    const currentPath = await page.path;
    const now = Date.now();

    // 检查缓存有效性
    const cacheValid =
      !forceRefresh &&
      this.#snapshotCache.snapshot !== null &&
      this.#snapshotCache.elementMap !== null &&
      this.#snapshotCache.path === currentPath &&
      (now - this.#snapshotCache.timestamp) < ttl;

    if (cacheValid) {
      if (this.#options.verbose) {
        console.error(`[SnapshotCache] 缓存命中，路径: ${currentPath}，缓存时长: ${now - this.#snapshotCache.timestamp}ms`);
      }
      return {
        snapshot: this.#snapshotCache.snapshot!,
        elementMap: this.#snapshotCache.elementMap!,
      };
    }

    // 缓存未命中，获取新快照
    if (this.#options.verbose) {
      const reason = forceRefresh
        ? '强制刷新'
        : this.#snapshotCache.snapshot === null
          ? '首次获取'
          : this.#snapshotCache.path !== currentPath
            ? '页面路径变化'
            : 'TTL 过期';
      console.error(`[SnapshotCache] 缓存未命中（${reason}），获取新快照...`);
    }

    const { snapshot, elementMap } = await getPageSnapshot(page);

    // 更新缓存
    this.#snapshotCache = {
      snapshot,
      elementMap,
      path: currentPath,
      timestamp: now,
    };

    // 同步更新 elementMap
    this.#elementMap = elementMap;

    if (this.#options.verbose) {
      console.error(`[SnapshotCache] 缓存已更新，元素数量: ${snapshot.elements.length}`);
    }

    return { snapshot, elementMap };
  }

  /**
   * 使缓存失效
   * 在导航后或 DOM 发生变化时调用
   */
  invalidateSnapshotCache(): void {
    this.#snapshotCache = {
      snapshot: null,
      elementMap: null,
      path: '',
      timestamp: 0,
    };
    if (this.#options.verbose) {
      console.error('[SnapshotCache] 缓存已失效');
    }
  }

  /**
   * 获取缓存状态信息（用于调试）
   */
  getSnapshotCacheStatus(): {
    isCached: boolean;
    path: string;
    age: number;
    elementCount: number;
    ttl: number;
  } {
    const now = Date.now();
    return {
      isCached: this.#snapshotCache.snapshot !== null,
      path: this.#snapshotCache.path,
      age: this.#snapshotCache.timestamp > 0 ? now - this.#snapshotCache.timestamp : -1,
      elementCount: this.#snapshotCache.snapshot?.elements.length ?? 0,
      ttl: this.#options.snapshotCacheTtl,
    };
  }

  // ============ Console Collector 相关方法 ============

  /**
   * 获取 Console 收集器（新 API）
   */
  getConsoleCollector(): ConsoleCollector {
    return this.#consoleCollector;
  }

  /**
   * 开始 Console 监听
   */
  startConsoleMonitoring(): void {
    this.#consoleCollector.startMonitoring();
  }

  /**
   * 停止 Console 监听
   */
  stopConsoleMonitoring(): void {
    this.#consoleCollector.stopMonitoring();
  }

  /**
   * 检查是否正在监听 Console
   */
  isConsoleMonitoring(): boolean {
    return this.#consoleCollector.isMonitoring();
  }

  /**
   * 添加 Console 消息
   * @returns 分配的 msgid
   */
  addConsoleMessage(message: Omit<ConsoleMessage, 'msgid'>): number {
    return this.#consoleCollector.addMessage(message);
  }

  /**
   * 添加异常消息
   * @returns 分配的 msgid
   */
  addExceptionMessage(exception: Omit<ExceptionMessage, 'msgid'>): number {
    return this.#consoleCollector.addException(exception);
  }

  /**
   * 通过 ID 获取消息
   */
  getConsoleMessageById(msgid: number): ConsoleEntry | undefined {
    return this.#consoleCollector.getMessageById(msgid);
  }

  /**
   * 获取所有消息（支持分页和过滤）
   */
  getConsoleMessages(options?: {
    includePreserved?: boolean;
    types?: string[];
    pageSize?: number;
    pageIdx?: number;
  }): ConsoleEntry[] {
    const { includePreserved = false, types, pageSize, pageIdx = 0 } = options || {};

    return this.#consoleCollector.getMessages({
      includePreserved,
      types: types as ConsoleMessageType[],
      pageSize,
      pageIdx,
    });
  }

  /**
   * 在导航时分割存储（保留历史）
   */
  splitConsoleAfterNavigation(): void {
    this.#consoleCollector.splitAfterNavigation();
  }

  /**
   * 清空 Console 消息
   */
  clearConsoleMessages(): void {
    this.#consoleCollector.clear();
  }

  // ============ Network Collector 相关方法 ============

  /**
   * 获取 Network 收集器（新 API）
   */
  getNetworkCollector(): NetworkCollector {
    return this.#networkCollector;
  }

  /**
   * 开始网络监听
   */
  startNetworkMonitoring(): void {
    this.#networkCollector.startMonitoring();
  }

  /**
   * 停止网络监听
   */
  stopNetworkMonitoring(): void {
    this.#networkCollector.stopMonitoring();
  }

  /**
   * 检查是否正在监听网络
   */
  isNetworkMonitoring(): boolean {
    return this.#networkCollector.isMonitoring();
  }

  /**
   * 添加网络请求
   */
  addNetworkRequest(request: NetworkRequest): number {
    return this.#networkCollector.addRequest(request);
  }

  /**
   * 更新网络请求
   */
  updateNetworkRequest(
    id: string,
    updates: Partial<Pick<NetworkRequest, 'statusCode' | 'response' | 'responseHeaders' | 'error' | 'duration' | 'completedAt' | 'success' | 'pending'>>
  ): boolean {
    return this.#networkCollector.updateRequest(id, updates);
  }

  /**
   * 完成网络请求
   */
  completeNetworkRequest(
    id: string,
    response: {
      statusCode?: number;
      data?: unknown;
      headers?: Record<string, string>;
      error?: string;
    }
  ): boolean {
    return this.#networkCollector.completeRequest(id, response);
  }

  /**
   * 获取网络请求
   */
  getNetworkRequests(options?: {
    type?: 'request' | 'uploadFile' | 'downloadFile' | 'all';
    urlPattern?: string;
    successOnly?: boolean;
    failedOnly?: boolean;
    since?: string;
    limit?: number;
  }): NetworkRequest[] {
    const { limit, ...queryOptions } = options || {};
    const requests = this.#networkCollector.getRequests(queryOptions);
    if (limit && limit > 0) {
      return requests.slice(0, limit);
    }
    return requests;
  }

  /**
   * 清空网络请求
   */
  clearNetworkRequests(): void {
    this.#networkCollector.clearCurrentSession();
  }

  /**
   * 在导航时分割存储（保留历史）
   */
  splitNetworkAfterNavigation(): void {
    this.#networkCollector.splitAfterNavigation();
  }

  // ============ ToolContext 接口实现 ============

  /**
   * ToolContext 接口：获取 miniProgram
   */
  get miniProgram(): MiniProgram | null {
    return this.#miniProgram;
  }

  /**
   * ToolContext 接口：设置 miniProgram
   */
  set miniProgram(value: MiniProgram | null) {
    this.#miniProgram = value;
  }

  /**
   * ToolContext 接口：获取 currentPage
   */
  get currentPage(): Page | null {
    return this.#currentPage;
  }

  /**
   * ToolContext 接口：设置 currentPage
   */
  set currentPage(value: Page | null) {
    this.#currentPage = value;
  }

  /**
   * ToolContext 接口：获取 elementMap
   */
  get elementMap(): Map<string, ElementMapInfo> {
    return this.#elementMap;
  }

  /**
   * ToolContext 接口：设置 elementMap
   */
  set elementMap(value: Map<string, ElementMapInfo>) {
    this.#elementMap = value;
  }

  /**
   * ToolContext 接口：获取 consoleStorage（向后兼容适配器）
   * 将 Collector 数据转换为 ConsoleStorage 格式
   */
  get consoleStorage(): ConsoleStorage {
    // 构建导航会话数据
    const navigations = this.#consoleCollector.getNavigations();
    const legacyNavigations = navigations.map(session => {
      const messages: ConsoleMessage[] = [];
      const exceptions: ExceptionMessage[] = [];

      for (const item of session.items) {
        if (isConsoleMessage(item)) {
          messages.push(item);
        } else if (isExceptionMessage(item)) {
          exceptions.push(item);
        }
      }

      return {
        messages,
        exceptions,
        timestamp: session.timestamp,
      };
    });

    // 构建 ID 映射表
    const messageIdMap = new Map<number, ConsoleMessage | ExceptionMessage>();
    const idMap = this.#consoleCollector.getIdMap();
    for (const [id, entry] of idMap) {
      messageIdMap.set(id, entry);
    }

    return {
      navigations: legacyNavigations,
      messageIdMap,
      isMonitoring: this.#consoleCollector.isMonitoring(),
      startTime: this.#consoleCollector.getStartTime(),
      maxNavigations: this.#options.maxNavigations,
    };
  }

  /**
   * ToolContext 接口：设置 consoleStorage（向后兼容适配器）
   * 注意：这个 setter 主要用于兼容性，新代码应直接使用 Collector
   */
  set consoleStorage(value: ConsoleStorage) {
    // 清空当前收集器
    this.#consoleCollector.clear();

    // 如果监听状态不同，同步监听状态
    if (value.isMonitoring && !this.#consoleCollector.isMonitoring()) {
      this.#consoleCollector.startMonitoring();
    } else if (!value.isMonitoring && this.#consoleCollector.isMonitoring()) {
      this.#consoleCollector.stopMonitoring();
    }

    // 导入历史数据（从最旧的导航开始）
    for (let i = value.navigations.length - 1; i >= 0; i--) {
      const nav = value.navigations[i];
      // 如果不是最后一个，先分割
      if (i < value.navigations.length - 1) {
        this.#consoleCollector.splitAfterNavigation();
      }
      // 添加消息和异常
      for (const msg of nav.messages) {
        this.#consoleCollector.addMessage(msg);
      }
      for (const exc of nav.exceptions) {
        this.#consoleCollector.addException(exc);
      }
    }
  }

  /**
   * ToolContext 接口：获取 networkStorage（向后兼容适配器）
   * 将 Collector 数据转换为 NetworkStorage 格式
   */
  get networkStorage(): NetworkStorage {
    return {
      requests: this.#networkCollector.getData({ includePreserved: true }),
      isMonitoring: this.#networkCollector.isMonitoring(),
      startTime: this.#networkCollector.getStartTime(),
      originalMethods: this.#networkCollector.getOriginalMethods(),
    };
  }

  /**
   * ToolContext 接口：设置 networkStorage（向后兼容适配器）
   * 注意：这个 setter 主要用于兼容性，新代码应直接使用 Collector
   */
  set networkStorage(value: NetworkStorage) {
    // 重置收集器
    this.#networkCollector.reset();

    // 同步监听状态
    if (value.isMonitoring) {
      this.#networkCollector.startMonitoring();
    }

    // 设置原始方法
    this.#networkCollector.setOriginalMethods(value.originalMethods);

    // 导入请求数据
    for (const request of value.requests) {
      this.#networkCollector.addRequest(request);
    }
  }

  /**
   * ToolContext 接口：获取 connectionStatus
   */
  get connectionStatus(): ConnectionStatusSnapshot {
    return this.#connectionStatus;
  }

  /**
   * ToolContext 接口：设置 connectionStatus（兼容层）
   */
  set connectionStatus(value: ConnectionStatusSnapshot) {
    this.#connectionStatus = value;
  }

  // ============ 调试和日志 ============

  /**
   * 获取上下文状态摘要（用于调试）
   */
  getStatusSummary(): {
    connected: boolean;
    hasCurrentPage: boolean;
    elementCount: number;
    consoleMonitoring: boolean;
    consoleMessageCount: number;
    networkMonitoring: boolean;
    networkRequestCount: number;
    snapshotCached: boolean;
    snapshotCacheAge: number;
  } {
    const now = Date.now();
    return {
      connected: this.#connectionStatus.connected,
      hasCurrentPage: this.#connectionStatus.hasCurrentPage,
      elementCount: this.#elementMap.size,
      consoleMonitoring: this.#consoleCollector.isMonitoring(),
      consoleMessageCount: this.#consoleCollector.getTotalCount(),
      networkMonitoring: this.#networkCollector.isMonitoring(),
      networkRequestCount: this.#networkCollector.getCurrentCount(),
      snapshotCached: this.#snapshotCache.snapshot !== null,
      snapshotCacheAge: this.#snapshotCache.timestamp > 0 ? now - this.#snapshotCache.timestamp : -1,
    };
  }
}
