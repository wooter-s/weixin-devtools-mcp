import type { MiniProgram } from 'miniprogram-automator';

import {
  connectDevtoolsEnhanced,
  detectIDEPort,
} from '../core/connection.js';
import type { EnhancedConnectOptions } from '../core/types.js';
import { loadMiniProgramAutomator } from '../utils/automator-loader.js';

import { waitForAutomation } from './automation-probe.js';
import {
  ConnectionError,
  EnvironmentConnectionError,
  ProtocolConnectionError,
  SessionConflictConnectionError,
} from './errors.js';
import type { ProjectStartup } from './project-startup.js';
import type {
  AdapterConnectionResult,
  ConnectionAttemptMethod,
  ConnectionAttemptSpec,
  ProjectConnectionTarget,
} from './types.js';

export interface ConnectionStrategyExecutionOptions {
  /** 仅允许由 MiniProgramContext 为已验证过的同一 project/port 会话提供。 */
  trustedProjectEndpoint?: string;
  projectStartup?: ProjectStartup;
}

function extractMessage(error: Error): string {
  return error.message.toLowerCase();
}

function buildEnhancedOptions(
  target: ProjectConnectionTarget,
  mode: Extract<ConnectionAttemptMethod, 'launch' | 'connect'>,
  timeoutMs: number,
): EnhancedConnectOptions {
  return {
    projectPath: target.projectPath,
    mode,
    cliPath: target.cliPath,
    autoPort: target.autoPort,
    timeout: timeoutMs,
    fallbackMode: false,
    healthCheck: false,
    verbose: false,
    autoAudits: target.autoAudits,
  };
}

function ensurePagePath(pagePath: string): string {
  if (!pagePath) {
    throw new ProtocolConnectionError('连接成功但当前页面路径为空', [
      '请确认开发者工具中项目已成功打开',
    ]);
  }
  return pagePath;
}

async function connectProject(
  attempt: Extract<ConnectionAttemptSpec, { method: 'launch' | 'connect' }>,
  timeoutMs: number,
  startup?: ProjectStartup,
): Promise<AdapterConnectionResult> {
  try {
    const result = await connectDevtoolsEnhanced(
      buildEnhancedOptions(attempt.target, attempt.method, timeoutMs),
      startup,
    );
    const endpointPort = result.processInfo?.port ?? attempt.target.autoPort;
    const endpoint = endpointPort ? `ws://127.0.0.1:${endpointPort}` : null;
    const pagePath = ensurePagePath(result.pagePath);

    return {
      strategyUsed: attempt.method,
      endpoint,
      miniProgram: result.miniProgram,
      currentPage: result.currentPage,
      pagePath,
    };
  } catch (error) {
    if (error instanceof ConnectionError) {
      throw error;
    }
    const baseError = error instanceof Error ? error : new Error(String(error));
    const message = extractMessage(baseError);
    if (
      message.includes('session') ||
      message.includes('already') ||
      message.includes('conflict') ||
      message.includes('会话') ||
      message.includes('冲突') ||
      (message.includes('port') && message.includes('in use')) ||
      (message.includes('端口') && message.includes('占用'))
    ) {
      throw new SessionConflictConnectionError(
        baseError.message,
        {
          method: attempt.method,
          projectPath: attempt.target.projectPath,
          ...(attempt.target.autoPort ? { port: attempt.target.autoPort } : {}),
        },
        baseError,
      );
    }
    throw new EnvironmentConnectionError(
      baseError.message,
      attempt.method === 'launch' ? 'startup' : 'connect',
      ['检查 projectPath、cliPath 与微信开发者工具启动状态'],
      {
        method: attempt.method,
        projectPath: attempt.target.projectPath,
      },
      baseError,
    );
  }
}

async function connectByWsEndpoint(
  wsEndpoint: string,
  strategyUsed: Extract<ConnectionAttemptMethod, 'connect' | 'wsEndpoint' | 'browserUrl' | 'discover'>,
  timeoutMs: number,
): Promise<AdapterConnectionResult> {
  let candidate: MiniProgram | null = null;
  try {
    const startedAt = Date.now();
    await waitForAutomation(wsEndpoint, Math.max(1, timeoutMs - 25));
    const automator = await loadMiniProgramAutomator();
    candidate = await automator.connect({ wsEndpoint, timeout: Math.max(1, timeoutMs - (Date.now() - startedAt)) });
    const currentPage = await candidate.currentPage();
    if (!currentPage) {
      throw new ProtocolConnectionError('端点已连接但 currentPage 不可用', [
        '确认目标 DevTools 实例已打开小程序项目',
      ]);
    }

    const pagePath = ensurePagePath(await currentPage.path);
    return {
      strategyUsed,
      endpoint: wsEndpoint,
      miniProgram: candidate,
      currentPage,
      pagePath,
    };
  } catch (error) {
    if (candidate) {
      try {
        await candidate.disconnect();
      } catch {
        // 候选清理失败不覆盖原始协议错误。
      }
    }
    if (error instanceof ConnectionError) {
      throw error;
    }
    const baseError = error instanceof Error ? error : new Error(String(error));
    throw new ProtocolConnectionError(
      baseError.message,
      ['确认端点可访问，且端点属于微信开发者工具自动化端口'],
      { wsEndpoint, method: strategyUsed },
      baseError,
    );
  }
}

function parseWebSocketDebuggerUrl(payload: {
  webSocketDebuggerUrl?: string;
  websocketDebuggerUrl?: string;
}): string {
  const endpoint = payload.webSocketDebuggerUrl ?? payload.websocketDebuggerUrl;
  if (!endpoint) {
    throw new EnvironmentConnectionError(
      'browserUrl 未返回 webSocketDebuggerUrl',
      'connect',
      ['确认目标地址支持 /json/version 并开启远程调试'],
    );
  }
  return endpoint;
}

async function resolveWsEndpointByBrowserUrl(
  browserUrl: string,
  timeoutMs: number,
): Promise<string> {
  const normalizedBase = browserUrl.endsWith('/') ? browserUrl.slice(0, -1) : browserUrl;
  const versionUrl = `${normalizedBase}/json/version`;

  let response: Response;
  try {
    response = await fetch(versionUrl, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const baseError = error instanceof Error ? error : new Error(String(error));
    throw new EnvironmentConnectionError(
      `请求 browserUrl 失败: ${baseError.message}`,
      'connect',
      ['确认 browserUrl 可访问，例如 http://127.0.0.1:9222'],
      { browserUrl },
      baseError,
    );
  }

  if (!response.ok) {
    throw new EnvironmentConnectionError(
      `browserUrl 返回非成功状态: ${response.status}`,
      'connect',
      ['确认远程调试服务已开启并允许访问 /json/version'],
      { browserUrl, status: response.status },
    );
  }

  const payload = await response.json() as {
    webSocketDebuggerUrl?: string;
    websocketDebuggerUrl?: string;
  };
  return parseWebSocketDebuggerUrl(payload);
}

async function connectByBrowserUrl(
  browserUrl: string,
  timeoutMs: number,
): Promise<AdapterConnectionResult> {
  const startedAt = Date.now();
  const endpoint = await resolveWsEndpointByBrowserUrl(browserUrl, timeoutMs);
  const remaining = timeoutMs - (Date.now() - startedAt);
  if (remaining <= 0) {
    throw new EnvironmentConnectionError('解析 browserUrl 后连接总预算已耗尽', 'connect');
  }
  return connectByWsEndpoint(endpoint, 'browserUrl', remaining);
}

async function connectByDiscover(timeoutMs: number): Promise<AdapterConnectionResult> {
  const startedAt = Date.now();
  const port = await detectIDEPort(false, timeoutMs);
  if (port === null) {
    throw new EnvironmentConnectionError(
      '自动发现失败：未检测到可用的微信开发者工具自动化端口',
      'startup',
      [
        '先在微信开发者工具中开启自动化能力',
        '需要指定项目时改用 project target',
      ],
    );
  }

  const remaining = timeoutMs - (Date.now() - startedAt);
  if (remaining <= 0) {
    throw new EnvironmentConnectionError('自动发现后连接总预算已耗尽', 'connect');
  }
  return connectByWsEndpoint(`ws://127.0.0.1:${port}`, 'discover', remaining);
}

export async function executeConnectionStrategy(
  attempt: ConnectionAttemptSpec,
  timeoutMs: number,
  options: ConnectionStrategyExecutionOptions = {},
): Promise<AdapterConnectionResult> {
  switch (attempt.method) {
    case 'launch':
      return connectProject(attempt, timeoutMs, options.projectStartup);
    case 'connect':
      if (options.trustedProjectEndpoint) {
        return connectByWsEndpoint(options.trustedProjectEndpoint, 'connect', timeoutMs);
      }
      return connectProject(attempt, timeoutMs, options.projectStartup);
    case 'wsEndpoint':
      return connectByWsEndpoint(attempt.target.endpoint, 'wsEndpoint', timeoutMs);
    case 'browserUrl':
      return connectByBrowserUrl(attempt.target.url, timeoutMs);
    case 'discover':
      return connectByDiscover(timeoutMs);
  }
}
