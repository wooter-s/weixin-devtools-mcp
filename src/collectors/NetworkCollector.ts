/**
 * NetworkCollector - 网络请求收集器
 *
 * 专门用于收集和管理网络请求
 * 继承自通用 Collector 基类
 */

import { Collector, type CollectorOptions, type QueryOptions } from './Collector.js';

/**
 * 网络请求类型
 */
export type NetworkRequestType = 'request' | 'uploadFile' | 'downloadFile';

/**
 * 网络请求信息接口
 */
export interface NetworkRequest {
  /** 请求 ID（由应用层分配） */
  id: string;
  /** 请求类型 */
  type: NetworkRequestType;
  /** 请求 URL */
  url: string;
  /** HTTP 方法 */
  method?: string;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体数据 */
  data?: unknown;
  /** 查询参数（Mpx 框架等） */
  params?: Record<string, unknown>;
  /** 响应状态码 */
  statusCode?: number;
  /** 响应数据 */
  response?: unknown;
  /** 响应头 */
  responseHeaders?: Record<string, string>;
  /** 错误信息 */
  error?: string;
  /** 请求耗时（毫秒） */
  duration?: number;
  /** 请求开始时间 */
  timestamp: string;
  /** 请求完成时间 */
  completedAt?: string;
  /** 是否成功 */
  success: boolean;
  /** 是否等待响应中 */
  pending?: boolean;
  /** 请求来源 */
  source?: string;
}

/**
 * 网络请求查询选项
 */
export interface NetworkQueryOptions extends QueryOptions<NetworkRequest> {
  /** 请求类型过滤 */
  type?: NetworkRequestType | 'all';
  /** URL 匹配模式（正则表达式） */
  urlPattern?: string;
  /** 仅返回成功的请求 */
  successOnly?: boolean;
  /** 仅返回失败的请求 */
  failedOnly?: boolean;
  /** 仅返回已完成的请求 */
  completedOnly?: boolean;
  /** 指定时间之后的请求（ISO 8601 格式） */
  since?: string;
}

/**
 * wx 网络方法类型（用于存储原始方法以便恢复）
 */
export type WxNetworkMethod = ((options: Record<string, unknown>) => unknown) | undefined;

/**
 * 原始方法存储
 */
export interface OriginalMethods {
  request?: WxNetworkMethod;
  uploadFile?: WxNetworkMethod;
  downloadFile?: WxNetworkMethod;
}

/**
 * 网络请求收集器
 */
export class NetworkCollector extends Collector<NetworkRequest> {
  /** 存储原始的 wx 网络方法 */
  #originalMethods: OriginalMethods = {};

  constructor(options?: CollectorOptions) {
    super(options);
  }

  // ============ 原始方法管理 ============

  /**
   * 设置原始方法（用于恢复）
   */
  setOriginalMethods(methods: OriginalMethods): void {
    this.#originalMethods = { ...methods };
  }

  /**
   * 获取原始方法
   */
  getOriginalMethods(): OriginalMethods {
    return { ...this.#originalMethods };
  }

  /**
   * 清除原始方法引用
   */
  clearOriginalMethods(): void {
    this.#originalMethods = {};
  }

  // ============ 请求收集 ============

  /**
   * 添加网络请求
   * @returns Stable ID
   */
  addRequest(request: NetworkRequest): number {
    return this.collect(request);
  }

  /**
   * 更新请求状态（当响应到达时）
   */
  updateRequest(
    id: string,
    updates: Partial<Pick<NetworkRequest, 'statusCode' | 'response' | 'responseHeaders' | 'error' | 'duration' | 'completedAt' | 'success' | 'pending'>>
  ): boolean {
    const request = this.find(req => req.id === id);
    if (request) {
      Object.assign(request, updates);
      return true;
    }
    return false;
  }

  /**
   * 标记请求完成
   */
  completeRequest(
    id: string,
    response: {
      statusCode?: number;
      data?: unknown;
      headers?: Record<string, string>;
      error?: string;
    }
  ): boolean {
    const request = this.find(req => req.id === id);
    if (!request) {
      return false;
    }

    const now = new Date().toISOString();
    const startTime = new Date(request.timestamp).getTime();
    const endTime = new Date(now).getTime();

    request.statusCode = response.statusCode;
    request.response = response.data;
    request.responseHeaders = response.headers;
    request.error = response.error;
    request.duration = endTime - startTime;
    request.completedAt = now;
    request.success = !response.error && (response.statusCode === undefined || (response.statusCode >= 200 && response.statusCode < 400));
    request.pending = false;

    return true;
  }

  // ============ 请求查询 ============

  /**
   * 获取网络请求（支持多种过滤条件）
   */
  getRequests(options: NetworkQueryOptions = {}): NetworkRequest[] {
    const {
      type = 'all',
      urlPattern,
      successOnly,
      failedOnly,
      completedOnly,
      since,
      ...baseOptions
    } = options;

    // 构建复合过滤函数
    const originalFilter = baseOptions.filter;
    const filter = (request: NetworkRequest): boolean => {
      // 类型过滤
      if (type !== 'all' && request.type !== type) {
        return false;
      }

      // URL 模式过滤
      if (urlPattern) {
        try {
          const regex = new RegExp(urlPattern);
          if (!regex.test(request.url)) {
            return false;
          }
        } catch {
          // 正则表达式无效，作为普通字符串匹配
          if (!request.url.includes(urlPattern)) {
            return false;
          }
        }
      }

      // 成功/失败过滤
      if (successOnly && !request.success) {
        return false;
      }
      if (failedOnly && request.success) {
        return false;
      }

      // 完成状态过滤
      if (completedOnly && request.pending) {
        return false;
      }

      // 时间过滤
      if (since) {
        const sinceTime = new Date(since).getTime();
        const requestTime = new Date(request.timestamp).getTime();
        if (requestTime < sinceTime) {
          return false;
        }
      }

      // 应用原始过滤器
      if (originalFilter && !originalFilter(request)) {
        return false;
      }

      return true;
    };

    return this.getData({ ...baseOptions, filter });
  }

  /**
   * 通过请求 ID 获取请求
   */
  getRequestById(id: string): NetworkRequest | undefined {
    return this.find(req => req.id === id);
  }

  /**
   * 获取待处理的请求
   */
  getPendingRequests(): NetworkRequest[] {
    return this.findAll(req => req.pending === true);
  }

  /**
   * 获取失败的请求
   */
  getFailedRequests(): NetworkRequest[] {
    return this.findAll(req => !req.success && !req.pending);
  }

  // ============ 统计信息 ============

  /**
   * 获取请求统计
   */
  getStats(): {
    total: number;
    pending: number;
    success: number;
    failed: number;
    byType: Record<NetworkRequestType, number>;
  } {
    const requests = this.getData({ includePreserved: false });

    const stats = {
      total: requests.length,
      pending: 0,
      success: 0,
      failed: 0,
      byType: {
        request: 0,
        uploadFile: 0,
        downloadFile: 0,
      } as Record<NetworkRequestType, number>,
    };

    for (const request of requests) {
      stats.byType[request.type]++;

      if (request.pending) {
        stats.pending++;
      } else if (request.success) {
        stats.success++;
      } else {
        stats.failed++;
      }
    }

    return stats;
  }

  /**
   * 获取平均响应时间（毫秒）
   */
  getAverageResponseTime(): number {
    const requests = this.getData({ includePreserved: false });
    const completedRequests = requests.filter(req => req.duration !== undefined);

    if (completedRequests.length === 0) {
      return 0;
    }

    const totalTime = completedRequests.reduce((sum, req) => sum + (req.duration ?? 0), 0);
    return Math.round(totalTime / completedRequests.length);
  }

  // ============ 重置 ============

  /**
   * 完全重置（包括原始方法引用）
   */
  reset(): void {
    this.clear();
    this.clearOriginalMethods();
    this.stopMonitoring();
  }
}
