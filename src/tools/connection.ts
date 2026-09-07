/**
 * 连接管理工具
 * 提供 connect / reconnect / disconnect / status 能力。
 */
import { z } from 'zod';

import type {
  ConnectionHealth,
  ConnectionRequest,
  ConnectionTarget,
} from '../connection/index.js';
import {
  sanitizePublicObject,
  sanitizePublicText,
  sanitizePublicUrl,
} from '../protocol/public-sanitizer.js';
import type { RuntimeStatusMetadata } from '../runtime-status.js';

import type { ToolContext } from './ToolDefinition.js';
import {
  defineTool,
  ToolCategory,
  ensureMiniProgram,
  extractErrorMessage,
  ResponseFormatter,
  runPageStateOperation,
} from './ToolDefinition.js';
import { jsonValueSchema } from './result.js';

const connectionMethodSchema = z.enum([
  'launch',
  'connect',
  'wsEndpoint',
  'browserUrl',
  'discover',
]);

const projectTargetSchema = z.object({
  kind: z.literal('project'),
  projectPath: z.string().min(1),
  cliPath: z.string().min(1).optional(),
  autoPort: z.number().int().min(1).max(65_535).optional(),
  autoAudits: z.boolean().optional(),
}).strict();

const connectionTargetSchema = z.discriminatedUnion('kind', [
  projectTargetSchema,
  z.object({
    kind: z.literal('wsEndpoint'),
    endpoint: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('browserUrl'),
    url: z.string().min(1),
  }).strict(),
  z.object({ kind: z.literal('discover') }).strict(),
]);

const connectSchema = z.object({
  target: connectionTargetSchema,
  timeoutMs: z.number().positive().optional().default(45_000),
  healthCheck: z.boolean().optional().default(true),
}).strict();

const reconnectSchema = z.object({
  target: connectionTargetSchema.optional(),
  timeoutMs: z.number().positive().optional(),
  healthCheck: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (!value.target && (value.timeoutMs !== undefined || value.healthCheck !== undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '覆盖 timeoutMs/healthCheck 时必须同时提供完整 target',
      path: ['target'],
    });
  }
});

const monitoringFeatureSchema = z.object({
  enabled: z.boolean(),
  state: z.enum(['disabled', 'idle', 'running', 'stopped', 'failed']),
  startedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

const runtimeMetadataSchema = {
  toolProfile: z.object({
    profile: z.enum(['core', 'full', 'minimal']),
    activeToolCount: z.number().int().nonnegative(),
    disabledToolCount: z.number().int().nonnegative(),
    activeCategories: z.array(z.enum(['core', 'console', 'network', 'debug'])),
    inactiveCategories: z.array(z.enum(['core', 'console', 'network', 'debug'])),
  }),
  monitoring: z.object({
    console: monitoringFeatureSchema,
    network: monitoringFeatureSchema,
  }),
};

const connectionDataSchema = z.object({
  connectionId: z.string(),
  state: z.enum(['connected', 'degraded']),
  method: connectionMethodSchema,
  endpoint: z.string().nullable(),
  pagePath: z.string(),
  pageRevision: z.number().int().nonnegative(),
  health: jsonValueSchema,
  timing: jsonValueSchema,
  attempts: z.array(jsonValueSchema),
  warnings: z.array(z.string()),
});

const connectionStatusDataSchema = z.object({
  state: z.enum(['disconnected', 'connecting', 'connected', 'degraded']),
  connected: z.boolean(),
  connectionId: z.string().nullable(),
  method: connectionMethodSchema.nullable(),
  endpoint: z.string().nullable(),
  pagePath: z.string().nullable(),
  pageRevision: z.number().int().nonnegative(),
  health: jsonValueSchema,
  lastError: jsonValueSchema,
  ...runtimeMetadataSchema,
});

const statusSchema = z.object({
  refreshHealth: z.boolean().optional().default(true).describe('是否刷新健康检查状态'),
}).strict();

type ReconnectParams = z.infer<typeof reconnectSchema>;
type StatusParams = z.infer<typeof statusSchema>;

function cloneTarget(target: ConnectionTarget): ConnectionTarget {
  return { ...target };
}

function toConnectionRequest(params: {
  target: ConnectionTarget;
  timeoutMs?: number;
  healthCheck?: boolean;
}): ConnectionRequest {
  return {
    target: cloneTarget(params.target),
    timeoutMs: params.timeoutMs,
    healthCheck: params.healthCheck,
  };
}

function formatHealthSummary(health: ConnectionHealth | null): string {
  if (!health) return 'unknown';
  return `${health.level} (${health.checks.length} checks)`;
}

function getRuntimeMetadata(context: ToolContext): RuntimeStatusMetadata {
  const managedContext = context as ToolContext & {
    getRuntimeStatus?: () => RuntimeStatusMetadata;
  };
  if (managedContext.getRuntimeStatus) {
    return managedContext.getRuntimeStatus();
  }

  const consoleRunning = context.consoleStorage.isMonitoring;
  const networkRunning = context.networkStorage.isMonitoring;
  return {
    toolProfile: {
      profile: 'core',
      activeToolCount: 0,
      disabledToolCount: 0,
      activeCategories: [ToolCategory.CORE],
      inactiveCategories: [ToolCategory.CONSOLE, ToolCategory.NETWORK, ToolCategory.DEBUG],
    },
    monitoring: {
      console: {
        enabled: consoleRunning,
        state: consoleRunning ? 'running' : 'disabled',
        startedAt: context.consoleStorage.startTime,
        lastError: null,
      },
      network: {
        enabled: networkRunning,
        state: networkRunning ? 'running' : 'disabled',
        startedAt: context.networkStorage.startTime,
        lastError: null,
      },
    },
  };
}

function appendMonitoringSummary(response: { appendResponseLine(text: string): void }, metadata: RuntimeStatusMetadata): void {
  response.appendResponseLine(
    `监听: console=${metadata.monitoring.console.state}, network=${metadata.monitoring.network.state}`
  );
}

function runtimeStructuredData(metadata: RuntimeStatusMetadata) {
  return sanitizePublicObject(metadata);
}

function connectionStructuredData(
  context: ToolContext,
  result: Awaited<ReturnType<ToolContext['connectDevtools']>>,
) {
  return sanitizePublicObject({
    connectionId: result.connectionId,
    state: result.status,
    method: result.strategyUsed,
    endpoint: result.endpoint,
    pagePath: result.pagePath,
    pageRevision: context.getPageRevision(),
    health: result.health,
    timing: result.timing,
    attempts: result.attempts,
    warnings: result.warnings,
  });
}

export const connectDevtoolsTool = defineTool({
  name: 'connect_devtools',
  description: '连接一个明确的微信开发者工具目标；project 固定按 launch → connect 尝试',
  schema: connectSchema,
  outputSchema: connectionDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const result = await context.connectDevtools(toConnectionRequest(request.params));
    const data = connectionStructuredData(context, result);
    const runtime = getRuntimeMetadata(context);

    response.appendResponseLine(ResponseFormatter.success('连接成功'));
    response.appendResponseLine(`连接ID: ${result.connectionId}`);
    response.appendResponseLine(`方式: ${result.strategyUsed}`);
    response.appendResponseLine(`连接状态: ${result.status}`);
    response.appendResponseLine(`健康检查: ${formatHealthSummary(result.health)}`);
    response.appendResponseLine(`当前页面: ${sanitizePublicText(result.pagePath, null)}`);
    response.appendResponseLine(`尝试次数: ${result.attempts.length}`);
    if (result.endpoint) response.appendResponseLine(`端点: ${sanitizePublicUrl(result.endpoint)}`);
    appendMonitoringSummary(response, runtime);
    for (const warning of result.warnings) {
      response.appendResponseLine(ResponseFormatter.warning(sanitizePublicText(warning)));
    }
    response.mergeStructuredContent(data);
  },
});

export const reconnectDevtoolsTool = defineTool({
  name: 'reconnect_devtools',
  description: '不传参数时完整复用上次成功请求；传入 target 时以完整新请求替换',
  schema: reconnectSchema,
  outputSchema: connectionDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const params = request.params as ReconnectParams;
    const result = params.target
      ? await context.reconnectDevtools(toConnectionRequest({ ...params, target: params.target }))
      : await context.reconnectDevtools();
    const data = connectionStructuredData(context, result);
    const runtime = getRuntimeMetadata(context);

    response.appendResponseLine(ResponseFormatter.success('重连成功'));
    response.appendResponseLine(`连接ID: ${result.connectionId}`);
    response.appendResponseLine(`方式: ${result.strategyUsed}`);
    response.appendResponseLine(`连接状态: ${result.status}`);
    response.appendResponseLine(`当前页面: ${sanitizePublicText(result.pagePath, null)}`);
    response.appendResponseLine(`尝试次数: ${result.attempts.length}`);
    appendMonitoringSummary(response, runtime);
    response.mergeStructuredContent(data);
  },
});

export const disconnectDevtoolsTool = defineTool({
  name: 'disconnect_devtools',
  description: '断开与微信开发者工具的连接并清理上下文状态',
  schema: z.object({}).strict(),
  outputSchema: z.object({
    state: z.literal('disconnected'),
    connected: z.literal(false),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (_request, response, context) => {
    const status = await context.disconnectDevtools();
    const runtime = getRuntimeMetadata(context);
    response.appendResponseLine(ResponseFormatter.success('已断开连接'));
    response.appendResponseLine(`当前状态: ${status.state}`);
    appendMonitoringSummary(response, runtime);
    response.mergeStructuredContent({ state: 'disconnected', connected: false });
  },
});

export const getConnectionStatusTool = defineTool({
  name: 'get_connection_status',
  description: '获取连接、工具 profile 与监听生命周期状态',
  schema: statusSchema,
  outputSchema: connectionStatusDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const params = request.params as StatusParams;
    const status = await context.getConnectionStatus({ refreshHealth: params.refreshHealth });
    const runtime = getRuntimeMetadata(context);

    response.appendResponseLine(`连接状态: ${status.state}`);
    response.appendResponseLine(`已连接: ${status.connected ? '是' : '否'}`);
    response.appendResponseLine(`方式: ${status.strategyUsed ?? 'N/A'}`);
    response.appendResponseLine(
      `页面: ${status.pagePath ? sanitizePublicText(status.pagePath, null) : 'N/A'}`
    );
    response.appendResponseLine(`健康检查: ${formatHealthSummary(status.health)}`);
    appendMonitoringSummary(response, runtime);
    if (status.lastError) {
      response.appendResponseLine(
        `最近错误: [${status.lastError.code}] ${sanitizePublicText(status.lastError.message)}`
      );
    }
    response.mergeStructuredContent(sanitizePublicObject({
      state: status.state,
      connected: status.connected,
      connectionId: status.connectionId,
      method: status.strategyUsed,
      endpoint: status.endpoint,
      pagePath: status.pagePath,
      pageRevision: context.getPageRevision(),
      health: status.health,
      lastError: status.lastError,
      ...runtimeStructuredData(runtime),
    }));
  },
});

/** 获取当前页面信息。 */
export const getCurrentPageTool = defineTool({
  name: 'get_current_page',
  description: '获取当前页面信息并设置为活动页面',
  schema: z.object({}).strict(),
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
      response.appendResponseLine(`当前页面: ${sanitizePublicText(pagePath, null)}`);
      response.mergeStructuredContent(sanitizePublicObject({ pagePath, pageRevision }));
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`获取当前页面失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 connect_devtools 工具建立连接'));
      throw error;
    }
  },
});
