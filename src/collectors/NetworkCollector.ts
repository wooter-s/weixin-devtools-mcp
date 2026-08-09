/**
 * NetworkCollector - 网络请求收集器
 *
 * 专门用于收集和管理网络请求
 * 继承自通用 Collector 基类
 */

import type {
  MiniProgram,
  MockWxMethodContext,
  WxMethodOptions,
} from 'miniprogram-automator';

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

interface RemoteNetworkResult extends Record<string, unknown> {
  statusCode?: number;
  data?: unknown;
  header?: Record<string, string>;
  errMsg?: string;
  tempFilePath?: string;
  filePath?: string;
}

interface RemoteNetworkOptions extends Record<string, unknown> {
  url?: string;
  method?: string;
  header?: Record<string, string>;
  data?: unknown;
  filePath?: string;
  name?: string;
  formData?: unknown;
  success?: (result: RemoteNetworkResult) => void;
  fail?: (result: RemoteNetworkResult) => void;
}

interface RemoteWxState {
  __networkLogs: Array<Record<string, unknown>>;
  __networkLogsLimit?: number;
}

interface RemoteOriginContext {
  origin(options: RemoteNetworkOptions): unknown;
}

/**
 * 网络请求收集器
 */
export class NetworkCollector extends Collector<NetworkRequest> {
  /** 存储原始的 wx 网络方法 */
  #originalMethods: OriginalMethods = {};

  /** 上次同步时间戳 */
  #lastSyncTimestamp = 0;

  /** 同步间隔（毫秒） */
  #syncIntervalMs = 5000;

  /** MiniProgram 引用（用于安装、恢复与同步） */
  #miniProgram: MiniProgram | null = null;

  /** 当前实例上仍由本 Collector 持有的 wx 方法拦截器。 */
  #installedRemoteMethods = new Set<string>();

  constructor(options?: CollectorOptions) {
    super(options);
  }

  // ============ MiniProgram 引用管理 ============

  /**
   * 设置 MiniProgram 引用（用于远程同步）
   */
  setMiniProgram(miniProgram: MiniProgram | null): void {
    this.#miniProgram = miniProgram;
  }

  /**
   * 在小程序运行时安装唯一一套网络拦截器。
   * 对同一个 MiniProgram 重复调用是幂等的；切换实例前必须先 stopRemoteMonitoring。
   */
  async startRemoteMonitoring(miniProgram: MiniProgram = this.#requireMiniProgram()): Promise<void> {
    if (
      this.#miniProgram === miniProgram &&
      this.#installedRemoteMethods.size === 3 &&
      this.isMonitoring()
    ) {
      return;
    }

    if (this.#installedRemoteMethods.size > 0) {
      await this.stopRemoteMonitoring();
    }

    this.#miniProgram = miniProgram;

    try {
      await miniProgram.evaluate(function() {
        // @ts-expect-error wx is available in WeChat miniprogram runtime
        const wxObj = (typeof wx !== 'undefined' ? wx : null) as RemoteWxState | null;
        if (!wxObj) return;
        wxObj.__networkLogs = [];
        wxObj.__networkLogsLimit = 1000;
      });

      await miniProgram.mockWxMethod('request', function(
        this: MockWxMethodContext,
        rawOptions: WxMethodOptions,
      ) {
        const options = rawOptions as RemoteNetworkOptions;
        const originContext = this as MockWxMethodContext & RemoteOriginContext;
        // @ts-expect-error wx is available in WeChat miniprogram runtime
        const wxObj = (typeof wx !== 'undefined' ? wx : null) as RemoteWxState | null;
        if (!wxObj) {
          return originContext.origin(options);
        }
        wxObj.__networkLogs = wxObj.__networkLogs || [];
        const id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const startedAt = Date.now();
        const originalSuccess = options.success;
        const originalFail = options.fail;
        options.success = function(this: unknown, res: RemoteNetworkResult) {
          wxObj.__networkLogs.push({
            id,
            type: 'request',
            url: options.url,
            method: options.method || 'GET',
            headers: options.header,
            data: options.data,
            statusCode: res.statusCode,
            response: res.data,
            responseHeaders: res.header,
            duration: Date.now() - startedAt,
            timestamp: new Date(startedAt).toISOString(),
            completedAt: new Date().toISOString(),
            success: true,
            pending: false,
            source: 'wx.request',
          });
          while (wxObj.__networkLogs.length > (wxObj.__networkLogsLimit || 1000)) {
            wxObj.__networkLogs.shift();
          }
          if (originalSuccess) originalSuccess.call(this, res);
        };
        options.fail = function(this: unknown, err: RemoteNetworkResult) {
          wxObj.__networkLogs.push({
            id,
            type: 'request',
            url: options.url,
            method: options.method || 'GET',
            headers: options.header,
            data: options.data,
            error: err.errMsg || String(err),
            duration: Date.now() - startedAt,
            timestamp: new Date(startedAt).toISOString(),
            completedAt: new Date().toISOString(),
            success: false,
            pending: false,
            source: 'wx.request',
          });
          while (wxObj.__networkLogs.length > (wxObj.__networkLogsLimit || 1000)) {
            wxObj.__networkLogs.shift();
          }
          if (originalFail) originalFail.call(this, err);
        };
        return originContext.origin(options);
      });
      this.#installedRemoteMethods.add('request');

      await miniProgram.mockWxMethod('uploadFile', function(
        this: MockWxMethodContext,
        rawOptions: WxMethodOptions,
      ) {
        const options = rawOptions as RemoteNetworkOptions;
        const originContext = this as MockWxMethodContext & RemoteOriginContext;
        // @ts-expect-error wx is available in WeChat miniprogram runtime
        const wxObj = (typeof wx !== 'undefined' ? wx : null) as RemoteWxState | null;
        if (!wxObj) {
          return originContext.origin(options);
        }
        wxObj.__networkLogs = wxObj.__networkLogs || [];
        const id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const startedAt = Date.now();
        const originalSuccess = options.success;
        const originalFail = options.fail;
        const finish = function(success: boolean, result: RemoteNetworkResult) {
          wxObj.__networkLogs.push({
            id,
            type: 'uploadFile',
            url: options.url,
            headers: options.header,
            data: {
              filePath: options.filePath,
              name: options.name,
              formData: options.formData,
            },
            statusCode: result && result.statusCode,
            response: success ? result && result.data : undefined,
            error: success ? undefined : (result && result.errMsg) || String(result),
            duration: Date.now() - startedAt,
            timestamp: new Date(startedAt).toISOString(),
            completedAt: new Date().toISOString(),
            success,
            pending: false,
            source: 'wx.uploadFile',
          });
          while (wxObj.__networkLogs.length > (wxObj.__networkLogsLimit || 1000)) {
            wxObj.__networkLogs.shift();
          }
        };
        options.success = function(this: unknown, res: RemoteNetworkResult) {
          finish(true, res);
          if (originalSuccess) originalSuccess.call(this, res);
        };
        options.fail = function(this: unknown, err: RemoteNetworkResult) {
          finish(false, err);
          if (originalFail) originalFail.call(this, err);
        };
        return originContext.origin(options);
      });
      this.#installedRemoteMethods.add('uploadFile');

      await miniProgram.mockWxMethod('downloadFile', function(
        this: MockWxMethodContext,
        rawOptions: WxMethodOptions,
      ) {
        const options = rawOptions as RemoteNetworkOptions;
        const originContext = this as MockWxMethodContext & RemoteOriginContext;
        // @ts-expect-error wx is available in WeChat miniprogram runtime
        const wxObj = (typeof wx !== 'undefined' ? wx : null) as RemoteWxState | null;
        if (!wxObj) {
          return originContext.origin(options);
        }
        wxObj.__networkLogs = wxObj.__networkLogs || [];
        const id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const startedAt = Date.now();
        const originalSuccess = options.success;
        const originalFail = options.fail;
        const finish = function(success: boolean, result: RemoteNetworkResult) {
          wxObj.__networkLogs.push({
            id,
            type: 'downloadFile',
            url: options.url,
            headers: options.header,
            statusCode: result && result.statusCode,
            response: success
              ? { tempFilePath: result && result.tempFilePath, filePath: result && result.filePath }
              : undefined,
            error: success ? undefined : (result && result.errMsg) || String(result),
            duration: Date.now() - startedAt,
            timestamp: new Date(startedAt).toISOString(),
            completedAt: new Date().toISOString(),
            success,
            pending: false,
            source: 'wx.downloadFile',
          });
          while (wxObj.__networkLogs.length > (wxObj.__networkLogsLimit || 1000)) {
            wxObj.__networkLogs.shift();
          }
        };
        options.success = function(this: unknown, res: RemoteNetworkResult) {
          finish(true, res);
          if (originalSuccess) originalSuccess.call(this, res);
        };
        options.fail = function(this: unknown, err: RemoteNetworkResult) {
          finish(false, err);
          if (originalFail) originalFail.call(this, err);
        };
        return originContext.origin(options);
      });
      this.#installedRemoteMethods.add('downloadFile');

      this.startMonitoring();
    } catch (error) {
      await Promise.all(
        Array.from(this.#installedRemoteMethods).map(async method => {
          try {
            await miniProgram.restoreWxMethod(method);
            this.#installedRemoteMethods.delete(method);
          } catch {
            // 尽力回滚部分安装，保留原始安装错误。
          }
        }),
      );
      this.stopMonitoring();
      throw error;
    }
  }

  /** 恢复由本 Collector 模拟的 wx 方法，并停止远程采集。 */
  async stopRemoteMonitoring(options?: { clearLogs?: boolean }): Promise<number> {
    const miniProgram = this.#miniProgram;
    let clearedCount = 0;
    const restoreFailures: string[] = [];

    if (miniProgram && this.#installedRemoteMethods.size > 0) {
      await Promise.all(
        Array.from(this.#installedRemoteMethods).map(async method => {
          try {
            await miniProgram.restoreWxMethod(method);
            this.#installedRemoteMethods.delete(method);
          } catch {
            restoreFailures.push(method);
          }
        }),
      );
    }

    if (miniProgram && options?.clearLogs) {
      try {
        clearedCount = await miniProgram.evaluate(function() {
          // @ts-expect-error wx is available in WeChat miniprogram runtime
          const wxObj = (typeof wx !== 'undefined' ? wx : null) as RemoteWxState | null;
          if (!wxObj || !wxObj.__networkLogs) return 0;
          const count = wxObj.__networkLogs.length;
          wxObj.__networkLogs = [];
          return count;
        });
      } catch {
        // 远端可能已断开；本地状态仍然必须清理。
      }
    }

    this.stopMonitoring();
    if (restoreFailures.length > 0) {
      throw new Error(`恢复 wx 方法失败: ${restoreFailures.sort().join(', ')}`);
    }
    return clearedCount;
  }

  /** 远端会话已经断开后，仅用于放弃无法再恢复的拦截器所有权。 */
  abandonRemoteMonitoring(): void {
    this.#installedRemoteMethods.clear();
    this.stopMonitoring();
  }

  #requireMiniProgram(): MiniProgram {
    if (!this.#miniProgram) {
      throw new Error('网络监听缺少 MiniProgram 实例');
    }
    return this.#miniProgram;
  }

  /**
   * 从远程同步数据（带节流）
   * @param force 是否强制同步（跳过节流）
   * @returns 同步的请求数量
   */
  async syncFromRemote(force = false): Promise<number> {
    const now = Date.now();

    // 节流：非强制且未到同步时间
    if (!force && now - this.#lastSyncTimestamp < this.#syncIntervalMs) {
      return 0;
    }

    if (!this.#miniProgram) {
      return 0;
    }

    try {
      // 从小程序环境拉取并清空远程日志
      const remoteLogs = await this.#miniProgram.evaluate(function() {
        // @ts-expect-error wx is available in WeChat miniprogram runtime
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (!wxObj || !wxObj.__networkLogs) return [];

        // 返回并清空（避免重复处理）
        const logs = [...wxObj.__networkLogs];
        wxObj.__networkLogs = [];
        return logs;
      }) as NetworkRequest[];

      this.#lastSyncTimestamp = now;

      // 批量添加到本地存储
      let addedCount = 0;
      for (const log of remoteLogs) {
        if (log && typeof log === 'object' && log.url) {
          this.addRequest(log);
          addedCount++;
        }
      }

      return addedCount;
    } catch (error) {
      console.warn('[NetworkCollector] 同步失败:', error);
      throw error;
    }
  }

  /**
   * 设置同步间隔
   */
  setSyncInterval(intervalMs: number): void {
    this.#syncIntervalMs = Math.max(1000, intervalMs); // 最少 1 秒
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
    const existing = this.getRequestById(request.id);
    if (existing) {
      Object.assign(existing, request);
      return this.getIdForItem(existing);
    }
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
    this.#lastSyncTimestamp = 0;
    this.stopMonitoring();
  }
}
