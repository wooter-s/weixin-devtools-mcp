/**
 * 工具定义基础框架
 * 参考 chrome-devtools-mcp 的设计模式
 */

import type { z } from 'zod'
import type { MiniProgram, Page, Element } from 'miniprogram-automator'

import type { ElementMapInfo } from '../tools.js'

/**
 * 工具分类枚举
 */
export enum ToolCategories {
  CONNECTION = 'Connection',
  PAGE_INTERACTION = 'Page interaction',
  AUTOMATION = 'Automation',
  DEBUGGING = 'Debugging'
}

/**
 * 工具注解接口
 */
export interface ToolAnnotations {
  audience?: string[];
  experimental?: boolean;
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
  msgid?: number;  // Stable ID，用于两阶段查询
  type: ConsoleMessageType;
  message?: string;  // 格式化的消息文本
  args: unknown[];  // console.log 参数可以是任意类型
  timestamp: string;
  source?: string;
}

/**
 * Exception异常信息（带 Stable ID）
 */
export interface ExceptionMessage {
  msgid?: number;  // Stable ID，用于两阶段查询
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
  maxNavigations: number;  // 最多保留的导航会话数，默认3

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
  data?: unknown;  // 请求体数据，可以是任意类型
  params?: Record<string, unknown>;  // Mpx框架的查询参数
  statusCode?: number;
  response?: unknown;  // 响应数据，可以是任意类型
  responseHeaders?: Record<string, string>;  // 响应头
  error?: string;
  duration?: number;
  timestamp: string;
  completedAt?: string;  // 完成时间
  success: boolean;
  pending?: boolean;  // 是否等待响应中
  source?: string;  // 请求来源（wx.request, getApp().$xfetch等）
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

  /**
   * 通过 UID 获取元素
   * 统一处理：连接检查、快照检查、元素查找、索引定位
   * @param uid 元素的唯一标识符
   * @returns 元素对象
   * @throws 如果页面未连接、UID 不存在、元素未找到等
   */
  getElementByUid(uid: string): Promise<Element>;
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
export interface ToolResponse {
  appendResponseLine(text: string): void;
  setIncludeSnapshot(include: boolean): void;
  attachImage(data: string, mimeType: string): void;
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
  annotations?: ToolAnnotations;
  handler: ToolHandler<unknown>;
}

/**
 * 定义工具的辅助函数
 */
export function defineTool<TSchema extends z.ZodTypeAny>(definition: {
  name: string;
  description: string;
  schema: TSchema;
  annotations?: ToolAnnotations;
  handler: ToolHandler<z.infer<TSchema>>;
}): ToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    schema: definition.schema,
    annotations: definition.annotations,
    handler: definition.handler,
  };
}

/**
 * 简单的响应实现类
 */
export class SimpleToolResponse implements ToolResponse {
  private responseLines: string[] = [];
  private includeSnapshot = false;
  private attachedImages: Array<{ data: string; mimeType: string }> = [];

  appendResponseLine(text: string): void {
    this.responseLines.push(text);
  }

  setIncludeSnapshot(include: boolean): void {
    this.includeSnapshot = include;
  }

  attachImage(data: string, mimeType: string): void {
    this.attachedImages.push({ data, mimeType });
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