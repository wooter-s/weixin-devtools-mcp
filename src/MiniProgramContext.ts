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
  ValidationConnectionError,
  createDisconnectedStatus,
  normalizeConnectionError,
  type ConnectionConnectResult,
  type ConnectionRequest,
  type ConnectionStatusSnapshot,
  type ResolvedConnectionRequest,
} from './connection/index.js';
import {
  createPageSnapshotDomSignature,
  getPageSnapshot,
  rebasePageSnapshotCapture,
  type PageSnapshotCapture,
} from './core/snapshot.js';
import type { ElementMapInfo, PageSnapshot, PageStateCommit } from './core/types.js';
import {
  ElementResolutionError,
  resolveElementTarget,
  type ElementTarget,
} from './elements/index.js';
import type {
  ToolContext,
  ConsoleStorage,
  NetworkStorage,
  ConsoleMessage,
  ExceptionMessage,
  ConsoleMessageType,
  PageStateOperation,
} from './tools/ToolDefinition.js';

export type { PageStateCommit } from './core/types.js';

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
  /** 缓存对应的页面修订号 */
  pageRevision: number;
}

interface DomEpochBaseline {
  page: Page;
  path: string;
  pageRevision: number;
  signature: string;
  snapshot: PageSnapshot;
}

export interface SynchronizePageStateOptions {
  mode?: 'guard' | 'snapshot';
  forceRefresh?: boolean;
}

export interface ElementMapRegistrationExpectations {
  expectedRevision?: number;
  expectedPath?: string;
}

interface MiniProgramListenerState {
  consoleHandler: ((msg: { type?: string; args?: unknown[] }) => void) | null;
  exceptionHandler: ((err: { message?: string; stack?: string }) => void) | null;
}

export interface MonitoringStartResult {
  consoleStarted: boolean;
  networkStarted: boolean;
  warnings: string[];
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<MiniProgramContextOptions> = {
  maxNavigations: 3,
  verbose: false,
  snapshotCacheTtl: 5000,
};

const RECONNECT_DELAY_MS = 300;
const MAX_PAGE_STATE_COMMIT_ATTEMPTS = 3;

function cloneConnectionStatus(status: ConnectionStatusSnapshot): ConnectionStatusSnapshot {
  return {
    ...status,
    health: status.health
      ? {
          ...status.health,
          checks: status.health.checks.map((check) => ({ ...check })),
        }
      : null,
    lastError: status.lastError ? { ...status.lastError } : null,
  };
}

function mergeReconnectRequest(
  previous: ResolvedConnectionRequest | null,
  overrides: ConnectionRequest
): ConnectionRequest {
  if (!previous) {
    return overrides;
  }

  return {
    strategy: overrides.strategy ?? previous.strategy,
    projectPath: overrides.projectPath ?? previous.projectPath,
    cliPath: overrides.cliPath ?? previous.cliPath,
    autoPort: overrides.autoPort ?? previous.autoPort,
    browserUrl: overrides.browserUrl ?? previous.browserUrl,
    wsEndpoint: overrides.wsEndpoint ?? previous.wsEndpoint,
    wsHeaders: overrides.wsHeaders
      ? { ...overrides.wsHeaders }
      : previous.wsHeaders
        ? { ...previous.wsHeaders }
        : undefined,
    timeoutMs: overrides.timeoutMs ?? previous.timeoutMs,
    fallback: overrides.fallback ? [...overrides.fallback] : [...previous.fallback],
    healthCheck: overrides.healthCheck ?? previous.healthCheck,
    verbose: overrides.verbose ?? previous.verbose,
    autoAudits: overrides.autoAudits ?? previous.autoAudits,
    autoDiscover: overrides.autoDiscover ?? previous.autoDiscover,
  };
}

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
  #lastConnectionRequest: ResolvedConnectionRequest | null = null;
  #lifecycleQueue: Promise<void> = Promise.resolve();
  #pageStateQueue: Promise<void> = Promise.resolve();
  #pageRevision = 0;
  #domEpochBaseline: DomEpochBaseline | null = null;
  #elementIdentityTokens = new WeakMap<Element, number>();
  #nextElementIdentityToken = 1;

  // 监听器所有权状态（谁注册谁解绑）
  #listenerState: MiniProgramListenerState = {
    consoleHandler: null,
    exceptionHandler: null,
  };
  #monitoringSession: MiniProgram | null = null;
  #monitoringStartResult: MonitoringStartResult | null = null;

  // 使用 Collector 模式管理数据
  #consoleCollector: ConsoleCollector;
  #networkCollector: NetworkCollector;

  // 快照缓存
  #snapshotCache: SnapshotCache = {
    snapshot: null,
    elementMap: null,
    path: '',
    timestamp: 0,
    pageRevision: 0,
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

  #enqueueLifecycleOperation<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.#lifecycleQueue.then(operation, operation);
    this.#lifecycleQueue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  /** 生命周期切换统一按 lifecycle → page-state 顺序取锁，避免替换正在使用的会话。 */
  #enqueueLifecyclePageStateOperation<T>(operation: () => Promise<T>): Promise<T> {
    return this.#enqueueLifecycleOperation(() => this.#enqueuePageStateOperation(operation));
  }

  #detachOwnedListeners(): void {
    if (!this.#miniProgram) {
      this.#listenerState.consoleHandler = null;
      this.#listenerState.exceptionHandler = null;
      return;
    }

    const errors: Error[] = [];
    const consoleHandler = this.#listenerState.consoleHandler;
    if (consoleHandler) {
      try {
        this.#miniProgram.off('console', consoleHandler);
        this.#listenerState.consoleHandler = null;
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    const exceptionHandler = this.#listenerState.exceptionHandler;
    if (exceptionHandler) {
      try {
        this.#miniProgram.off('exception', exceptionHandler);
        this.#listenerState.exceptionHandler = null;
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, '解绑 MiniProgram 监听器失败');
    }
  }

  bindConsoleAndExceptionListeners(handlers: {
    consoleHandler: (msg: { type?: string; args?: unknown[] }) => void;
    exceptionHandler: (err: { message?: string; stack?: string }) => void;
  }): void {
    if (!this.#miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    this.#detachOwnedListeners();
    this.#miniProgram.on('console', handlers.consoleHandler);
    this.#listenerState.consoleHandler = handlers.consoleHandler;
    try {
      this.#miniProgram.on('exception', handlers.exceptionHandler);
      this.#listenerState.exceptionHandler = handlers.exceptionHandler;
    } catch (error) {
      try {
        this.#detachOwnedListeners();
      } catch (rollbackError) {
        throw new AggregateError(
          [
            error instanceof Error ? error : new Error(String(error)),
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)),
          ],
          '注册 MiniProgram 监听器失败，且回滚未完全成功'
        );
      }
      throw error;
    }
  }

  /** 启动 Context 拥有的 Console/Network 监听；重复调用不会叠加 handler 或 wx mock。 */
  async startAutomaticMonitoring(): Promise<MonitoringStartResult> {
    const miniProgram = this.getMiniProgram();
    if (
      this.#monitoringSession === miniProgram &&
      this.#monitoringStartResult?.consoleStarted &&
      this.#monitoringStartResult.networkStarted &&
      this.#listenerState.consoleHandler &&
      this.#listenerState.exceptionHandler
    ) {
      return {
        ...this.#monitoringStartResult,
        warnings: [...this.#monitoringStartResult.warnings],
      };
    }

    this.#monitoringSession = miniProgram;
    const warnings: string[] = [];

    if (
      !this.#consoleCollector.isMonitoring() ||
      !this.#listenerState.consoleHandler ||
      !this.#listenerState.exceptionHandler
    ) {
      try {
        this.bindConsoleAndExceptionListeners({
          consoleHandler: (msg) => {
            this.addConsoleMessage({
              type: (msg.type as ConsoleMessageType | undefined) ?? 'log',
              args: msg.args ?? [],
              timestamp: new Date().toISOString(),
              source: 'miniprogram',
            });
          },
          exceptionHandler: (err) => {
            this.addExceptionMessage({
              message: err.message ?? 'Unknown exception',
              stack: err.stack,
              timestamp: new Date().toISOString(),
              source: 'miniprogram',
            });
          },
        });
        this.#consoleCollector.startMonitoring();
      } catch (error) {
        this.#consoleCollector.stopMonitoring();
        warnings.push(
          `Console监听启动失败 - ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    try {
      await this.#networkCollector.startRemoteMonitoring(miniProgram);
    } catch (error) {
      warnings.push(`网络监听启动失败 - ${error instanceof Error ? error.message : String(error)}`);
    }

    this.#monitoringStartResult = {
      consoleStarted: this.#consoleCollector.isMonitoring(),
      networkStarted: this.#networkCollector.isMonitoring(),
      warnings,
    };
    return {
      ...this.#monitoringStartResult,
      warnings: [...warnings],
    };
  }

  #updateCurrentPage(page: Page | null, pagePath?: string | null): boolean {
    const previousPage = this.#currentPage;
    const previousPath = this.#connectionStatus.pagePath;
    const changed = previousPage !== page || (pagePath !== undefined && previousPath !== pagePath);

    this.#currentPage = page;
    if (changed) {
      this.#pageRevision += 1;
      // 页面切换时保留上一份 snapshot，供下一次 PageStateCommit 生成跨页 diff；
      // 真正断连时释放 Element 引用，避免把旧会话 baseline 带入新连接。
      if (page === null) this.#domEpochBaseline = null;
      this.clearElementMap();
      this.invalidateSnapshotCache();
    }

    if (pagePath !== undefined) {
      this.#connectionStatus = {
        ...this.#connectionStatus,
        hasCurrentPage: page !== null && Boolean(pagePath),
        pagePath,
      };
    }

    return changed;
  }

  #resetCollectors(): void {
    this.#consoleCollector.clear();
    this.#consoleCollector.stopMonitoring();
    this.#networkCollector.reset();
  }

  async #teardownRuntime(disconnectRemote: boolean): Promise<void> {
    const activeMiniProgram = this.#miniProgram;

    try {
      this.#detachOwnedListeners();
    } catch (error) {
      if (this.#options.verbose) {
        console.warn('[MiniProgramContext] 解绑监听器失败，继续收敛运行时状态:', error);
      }
    }
    this.#monitoringSession = null;
    this.#monitoringStartResult = null;
    this.#consoleCollector.stopMonitoring();
    try {
      await this.#networkCollector.stopRemoteMonitoring();
    } catch (error) {
      if (this.#options.verbose) {
        console.warn('[MiniProgramContext] 恢复网络拦截器失败，继续收敛本地状态:', error);
      }
    }

    if (disconnectRemote && activeMiniProgram) {
      await this.#connectionManager.disconnect(activeMiniProgram);
    }

    // 远端断开后 listener 已不可再解绑，避免把旧会话 handler 带到下一实例。
    this.#listenerState = {
      consoleHandler: null,
      exceptionHandler: null,
    };
    this.#networkCollector.abandonRemoteMonitoring();
    this.#miniProgram = null;
    this.#networkCollector.setMiniProgram(null);
    this.#updateCurrentPage(null, null);
    this.#resetCollectors();
  }

  #setDisconnectedStatus(lastError: ConnectionStatusSnapshot['lastError'] = null): void {
    this.#connectionStatus = {
      ...createDisconnectedStatus(),
      lastError,
    };
  }

  #commitConnectedSession(result: ConnectionConnectResult): void {
    this.#miniProgram = result.miniProgram;
    this.#networkCollector.setMiniProgram(result.miniProgram);
    this.#connectionStatus = {
      connectionId: result.connectionId,
      state: result.status,
      strategyUsed: result.strategyUsed,
      endpoint: result.endpoint,
      connected: true,
      hasCurrentPage: Boolean(result.pagePath),
      pagePath: result.pagePath,
      health: result.health,
      lastError: null,
      lastConnectedAt: new Date().toISOString(),
      lastHealthCheckAt: result.health.checkedAt,
    };
    this.#updateCurrentPage(result.currentPage, result.pagePath);
  }

  async #connectInternal(request: ConnectionRequest): Promise<ConnectionConnectResult> {
    await this.#teardownRuntime(true);
    this.#connectionStatus = {
      ...createDisconnectedStatus(),
      state: 'connecting',
    };

    try {
      const execution = await this.#connectionManager.connect(request);
      const result = execution.result;
      this.#lastConnectionRequest = {
        ...execution.reconnectRequest,
        fallback: [...execution.reconnectRequest.fallback],
        wsHeaders: execution.reconnectRequest.wsHeaders
          ? { ...execution.reconnectRequest.wsHeaders }
          : undefined,
      };
      this.#commitConnectedSession(result);

      const monitoring = await this.startAutomaticMonitoring();
      if (monitoring.warnings.length > 0) {
        result.warnings.push(...monitoring.warnings);
        result.status = 'degraded';
        this.#connectionStatus = {
          ...this.#connectionStatus,
          state: 'degraded',
        };
      }

      return result;
    } catch (error) {
      const connectionError = normalizeConnectionError(
        error instanceof Error ? error : new Error(String(error))
      );
      await this.#teardownRuntime(false);
      this.#setDisconnectedStatus(connectionError.toSummary());
      throw connectionError;
    }
  }

  /**
   * 设置 MiniProgram 实例
   */
  async setMiniProgram(miniProgram: MiniProgram): Promise<void> {
    return this.#enqueueLifecyclePageStateOperation(() => this.#setMiniProgram(miniProgram));
  }

  async #setMiniProgram(miniProgram: MiniProgram): Promise<void> {
    if (this.#miniProgram === miniProgram) {
      return;
    }
    if (this.#miniProgram) {
      await this.#teardownRuntime(true);
    }
    this.#miniProgram = miniProgram;
    this.#networkCollector.setMiniProgram(miniProgram);

    // 自动获取当前页面
    try {
      const page = await miniProgram.currentPage();
      if (page) {
        const pagePath = await page.path;
        this.#connectionStatus = {
          ...this.#connectionStatus,
          state: 'connected',
          connected: true,
          hasCurrentPage: true,
          pagePath,
        };
        this.#updateCurrentPage(page, pagePath);
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
    if (this.#miniProgram) {
      throw new Error('存在活动连接时请使用 disconnectDevtools() 完成异步资源清理');
    }
    this.#detachOwnedListeners();
    this.#miniProgram = null;
    this.#networkCollector.abandonRemoteMonitoring();
    this.#networkCollector.setMiniProgram(null);
    this.#updateCurrentPage(null, null);
    this.#resetCollectors();
    this.#setDisconnectedStatus();
  }

  async connectDevtools(request: ConnectionRequest): Promise<ConnectionConnectResult> {
    return this.#enqueueLifecyclePageStateOperation(() => this.#connectInternal(request));
  }

  async reconnectDevtools(request?: ConnectionRequest): Promise<ConnectionConnectResult> {
    return this.#enqueueLifecyclePageStateOperation(async () => {
      const reconnectRequest = request
        ? mergeReconnectRequest(this.#lastConnectionRequest, request)
        : this.#lastConnectionRequest;
      if (!reconnectRequest) {
        throw new ValidationConnectionError('没有可用于重连的历史连接参数', [
          '调用 reconnect_devtools 时显式传入连接参数',
        ]);
      }

      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
      return this.#connectInternal(reconnectRequest);
    });
  }

  async disconnectDevtools(): Promise<ConnectionStatusSnapshot> {
    return this.#enqueueLifecyclePageStateOperation(async () => {
      await this.#teardownRuntime(true);
      this.#setDisconnectedStatus();
      return cloneConnectionStatus(this.#connectionStatus);
    });
  }

  async getConnectionStatus(options?: {
    refreshHealth?: boolean;
  }): Promise<ConnectionStatusSnapshot> {
    const refreshHealth = options?.refreshHealth ?? true;
    if (!refreshHealth || !this.#miniProgram) {
      return cloneConnectionStatus(this.#connectionStatus);
    }

    return this.#enqueueLifecyclePageStateOperation(async () => {
      const miniProgram = this.#miniProgram;
      if (!miniProgram) {
        return cloneConnectionStatus(this.#connectionStatus);
      }

      const health = await this.#connectionManager.refreshHealth(miniProgram);
      if (health.level === 'unhealthy') {
        await this.#teardownRuntime(true);
        this.#connectionStatus = {
          ...createDisconnectedStatus(),
          lastError: {
            code: 'HEALTH_CHECK_FAILED',
            phase: 'health_check',
            message: '连接健康检查失败，已自动断开连接',
            suggestions: ['调用 connect_devtools 或 reconnect_devtools 重新建立连接'],
            timestamp: new Date().toISOString(),
          },
        };
        return cloneConnectionStatus(this.#connectionStatus);
      }

      const page = await this.syncCurrentPage();
      const pagePath = await page.path;
      this.#connectionStatus = {
        ...this.#connectionStatus,
        state: health.level === 'healthy' ? 'connected' : 'degraded',
        connected: true,
        hasCurrentPage: Boolean(pagePath),
        pagePath,
        health,
        lastHealthCheckAt: health.checkedAt,
      };

      return cloneConnectionStatus(this.#connectionStatus);
    });
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
    this.#updateCurrentPage(page);
  }

  /**
   * 从 MiniProgram 获取真实活动页面并同步 revision、缓存和连接摘要。
   */
  async syncCurrentPage(): Promise<Page> {
    const miniProgram = this.getMiniProgram();
    const page = await miniProgram.currentPage();
    if (!page) {
      throw new Error('无法获取当前页面');
    }
    const pagePath = await page.path;
    this.#updateCurrentPage(page, pagePath);
    return page;
  }

  /** 向后兼容别名。 */
  async refreshCurrentPage(): Promise<Page> {
    return this.syncCurrentPage();
  }

  getPageRevision(): number {
    return this.#pageRevision;
  }

  #advancePageRevision(): void {
    this.#pageRevision += 1;
    this.#elementMap = this.#limitElementRegistry(
      this.#elementMap,
      this.#connectionStatus.pagePath
    );
    this.invalidateSnapshotCache();
  }

  /** 标记同一页面内已知的 DOM/状态变更，使旧元素引用和快照立即失效。 */
  markPageMutation(): void {
    // 保留上一 revision 的 baseline。下一次扫描看到 revision 已变化时会把
    // 当前 DOM 作为新 baseline，而不会把同一次已知 mutation 再推进一次。
    this.#advancePageRevision();
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

  /** 合并一次查询生成的 ref generation，并保持 registry 有界。 */
  registerElementMap(
    elementMap: Map<string, ElementMapInfo>,
    expectations: ElementMapRegistrationExpectations = {}
  ): void {
    this.#registerElementMapInPageStateOperation(elementMap, expectations);
  }

  #registerElementMapInPageStateOperation(
    elementMap: Map<string, ElementMapInfo>,
    expectations: ElementMapRegistrationExpectations = {}
  ): void {
    const queryElementMap = new Map<string, ElementMapInfo>();
    for (const [ref, info] of elementMap) {
      queryElementMap.set(ref, { ...info, generationKind: 'query' });
    }
    const firstEntry = queryElementMap.values().next().value as ElementMapInfo | undefined;
    const expectedRevision = expectations.expectedRevision ?? firstEntry?.pageRevision;
    const expectedPath = expectations.expectedPath ?? firstEntry?.pagePath;
    if (expectedRevision !== undefined && expectedRevision !== this.#pageRevision) {
      throw new ElementResolutionError(
        'STALE_ELEMENT',
        `元素引用基于 pageRevision=${expectedRevision}，当前为 ${this.#pageRevision}`
      );
    }
    if (
      expectedPath !== undefined &&
      this.#connectionStatus.pagePath !== null &&
      expectedPath !== this.#connectionStatus.pagePath
    ) {
      throw new ElementResolutionError(
        'STALE_ELEMENT',
        `元素引用属于页面 ${expectedPath}，当前为 ${this.#connectionStatus.pagePath}`
      );
    }
    for (const info of queryElementMap.values()) {
      if (expectedRevision !== undefined && info.pageRevision !== expectedRevision) {
        throw new ElementResolutionError('STALE_ELEMENT', '同一批元素引用包含不同 pageRevision');
      }
      if (expectedPath !== undefined && info.pagePath !== expectedPath) {
        throw new ElementResolutionError('STALE_ELEMENT', '同一批元素引用包含不同页面路径');
      }
    }

    const currentPath = expectedPath ?? this.#connectionStatus.pagePath;
    if (!currentPath) {
      throw new Error('注册元素引用时缺少当前页面路径');
    }
    this.#elementMap = this.#mergeElementRegistry(queryElementMap, currentPath);
  }

  #mergeElementRegistry(
    nextMap: ReadonlyMap<string, ElementMapInfo>,
    currentPath: string
  ): Map<string, ElementMapInfo> {
    const combined = new Map(this.#elementMap);
    for (const [ref, info] of nextMap) combined.set(ref, info);
    return this.#limitElementRegistry(combined, currentPath);
  }

  /**
   * 当前 revision 的 query ref 在整个稳定 epoch 内有效；snapshot 只留最新一代。
   * revision 推进后，上一代各保留最新一代，仅用于 stale/rebind。
   */
  #limitElementRegistry(
    source: ReadonlyMap<string, ElementMapInfo>,
    currentPath: string | null
  ): Map<string, ElementMapInfo> {
    const minimumRevision = Math.max(0, this.#pageRevision - 1);
    const candidates = [...source].filter(
      ([, info]) =>
        info.pageRevision !== undefined &&
        info.pageRevision >= minimumRevision &&
        info.pageRevision <= this.#pageRevision &&
        (currentPath === null || info.pagePath === undefined || info.pagePath === currentPath)
    );
    const generationOrder = new Map<string, string[]>();

    for (const [, info] of candidates) {
      // 历史手工注入的 ref 更接近查询结果；生产 snapshot 均显式标记。
      const kind = info.generationKind ?? 'query';
      const bucket = `${info.pageRevision}:${kind}`;
      const generation = info.snapshotId ?? `legacy:${kind}`;
      const order = generationOrder.get(bucket) ?? [];
      if (!order.includes(generation)) order.push(generation);
      generationOrder.set(bucket, order);
    }

    const retainedGenerations = new Map<string, Set<string>>();
    for (const [bucket, order] of generationOrder) {
      const kind = bucket.endsWith(':query') ? 'query' : 'snapshot';
      const revision = Number.parseInt(bucket.slice(0, bucket.indexOf(':')), 10);
      const retainCount = kind === 'query' && revision === this.#pageRevision ? order.length : 1;
      retainedGenerations.set(bucket, new Set(order.slice(-retainCount)));
    }

    return new Map(
      candidates.filter(([, info]) => {
        const kind = info.generationKind ?? 'query';
        const bucket = `${info.pageRevision}:${kind}`;
        const generation = info.snapshotId ?? `legacy:${kind}`;
        return retainedGenerations.get(bucket)?.has(generation) ?? false;
      })
    );
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
      throw new Error(`找不到 UID: ${uid}\n` + `请先调用 get_page_snapshot 工具获取页面快照`);
    }

    if (this.#options.verbose) {
      console.error(
        `[getElementByUid] UID: ${uid}, Selector: ${mapInfo.selector}, Index: ${mapInfo.index}`
      );
    }

    // 3. 使用选择器获取所有匹配元素
    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(
        `选择器 "${mapInfo.selector}" 未找到任何元素\n` + `页面可能已发生变化，请重新获取快照`
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

  async #resolveElementTargetInPageStateOperation(target: ElementTarget): Promise<Element> {
    const previousRefInfo = target.kind === 'ref' ? this.#elementMap.get(target.ref) : undefined;
    let page: Page;
    let pagePath: string;
    if (target.kind === 'ref') {
      const commit = await this.#synchronizePageState(
        {
          mode: 'guard',
          forceRefresh: true,
        },
        this.#options.snapshotCacheTtl
      );
      page = this.getCurrentPage();
      pagePath = commit.pagePath;
    } else {
      page = await this.syncCurrentPage();
      pagePath = await page.path;
    }
    // epoch 推进会把 previous revision 收敛到最新 generation。对本次已经开始
    // 解析的旧 ref，仅在局部 map 恢复其语义，不破坏 registry 的有界保留策略。
    let resolutionElementMap: ReadonlyMap<string, ElementMapInfo> = this.#elementMap;
    if (
      target.kind === 'ref' &&
      previousRefInfo !== undefined &&
      !this.#elementMap.has(target.ref) &&
      previousRefInfo.pageRevision === this.#pageRevision - 1 &&
      previousRefInfo.pagePath === pagePath
    ) {
      resolutionElementMap = new Map(this.#elementMap).set(target.ref, previousRefInfo);
    }
    const resolved = await resolveElementTarget(page, resolutionElementMap, target, {
      pageRevision: this.#pageRevision,
      pagePath,
    });
    return resolved.element;
  }

  async getElementByTarget(target: ElementTarget): Promise<Element> {
    return this.withPageStateOperation((pageState) =>
      pageState.withElementByTargetOperation(target, async (element) => element)
    );
  }

  /** 在同一页面状态临界区内完成 target guard、解析与元素动作。 */
  withElementByTargetOperation<T>(
    target: ElementTarget,
    operation: (element: Element) => Promise<T>
  ): Promise<T> {
    return this.withPageStateOperation((pageState) =>
      pageState.withElementByTargetOperation(target, operation)
    );
  }

  // ============ 快照缓存相关方法 ============

  #enqueuePageStateOperation<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.#pageStateQueue.then(operation, operation);
    this.#pageStateQueue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  /** 查询、ref 注册、observation 和后续解析共享同一个页面状态临界区。 */
  withPageStateOperation<T>(operation: (pageState: PageStateOperation) => Promise<T>): Promise<T> {
    return this.#enqueuePageStateOperation(() =>
      operation({
        synchronizePageState: (options) => this.#synchronizePageStateInOperation(options),
        registerElementMap: (elementMap, expectations) =>
          this.#registerElementMapInPageStateOperation(elementMap, expectations),
        withElementByTargetOperation: async (target, elementOperation) => {
          const element = await this.#resolveElementTargetInPageStateOperation(target);
          return elementOperation(element);
        },
      })
    );
  }

  #elementIdentity(element: Element): number {
    // miniprogram-automator 的 Page 会按 elementId 复用 Element 包装对象；同一节点
    // 跨查询保持对象身份，而 DOM 重建产生新的 elementId/对象，可据此识别同形重建。
    const existing = this.#elementIdentityTokens.get(element);
    if (existing !== undefined) return existing;

    const token = this.#nextElementIdentityToken;
    this.#nextElementIdentityToken += 1;
    this.#elementIdentityTokens.set(element, token);
    return token;
  }

  #cacheValid(path: string, ttl: number, now: number): boolean {
    return (
      this.#snapshotCache.snapshot !== null &&
      this.#snapshotCache.elementMap !== null &&
      this.#snapshotCache.path === path &&
      this.#snapshotCache.pageRevision === this.#pageRevision &&
      now - this.#snapshotCache.timestamp < ttl
    );
  }

  #publishPageCapture(
    page: Page,
    path: string,
    capture: PageSnapshotCapture,
    signature: string,
    domChanged: boolean,
    previousSnapshot: PageSnapshot | null
  ): PageStateCommit {
    const mergedElementMap = this.#mergeElementRegistry(capture.elementMap, path);
    const timestamp = Date.now();
    this.#elementMap = mergedElementMap;
    this.#snapshotCache = {
      snapshot: capture.snapshot,
      elementMap: mergedElementMap,
      path,
      timestamp,
      pageRevision: this.#pageRevision,
    };
    this.#domEpochBaseline = {
      page,
      path,
      pageRevision: this.#pageRevision,
      signature,
      snapshot: capture.snapshot,
    };

    return {
      snapshot: capture.snapshot,
      elementMap: mergedElementMap,
      pagePath: path,
      pageRevision: this.#pageRevision,
      domChanged,
      previousSnapshot,
    };
  }

  #baselineRefsAreRegistered(baseline: DomEpochBaseline): boolean {
    return baseline.snapshot.elements.every((element) => this.#elementMap.has(element.ref));
  }

  async #synchronizePageState(
    options: Required<SynchronizePageStateOptions>,
    ttl: number
  ): Promise<PageStateCommit> {
    for (let attempt = 1; attempt <= MAX_PAGE_STATE_COMMIT_ATTEMPTS; attempt += 1) {
      const page = await this.syncCurrentPage();
      const pagePath = await page.path;
      const pageRevision = this.#pageRevision;
      const now = Date.now();

      if (
        options.mode === 'snapshot' &&
        !options.forceRefresh &&
        this.#cacheValid(pagePath, ttl, now)
      ) {
        return {
          snapshot: this.#snapshotCache.snapshot!,
          elementMap: this.#snapshotCache.elementMap!,
          pagePath,
          pageRevision,
          domChanged: false,
          previousSnapshot: this.#domEpochBaseline?.snapshot ?? null,
        };
      }

      const previousBaseline = this.#domEpochBaseline;
      const capture = await getPageSnapshot(page, { pageRevision });

      // 扫描期间可能发生导航、known mutation 或另一条业务链推进 revision。
      // draft 只能在 Page/path/revision 全部仍与开始时一致时提交。
      const activePage = await this.syncCurrentPage();
      const activePath = await activePage.path;
      if (activePage !== page || activePath !== pagePath || this.#pageRevision !== pageRevision) {
        continue;
      }

      const verifiedCapture = await getPageSnapshot(page, {
        pageRevision,
        preferredStrategy: capture.collectionStrategy,
      });
      const verifiedPage = await this.syncCurrentPage();
      const verifiedPath = await verifiedPage.path;
      if (
        verifiedPage !== page ||
        verifiedPath !== pagePath ||
        this.#pageRevision !== pageRevision
      ) {
        continue;
      }

      const identify = (element: Element): number => this.#elementIdentity(element);
      if (
        createPageSnapshotDomSignature(capture, identify) !==
        createPageSnapshotDomSignature(verifiedCapture, identify)
      ) {
        continue;
      }
      const signature = createPageSnapshotDomSignature(verifiedCapture, identify);

      const comparableBaseline =
        previousBaseline !== null &&
        previousBaseline.page === page &&
        previousBaseline.path === pagePath &&
        previousBaseline.pageRevision === pageRevision;
      const domChanged = comparableBaseline && previousBaseline.signature !== signature;
      const previousSnapshot = previousBaseline?.snapshot ?? null;
      let committedCapture = verifiedCapture;

      if (domChanged) {
        this.#advancePageRevision();
        committedCapture = rebasePageSnapshotCapture(verifiedCapture, this.#pageRevision);
      }

      const canReuseBaseline =
        options.mode === 'guard' &&
        comparableBaseline &&
        !domChanged &&
        this.#baselineRefsAreRegistered(previousBaseline);
      if (canReuseBaseline) {
        this.#snapshotCache = {
          snapshot: previousBaseline.snapshot,
          elementMap: this.#elementMap,
          path: pagePath,
          timestamp: now,
          pageRevision: this.#pageRevision,
        };
        return {
          snapshot: previousBaseline.snapshot,
          elementMap: this.#elementMap,
          pagePath,
          pageRevision: this.#pageRevision,
          domChanged: false,
          previousSnapshot,
        };
      }

      return this.#publishPageCapture(
        page,
        pagePath,
        committedCapture,
        signature,
        Boolean(domChanged),
        previousSnapshot
      );
    }

    throw new Error(`页面状态在 ${MAX_PAGE_STATE_COMMIT_ATTEMPTS} 次扫描期间持续变化，未提交快照`);
  }

  #synchronizePageStateInOperation(
    options: SynchronizePageStateOptions = {}
  ): Promise<PageStateCommit> {
    const mode = options.mode ?? 'guard';
    return this.#synchronizePageState(
      {
        mode,
        forceRefresh: options.forceRefresh ?? mode === 'guard',
      },
      this.#options.snapshotCacheTtl
    );
  }

  /**
   * 同步页面 DOM epoch，并原子提交 revision、snapshot、elementMap 与 baseline。
   * guard 用于 ref 解析前检查；snapshot 用于需要发布新快照 generation 的调用。
   */
  synchronizePageState(options: SynchronizePageStateOptions = {}): Promise<PageStateCommit> {
    return this.withPageStateOperation((pageState) => pageState.synchronizePageState(options));
  }

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
    const commit = await this.#enqueuePageStateOperation(() =>
      this.#synchronizePageState(
        {
          mode: 'snapshot',
          forceRefresh,
        },
        ttl
      )
    );
    return { snapshot: commit.snapshot, elementMap: commit.elementMap };
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
      pageRevision: this.#pageRevision,
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
    this.#detachOwnedListeners();
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
  async startNetworkMonitoring(): Promise<void> {
    await this.#networkCollector.startRemoteMonitoring(this.getMiniProgram());
  }

  /**
   * 停止网络监听
   */
  async stopNetworkMonitoring(options?: { clearLogs?: boolean }): Promise<number> {
    return this.#networkCollector.stopRemoteMonitoring(options);
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
    updates: Partial<
      Pick<
        NetworkRequest,
        | 'statusCode'
        | 'response'
        | 'responseHeaders'
        | 'error'
        | 'duration'
        | 'completedAt'
        | 'success'
        | 'pending'
      >
    >
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
    if (this.#miniProgram === value) {
      return;
    }
    throw new Error(
      'miniProgram 由 MiniProgramContext 生命周期管理；请使用 setMiniProgram()、connectDevtools() 或 disconnectDevtools()'
    );
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
    this.#updateCurrentPage(value);
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
    const legacyNavigations = navigations.map((session) => {
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
    return cloneConnectionStatus(this.#connectionStatus);
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
    pageRevision: number;
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
      pageRevision: this.#pageRevision,
      elementCount: this.#elementMap.size,
      consoleMonitoring: this.#consoleCollector.isMonitoring(),
      consoleMessageCount: this.#consoleCollector.getTotalCount(),
      networkMonitoring: this.#networkCollector.isMonitoring(),
      networkRequestCount: this.#networkCollector.getCurrentCount(),
      snapshotCached: this.#snapshotCache.snapshot !== null,
      snapshotCacheAge:
        this.#snapshotCache.timestamp > 0 ? now - this.#snapshotCache.timestamp : -1,
    };
  }
}
