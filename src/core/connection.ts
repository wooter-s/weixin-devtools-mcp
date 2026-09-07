/**
 * 连接管理核心逻辑
 * 从 src/tools.ts 提取的连接相关函数
 */

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import type { MiniProgram } from 'miniprogram-automator';

import { probeAutomation, waitForAutomation } from '../connection/automation-probe.js';
import { ProjectStartup } from '../connection/project-startup.js';
import {
  DevToolsError,
  ErrorCode,
  ErrorCategory,
  type ErrorContext
} from '../types/errors.js';

import type {
  ConnectOptions,
  ConnectResult,
  DetailedConnectResult,
  EnhancedConnectOptions,
} from './types.js';

type TimedConnectOptions = ConnectOptions & { timeout?: number };

/**
 * @deprecated 使用 DevToolsError 替代
 * 保留此类以保持向后兼容性
 */
export class DevToolsConnectionError extends DevToolsError {
  constructor(
    message: string,
    public phase: 'startup' | 'connection' | 'health_check',
    public originalError?: Error,
    public details?: Record<string, unknown>
  ) {
    const code = phase === 'startup'
      ? ErrorCode.CONNECTION_FAILED
      : phase === 'connection'
        ? ErrorCode.CONNECTION_FAILED
        : ErrorCode.CONNECTION_TIMEOUT;

    const context: ErrorContext = {
      operation: phase,
      details,
      cause: originalError,
    };

    super(message, code, {
      category: ErrorCategory.CONNECTION,
      context,
    });

    this.name = 'DevToolsConnectionError';
  }
}

/**
 * 连接到微信开发者工具
 */
export async function connectDevtools(options: TimedConnectOptions): Promise<ConnectResult> {
  return connectDevtoolsEnhanced({ ...options, autoPort: options.port, mode: 'launch' });
}

/**
 * 智能连接到微信开发者工具（优化版）
 */
export async function connectDevtoolsEnhanced(
  options: EnhancedConnectOptions,
  startup?: ProjectStartup,
): Promise<DetailedConnectResult> {
  if (!options.projectPath) throw new Error('项目路径是必需的');
  if (options.mode === 'auto') throw new Error('auto 模式已移除，请使用具体的 launch 或 connect attempt');
  const session = startup ?? new ProjectStartup();
  try {
    const result = await session.connect({
      ...options,
      projectPath: canonicalizeProjectPath(options.projectPath),
    });
    if (options.healthCheck) result.healthStatus = await performHealthCheck(result.miniProgram);
    if (!startup) session.commit();
    return result;
  } finally {
    if (!startup) await session.dispose();
  }
}

function canonicalizeProjectPath(projectPath: string): string {
  const absolutePath = projectPath.startsWith('@playground/')
    ? path.resolve(process.cwd(), projectPath.replace('@playground/', 'playground/'))
    : path.resolve(process.cwd(), projectPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Project path '${absolutePath}' doesn't exist`);
  }

  const canonicalPath = fs.realpathSync(absolutePath);
  if (!fs.statSync(canonicalPath).isDirectory()) {
    throw new Error(`Project path '${canonicalPath}' is not a directory`);
  }
  return canonicalPath;
}

/** Wait for both the automation protocol and the app runtime. */
export async function waitForWebSocketReady(port: number, timeout: number, _verbose = false): Promise<void> {
  await waitForAutomation(`ws://127.0.0.1:${port}`, timeout);
}

/**
 * 检查开发者工具是否运行
 */
export async function checkDevToolsRunning(port: number, timeoutMs = 1_000): Promise<boolean> {
  return (await probeAutomation(`ws://127.0.0.1:${port}`, timeoutMs)).automation;
}

/**
 * 自动检测当前IDE运行的端口
 */
export async function detectIDEPort(
  verbose: boolean = false,
  timeoutMs = 5_000,
): Promise<number | null> {
  const commonPorts = [9420, 9440, 9430, 9450, 9460];
  const deadline = Date.now() + timeoutMs;

  if (verbose) {
    console.error('🔍 检测微信开发者工具运行端口...');
  }

  for (const port of commonPorts) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return null;
    }
    if (verbose) {
      console.error(`  检测端口 ${port}...`);
    }

    if (await checkDevToolsRunning(port, Math.min(remaining, 300))) {
      if (verbose) {
        console.error(`✅ 检测到IDE运行在端口 ${port}`);
      }
      return port;
    }
  }

  if ((process.platform === 'darwin' || process.platform === 'linux') && Date.now() < deadline) {
    try {
      const { stdout: execOutput } = await promisify(execFile)(
        'lsof', ['-nP', '-iTCP:9400-9500', '-sTCP:LISTEN', '-Fn'],
        { encoding: 'utf8', timeout: Math.max(1, Math.min(1000, deadline - Date.now())) }
      );

      if (execOutput) {
        const ports = [...new Set(execOutput.split('\n').filter(line => line.startsWith('n')).map(line => Number(line.match(/:(\d+)$/)?.[1])).filter(Number.isInteger))];

        if (verbose && ports.length > 0) {
          console.error(`  lsof检测到端口: ${ports.join(', ')}`);
        }

        for (const port of ports) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) {
            return null;
          }
          if (port >= 9400 && port <= 9500) {
            if (await checkDevToolsRunning(port, Math.min(remaining, 300))) {
              if (verbose) {
                console.error(`✅ 通过lsof检测到IDE运行在端口 ${port}`);
              }
              return port;
            }
          }
        }
      }
    } catch {
      if (verbose) {
        console.error('  lsof检测失败');
      }
    }
  }

  if (verbose) {
    console.error('❌ 未检测到IDE运行端口');
  }

  return null;
}

async function performHealthCheck(miniProgram: MiniProgram): Promise<'healthy' | 'degraded' | 'unhealthy'> {
  try {
    const currentPage = await miniProgram.currentPage();
    if (!currentPage) {
      return 'unhealthy';
    }

    const pagePath = await currentPage.path;
    if (!pagePath) {
      return 'degraded';
    }

    return 'healthy';
  } catch {
    return 'unhealthy';
  }
}
