/**
 * 网络请求监听工具
 * 采用两阶段查询：list -> get detail
 */
/* eslint-disable @typescript-eslint/ban-ts-comment -- wx 运行时对象在 evaluate 上下文中动态注入，需保持现有注释抑制。 */

import { z } from 'zod';

import type { NetworkRequest as StoredNetworkRequest } from './ToolDefinition.js';
import { defineTool, ToolCategory, type NetworkRequestType } from './ToolDefinition.js';

interface NetworkRequestSummary {
  reqid: string;
  type: NetworkRequestType;
  method: string;
  url: string;
  status: 'pending' | 'success' | 'failed';
  statusCode: number | null;
  durationMs: number | null;
  timestamp: string;
}

function sanitizeNetworkRequests(logs: StoredNetworkRequest[]): StoredNetworkRequest[] {
  const deduped = new Map<string, StoredNetworkRequest>();

  for (const request of logs) {
    if (!request || typeof request !== 'object') {
      continue;
    }

    if (!request.id || request.id === 'N/A') {
      continue;
    }

    if (!request.url || request.url === 'undefined') {
      continue;
    }

    if (request.type !== 'request' && request.type !== 'uploadFile' && request.type !== 'downloadFile') {
      continue;
    }

    deduped.set(request.id, request);
  }

  return Array.from(deduped.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

function toRequestStatus(request: StoredNetworkRequest): 'pending' | 'success' | 'failed' {
  if (request.pending === true) {
    return 'pending';
  }
  return request.success ? 'success' : 'failed';
}

function toSummary(request: StoredNetworkRequest): NetworkRequestSummary {
  return {
    reqid: request.id,
    type: request.type,
    method: request.method ?? 'GET',
    url: request.url,
    status: toRequestStatus(request),
    statusCode: request.statusCode ?? null,
    durationMs: request.duration ?? null,
    timestamp: request.timestamp,
  };
}

function ensureConnected(context: { miniProgram: { evaluate: <T>(fn: () => T) => Promise<T> } | null }): void {
  if (!context.miniProgram) {
    throw new Error('请先连接到微信开发者工具');
  }
}

const requestTypeSchema = z.enum(['request', 'uploadFile', 'downloadFile']);

const listNetworkRequestsSchema = z.object({
  pageSize: z.number().int().positive().optional().default(50).describe('每页条数'),
  pageIdx: z.number().int().min(0).optional().default(0).describe('页码（从 0 开始）'),
  resourceTypes: z.array(requestTypeSchema).optional().describe('按请求类型过滤'),
  includePreservedRequests: z.boolean().optional().default(false).describe('是否包含历史请求（最近 3 次会话）'),
  urlPattern: z.string().optional().describe('URL 匹配模式（支持正则）'),
  successOnly: z.boolean().optional().default(false).describe('仅返回成功请求'),
  failedOnly: z.boolean().optional().default(false).describe('仅返回失败请求'),
  since: z.string().optional().describe('仅返回指定时间后的请求（ISO 8601）'),
});

const getNetworkRequestSchema = z.object({
  reqid: z.string().min(1).describe('请求 ID（从 list_network_requests 获取）'),
});

const stopNetworkMonitoringSchema = z.object({
  clearLogs: z.boolean().optional().default(false).describe('是否同时清空已收集的日志'),
});

const clearNetworkRequestsSchema = z.object({
  clearRemote: z.boolean().optional().default(true).describe('是否同时清空小程序端日志'),
});

// 注意: start_network_monitoring 已移除，监听在连接成功后自动启动

/**
 * 第一阶段：列表查询网络请求（短格式）
 */
export const listNetworkRequestsTool = defineTool({
  name: 'list_network_requests',
  description: '列表查询网络请求（短格式，支持分页和过滤），用于获取 reqid 后再查询详情',
  schema: listNetworkRequestsSchema,
  annotations: {
    category: ToolCategory.NETWORK,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    ensureConnected(context);

    const {
      pageSize,
      pageIdx,
      resourceTypes,
      includePreservedRequests,
      urlPattern,
      successOnly,
      failedOnly,
      since,
    } = request.params;

    if (successOnly && failedOnly) {
      throw new Error('successOnly 与 failedOnly 不能同时为 true');
    }

    const syncedCount = await context.getNetworkCollector().syncFromRemote(true);
    const allRequests = context.getNetworkCollector().getRequests({
      includePreserved: includePreservedRequests,
    });

    let filteredRequests = sanitizeNetworkRequests(allRequests);

    if (resourceTypes && resourceTypes.length > 0) {
      const typeSet = new Set(resourceTypes);
      filteredRequests = filteredRequests.filter(req => typeSet.has(req.type));
    }

    if (urlPattern) {
      try {
        const regex = new RegExp(urlPattern);
        filteredRequests = filteredRequests.filter(req => regex.test(req.url));
      } catch {
        filteredRequests = filteredRequests.filter(req => req.url.includes(urlPattern));
      }
    }

    if (successOnly) {
      filteredRequests = filteredRequests.filter(req => req.success === true);
    }

    if (failedOnly) {
      filteredRequests = filteredRequests.filter(req => req.success === false);
    }

    if (since) {
      const sinceTime = new Date(since).getTime();
      if (Number.isNaN(sinceTime)) {
        throw new Error('since 参数必须是有效的 ISO 8601 时间字符串');
      }
      filteredRequests = filteredRequests.filter(req => new Date(req.timestamp).getTime() >= sinceTime);
    }

    const total = filteredRequests.length;
    const start = pageIdx * pageSize;
    const end = Math.min(start + pageSize, total);
    const pageRequests = filteredRequests.slice(start, end);

    response.appendResponseLine('## Network Requests (List View)');
    response.appendResponseLine(`监听状态: ${context.networkStorage.isMonitoring ? '运行中' : '已停止'}`);
    response.appendResponseLine(`监听开始时间: ${context.networkStorage.startTime || '未设置'}`);
    response.appendResponseLine(`本次同步新增: ${syncedCount}`);
    response.appendResponseLine(`总数: ${total} 条`);
    response.appendResponseLine(`显示: ${total === 0 ? 0 : start + 1}-${end}`);
    response.appendResponseLine('');

    if (pageRequests.length === 0) {
      response.appendResponseLine('<no requests found>');
      return;
    }

    for (const item of pageRequests.map(toSummary)) {
      response.appendResponseLine(
        `reqid=${item.reqid} [${item.type}] ${item.method} ${item.url} status=${item.status}`
      );
    }

    response.appendResponseLine('');
    response.appendResponseLine('提示: 使用 get_network_request 结合 reqid 查看完整详情');
  },
});

/**
 * 第二阶段：按 reqid 查询请求详情
 */
export const getNetworkRequestTool = defineTool({
  name: 'get_network_request',
  description: '通过 reqid 获取单条网络请求完整详情',
  schema: getNetworkRequestSchema,
  annotations: {
    category: ToolCategory.NETWORK,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    ensureConnected(context);

    await context.getNetworkCollector().syncFromRemote(true);
    const requests = sanitizeNetworkRequests(
      context.getNetworkCollector().getRequests({ includePreserved: true })
    );

    const matched = requests.find(item => item.id === request.params.reqid);
    if (!matched) {
      throw new Error(`未找到 reqid=${request.params.reqid} 的请求，请先调用 list_network_requests 获取可用 reqid`);
    }

    response.appendResponseLine('## Network Request (Detail View)');
    response.appendResponseLine(`ID: ${matched.id}`);
    response.appendResponseLine(`类型: ${matched.type}`);
    response.appendResponseLine(`URL: ${matched.url}`);
    response.appendResponseLine(`方法: ${matched.method ?? 'GET'}`);
    response.appendResponseLine(`状态: ${toRequestStatus(matched)}`);
    response.appendResponseLine(`状态码: ${matched.statusCode ?? 'N/A'}`);
    response.appendResponseLine(`耗时: ${matched.duration ?? 'N/A'}ms`);
    response.appendResponseLine(`时间: ${matched.timestamp}`);

    if (matched.headers && Object.keys(matched.headers).length > 0) {
      response.appendResponseLine(`请求头: ${JSON.stringify(matched.headers)}`);
    }

    if (matched.data !== undefined) {
      response.appendResponseLine(`请求数据: ${JSON.stringify(matched.data)}`);
    }

    if (matched.params && Object.keys(matched.params).length > 0) {
      response.appendResponseLine(`请求参数: ${JSON.stringify(matched.params)}`);
    }

    if (matched.response !== undefined) {
      response.appendResponseLine(`响应数据: ${JSON.stringify(matched.response)}`);
    }

    if (matched.responseHeaders && Object.keys(matched.responseHeaders).length > 0) {
      response.appendResponseLine(`响应头: ${JSON.stringify(matched.responseHeaders)}`);
    }

    if (matched.error) {
      response.appendResponseLine(`错误信息: ${matched.error}`);
    }

    if (matched.completedAt) {
      response.appendResponseLine(`完成时间: ${matched.completedAt}`);
    }
  },
});

/**
 * 停止网络监听
 */
export const stopNetworkMonitoringTool = defineTool({
  name: 'stop_network_monitoring',
  description: '停止网络监听并禁用拦截器',
  schema: stopNetworkMonitoringSchema,
  annotations: {
    category: ToolCategory.NETWORK,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    ensureConnected(context);

    const { clearLogs } = request.params;

    await context.miniProgram!.evaluate(function() {
      // @ts-ignore - wx is available in WeChat miniprogram environment
      const wxObj = typeof wx !== 'undefined' ? wx : null;
      if (wxObj) {
        // @ts-ignore
        wxObj.__networkInterceptorsDisabled = true;
      }
    });

    const storage = context.networkStorage;
    storage.isMonitoring = false;
    context.networkStorage = storage;

    let clearedCount = 0;
    if (clearLogs) {
      clearedCount = await context.miniProgram!.evaluate(function() {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (wxObj && wxObj.__networkLogs) {
          // @ts-ignore
          const count = wxObj.__networkLogs.length;
          // @ts-ignore
          wxObj.__networkLogs = [];
          return count;
        }
        return 0;
      });
    }

    response.appendResponseLine('=== 网络监听已停止 ===');
    response.appendResponseLine('监听状态: 已停止');
    if (clearLogs) {
      response.appendResponseLine(`已清空日志: ${clearedCount} 条`);
    }
    response.appendResponseLine('');
    response.appendResponseLine('提示: 使用 reconnect_devtools 重新连接可恢复监听');
  },
});

/**
 * 清空网络请求记录
 */
export const clearNetworkRequestsTool = defineTool({
  name: 'clear_network_requests',
  description: '清空已收集的网络请求记录',
  schema: clearNetworkRequestsSchema,
  annotations: {
    category: ToolCategory.NETWORK,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    ensureConnected(context);

    const { clearRemote } = request.params;
    const localCountBefore = context.getNetworkCollector().getCurrentCount();

    context.clearNetworkRequests();

    let remoteCount = 0;
    if (clearRemote) {
      remoteCount = await context.miniProgram!.evaluate(function() {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (wxObj && wxObj.__networkLogs) {
          // @ts-ignore
          const count = wxObj.__networkLogs.length;
          // @ts-ignore
          wxObj.__networkLogs = [];
          return count;
        }
        return 0;
      });
    }

    response.appendResponseLine('=== 网络请求记录已清空 ===');
    response.appendResponseLine(`本地清空: ${localCountBefore} 条`);
    if (clearRemote) {
      response.appendResponseLine(`远程清空: ${remoteCount} 条`);
    }
    response.appendResponseLine('');
    response.appendResponseLine('提示: 网络监听仍在运行，新的请求会继续被收集');
  },
});
