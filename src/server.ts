#!/usr/bin/env node

/**
 * 微信开发者工具自动化 MCP 服务器 (模块化版本)
 * 基于 chrome-devtools-mcp 架构模式重构
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { MiniProgramContext } from './MiniProgramContext.js';
import type { ToolCategory } from './config/tool-category.js';
import {
  parseToolProfileConfig,
  resolveToolDescriptorsByProfile,
  summarizeToolProfile,
} from './config/tool-profile.js';
import type { ElementSnapshot, PageSnapshot, PageStateCommit } from './core/types.js';
import { LeanServer } from './protocol/lean-server.js';
import {
  sanitizePublicObject,
  sanitizePublicText,
} from './protocol/public-sanitizer.js';
import {
  assertToolDescriptorsMatchManifest,
  loadToolDescriptorManifest,
} from './protocol/tool-descriptor-manifest.js';
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
  type RuntimeToolResponse,
  type ToolRuntimeModule,
} from './tools/runtime-loader.js';
import { extractErrorMessage } from './utils/error.js';
import { PACKAGE_NAME, VERSION } from './version.js';

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
const toolProfileSummary = summarizeToolProfile(
  toolProfileConfig,
  { activeTools: activeToolDescriptors, disabledTools: disabledToolDescriptors },
  tool => tool._meta.category,
);
const globalContext = MiniProgramContext.create({ toolProfile: toolProfileSummary });
const activeToolNames = new Set(activeToolDescriptors.map(tool => tool.name));
let toolRuntimeRegistration: Promise<ToolRuntimeModule> | undefined;
type ToolResultRuntime = typeof ToolResultRuntimeModule;
let toolResultRuntimePromise: Promise<ToolResultRuntime> | undefined;

const MAX_OBSERVATION_DIFF_ITEMS = 20;
const CONNECTION_STATUS_RESOURCE_URI = 'weixin://connection/status';
const PAGE_SNAPSHOT_RESOURCE_URI = 'weixin://page/snapshot';

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
  toolRuntimeRegistration ??= Promise.all([
    loadToolRuntime(),
    import('./protocol/tool-descriptors.js'),
  ])
    .then(([runtime, descriptorRuntime]) => {
      const runtimeDescriptors = descriptorRuntime.buildToolDescriptors(runtime.allTools);
      assertToolDescriptorsMatchManifest(descriptorManifest, runtimeDescriptors);
      const implementations = new Map(runtime.allTools.map(tool => [tool.name, tool]));

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

function observationIdentity(element: ElementSnapshot, index: number, scopeId: string): string {
  const attributes = element.attributes ?? {};
  const stableId = attributes['data-testid'] ?? attributes.id ?? attributes['data-id'];
  return stableId
    ? `${scopeId}:${element.tagName}:stable:${stableId}`
    : `${scopeId}:${element.tagName}:position:${index}`;
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

function scopedSnapshotElements(snapshot: PageSnapshot) {
  const scopes = snapshot.scopes;
  if (!scopes) {
    return snapshot.elements.map((element, index) => ({
      scopeId: snapshot.rootScopeId ?? 'scope_0',
      element,
      index,
    }));
  }
  return scopes.flatMap(scope => scope.elements.map((element, index) => ({
    scopeId: scope.scopeId,
    element,
    index,
  })));
}

function createObservationDiff(previous: PageSnapshot, current: PageSnapshot) {
  const previousByIdentity = new Map(scopedSnapshotElements(previous).map(entry => [
    observationIdentity(entry.element, entry.index, entry.scopeId),
    entry.element,
  ]));
  const currentByIdentity = new Map(scopedSnapshotElements(current).map(entry => [
    observationIdentity(entry.element, entry.index, entry.scopeId),
    entry.element,
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
    elementCount: snapshot.usage?.elements ?? scopedSnapshotElements(snapshot).length,
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
    { code },
  );
}

type McpToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

function responseContent(
  response: RuntimeToolResponse,
  options: { sanitizeText?: boolean } = {},
): McpToolContent[] {
  const content: McpToolContent[] = [];
  const text = response.getResponseText();
  if (text) {
    content.push({
      type: 'text',
      text: options.sanitizeText ? sanitizePublicText(text, null) : text,
    });
  }
  for (const image of response.getAttachedImages()) {
    content.push({ type: 'image', data: image.data, mimeType: image.mimeType });
  }
  return content;
}

function invocationFailureResult(
  resultRuntime: ToolResultRuntime,
  invocation: ToolInvocationMeta,
  error: Error,
  options: {
    code?: ToolErrorCode;
    response?: RuntimeToolResponse;
  } = {},
) {
  const partialData = options.response?.getStructuredContent();
  const warnings: ToolNotice[] = [];
  let observation: ToolObservation | undefined;
  const commit = options.response?.getPageStateCommit();
  if (commit) {
    try {
      observation = captureObservation(commit);
    } catch (observationError) {
      warnings.push({
        code: 'OBSERVATION_UNAVAILABLE',
        message: `已提交页面观察无法序列化: ${extractErrorMessage(observationError)}`,
      });
    }
  }
  const failure = resultRuntime.buildToolFailure(invocation, error, {
    code: options.code,
    partialData: partialData && Object.keys(partialData).length > 0 ? partialData : undefined,
    observation,
    warnings,
  });
  const content: McpToolContent[] = [
    { type: 'text', text: `[${failure.code}] ${failure.error.message}` },
  ];
  if (options.response) {
    content.push(...responseContent(options.response, { sanitizeText: true }));
  }
  return {
    content,
    structuredContent: { ...failure },
    isError: true,
  };
}

/**
 * 处理资源列表请求
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [{
      uri: CONNECTION_STATUS_RESOURCE_URI,
      mimeType: "application/json",
      name: "连接状态",
      description: "连接、工具 profile 与监听生命周期状态"
    }, {
      uri: PAGE_SNAPSHOT_RESOURCE_URI,
      mimeType: "application/json",
      name: "页面快照",
      description: "当前页面的 V2 作用域图快照（读取时需要已连接）"
    }],
  };
});

/**
 * 处理资源读取请求
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === CONNECTION_STATUS_RESOURCE_URI) {
    const connectionStatus = await globalContext.getConnectionStatus({ refreshHealth: false });
    const summary = globalContext.getStatusSummary();
    const runtimeStatus = globalContext.getRuntimeStatus();
    const status = {
      schemaVersion: '2.0',
      state: connectionStatus.state,
      connectionId: connectionStatus.connectionId,
      connected: connectionStatus.connected,
      hasCurrentPage: connectionStatus.hasCurrentPage,
      pagePath: connectionStatus.pagePath,
      method: connectionStatus.strategyUsed,
      endpoint: connectionStatus.endpoint,
      health: connectionStatus.health,
      lastError: connectionStatus.lastError,
      lastConnectedAt: connectionStatus.lastConnectedAt,
      lastHealthCheckAt: connectionStatus.lastHealthCheckAt,
      elementCount: summary.elementCount,
      consoleMessageCount: summary.consoleMessageCount,
      networkRequestCount: summary.networkRequestCount,
      ...runtimeStatus,
    };

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(sanitizePublicObject(status), null, 2)
      }]
    };
  }

  if (request.params.uri === PAGE_SNAPSHOT_RESOURCE_URI) {
    if (!globalContext.isConnected()) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        '获取页面快照失败: 请先连接微信开发者工具',
      );
    }
    if (!globalContext.currentPage) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        '获取页面快照失败: 当前没有活动页面',
      );
    }

    try {
      const { snapshot: pageSnapshot } = await globalContext.capturePageSnapshot();
      const rootScopeId = pageSnapshot.rootScopeId ?? 'scope_0';
      const scopes = (pageSnapshot.scopes ?? [{
        scopeId: rootScopeId,
        kind: 'page' as const,
        depth: 0,
        status: 'complete' as const,
        elements: pageSnapshot.elements,
      }]).map(scope => ({
        scopeId: scope.scopeId,
        kind: scope.kind,
        rootRef: scope.rootRef ?? null,
        depth: scope.depth,
        status: scope.status,
        reason: scope.reason ?? null,
        elements: scope.elements,
      }));
      const snapshot = {
        schemaVersion: '2.0',
        snapshotId: pageSnapshot.snapshotId,
        pageRevision: pageSnapshot.pageRevision,
        path: pageSnapshot.path,
        rootScopeId,
        complete: pageSnapshot.complete ?? scopes.every(scope => scope.status === 'complete'),
        budget: pageSnapshot.budget,
        usage: pageSnapshot.usage,
        scopes,
        edges: pageSnapshot.edges ?? [],
      };

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(snapshot, null, 2)
        }]
      };
    } catch (error) {
      if (!globalContext.isConnected() || !globalContext.currentPage) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `获取页面快照失败: ${sanitizePublicText(extractErrorMessage(error))}`,
        );
      }
      throw new Error(`获取页面快照失败: ${sanitizePublicText(extractErrorMessage(error))}`);
    }
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    `未知的资源: ${sanitizePublicText(request.params.uri)}`,
  );
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
      { code: 'INTERNAL_ERROR' },
    );
  }

  const runtime = runtimeOutcome.runtime;
  const registeredTool = toolHandlers.get(toolName);
  if (!registeredTool) {
    return invocationFailureResult(
      resultRuntime,
      invocation,
      new Error(`工具 ${toolName} 未完成运行时注册`),
      { code: 'INTERNAL_ERROR' },
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
      {
        code: error instanceof Error && error.name === 'ZodError'
          ? 'INVALID_ARGUMENT'
          : 'INTERNAL_ERROR',
      },
    );
  }

  const toolResponse = new runtime.SimpleToolResponse();
  try {
    // 创建工具请求和响应对象
    const toolRequest: ToolRequest = { params: validatedParams };

    // 执行工具处理器
    await tool.handler(toolRequest, toolResponse, globalContext);

    const content = responseContent(toolResponse);
    const responseText = toolResponse.getResponseText();

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
      isError: false,
    };

  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(extractErrorMessage(error));
    return invocationFailureResult(resultRuntime, invocation, normalizedError, {
      response: toolResponse,
    });
  }
});

const profileSummary = [
  `[ToolProfile] profile=${toolProfileSummary.profile}`,
  `active=${toolProfileSummary.activeToolCount}`,
  `disabled=${toolProfileSummary.disabledToolCount}`,
  `categories=${toolProfileSummary.activeCategories.join(',') || 'none'}`,
].join(', ');
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
