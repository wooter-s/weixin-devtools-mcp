/**
 * 连接管理核心逻辑
 * 从 src/tools.ts 提取的连接相关函数
 */

import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
import fs from "fs";
import net from 'node:net';
import path from "path";
import { promisify } from "util";

import type { MiniProgram } from 'miniprogram-automator';

import {
  DevToolsError,
  ErrorCode,
  ErrorCategory,
  type ErrorContext
} from '../types/errors.js';
import { loadMiniProgramAutomator } from '../utils/automator-loader.js';
import { extractErrorMessage } from '../utils/error.js';

import type {
  ConnectOptions,
  ConnectResult,
  DetailedConnectResult,
  EnhancedConnectOptions,
  StartupResult,
  AutomatorLaunchOptions,
} from './types.js';

const sleep = promisify(setTimeout);

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
export async function connectDevtools(options: ConnectOptions): Promise<ConnectResult> {
  const { projectPath, cliPath, port, autoAudits } = options;

  if (!projectPath) {
    throw new Error("项目路径是必需的");
  }

  let miniProgram: MiniProgram | null = null;

  try {
    let resolvedProjectPath = projectPath;
    if (projectPath.startsWith('@playground/')) {
      const relativePath = projectPath.replace('@playground/', 'playground/');
      resolvedProjectPath = path.resolve(process.cwd(), relativePath);
    } else if (!path.isAbsolute(projectPath)) {
      resolvedProjectPath = path.resolve(process.cwd(), projectPath);
    }

    if (!fs.existsSync(resolvedProjectPath)) {
      throw new Error(`Project path '${resolvedProjectPath}' doesn't exist`);
    }

    const launchOptions: AutomatorLaunchOptions = { projectPath: resolvedProjectPath };
    if (cliPath) launchOptions.cliPath = cliPath;
    if (port) launchOptions.port = port;
    if (typeof autoAudits === 'boolean') {
      launchOptions.projectConfig = {
        ...(launchOptions.projectConfig || {}),
        setting: {
          ...(launchOptions.projectConfig?.setting || {}),
          autoAudits
        }
      };
    }

    const automator = await loadMiniProgramAutomator();
    miniProgram = await automator.launch(launchOptions);
    const currentPage = await miniProgram.currentPage();
    if (!currentPage) {
      throw new Error("无法获取当前页面");
    }

    return {
      miniProgram,
      currentPage,
      pagePath: await currentPage.path
    };
  } catch (error) {
    if (miniProgram) {
      try {
        await miniProgram.disconnect();
      } catch {
        // 候选连接清理失败不应覆盖原始连接错误。
      }
    }
    const errorMessage = extractErrorMessage(error);
    throw new Error(`连接微信开发者工具失败: ${errorMessage}`);
  }
}

/**
 * 智能连接到微信开发者工具（优化版）
 */
export async function connectDevtoolsEnhanced(
  options: EnhancedConnectOptions
): Promise<DetailedConnectResult> {
  const {
    mode = 'auto',
    verbose = false
  } = options;

  const startTime = Date.now();

  if (!options.projectPath) {
    throw new Error("项目路径是必需的");
  }

  let resolvedProjectPath = options.projectPath;
  if (options.projectPath.startsWith('@playground/')) {
    const relativePath = options.projectPath.replace('@playground/', 'playground/');
    resolvedProjectPath = path.resolve(process.cwd(), relativePath);
  } else if (!path.isAbsolute(options.projectPath)) {
    resolvedProjectPath = path.resolve(process.cwd(), options.projectPath);
  }

  if (!fs.existsSync(resolvedProjectPath)) {
    throw new Error(`Project path '${resolvedProjectPath}' doesn't exist`);
  }

  if (verbose) {
    console.error(`开始连接微信开发者工具，模式: ${mode}`);
    console.error(`项目路径: ${resolvedProjectPath}`);
  }

  try {
    switch (mode) {
      case 'auto':
        return await intelligentConnect(options, startTime);
      case 'connect':
        return await connectMode(options, startTime);
      case 'launch':
        return await launchMode(options, startTime);
      default:
        throw new Error(`不支持的连接模式: ${mode}`);
    }
  } catch (error) {
    if (verbose) {
      console.error(`连接失败:`, error);
    }
    throw error;
  }
}

function isSessionConflictError(error: any): boolean {
  if (error instanceof DevToolsConnectionError) {
    return error.details?.reason === 'session_conflict';
  }
  const message = error?.message || '';
  return message.includes('already') ||
         message.includes('session') ||
         message.includes('conflict') ||
         message.includes('automation');
}

async function intelligentConnect(
  options: EnhancedConnectOptions,
  startTime: number
): Promise<DetailedConnectResult> {
  if (options.verbose) {
    console.error('🎯 智能连接策略: 优先使用 launchMode（自动处理项目验证和会话复用）');
  }

  try {
    return await launchMode(options, startTime);
  } catch (error) {
    if (options.verbose) {
      console.error('⚠️ launchMode 失败，分析错误类型...');
    }

    if (options.fallbackMode && isSessionConflictError(error)) {
      if (options.verbose) {
        console.error('🔄 检测到会话冲突，尝试回退到 connectMode');
      }
      return await connectMode(options, startTime);
    }

    throw error;
  }
}

async function connectMode(
  options: EnhancedConnectOptions,
  startTime: number
): Promise<DetailedConnectResult> {
  try {
    const startupResult = await executeWithDetailedError(
      () => startupPhase(options),
      'startup'
    );

    const connectionResult = await executeWithDetailedError(
      () => connectionPhase(options, startupResult),
      'connection'
    );

    let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (options.healthCheck) {
      healthStatus = await executeWithDetailedError(
        () => performHealthCheck(connectionResult.miniProgram),
        'health_check'
      );
    }

    return {
      ...connectionResult,
      connectionMode: 'connect',
      startupTime: Date.now() - startTime,
      healthStatus,
      processInfo: startupResult.processInfo
    };
  } catch (error) {
    if (error instanceof DevToolsConnectionError &&
        error.phase === 'startup' &&
        error.details?.reason === 'session_conflict') {

      if (options.verbose) {
        console.error('🔄 检测到会话冲突，自动回退到传统连接模式（launch）...');
      }

      if (options.fallbackMode) {
        return await launchMode(options, startTime);
      }
    }

    throw error;
  }
}

async function launchMode(
  options: EnhancedConnectOptions,
  startTime: number
): Promise<DetailedConnectResult> {
  const connectOptions: ConnectOptions = {
    projectPath: options.projectPath,
    cliPath: options.cliPath,
    port: options.autoPort || options.port,
    autoAudits: options.autoAudits
  };

  const result = await connectDevtools(connectOptions);

  let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (options.healthCheck) {
    healthStatus = await executeWithDetailedError(
      () => performHealthCheck(result.miniProgram),
      'health_check'
    );
  }

  return {
    ...result,
    connectionMode: 'launch',
    startupTime: Date.now() - startTime,
    healthStatus
  };
}

async function startupPhase(options: EnhancedConnectOptions): Promise<StartupResult> {
  const port = options.autoPort || 9420;
  const cliCommand = buildCliCommand(options);

  if (options.verbose) {
    console.error('执行CLI命令:', cliCommand.join(' '));
  }

  const cliProcess = await executeCliCommand(cliCommand);

  await waitForWebSocketReady(port, options.timeout || 45000, options.verbose);

  return {
    processInfo: {
      pid: cliProcess.pid!,
      port
    },
    startTime: Date.now()
  };
}

async function connectionPhase(
  options: EnhancedConnectOptions,
  startupResult: StartupResult
): Promise<ConnectResult> {
  const wsEndpoint = `ws://localhost:${startupResult.processInfo.port}`;

  if (options.verbose) {
    console.error('连接WebSocket端点:', wsEndpoint);
  }

  const miniProgram = await connectWithRetry(wsEndpoint, 3);
  try {
    const currentPage = await miniProgram.currentPage();
    if (!currentPage) {
      throw new Error('无法获取当前页面');
    }

    const pagePath = await currentPage.path;

    return {
      miniProgram,
      currentPage,
      pagePath
    };
  } catch (error) {
    try {
      await miniProgram.disconnect();
    } catch {
      // 候选连接清理失败不覆盖页面初始化错误。
    }
    throw error;
  }
}

function buildCliCommand(options: EnhancedConnectOptions): string[] {
  const cliPath = options.cliPath || findDefaultCliPath();
  const resolvedProjectPath = resolveProjectPath(options.projectPath);

  const args = ['auto', '--project', resolvedProjectPath];

  if (options.autoPort) {
    args.push('--auto-port', options.autoPort.toString());
  }

  if (options.autoAccount) {
    console.warn('autoAccount参数可能不受支持，已忽略');
  }

  if (options.verbose) {
    args.push('--debug');
  }

  return [cliPath, ...args];
}

function findDefaultCliPath(): string {
  const platform = process.platform;

  if (platform === 'darwin') {
    return '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  } else if (platform === 'win32') {
    return 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat';
  } else {
    throw new Error(`不支持的平台: ${platform}`);
  }
}

function resolveProjectPath(projectPath: string): string {
  if (projectPath.startsWith('@playground/')) {
    const relativePath = projectPath.replace('@playground/', 'playground/');
    return path.resolve(process.cwd(), relativePath);
  } else if (!path.isAbsolute(projectPath)) {
    return path.resolve(process.cwd(), projectPath);
  }
  return projectPath;
}

async function executeCliCommand(command: string[]): Promise<ChildProcess> {
  const [cliPath, ...args] = command;

  return new Promise((resolve, reject) => {
    const cliProcess = spawn(cliPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    let resolved = false;

    if (cliProcess.stdout) {
      cliProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.error('[CLI stdout]:', text.trim());
      });
    }

    if (cliProcess.stderr) {
      cliProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error('[CLI stderr]:', text.trim());

        if (text.includes('must be restarted on port')) {
          const match = text.match(/started on .+:(\d+) and must be restarted on port (\d+)/);
          if (match) {
            const [, currentPort, requestedPort] = match;
            if (!resolved) {
              resolved = true;
              cliProcess.kill();
              reject(new Error(
                `端口冲突: IDE已在端口 ${currentPort} 上运行，但请求的端口是 ${requestedPort}。\n` +
                `解决方案：\n` +
                `1. 使用当前端口：autoPort: ${currentPort}\n` +
                `2. 关闭微信开发者工具后重新连接`
              ));
            }
          }
        }

        if ((text.includes('automation') || text.includes('自动化')) &&
            (text.includes('already') || text.includes('exists') || text.includes('已存在'))) {
          if (!resolved) {
            resolved = true;
            cliProcess.kill();

            const sessionConflictError = new DevToolsConnectionError(
              `自动化会话冲突: 微信开发者工具已有活跃的自动化会话`,
              'startup',
              undefined,
              {
                reason: 'session_conflict',
                suggestFallback: true,
                details: `可能原因：\n` +
                  `1. 之前使用了 connect_devtools (传统模式) 并已建立连接\n` +
                  `2. 其他程序正在使用自动化功能\n` +
                  `解决方案：\n` +
                  `1. 使用已建立的连接（工具会自动检测并复用）\n` +
                  `2. 关闭微信开发者工具并重新打开\n` +
                  `3. 使用 connect_devtools 继续传统模式`
              }
            );
            reject(sessionConflictError);
          }
        }

        if (text.includes('error') || text.includes('failed') || text.includes('失败')) {
          if (!resolved && text.length > 10) {
            console.error('[CLI 警告] 检测到潜在错误:', text.trim());
          }
        }
      });
    }

    cliProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`CLI命令执行失败: ${error.message}`));
      }
    });

    cliProcess.on('exit', (code, signal) => {
      if (!resolved && code !== 0 && code !== null) {
        resolved = true;
        const errorMsg = errorOutput || `CLI进程异常退出 (code=${code}, signal=${signal})`;
        reject(new Error(errorMsg));
      }
    });

    cliProcess.on('spawn', () => {
      if (!resolved) {
        resolved = true;
        resolve(cliProcess);
      }
    });

    setTimeout(() => {
      if (!resolved && !cliProcess.killed) {
        resolved = true;
        cliProcess.kill();
        reject(new Error('CLI命令启动超时'));
      }
    }, 10000);
  });
}

/**
 * 等待WebSocket服务就绪
 */
export async function waitForWebSocketReady(port: number, timeout: number, verbose: boolean = false): Promise<void> {
  const startTime = Date.now();
  let attempt = 0;

  if (verbose) {
    console.error(`等待WebSocket服务启动，端口: ${port}，超时: ${timeout}ms`);
  }

  while (Date.now() - startTime < timeout) {
    attempt++;

    if (verbose && attempt % 5 === 0) {
      const elapsed = Date.now() - startTime;
      console.error(`WebSocket检测进度: ${Math.round(elapsed/1000)}s / ${Math.round(timeout/1000)}s`);
    }

    const isReady = await checkDevToolsRunning(port) || await checkWebSocketDirectly(port);

    if (isReady) {
      if (verbose) {
        const elapsed = Date.now() - startTime;
        console.error(`WebSocket服务已启动，耗时: ${elapsed}ms`);
      }
      return;
    }

    const waitTime = attempt <= 10 ? 500 : 1000;
    await sleep(waitTime);
  }

  const elapsed = Date.now() - startTime;
  throw new Error(`WebSocket服务启动超时，端口: ${port}，已等待: ${elapsed}ms`);
}

async function checkWebSocketDirectly(port: number): Promise<boolean> {
  // TCP connect probe: good enough for readiness gating here.
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });

    socket.once('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });

    socket.once('close', () => {
      // No-op; resolve handled by connect/error/timeout.
    });
  });
}

/**
 * 检查开发者工具是否运行
 */
export async function checkDevToolsRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}`, {
      signal: AbortSignal.timeout(1000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 自动检测当前IDE运行的端口
 */
export async function detectIDEPort(verbose: boolean = false): Promise<number | null> {
  const commonPorts = [9420, 9440, 9430, 9450, 9460];

  if (verbose) {
    console.error('🔍 检测微信开发者工具运行端口...');
  }

  for (const port of commonPorts) {
    if (verbose) {
      console.error(`  检测端口 ${port}...`);
    }

    if (await checkDevToolsRunning(port)) {
      if (verbose) {
        console.error(`✅ 检测到IDE运行在端口 ${port}`);
      }
      return port;
    }
  }

  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      const { execSync } = await import('child_process');
      const execOutput = execSync(
        "lsof -i -P | grep wechat | grep LISTEN | awk '{print $9}' | cut -d: -f2 | grep '^94[0-9][0-9]$'",
        { encoding: 'utf-8', timeout: 3000 }
      ).trim();

      if (execOutput) {
        const ports = execOutput.split('\n').map((p: string) => parseInt(p, 10)).filter((p: number) => !isNaN(p));

        if (verbose && ports.length > 0) {
          console.error(`  lsof检测到端口: ${ports.join(', ')}`);
        }

        for (const port of ports) {
          if (port >= 9400 && port <= 9500) {
            if (await checkDevToolsRunning(port)) {
              if (verbose) {
                console.error(`✅ 通过lsof检测到IDE运行在端口 ${port}`);
              }
              return port;
            }
          }
        }
      }
    } catch (error) {
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

async function connectWithRetry(wsEndpoint: string, maxRetries: number): Promise<MiniProgram> {
  const automator = await loadMiniProgramAutomator();
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await automator.connect({ wsEndpoint });
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      await sleep(1000 * Math.pow(2, i));
    }
  }

  throw new Error('连接重试未执行');
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

async function executeWithDetailedError<T>(
  operation: () => Promise<T>,
  phase: 'startup' | 'connection' | 'health_check'
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const originalError = error instanceof Error ? error : new Error(String(error));
    throw new DevToolsConnectionError(
      originalError.message,
      phase,
      originalError,
      { timestamp: new Date().toISOString() }
    );
  }
}
