/**
 * 工具定义基础框架
 * 参考 chrome-devtools-mcp 的设计模式
 */

import type { MiniProgram, Page, Element } from 'miniprogram-automator';
import type { z } from 'zod';

import type { ToolCategory } from '../config/tool-category.js';
import type {
  ConnectionConnectResult,
  ConnectionRequest,
  ConnectionStatusSnapshot,
} from '../connection/index.js';
import type { ElementTarget } from '../elements/index.js';
import type { ElementMapInfo, PageSnapshot, PageStateCommit } from '../tools.js';

import { createToolResultSchema, jsonObjectSchema, type JsonObject } from './result.js';

export { ToolCategory } from '../config/tool-category.js';

/**
 * 工具注解接口
 */
export interface ToolAnnotations {
  category: ToolCategory;
  audience?: string[];
  experimental?: boolean;
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * Console日志类型（扩展到15+种类型）
 */
export type ConsoleMessageType =
  | 'log'
  | 'debug'
  | 'info'
  | 'error'
  | 'warn'
  | 'dir'
  | 'dirxml'
  | 'table'
  | 'trace'
  | 'clear'
  | 'group'
  | 'groupCollapsed'
  | 'groupEnd'
  | 'assert'
  | 'count'
  | 'timeEnd'
  | 'verbose';

/**
 * Console消息接口（带 Stable ID）
 */
export interface ConsoleMessage {
  msgid?: number; // Stable ID，用于两阶段查询
  type: ConsoleMessageType;
  message?: string; // 格式化的消息文本
  args: unknown[]; // console.log 参数可以是任意类型
  timestamp: string;
  source?: string;
}

/**
 * Exception异常信息（带 Stable ID）
 */
export interface ExceptionMessage {
  msgid?: number; // Stable ID，用于两阶段查询
  message: string;
  stack?: string;
  timestamp: string;
  source?: string;
}

/**
 * 导航会话数据
 */
export interface NavigationSession {
  messages: ConsoleMessage[];
  exceptions: ExceptionMessage[];
  timestamp: string;
}

/**
 * Console数据存储（支持导航历史）
 */
export interface ConsoleStorage {
  // 按导航分组存储（最新的在前）
  navigations: NavigationSession[];

  // ID 映射表（用于快速查找）
  messageIdMap: Map<number, ConsoleMessage | ExceptionMessage>;

  // 监听状态
  isMonitoring: boolean;
  startTime: string | null;

  // 配置
  maxNavigations: number; // 最多保留的导航会话数，默认3

  // ID 生成器
  idGenerator?: () => number;
}

/**
 * 网络请求类型
 */
export type NetworkRequestType = 'request' | 'uploadFile' | 'downloadFile';

/**
 * 网络请求信息
 */
export interface NetworkRequest {
  id: string;
  type: NetworkRequestType;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  data?: unknown; // 请求体数据，可以是任意类型
  params?: Record<string, unknown>; // Mpx框架的查询参数
  statusCode?: number;
  response?: unknown; // 响应数据，可以是任意类型
  responseHeaders?: Record<string, string>; // 响应头
  error?: string;
  duration?: number;
  timestamp: string;
  completedAt?: string; // 完成时间
  success: boolean;
  pending?: boolean; // 是否等待响应中
  source?: string; // 请求来源（wx.request, getApp().$xfetch等）
}

/**
 * wx 网络方法类型
 * 用于存储原始方法以便恢复
 */
export type WxNetworkMethod = ((options: Record<string, unknown>) => unknown) | undefined;

/**
 * 网络请求数据存储
 */
export interface NetworkStorage {
  requests: NetworkRequest[];
  isMonitoring: boolean;
  startTime: string | null;
  originalMethods: {
    request?: WxNetworkMethod;
    uploadFile?: WxNetworkMethod;
    downloadFile?: WxNetworkMethod;
  };
}

/**
 * 工具处理器上下文
 */
export interface NetworkCollectorContext {
  syncFromRemote(includePreserved: boolean): Promise<number>;
  stopRemoteMonitoring(options?: { clearLogs?: boolean }): Promise<number>;
  getRequests(options?: {
    includePreserved?: boolean;
    types?: NetworkRequestType[];
    urlPattern?: string;
    successOnly?: boolean;
    failedOnly?: boolean;
    since?: string;
  }): NetworkRequest[];
  getCurrentCount(): number;
}

export interface PageStateOperation {
  /** 在已持有页面状态队列时同步 DOM epoch，避免再次入队造成自锁。 */
  synchronizePageState(options?: {
    mode?: 'guard' | 'snapshot';
    forceRefresh?: boolean;
  }): Promise<PageStateCommit>;

  /** 在当前页面状态事务内注册查询产生的 ref generation。 */
  registerElementMap(
    elementMap: Map<string, ElementMapInfo>,
    expectations?: { expectedRevision?: number; expectedPath?: string }
  ): void;

  /** 在当前页面状态事务内完成 target guard、解析与读取/动作。 */
  withElementByTargetOperation<T>(
    target: ElementTarget,
    operation: (element: Element) => Promise<T>
  ): Promise<T>;
}

export interface ToolContext {
  /**
   * 小程序实例 (miniprogram-automator的MiniProgram类型)
   * 通过 automator.connect() 或 automator.launch() 获得
   */
  miniProgram: MiniProgram | null;

  /**
   * 当前页面实例 (miniprogram-automator的Page类型)
   * 通过 miniProgram.currentPage() 获得
   */
  currentPage: Page | null;

  elementMap: Map<string, ElementMapInfo>;
  consoleStorage: ConsoleStorage;
  networkStorage: NetworkStorage;
  connectionStatus: ConnectionStatusSnapshot;

  /**
   * 绑定并替换 miniProgram 上的 console / exception 监听器
   * 用于确保监听器所有权清晰（谁注册，谁解绑）
   */
  bindConsoleAndExceptionListeners?(handlers: {
    consoleHandler: (msg: { type?: string; args?: unknown[] }) => void;
    exceptionHandler: (err: { message?: string; stack?: string }) => void;
  }): void;

  /**
   * 追加一条 Console 消息（优先使用 Collector 实现）
   * 返回分配的稳定 ID
   */
  addConsoleMessage?(message: Omit<ConsoleMessage, 'msgid'>): number;

  /**
   * 追加一条异常消息（优先使用 Collector 实现）
   * 返回分配的稳定 ID
   */
  addExceptionMessage?(exception: Omit<ExceptionMessage, 'msgid'>): number;

  /**
   * 获取网络收集器
   */
  getNetworkCollector(): NetworkCollectorContext;

  /**
   * 清空当前会话的网络请求
   */
  clearNetworkRequests(): void;

  /**
   * 通过 UID 获取元素
   * 统一处理：连接检查、快照检查、元素查找、索引定位
   * @param uid 元素的唯一标识符
   * @returns 元素对象
   * @throws 如果页面未连接、UID 不存在、元素未找到等
   */
  getElementByUid(uid: string): Promise<Element>;

  /** 使用统一 target 解析器定位元素，并执行 pageRevision/fingerprint 校验。 */
  getElementByTarget(target: ElementTarget): Promise<Element>;

  /** 在同一页面状态临界区内完成 target 解析与动作；测试上下文可省略并回退。 */
  withElementByTargetOperation?<T>(
    target: ElementTarget,
    operation: (element: Element) => Promise<T>
  ): Promise<T>;

  /** 将查询、ref 注册和最终 observation 作为一个页面状态事务执行。 */
  withPageStateOperation?<T>(operation: (pageState: PageStateOperation) => Promise<T>): Promise<T>;

  /** 注册一次查询产生的 ref generation，并淘汰更旧 generation。 */
  registerElementMap?(
    elementMap: Map<string, ElementMapInfo>,
    expectations?: { expectedRevision?: number; expectedPath?: string }
  ): void;

  /** 当前页面引用版本。 */
  getPageRevision(): number;

  /** 已知页面变更后递增 revision 并失效旧引用。 */
  markPageMutation(): void;

  /** 从运行时同步真实活动页面。 */
  syncCurrentPage(): Promise<Page>;

  /** 原子同步 DOM epoch、快照与元素引用；生产上下文必须实现。 */
  synchronizePageState?(options?: {
    mode?: 'guard' | 'snapshot';
    forceRefresh?: boolean;
  }): Promise<PageStateCommit>;

  /**
   * 建立连接
   */
  connectDevtools(request: ConnectionRequest): Promise<ConnectionConnectResult>;

  /**
   * 重新连接
   */
  reconnectDevtools(request?: ConnectionRequest): Promise<ConnectionConnectResult>;

  /**
   * 断开连接
   */
  disconnectDevtools(): Promise<ConnectionStatusSnapshot>;

  /**
   * 获取连接状态
   */
  getConnectionStatus(options?: { refreshHealth?: boolean }): Promise<ConnectionStatusSnapshot>;

  /**
   * 获取页面快照（带缓存）
   */
  getPageSnapshotCached?(options?: {
    forceRefresh?: boolean;
    ttl?: number;
  }): Promise<{ snapshot: PageSnapshot; elementMap: Map<string, ElementMapInfo> }>;

  /**
   * 刷新当前页面引用，并同步连接状态中的 pagePath
   */
  refreshCurrentPage?(): Promise<Page>;

  /**
   * 清空当前 UID 映射，避免导航后的旧元素继续被复用
   */
  clearElementMap?(): void;

  /**
   * 使页面快照缓存失效
   */
  invalidateSnapshotCache?(): void;

  /**
   * 在导航后切分 Console 会话，保留历史并开启新会话
   */
  splitConsoleAfterNavigation?(): void;

  /**
   * 在导航后切分 Network 会话，保留历史并开启新会话
   */
  splitNetworkAfterNavigation?(): void;
}

/**
 * 工具请求接口
 */
export interface ToolRequest<T = unknown> {
  params: T;
}

/**
 * 工具响应接口
 */
export interface StructuredSnapshotMeta {
  requested: boolean;
  pagePath: string | null;
  elementCount: number;
  generatedAt: string;
}

export type StructuredContent = JsonObject & {
  snapshot?: StructuredSnapshotMeta & JsonObject;
};

export interface ToolResponse {
  appendResponseLine(text: string): void;
  setIncludeSnapshot(include: boolean): void;
  attachImage(data: string, mimeType: string): void;
  shouldIncludeSnapshot(): boolean;
  mergeStructuredContent(content: StructuredContent): void;
  getStructuredContent(): StructuredContent;
  /** 仅供协议层复用 handler 已提交的页面状态，避免事后推进 revision。 */
  setPageStateCommit?(commit: PageStateCommit): void;
  getPageStateCommit?(): PageStateCommit | undefined;
}

/**
 * 在 handler 内完成页面状态提交，并让协议层复用同一份快照。
 * 测试/旧式 ToolContext 没有原子接口时保留 includeSnapshot 语义，由协议层兜底。
 */
export async function attachPageStateObservation(
  context: ToolContext,
  response: ToolResponse,
  options: { mode?: 'guard' | 'snapshot'; forceRefresh?: boolean } = {},
  pageState: Pick<PageStateOperation, 'synchronizePageState'> | ToolContext = context
): Promise<PageStateCommit | undefined> {
  response.setIncludeSnapshot(true);
  if (!pageState.synchronizePageState) {
    return undefined;
  }

  const commit = await pageState.synchronizePageState({
    mode: options.mode ?? 'snapshot',
    forceRefresh: options.forceRefresh ?? true,
  });
  response.setPageStateCommit?.(commit);
  return commit;
}

/** 兼容测试上下文，并保证生产环境的 target 解析与后续 I/O 位于同一临界区。 */
export function runElementTargetOperation<T>(
  context: ToolContext,
  target: ElementTarget,
  operation: (element: Element) => Promise<T>
): Promise<T> {
  if (context.withElementByTargetOperation) {
    return context.withElementByTargetOperation(target, operation);
  }
  return context.getElementByTarget(target).then(operation);
}

/** 兼容测试上下文，并让会改变/观察页面的完整业务链共享同一状态队列。 */
export function runPageStateOperation<T>(
  context: ToolContext,
  operation: (pageState?: PageStateOperation) => Promise<T>
): Promise<T> {
  if (context.withPageStateOperation) {
    return context.withPageStateOperation(operation);
  }
  return operation();
}

/**
 * 工具处理器函数类型
 */
export type ToolHandler<TParams> = (
  request: ToolRequest<TParams>,
  response: ToolResponse,
  context: ToolContext
) => Promise<void>;

/**
 * 工具定义接口
 */
export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  dataSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  annotations?: ToolAnnotations;
  handler: ToolHandler<unknown>;
}

/**
 * 定义工具的辅助函数
 */
export function defineTool<
  TSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = typeof jsonObjectSchema,
>(definition: {
  name: string;
  description: string;
  schema: TSchema;
  outputSchema?: TOutputSchema;
  annotations?: ToolAnnotations;
  handler: ToolHandler<z.infer<TSchema>>;
}): ToolDefinition {
  const dataSchema = definition.outputSchema ?? jsonObjectSchema;
  return {
    name: definition.name,
    description: definition.description,
    schema: definition.schema,
    dataSchema,
    outputSchema: createToolResultSchema(dataSchema),
    annotations: definition.annotations,
    handler: definition.handler,
  };
}

/**
 * 连接状态检查辅助函数
 * 替代工具模块中重复的 `if (!context.miniProgram) throw ...` 模式
 */
export function ensureMiniProgram(
  context: ToolContext
): asserts context is ToolContext & { miniProgram: MiniProgram } {
  if (!context.miniProgram) {
    throw new Error('请先连接到微信开发者工具。使用 connect_devtools 工具建立连接。');
  }
}

/**
 * 页面状态检查辅助函数
 * 替代工具模块中重复的 `if (!context.currentPage) throw ...` 模式
 */
export function ensureCurrentPage(
  context: ToolContext
): asserts context is ToolContext & { currentPage: Page } {
  if (!context.currentPage) {
    throw new Error('请先获取当前页面。使用 get_current_page 或 get_page_snapshot 工具。');
  }
}

/**
 * 统一错误消息提取（从 utils/error.ts 重导出）
 */
export { extractErrorMessage } from '../utils/error.js';

/**
 * 响应格式化工具类
 * 统一所有工具的响应消息格式
 */
export class ResponseFormatter {
  /** 成功消息格式 */
  static success(message: string): string {
    return `✅ ${message}`;
  }

  /** 错误消息格式 */
  static error(message: string): string {
    return `❌ ${message}`;
  }

  /** 警告消息格式 */
  static warning(message: string): string {
    return `⚠️ ${message}`;
  }

  /** 章节标题格式 */
  static section(title: string): string {
    return `## ${title}`;
  }

  /** 提示消息格式 */
  static hint(message: string): string {
    return `💡 ${message}`;
  }

  /** 分隔线 */
  static separator(): string {
    return '---';
  }
}

/**
 * 默认导航超时时间（毫秒）
 */
export const DEFAULT_NAVIGATION_TIMEOUT = 10000;

/**
 * 默认等待超时时间（毫秒）
 */
export const DEFAULT_WAIT_TIMEOUT = 5000;

/**
 * 简单的响应实现类
 */
export class SimpleToolResponse implements ToolResponse {
  private responseLines: string[] = [];
  private includeSnapshot = false;
  private attachedImages: Array<{ data: string; mimeType: string }> = [];
  private structuredContent: StructuredContent = {};
  private pageStateCommit: PageStateCommit | undefined;

  appendResponseLine(text: string): void {
    this.responseLines.push(text);
  }

  setIncludeSnapshot(include: boolean): void {
    this.includeSnapshot = include;
  }

  attachImage(data: string, mimeType: string): void {
    this.attachedImages.push({ data, mimeType });
  }

  mergeStructuredContent(content: StructuredContent): void {
    this.structuredContent = { ...this.structuredContent, ...content };
  }

  getStructuredContent(): StructuredContent {
    return { ...this.structuredContent };
  }

  setPageStateCommit(commit: PageStateCommit): void {
    this.pageStateCommit = commit;
  }

  getPageStateCommit(): PageStateCommit | undefined {
    return this.pageStateCommit;
  }

  getResponseText(): string {
    return this.responseLines.join('\n');
  }

  shouldIncludeSnapshot(): boolean {
    return this.includeSnapshot;
  }

  getAttachedImages(): Array<{ data: string; mimeType: string }> {
    return this.attachedImages;
  }
}
