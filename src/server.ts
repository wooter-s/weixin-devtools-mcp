#!/usr/bin/env node

/**
 * 微信开发者工具自动化 MCP 服务器 (模块化版本)
 * 基于 chrome-devtools-mcp 架构模式重构
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { MiniProgramContext } from './MiniProgramContext.js';
import type { ToolCategory } from './config/tool-category.js';
import {
  parseToolProfileConfig,
  resolveToolDescriptorsByProfile,
} from './config/tool-profile.js';
import type { ElementSnapshot, PageSnapshot, PageStateCommit } from './core/types.js';
import { LeanServer } from './protocol/lean-server.js';
import { loadToolDescriptorManifest } from './protocol/tool-descriptor-manifest.js';
import type * as ToolResultRuntimeModule from './protocol/tool-result.js';
import type { ToolInvocationMeta } from './protocol/tool-result.js';
import type { ToolDefinition, ToolRequest } from './tools/ToolDefinition.js';
import type {
  ToolErrorCode,
  ToolNotice,
  ToolObservation,
} from './tools/result.js';
import {
  loadToolRuntime,
  type ToolRuntimeModule,
} from './tools/runtime-loader.js';
import { extractErrorMessage } from './utils/error.js';
import { PACKAGE_NAME, VERSION } from './version.js';

/**
 * 全局上下文状态 - 使用 MiniProgramContext 类管理
 */
const globalContext = MiniProgramContext.create();

/**
 * 创建 MCP 服务器
 */
const server = new LeanServer(
  {
    name: PACKAGE_NAME,
    version: VERSION,
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * 工具处理器映射
 */
const toolHandlers = new Map<string, ToolDefinition>();

/**
 * 工具 profile 配置与激活结果
 */
const toolProfileConfig = parseToolProfileConfig();
const descriptorManifest = loadToolDescriptorManifest(
  new URL('./protocol/tool-descriptors.generated.json', import.meta.url),
);
const {
  activeTools: activeToolDescriptors,
  disabledTools: disabledToolDescriptors,
} = resolveToolDescriptorsByProfile(descriptorManifest.tools, toolProfileConfig);
const activeToolNames = new Set(activeToolDescriptors.map(tool => tool.name));
let toolRuntimeRegistration: Promise<ToolRuntimeModule> | undefined;
type ToolResultRuntime = typeof ToolResultRuntimeModule;
let toolResultRuntimePromise: Promise<ToolResultRuntime> | undefined;

const MAX_OBSERVATION_DIFF_ITEMS = 20;

function getDisabledToolHint(category: ToolCategory): string {
  return [
    `工具类别: ${category}`,
    `可用启用方式:`,
    `1. --tools-profile=full (启用全部工具)`,
    `2. --enable-categories=${category} (按类别启用)`
  ].join('\n');
}

/**
 * 注册工具到 MCP 服务器
 */
function registerTool(tool: ToolDefinition): void {
  toolHandlers.set(tool.name, tool);
}

async function loadAndRegisterToolRuntime(): Promise<ToolRuntimeModule> {
  toolRuntimeRegistration ??= loadToolRuntime()
    .then(runtime => {
      const implementations = new Map(runtime.allTools.map(tool => [tool.name, tool]));
      if (
        implementations.size !== descriptorManifest.toolCount ||
        descriptorManifest.tools.some(descriptor => !implementations.has(descriptor.name))
      ) {
        throw new Error('工具实现与构建期 descriptor manifest 不一致，请重新执行 npm run build');
      }

      for (const toolName of activeToolNames) {
        const implementation = implementations.get(toolName);
        if (!implementation) {
          throw new Error(`工具 ${toolName} 缺少运行时实现，请重新执行 npm run build`);
        }
        registerTool(implementation);
      }
      return runtime;
    })
    .catch(error => {
      toolRuntimeRegistration = undefined;
      throw error;
    });
  return toolRuntimeRegistration;
}

function loadToolResultRuntime(): Promise<ToolResultRuntime> {
  toolResultRuntimePromise ??= import('./protocol/tool-result.js').catch(error => {
    toolResultRuntimePromise = undefined;
    throw error;
  });
  return toolResultRuntimePromise;
}

function observationIdentity(element: ElementSnapshot, index: number): string {
  const attributes = element.attributes ?? {};
  const stableId = attributes['data-testid'] ?? attributes.id ?? attributes['data-id'];
  return stableId
    ? `${element.tagName}:stable:${stableId}`
    : `${element.tagName}:position:${index}`;
}

function observationFingerprint(element: ElementSnapshot): string {
  return JSON.stringify({
    tagName: element.tagName,
    text: element.text ?? null,
    attributes: element.attributes ?? null,
    position: element.position ?? null,
  });
}

function observationElement(element: ElementSnapshot) {
  return {
    ref: element.ref,
    tagName: element.tagName,
    ...(element.text ? { text: element.text } : {}),
  };
}

function createObservationDiff(previous: PageSnapshot, current: PageSnapshot) {
  const previousByIdentity = new Map(previous.elements.map((element, index) => [
    observationIdentity(element, index),
    element,
  ]));
  const currentByIdentity = new Map(current.elements.map((element, index) => [
    observationIdentity(element, index),
    element,
  ]));

  const added: ReturnType<typeof observationElement>[] = [];
  const changed: ReturnType<typeof observationElement>[] = [];
  const removed: string[] = [];

  for (const [identity, element] of currentByIdentity) {
    const previousElement = previousByIdentity.get(identity);
    if (!previousElement) {
      added.push(observationElement(element));
    } else if (observationFingerprint(previousElement) !== observationFingerprint(element)) {
      changed.push(observationElement(element));
    }
  }
  for (const [identity, element] of previousByIdentity) {
    if (!currentByIdentity.has(identity)) removed.push(element.ref);
  }

  const total = added.length + changed.length + removed.length;
  let remaining = MAX_OBSERVATION_DIFF_ITEMS;
  const boundedAdded = added.slice(0, remaining);
  remaining -= boundedAdded.length;
  const boundedChanged = changed.slice(0, remaining);
  remaining -= boundedChanged.length;
  const boundedRemoved = removed.slice(0, remaining);

  return {
    added: boundedAdded,
    changed: boundedChanged,
    removed: boundedRemoved,
    truncated: total > MAX_OBSERVATION_DIFF_ITEMS,
  };
}

function captureObservation(commit: PageStateCommit): ToolObservation {
  const { snapshot, previousSnapshot: previous } = commit;
  const diff = previous ? createObservationDiff(previous, snapshot) : undefined;
  const changed = commit.domChanged ||
    Boolean(previous && (
      previous.path !== snapshot.path ||
      previous.pageRevision !== snapshot.pageRevision
    )) ||
    Boolean(diff && (diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0));

  return {
    pagePath: snapshot.path,
    pageRevision: snapshot.pageRevision,
    snapshotId: snapshot.snapshotId,
    generatedAt: new Date().toISOString(),
    elementCount: snapshot.elements.length,
    changed,
    ...(diff ? { diff } : {}),
  };
}

function firstSummaryLine(text: string): string {
  return text.split('\n').map(line => line.trim()).find(Boolean) ?? '执行成功';
}

function failureResult(
  resultRuntime: ToolResultRuntime,
  toolName: string,
  error: Error,
  code?: ToolErrorCode,
) {
  return invocationFailureResult(
    resultRuntime,
    resultRuntime.startToolInvocation(toolName),
    error,
    code,
  );
}

function invocationFailureResult(
  resultRuntime: ToolResultRuntime,
  invocation: ToolInvocationMeta,
  error: Error,
  code?: ToolErrorCode,
) {
  const failure = resultRuntime.buildToolFailure(invocation, error, code ? { code } : undefined);
  return {
    content: [{ type: 'text' as const, text: `[${failure.code}] ${failure.error.message}` }],
    structuredContent: { ...failure },
    isError: true,
  };
}

/**
 * 处理资源列表请求
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = [];

  // 连接状态资源
  resources.push({
    uri: "weixin://connection/status",
    mimeType: "application/json",
    name: "连接状态",
    description: "微信开发者工具连接状态"
  });

  // 如果已连接，提供页面快照资源
  if (globalContext.isConnected() && globalContext.currentPage) {
    resources.push({
      uri: "weixin://page/snapshot",
      mimeType: "application/json",
      name: "页面快照",
      description: "当前页面的元素快照"
    });
  }

  return { resources };
});

/**
 * 处理资源读取请求
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);

  // 对于 weixin://connection/status, url.host="connection", url.pathname="/status"
  // 对于 weixin://page/snapshot, url.host="page", url.pathname="/snapshot"
  const resourcePath = `${url.host}${url.pathname}`;

  if (resourcePath === "connection/status") {
    const connectionStatus = await globalContext.getConnectionStatus({ refreshHealth: false });
    const summary = globalContext.getStatusSummary();
    const status = {
      state: connectionStatus.state,
      connectionId: connectionStatus.connectionId,
      connected: connectionStatus.connected,
      hasCurrentPage: connectionStatus.hasCurrentPage,
      pagePath: connectionStatus.pagePath,
      strategyUsed: connectionStatus.strategyUsed,
      endpoint: connectionStatus.endpoint,
      health: connectionStatus.health,
      lastError: connectionStatus.lastError,
      lastConnectedAt: connectionStatus.lastConnectedAt,
      lastHealthCheckAt: connectionStatus.lastHealthCheckAt,
      elementCount: summary.elementCount,
      consoleMonitoring: summary.consoleMonitoring,
      consoleMessageCount: summary.consoleMessageCount,
      networkMonitoring: summary.networkMonitoring,
      networkRequestCount: summary.networkRequestCount
    };

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(status, null, 2)
      }]
    };
  }

  if (resourcePath === "page/snapshot") {
    try {
      const { snapshot: pageSnapshot } = await globalContext.synchronizePageState({
        mode: 'snapshot',
        forceRefresh: true,
      });
      const snapshot = {
        snapshotId: pageSnapshot.snapshotId,
        pageRevision: pageSnapshot.pageRevision,
        path: pageSnapshot.path,
        elementCount: pageSnapshot.elements.length,
        timestamp: new Date().toISOString(),
      };

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(snapshot, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`获取页面快照失败: ${extractErrorMessage(error)}`);
    }
  }

  throw new Error(`未知的资源: ${request.params.uri}`);
});

/**
 * 处理工具列表请求
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: activeToolDescriptors };
});

/**
 * 处理工具调用请求
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const resultRuntimePromise = loadToolResultRuntime();
  if (!activeToolNames.has(toolName)) {
    const resultRuntime = await resultRuntimePromise;
    const disabledTool = disabledToolDescriptors.get(toolName);
    if (disabledTool) {
      const category = disabledTool._meta.category;
      const disabledMessage = category
        ? getDisabledToolHint(category)
        : '请使用 --tools-profile=full 启用全部工具';

      return failureResult(
        resultRuntime,
        toolName,
        new Error(`工具 "${toolName}" 当前未启用。\n${disabledMessage}`),
        'TOOL_DISABLED',
      );
    }

    return failureResult(
      resultRuntime,
      toolName,
      new Error(`未知的工具: ${toolName}`),
      'UNKNOWN_TOOL',
    );
  }

  const runtimeOutcomePromise = loadAndRegisterToolRuntime().then(
    runtime => ({ ok: true as const, runtime }),
    error => ({ ok: false as const, error }),
  );
  const resultRuntime = await resultRuntimePromise;
  const invocation = resultRuntime.startToolInvocation(toolName);
  const runtimeOutcome = await runtimeOutcomePromise;
  if (!runtimeOutcome.ok) {
    const normalizedError = runtimeOutcome.error instanceof Error
      ? runtimeOutcome.error
      : new Error(extractErrorMessage(runtimeOutcome.error));
    return invocationFailureResult(
      resultRuntime,
      invocation,
      normalizedError,
      'INTERNAL_ERROR',
    );
  }

  const runtime = runtimeOutcome.runtime;
  const registeredTool = toolHandlers.get(toolName);
  if (!registeredTool) {
    return invocationFailureResult(
      resultRuntime,
      invocation,
      new Error(`工具 ${toolName} 未完成运行时注册`),
      'INTERNAL_ERROR',
    );
  }
  const tool = registeredTool;

  let validatedParams: unknown;
  try {
    validatedParams = tool.schema.parse(request.params.arguments || {});
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(extractErrorMessage(error));
    return invocationFailureResult(
      resultRuntime,
      invocation,
      normalizedError,
      error instanceof Error && error.name === 'ZodError'
        ? 'INVALID_ARGUMENT'
        : 'INTERNAL_ERROR',
    );
  }

  try {
    // 创建工具请求和响应对象
    const toolRequest: ToolRequest = { params: validatedParams };
    const toolResponse = new runtime.SimpleToolResponse();

    // 执行工具处理器
    await tool.handler(toolRequest, toolResponse, globalContext);

    // 构建响应内容
    const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

    // 添加文本响应
    const responseText = toolResponse.getResponseText();
    if (responseText) {
      content.push({
        type: "text",
        text: responseText
      });
    }

    // 添加附加的图片
    const attachedImages = toolResponse.getAttachedImages();
    for (const image of attachedImages) {
      content.push({
        type: "image",
        data: image.data,
        mimeType: image.mimeType
      });
    }

    const data = toolResponse.getStructuredContent();
    if (Object.keys(data).length === 0) {
      data.summary = firstSummaryLine(responseText);
    }

    let observation: ToolObservation | undefined;
    const warnings: ToolNotice[] = [];
    if (toolResponse.shouldIncludeSnapshot()) {
      let commit: PageStateCommit | undefined;
      try {
        commit = toolResponse.getPageStateCommit() ??
          await globalContext.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
      } catch (error) {
        warnings.push({
          code: 'OBSERVATION_UNAVAILABLE',
          message: `自动页面观察失败: ${extractErrorMessage(error)}`,
        });
      }

      if (commit) {
        const returnedRevision = data.pageRevision;
        if (typeof returnedRevision === 'number' && returnedRevision !== commit.pageRevision) {
          throw new Error(
            `工具 ${tool.name} 返回的 pageRevision=${returnedRevision} 与已提交 revision=${commit.pageRevision} 不一致`,
          );
        }
        const returnedSnapshotId = data.snapshotId;
        if (typeof returnedSnapshotId === 'string' && returnedSnapshotId !== commit.snapshot.snapshotId) {
          throw new Error(
            `工具 ${tool.name} 返回的 snapshotId 与已提交页面状态不一致`,
          );
        }
        observation = captureObservation(commit);
      }
    }

    const structuredContent = resultRuntime.buildToolSuccess(
      tool,
      invocation,
      data,
      observation,
      warnings,
    );

    return {
      content,
      structuredContent: { ...structuredContent },
    };

  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(extractErrorMessage(error));
    return invocationFailureResult(resultRuntime, invocation, normalizedError);
  }
});

const profileSummary = `[ToolProfile] profile=${toolProfileConfig.profile}, active=${activeToolDescriptors.length}, disabled=${disabledToolDescriptors.size}`;
console.error(profileSummary);

/**
 * 启动服务器
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
