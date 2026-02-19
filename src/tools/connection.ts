/**
 * 连接管理工具
 * 提供 connect / reconnect / disconnect / status 能力
 */
/* eslint-disable @typescript-eslint/ban-ts-comment -- wx 运行时对象在 evaluate 上下文中动态注入，需保持现有注释抑制。 */

import type { MiniProgram } from 'miniprogram-automator';
import { z } from 'zod';

import type {
  ConnectionHealth,
  ConnectionRequest,
} from '../connection/index.js';

import type {
  ConsoleMessage,
  ExceptionMessage,
  ConsoleStorage,
  NetworkStorage,
  ToolContext,
  ToolResponse
} from './ToolDefinition.js';
import { defineTool, ToolCategory } from './ToolDefinition.js';

const strategyEnum = z.enum(['auto', 'launch', 'connect', 'wsEndpoint', 'browserUrl', 'discover']);

const connectSchema = z.object({
  strategy: strategyEnum.optional().default('auto')
    .describe('连接策略: auto/launch/connect/wsEndpoint/browserUrl/discover'),
  projectPath: z.string().optional().describe('小程序项目的绝对路径'),
  cliPath: z.string().optional().describe('微信开发者工具 CLI 绝对路径（可选）'),
  autoPort: z.number().optional().describe('自动化监听端口（可选）'),
  browserUrl: z.string().optional().describe('已运行实例的 HTTP 调试地址，如 http://127.0.0.1:9222'),
  wsEndpoint: z.string().optional().describe('已运行实例的 WS 地址，如 ws://127.0.0.1:9420'),
  wsHeaders: z.record(z.string()).optional().describe('WS 自定义请求头'),
  timeoutMs: z.number().optional().default(45000).describe('连接超时时间（毫秒）'),
  fallback: z.array(strategyEnum).optional().describe('连接失败时的回退策略序列'),
  healthCheck: z.boolean().optional().default(true).describe('是否执行连接健康检查'),
  autoDiscover: z.boolean().optional().default(true).describe('auto 策略下是否优先尝试自动发现端点'),
  verbose: z.boolean().optional().default(false).describe('是否输出详细日志'),
  autoAudits: z.boolean().optional().describe('launch/connect 策略下是否启用体验评分'),
});

const reconnectSchema = z.object({
  strategy: strategyEnum.optional().describe('可选，覆盖上次连接策略'),
  projectPath: z.string().optional().describe('可选，覆盖上次项目路径'),
  cliPath: z.string().optional(),
  autoPort: z.number().optional(),
  browserUrl: z.string().optional(),
  wsEndpoint: z.string().optional(),
  wsHeaders: z.record(z.string()).optional(),
  timeoutMs: z.number().optional(),
  fallback: z.array(strategyEnum).optional(),
  healthCheck: z.boolean().optional(),
  autoDiscover: z.boolean().optional(),
  verbose: z.boolean().optional(),
  autoAudits: z.boolean().optional(),
});

const statusSchema = z.object({
  refreshHealth: z.boolean().optional().default(true).describe('是否刷新健康检查状态'),
});

type ConnectParams = z.infer<typeof connectSchema>;
type ReconnectParams = z.infer<typeof reconnectSchema>;
type StatusParams = z.infer<typeof statusSchema>;

function toConnectionRequest(params: ConnectParams | ReconnectParams): ConnectionRequest {
  return {
    strategy: params.strategy,
    projectPath: params.projectPath,
    cliPath: params.cliPath,
    autoPort: params.autoPort,
    browserUrl: params.browserUrl,
    wsEndpoint: params.wsEndpoint,
    wsHeaders: params.wsHeaders,
    timeoutMs: params.timeoutMs,
    fallback: params.fallback,
    healthCheck: params.healthCheck,
    autoDiscover: params.autoDiscover,
    verbose: params.verbose,
    autoAudits: params.autoAudits,
  };
}

function formatHealthSummary(health: ConnectionHealth | null): string {
  if (!health) {
    return 'unknown';
  }
  return `${health.level} (${health.checks.length} checks)`;
}

function updateConsoleStorage(
  context: ToolContext,
  updater: (storage: ConsoleStorage) => void
): void {
  const storage = context.consoleStorage;
  updater(storage);
  context.consoleStorage = storage;
}

function updateNetworkStorage(
  context: ToolContext,
  updater: (storage: NetworkStorage) => void
): void {
  const storage = context.networkStorage;
  updater(storage);
  context.networkStorage = storage;
}

async function startAutomaticMonitoring(
  miniProgram: MiniProgram,
  context: ToolContext,
  response: ToolResponse,
): Promise<void> {
  try {
    miniProgram.removeAllListeners('console');
    miniProgram.removeAllListeners('exception');

    updateConsoleStorage(context, storage => {
      storage.isMonitoring = true;
      storage.startTime = new Date().toISOString();
    });

    miniProgram.on('console', (msg: { type?: string; args?: unknown[] }) => {
      const consoleMessage: ConsoleMessage = {
        type: (msg.type as ConsoleMessage['type']) || 'log',
        args: msg.args || [],
        timestamp: new Date().toISOString(),
        source: 'miniprogram',
      };

      updateConsoleStorage(context, storage => {
        const currentSession = storage.navigations[0];
        if (!currentSession) {
          return;
        }
        if (storage.idGenerator) {
          consoleMessage.msgid = storage.idGenerator();
          if (consoleMessage.msgid !== undefined) {
            storage.messageIdMap.set(consoleMessage.msgid, consoleMessage);
          }
        }
        currentSession.messages.push(consoleMessage);
      });
    });

    miniProgram.on('exception', (err: { message?: string; stack?: string }) => {
      const exceptionMessage: ExceptionMessage = {
        message: err.message || 'Unknown exception',
        stack: err.stack,
        timestamp: new Date().toISOString(),
        source: 'miniprogram',
      };

      updateConsoleStorage(context, storage => {
        const currentSession = storage.navigations[0];
        if (!currentSession) {
          return;
        }
        if (storage.idGenerator) {
          exceptionMessage.msgid = storage.idGenerator();
          if (exceptionMessage.msgid !== undefined) {
            storage.messageIdMap.set(exceptionMessage.msgid, exceptionMessage);
          }
        }
        currentSession.exceptions.push(exceptionMessage);
      });
    });

    response.appendResponseLine('Console监听已自动启动');
  } catch (error) {
    response.appendResponseLine(`警告: Console监听启动失败 - ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    if (!context.networkStorage.isMonitoring) {
      await miniProgram.evaluate(function() {
        // @ts-ignore
        if (typeof wx === 'undefined' || wx.__networkInterceptorsInstalled) return;
        // @ts-ignore
        wx.__networkLogs = wx.__networkLogs || [];
        // @ts-ignore
        wx.__networkLogsLimit = 1000;
        // @ts-ignore
        wx.__networkInterceptorsDisabled = false;
        // @ts-ignore
        wx.__pushNetworkLog = function(log: any) {
          // @ts-ignore
          if (wx.__networkInterceptorsDisabled) return;
          // @ts-ignore
          wx.__networkLogs.push(log);
          // @ts-ignore
          while (wx.__networkLogs.length > wx.__networkLogsLimit) {
            // @ts-ignore
            wx.__networkLogs.shift();
          }
        };

        // @ts-ignore
        const _originalRequest = wx.request;
        // @ts-ignore
        const _originalUploadFile = wx.uploadFile;
        // @ts-ignore
        const _originalDownloadFile = wx.downloadFile;

        // @ts-ignore
        delete wx.request;
        // @ts-ignore
        Object.defineProperty(wx, 'request', {
          configurable: true,
          value: function(options: any) {
            // @ts-ignore
            if (wx.__networkInterceptorsDisabled) return _originalRequest.call(this, options);
            const id = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const start = Date.now();
            const origSuccess = options.success;
            const origFail = options.fail;
            options.success = function(res: any) {
              // @ts-ignore
              wx.__pushNetworkLog({ id, type: 'request', url: options.url, method: options.method || 'GET',
                headers: options.header, data: options.data, statusCode: res.statusCode,
                response: res.data, duration: Date.now() - start, timestamp: new Date().toISOString(), success: true });
              if (origSuccess) origSuccess.call(this, res);
            };
            options.fail = function(err: any) {
              // @ts-ignore
              wx.__pushNetworkLog({ id, type: 'request', url: options.url, method: options.method || 'GET',
                headers: options.header, data: options.data, error: err.errMsg || String(err),
                duration: Date.now() - start, timestamp: new Date().toISOString(), success: false });
              if (origFail) origFail.call(this, err);
            };
            return _originalRequest.call(this, options);
          }
        });

        // @ts-ignore
        delete wx.uploadFile;
        // @ts-ignore
        Object.defineProperty(wx, 'uploadFile', {
          configurable: true,
          value: function(options: any) {
            // @ts-ignore
            if (wx.__networkInterceptorsDisabled) return _originalUploadFile.call(this, options);
            const id = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const start = Date.now();
            const origSuccess = options.success;
            const origFail = options.fail;
            options.success = function(res: any) {
              // @ts-ignore
              wx.__pushNetworkLog({ id, type: 'uploadFile', url: options.url, headers: options.header,
                data: { filePath: options.filePath, name: options.name, formData: options.formData },
                statusCode: res.statusCode, response: res.data, duration: Date.now() - start,
                timestamp: new Date().toISOString(), success: true });
              if (origSuccess) origSuccess.call(this, res);
            };
            options.fail = function(err: any) {
              // @ts-ignore
              wx.__pushNetworkLog({ id, type: 'uploadFile', url: options.url, headers: options.header,
                data: { filePath: options.filePath, name: options.name, formData: options.formData },
                error: err.errMsg || String(err), duration: Date.now() - start,
                timestamp: new Date().toISOString(), success: false });
              if (origFail) origFail.call(this, err);
            };
            return _originalUploadFile.call(this, options);
          }
        });

        // @ts-ignore
        delete wx.downloadFile;
        // @ts-ignore
        Object.defineProperty(wx, 'downloadFile', {
          configurable: true,
          value: function(options: any) {
            // @ts-ignore
            if (wx.__networkInterceptorsDisabled) return _originalDownloadFile.call(this, options);
            const id = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const start = Date.now();
            const origSuccess = options.success;
            const origFail = options.fail;
            options.success = function(res: any) {
              // @ts-ignore
              wx.__pushNetworkLog({ id, type: 'downloadFile', url: options.url, headers: options.header,
                statusCode: res.statusCode, response: { tempFilePath: res.tempFilePath, filePath: res.filePath },
                duration: Date.now() - start, timestamp: new Date().toISOString(), success: true });
              if (origSuccess) origSuccess.call(this, res);
            };
            options.fail = function(err: any) {
              // @ts-ignore
              wx.__pushNetworkLog({ id, type: 'downloadFile', url: options.url, headers: options.header,
                error: err.errMsg || String(err), duration: Date.now() - start,
                timestamp: new Date().toISOString(), success: false });
              if (origFail) origFail.call(this, err);
            };
            return _originalDownloadFile.call(this, options);
          }
        });

        // @ts-ignore
        wx.__networkInterceptorsInstalled = true;
      });

      updateNetworkStorage(context, storage => {
        storage.isMonitoring = true;
        storage.startTime = new Date().toISOString();
      });
    }
    response.appendResponseLine('网络监听已自动启动（增强型拦截）');
  } catch (error) {
    response.appendResponseLine(`警告: 网络监听启动失败 - ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const connectDevtoolsTool = defineTool({
  name: 'connect_devtools',
  description: '连接微信开发者工具，支持多入口策略和自动回退',
  schema: connectSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const result = await context.connectDevtools(toConnectionRequest(request.params));
    await startAutomaticMonitoring(result.miniProgram, context, response);

    response.appendResponseLine('✅ 连接成功');
    response.appendResponseLine(`连接ID: ${result.connectionId}`);
    response.appendResponseLine(`策略: ${result.strategyUsed}`);
    response.appendResponseLine(`连接状态: ${result.status}`);
    response.appendResponseLine(`健康检查: ${formatHealthSummary(result.health)}`);
    response.appendResponseLine(`当前页面: ${result.pagePath}`);
    if (result.endpoint) {
      response.appendResponseLine(`端点: ${result.endpoint}`);
    }
    response.appendResponseLine(
      `耗时: total=${result.timing.totalMs}ms, connect=${result.timing.connectMs}ms, health=${result.timing.healthMs}ms`
    );
    if (result.warnings.length > 0) {
      response.appendResponseLine(`回退告警: ${result.warnings.join(' | ')}`);
    }
  },
});

export const reconnectDevtoolsTool = defineTool({
  name: 'reconnect_devtools',
  description: '重新连接微信开发者工具，可复用上一次连接参数',
  schema: reconnectSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const params = toConnectionRequest(request.params);
    const hasOverride = Object.values(params).some(value => value !== undefined);
    const result = hasOverride
      ? await context.reconnectDevtools(params)
      : await context.reconnectDevtools();
    await startAutomaticMonitoring(result.miniProgram, context, response);

    response.appendResponseLine('✅ 重连成功');
    response.appendResponseLine(`连接ID: ${result.connectionId}`);
    response.appendResponseLine(`策略: ${result.strategyUsed}`);
    response.appendResponseLine(`连接状态: ${result.status}`);
    response.appendResponseLine(`健康检查: ${formatHealthSummary(result.health)}`);
    response.appendResponseLine(`当前页面: ${result.pagePath}`);
  },
});

export const disconnectDevtoolsTool = defineTool({
  name: 'disconnect_devtools',
  description: '断开与微信开发者工具的连接并清理上下文状态',
  schema: z.object({}),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (_request, response, context) => {
    const status = await context.disconnectDevtools();
    response.appendResponseLine('✅ 已断开连接');
    response.appendResponseLine(`当前状态: ${status.state}`);
  },
});

export const getConnectionStatusTool = defineTool({
  name: 'get_connection_status',
  description: '获取当前连接状态（可选刷新健康检查）',
  schema: statusSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const params = request.params as StatusParams;
    const status = await context.getConnectionStatus({
      refreshHealth: params.refreshHealth,
    });

    response.appendResponseLine(`连接状态: ${status.state}`);
    response.appendResponseLine(`已连接: ${status.connected ? '是' : '否'}`);
    response.appendResponseLine(`策略: ${status.strategyUsed ?? 'N/A'}`);
    response.appendResponseLine(`页面: ${status.pagePath ?? 'N/A'}`);
    response.appendResponseLine(`健康检查: ${formatHealthSummary(status.health)}`);
    if (status.lastError) {
      response.appendResponseLine(`最近错误: [${status.lastError.code}] ${status.lastError.message}`);
    }
  },
});

/**
 * 获取当前页面信息
 */
export const getCurrentPageTool = defineTool({
  name: 'get_current_page',
  description: '获取当前页面信息并设置为活动页面',
  schema: z.object({}),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (_request, response, context) => {
    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    try {
      context.currentPage = await context.miniProgram.currentPage();
      const pagePath = await context.currentPage.path;
      response.appendResponseLine(`当前页面: ${pagePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`获取当前页面失败: ${errorMessage}`);
      throw error;
    }
  },
});
