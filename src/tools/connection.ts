/**
 * 连接管理工具
 * 提供 connect / reconnect / disconnect / status 能力
 */
import { z } from 'zod';

import type { ConnectionHealth, ConnectionRequest } from '../connection/index.js';

import type { ToolContext, ToolResponse } from './ToolDefinition.js';
import {
  defineTool,
  ToolCategory,
  ensureMiniProgram,
  extractErrorMessage,
  ResponseFormatter,
  runPageStateOperation,
} from './ToolDefinition.js';
import { jsonValueSchema, toJsonValue } from './result.js';

const strategyEnum = z.enum(['auto', 'launch', 'connect', 'wsEndpoint', 'browserUrl', 'discover']);

const connectionDataSchema = z.object({
  connectionId: z.string(),
  state: z.enum(['connected', 'degraded']),
  strategy: strategyEnum,
  endpoint: z.string().nullable(),
  pagePath: z.string(),
  pageRevision: z.number().int().nonnegative(),
  health: jsonValueSchema,
  timing: jsonValueSchema,
  warnings: z.array(z.string()),
});

const connectionStatusDataSchema = z.object({
  state: z.enum(['disconnected', 'connecting', 'connected', 'degraded']),
  connected: z.boolean(),
  connectionId: z.string().nullable(),
  strategy: strategyEnum.nullable(),
  endpoint: z.string().nullable(),
  pagePath: z.string().nullable(),
  pageRevision: z.number().int().nonnegative(),
  health: jsonValueSchema,
  lastError: jsonValueSchema,
});

const connectSchema = z.object({
  strategy: strategyEnum
    .optional()
    .default('auto')
    .describe('连接策略: auto/launch/connect/wsEndpoint/browserUrl/discover'),
  projectPath: z.string().optional().describe('小程序项目的绝对路径'),
  cliPath: z.string().optional().describe('微信开发者工具 CLI 绝对路径（可选）'),
  autoPort: z.number().optional().describe('自动化监听端口（可选）'),
  browserUrl: z
    .string()
    .optional()
    .describe('已运行实例的 HTTP 调试地址，如 http://127.0.0.1:9222'),
  wsEndpoint: z.string().optional().describe('已运行实例的 WS 地址，如 ws://127.0.0.1:9420'),
  wsHeaders: z.record(z.string()).optional().describe('WS 自定义请求头'),
  timeoutMs: z.number().optional().default(45000).describe('连接超时时间（毫秒）'),
  fallback: z.array(strategyEnum).optional().describe('连接失败时的回退策略序列'),
  healthCheck: z.boolean().optional().default(true).describe('是否执行连接健康检查'),
  autoDiscover: z
    .boolean()
    .optional()
    .default(true)
    .describe('auto 策略下是否优先尝试自动发现端点'),
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

async function reportAutomaticMonitoring(
  context: ToolContext,
  response: ToolResponse
): Promise<void> {
  const managedContext = context as ToolContext & {
    startAutomaticMonitoring?: () => Promise<{
      consoleStarted: boolean;
      networkStarted: boolean;
      warnings: string[];
    }>;
  };

  if (!managedContext.startAutomaticMonitoring) {
    response.appendResponseLine(
      ResponseFormatter.warning('当前上下文不支持统一监听生命周期，已跳过自动监听')
    );
    return;
  }

  const result = await managedContext.startAutomaticMonitoring();
  if (result.consoleStarted) {
    response.appendResponseLine(ResponseFormatter.success('Console监听已自动启动'));
  }
  if (result.networkStarted) {
    response.appendResponseLine(ResponseFormatter.success('网络监听已自动启动'));
  }
  for (const warning of result.warnings) {
    response.appendResponseLine(ResponseFormatter.warning(warning));
  }
}

export const connectDevtoolsTool = defineTool({
  name: 'connect_devtools',
  description: '连接微信开发者工具，支持多入口策略和自动回退',
  schema: connectSchema,
  outputSchema: connectionDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const result = await context.connectDevtools(toConnectionRequest(request.params));
    await reportAutomaticMonitoring(context, response);

    response.appendResponseLine(ResponseFormatter.success('连接成功'));
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
    response.mergeStructuredContent({
      connectionId: result.connectionId,
      state: result.status,
      strategy: result.strategyUsed,
      endpoint: result.endpoint,
      pagePath: result.pagePath,
      pageRevision: context.getPageRevision(),
      health: toJsonValue(result.health),
      timing: toJsonValue(result.timing),
      warnings: result.warnings,
    });
  },
});

export const reconnectDevtoolsTool = defineTool({
  name: 'reconnect_devtools',
  description: '重新连接微信开发者工具，可复用上一次连接参数',
  schema: reconnectSchema,
  outputSchema: connectionDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const params = toConnectionRequest(request.params);
    const hasOverride = Object.values(params).some((value) => value !== undefined);
    const result = hasOverride
      ? await context.reconnectDevtools(params)
      : await context.reconnectDevtools();
    await reportAutomaticMonitoring(context, response);

    response.appendResponseLine(ResponseFormatter.success('重连成功'));
    response.appendResponseLine(`连接ID: ${result.connectionId}`);
    response.appendResponseLine(`策略: ${result.strategyUsed}`);
    response.appendResponseLine(`连接状态: ${result.status}`);
    response.appendResponseLine(`健康检查: ${formatHealthSummary(result.health)}`);
    response.appendResponseLine(`当前页面: ${result.pagePath}`);
    response.mergeStructuredContent({
      connectionId: result.connectionId,
      state: result.status,
      strategy: result.strategyUsed,
      endpoint: result.endpoint,
      pagePath: result.pagePath,
      pageRevision: context.getPageRevision(),
      health: toJsonValue(result.health),
      timing: toJsonValue(result.timing),
      warnings: result.warnings,
    });
  },
});

export const disconnectDevtoolsTool = defineTool({
  name: 'disconnect_devtools',
  description: '断开与微信开发者工具的连接并清理上下文状态',
  schema: z.object({}),
  outputSchema: z.object({ state: z.literal('disconnected'), connected: z.literal(false) }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (_request, response, context) => {
    const status = await context.disconnectDevtools();
    response.appendResponseLine(ResponseFormatter.success('已断开连接'));
    response.appendResponseLine(`当前状态: ${status.state}`);
    response.mergeStructuredContent({ state: 'disconnected', connected: false });
  },
});

export const getConnectionStatusTool = defineTool({
  name: 'get_connection_status',
  description: '获取当前连接状态（可选刷新健康检查）',
  schema: statusSchema,
  outputSchema: connectionStatusDataSchema,
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
      response.appendResponseLine(
        `最近错误: [${status.lastError.code}] ${status.lastError.message}`
      );
    }
    response.mergeStructuredContent({
      state: status.state,
      connected: status.connected,
      connectionId: status.connectionId,
      strategy: status.strategyUsed,
      endpoint: status.endpoint,
      pagePath: status.pagePath,
      pageRevision: context.getPageRevision(),
      health: toJsonValue(status.health),
      lastError: toJsonValue(status.lastError),
    });
  },
});

/**
 * 获取当前页面信息
 */
export const getCurrentPageTool = defineTool({
  name: 'get_current_page',
  description: '获取当前页面信息并设置为活动页面',
  schema: z.object({}),
  outputSchema: z.object({
    pagePath: z.string(),
    pageRevision: z.number().int().nonnegative(),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (_request, response, context) => {
    ensureMiniProgram(context);

    try {
      const { pagePath, pageRevision } = await runPageStateOperation(context, async () => {
        context.currentPage = await context.syncCurrentPage();
        return {
          pagePath: await context.currentPage.path,
          pageRevision: context.getPageRevision(),
        };
      });
      response.appendResponseLine(`当前页面: ${pagePath}`);
      response.mergeStructuredContent({
        pagePath,
        pageRevision,
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`获取当前页面失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 connect_devtools 工具建立连接'));
      throw error;
    }
  },
});
