import { ValidationConnectionError } from './errors.js';
import type {
  ConnectionRequest,
  ConnectionStrategy,
  ResolvedConnectionPlan,
  ResolvedConnectionRequest,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_FALLBACK_FOR_LAUNCH: ConnectionStrategy[] = ['connect'];
const DEFAULT_FALLBACK_FOR_CONNECT: ConnectionStrategy[] = ['launch'];
const DEFAULT_FALLBACK_FOR_ENDPOINT: ConnectionStrategy[] = ['discover', 'launch', 'connect'];

function uniqueStrategies(strategies: ConnectionStrategy[]): ConnectionStrategy[] {
  const result: ConnectionStrategy[] = [];
  for (const strategy of strategies) {
    if (!result.includes(strategy)) {
      result.push(strategy);
    }
  }
  return result;
}

function resolvePrimaryStrategy(request: ConnectionRequest): ConnectionStrategy {
  if (request.strategy) {
    return request.strategy;
  }

  if (request.wsEndpoint) {
    return 'wsEndpoint';
  }

  if (request.browserUrl) {
    return 'browserUrl';
  }

  if (request.autoDiscover) {
    return 'discover';
  }

  return 'auto';
}

function resolveFallbackStrategies(
  primary: ConnectionStrategy,
  request: ConnectionRequest,
): ConnectionStrategy[] {
  if (request.fallback && request.fallback.length > 0) {
    return request.fallback.filter(strategy => strategy !== primary);
  }

  if (primary === 'launch') {
    return [...DEFAULT_FALLBACK_FOR_LAUNCH];
  }

  if (primary === 'connect') {
    return [...DEFAULT_FALLBACK_FOR_CONNECT];
  }

  if (primary === 'wsEndpoint' || primary === 'browserUrl') {
    return [...DEFAULT_FALLBACK_FOR_ENDPOINT];
  }

  if (primary === 'discover') {
    const fallback: ConnectionStrategy[] = [];
    if (request.projectPath) {
      fallback.push('launch', 'connect');
    }
    return fallback;
  }

  if (primary === 'auto') {
    return request.projectPath ? ['launch', 'connect'] : ['discover'];
  }

  return [];
}

function validateRequest(request: ResolvedConnectionRequest): void {
  if (request.strategy === 'launch' || request.strategy === 'connect') {
    if (!request.projectPath) {
      throw new ValidationConnectionError(
        `${request.strategy} 策略要求提供 projectPath`,
        ['为 connect_devtools 传入 projectPath'],
        { strategy: request.strategy },
      );
    }
  }

  if (request.strategy === 'wsEndpoint' && !request.wsEndpoint) {
    throw new ValidationConnectionError(
      'wsEndpoint 策略要求提供 wsEndpoint',
      ['设置 wsEndpoint，例如 ws://127.0.0.1:9420'],
    );
  }

  if (request.strategy === 'browserUrl' && !request.browserUrl) {
    throw new ValidationConnectionError(
      'browserUrl 策略要求提供 browserUrl',
      ['设置 browserUrl，例如 http://127.0.0.1:9222'],
    );
  }

  if (request.timeoutMs <= 0) {
    throw new ValidationConnectionError(
      'timeoutMs 必须是正数',
      ['设置一个大于 0 的超时时间'],
      { timeoutMs: request.timeoutMs },
    );
  }
}

export function resolveConnectionPlan(rawRequest: ConnectionRequest): ResolvedConnectionPlan {
  const strategy = resolvePrimaryStrategy(rawRequest);
  const fallback = uniqueStrategies(resolveFallbackStrategies(strategy, rawRequest));

  const request: ResolvedConnectionRequest = {
    strategy,
    projectPath: rawRequest.projectPath,
    cliPath: rawRequest.cliPath,
    autoPort: rawRequest.autoPort,
    browserUrl: rawRequest.browserUrl,
    wsEndpoint: rawRequest.wsEndpoint,
    wsHeaders: rawRequest.wsHeaders,
    timeoutMs: rawRequest.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fallback,
    healthCheck: rawRequest.healthCheck ?? true,
    verbose: rawRequest.verbose ?? false,
    autoAudits: rawRequest.autoAudits,
    autoDiscover: rawRequest.autoDiscover ?? true,
  };

  validateRequest(request);

  const attempts = uniqueStrategies([request.strategy, ...request.fallback]);

  return {
    request,
    attempts,
  };
}
