/**
 * 工具定义基础框架
 * 参考 chrome-devtools-mcp 的设计模式
 */

import { z } from 'zod'
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
 * Console日志类型
 */
export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: any[];
  timestamp: string;
  source?: string;
}

/**
 * Exception异常信息
 */
export interface ExceptionMessage {
  message: string;
  stack?: string;
  timestamp: string;
  source?: string;
}

/**
 * Console数据存储
 */
export interface ConsoleStorage {
  consoleMessages: ConsoleMessage[];
  exceptionMessages: ExceptionMessage[];
  isMonitoring: boolean;
  startTime: string | null;
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
  data?: any;
  params?: any;  // Mpx框架的查询参数
  statusCode?: number;
  response?: any;
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
 * 网络请求数据存储
 */
export interface NetworkStorage {
  requests: NetworkRequest[];
  isMonitoring: boolean;
  startTime: string | null;
  originalMethods: {
    request?: any;
    uploadFile?: any;
    downloadFile?: any;
  };
}

/**
 * 工具处理器上下文
 */
export interface ToolContext {
  miniProgram: any;
  currentPage: any;
  elementMap: Map<string, ElementMapInfo>;
  consoleStorage: ConsoleStorage;
  networkStorage: NetworkStorage;
}

/**
 * 工具请求接口
 */
export interface ToolRequest<T = any> {
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
  handler: ToolHandler<any>;
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