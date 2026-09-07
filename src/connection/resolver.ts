import fs from 'node:fs';
import path from 'node:path';

import { ValidationConnectionError } from './errors.js';
import type {
  BrowserUrlConnectionTarget,
  ConnectionAttemptSpec,
  ConnectionRequest,
  ConnectionTarget,
  DiscoverConnectionTarget,
  ProjectConnectionTarget,
  ResolvedConnectionPlan,
  ResolvedConnectionRequest,
  WsEndpointConnectionTarget,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 45_000;

function validateObject(value: object, allowedKeys: string[], label: string): void {
  const unexpectedKeys = Object.keys(value).filter(key => !allowedKeys.includes(key));
  if (unexpectedKeys.length > 0) {
    throw new ValidationConnectionError(
      `${label} 包含不支持的字段: ${unexpectedKeys.join(', ')}`,
      [`仅保留字段: ${allowedKeys.join(', ')}`],
    );
  }
}

function requireNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationConnectionError(`${field} 不能为空`, [`为 ${field} 提供有效值`]);
  }
  return normalized;
}

function resolveProjectPath(projectPath: string): string {
  const normalized = requireNonEmptyString(projectPath, 'target.projectPath');
  const expanded = normalized.startsWith('@playground/')
    ? path.resolve(process.cwd(), normalized.replace('@playground/', 'playground/'))
    : path.resolve(process.cwd(), normalized);

  let canonicalPath: string;
  try {
    canonicalPath = fs.realpathSync(expanded);
  } catch {
    throw new ValidationConnectionError(
      `项目路径不存在: ${expanded}`,
      ['检查 target.projectPath 后重试'],
      { projectPath: expanded },
    );
  }

  if (!fs.statSync(canonicalPath).isDirectory()) {
    throw new ValidationConnectionError(
      `项目路径不是目录: ${canonicalPath}`,
      ['将 target.projectPath 指向小程序项目目录'],
      { projectPath: canonicalPath },
    );
  }

  return canonicalPath;
}

function validatePort(port: number | undefined): number | undefined {
  if (port === undefined) {
    return undefined;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ValidationConnectionError(
      'target.autoPort 必须是 1 到 65535 之间的整数',
      ['设置一个有效且未被占用的自动化端口'],
      { autoPort: port },
    );
  }
  return port;
}

function validateUrl(value: string, field: string, protocols: string[]): string {
  const normalized = requireNonEmptyString(value, field);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new ValidationConnectionError(`${field} 不是有效 URL`, [`检查 ${field} 的格式`]);
  }

  if (!protocols.includes(url.protocol)) {
    throw new ValidationConnectionError(
      `${field} 仅支持 ${protocols.join('、')} 协议`,
      [`修改 ${field} 的协议后重试`],
      { protocol: url.protocol },
    );
  }
  return url.toString();
}

function resolveProjectTarget(target: ProjectConnectionTarget): ProjectConnectionTarget {
  validateObject(
    target,
    ['kind', 'projectPath', 'cliPath', 'autoPort', 'autoAudits'],
    'project target',
  );
  return {
    kind: 'project',
    projectPath: resolveProjectPath(target.projectPath),
    cliPath: target.cliPath === undefined
      ? undefined
      : requireNonEmptyString(target.cliPath, 'target.cliPath'),
    autoPort: validatePort(target.autoPort),
    autoAudits: target.autoAudits,
  };
}

function resolveWsEndpointTarget(
  target: WsEndpointConnectionTarget,
): WsEndpointConnectionTarget {
  validateObject(target, ['kind', 'endpoint'], 'wsEndpoint target');
  return {
    kind: 'wsEndpoint',
    endpoint: validateUrl(target.endpoint, 'target.endpoint', ['ws:', 'wss:']),
  };
}

function resolveBrowserUrlTarget(
  target: BrowserUrlConnectionTarget,
): BrowserUrlConnectionTarget {
  validateObject(target, ['kind', 'url'], 'browserUrl target');
  return {
    kind: 'browserUrl',
    url: validateUrl(target.url, 'target.url', ['http:', 'https:']),
  };
}

function resolveDiscoverTarget(target: DiscoverConnectionTarget): DiscoverConnectionTarget {
  validateObject(target, ['kind'], 'discover target');
  return { kind: 'discover' };
}

function resolveTarget(target: ConnectionTarget | undefined): ConnectionTarget {
  if (!target || typeof target !== 'object') {
    throw new ValidationConnectionError(
      'target 是必需的',
      ['提供 project、wsEndpoint、browserUrl 或 discover target'],
    );
  }

  switch (target.kind) {
    case 'project':
      return resolveProjectTarget(target);
    case 'wsEndpoint':
      return resolveWsEndpointTarget(target);
    case 'browserUrl':
      return resolveBrowserUrlTarget(target);
    case 'discover':
      return resolveDiscoverTarget(target);
    default:
      throw new ValidationConnectionError(
        'target.kind 无效',
        ['target.kind 只能是 project、wsEndpoint、browserUrl 或 discover'],
      );
  }
}

function buildAttempts(target: ConnectionTarget): ConnectionAttemptSpec[] {
  switch (target.kind) {
    case 'project':
      return [
        { method: 'launch', target },
        { method: 'connect', target },
      ];
    case 'wsEndpoint':
      return [{ method: 'wsEndpoint', target }];
    case 'browserUrl':
      return [{ method: 'browserUrl', target }];
    case 'discover':
      return [{ method: 'discover', target }];
  }
}

export function resolveConnectionPlan(rawRequest: ConnectionRequest): ResolvedConnectionPlan {
  validateObject(rawRequest, ['target', 'timeoutMs', 'healthCheck'], '连接请求');

  const timeoutMs = rawRequest.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ValidationConnectionError(
      'timeoutMs 必须是正数',
      ['设置一个大于 0 的总超时时间'],
      { timeoutMs },
    );
  }

  const target = resolveTarget(rawRequest.target);
  const request: ResolvedConnectionRequest = {
    target,
    timeoutMs,
    healthCheck: rawRequest.healthCheck ?? true,
  };

  return {
    request,
    attempts: buildAttempts(target),
  };
}
