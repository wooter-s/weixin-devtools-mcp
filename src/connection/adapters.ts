import automator from 'miniprogram-automator';

import {
  connectDevtoolsEnhanced,
  detectIDEPort,
  type EnhancedConnectOptions,
} from '../tools.js';

import {
  EnvironmentConnectionError,
  ProtocolConnectionError,
  SessionConflictConnectionError,
} from './errors.js';
import type {
  AdapterConnectionResult,
  ConnectionStrategy,
  ResolvedConnectionRequest,
} from './types.js';

function extractMessage(error: Error): string {
  return error.message.toLowerCase();
}

function buildEnhancedOptions(
  request: ResolvedConnectionRequest,
  mode: Extract<ConnectionStrategy, 'auto' | 'launch' | 'connect'>,
): EnhancedConnectOptions {
  return {
    projectPath: request.projectPath ?? '',
    mode,
    cliPath: request.cliPath,
    autoPort: request.autoPort,
    timeout: request.timeoutMs,
    fallbackMode: request.fallback.length > 0,
    healthCheck: false,
    verbose: request.verbose,
    autoAudits: request.autoAudits,
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

async function connectByEnhancedMode(
  request: ResolvedConnectionRequest,
  strategy: Extract<ConnectionStrategy, 'auto' | 'launch' | 'connect'>,
): Promise<AdapterConnectionResult> {
  try {
    const result = await connectDevtoolsEnhanced(buildEnhancedOptions(request, strategy));
    const endpoint = result.processInfo?.port
      ? `ws://127.0.0.1:${result.processInfo.port}`
      : null;
    const pagePath = ensurePagePath(result.pagePath);

    return {
      strategyUsed: strategy,
      endpoint,
      miniProgram: result.miniProgram,
      currentPage: result.currentPage,
      pagePath,
    };
  } catch (error) {
    const baseError = error instanceof Error ? error : new Error(String(error));
    const message = extractMessage(baseError);
    if (message.includes('session') || message.includes('already') || message.includes('conflict')) {
      throw new SessionConflictConnectionError(baseError.message, undefined, baseError);
    }
    throw new EnvironmentConnectionError(
      baseError.message,
      'connect',
      ['检查 projectPath、cliPath 与微信开发者工具启动状态'],
      { strategy },
      baseError,
    );
  }
}

async function connectByWsEndpoint(
  request: ResolvedConnectionRequest,
  wsEndpoint: string,
  strategyUsed: ConnectionStrategy,
): Promise<AdapterConnectionResult> {
  try {
    const miniProgram = await automator.connect({ wsEndpoint, timeout: request.timeoutMs });
    const currentPage = await miniProgram.currentPage();
    if (!currentPage) {
      throw new ProtocolConnectionError('wsEndpoint 已连接但 currentPage 不可用', [
        '确认目标 DevTools 实例已打开小程序项目',
      ]);
    }

    const pagePath = ensurePagePath(await currentPage.path);
    return {
      strategyUsed,
      endpoint: wsEndpoint,
      miniProgram,
      currentPage,
      pagePath,
    };
  } catch (error) {
    const baseError = error instanceof Error ? error : new Error(String(error));
    throw new ProtocolConnectionError(
      baseError.message,
      ['确认 wsEndpoint 可访问，且端点属于微信开发者工具自动化端口'],
      { wsEndpoint, strategy: strategyUsed },
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
  request: ResolvedConnectionRequest,
  browserUrl: string,
): Promise<AdapterConnectionResult> {
  const endpoint = await resolveWsEndpointByBrowserUrl(browserUrl, request.timeoutMs);
  return connectByWsEndpoint(request, endpoint, 'browserUrl');
}

async function connectByDiscover(
  request: ResolvedConnectionRequest,
): Promise<AdapterConnectionResult> {
  const port = await detectIDEPort(request.verbose);
  if (port === null) {
    throw new EnvironmentConnectionError(
      '自动发现失败：未检测到可用的微信开发者工具自动化端口',
      'startup',
      [
        '先在微信开发者工具中开启自动化能力',
        '改用 strategy=launch 并传入 projectPath',
      ],
    );
  }

  const endpoint = `ws://127.0.0.1:${port}`;
  return connectByWsEndpoint(request, endpoint, 'discover');
}

export async function executeConnectionStrategy(
  strategy: ConnectionStrategy,
  request: ResolvedConnectionRequest,
): Promise<AdapterConnectionResult> {
  if (strategy === 'auto' || strategy === 'launch' || strategy === 'connect') {
    return connectByEnhancedMode(request, strategy);
  }

  if (strategy === 'wsEndpoint') {
    if (!request.wsEndpoint) {
      throw new EnvironmentConnectionError('wsEndpoint 策略缺少 wsEndpoint 参数', 'resolve');
    }
    return connectByWsEndpoint(request, request.wsEndpoint, strategy);
  }

  if (strategy === 'browserUrl') {
    if (!request.browserUrl) {
      throw new EnvironmentConnectionError('browserUrl 策略缺少 browserUrl 参数', 'resolve');
    }
    return connectByBrowserUrl(request, request.browserUrl);
  }

  return connectByDiscover(request);
}
