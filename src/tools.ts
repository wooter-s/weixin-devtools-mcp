/**
 * 微信开发者工具 MCP 工具函数
 * 提供可测试的纯函数实现
 */

import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import automator from "miniprogram-automator";
const sleep = promisify(setTimeout);

/**
 * 连接选项接口
 */
export interface ConnectOptions {
  projectPath: string;
  cliPath?: string;
  port?: number;
  autoAudits?: boolean;
}

/**
 * 增强的连接选项接口
 */
export interface EnhancedConnectOptions extends ConnectOptions {
  mode?: 'auto' | 'launch' | 'connect';
  autoPort?: number;           // CLI --auto-port 参数
  autoAccount?: string;        // CLI --auto-account 参数
  timeout?: number;            // 连接超时时间
  fallbackMode?: boolean;      // 允许回退到其他模式
  healthCheck?: boolean;       // 执行连接后健康检查
  verbose?: boolean;          // 详细日志输出
}

/**
 * 启动结果接口
 */
export interface StartupResult {
  processInfo: {
    pid: number;
    port: number;
  };
  startTime: number;
}

/**
 * 详细连接结果接口
 */
export interface DetailedConnectResult extends ConnectResult {
  connectionMode: 'launch' | 'connect';
  startupTime: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  processInfo?: {
    pid: number;
    port: number;
  };
}

/**
 * 开发者工具连接错误类
 */
import {
  DevToolsError,
  ErrorCode,
  ErrorCategory,
  type ErrorContext
} from './types/errors.js';

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
    // 根据阶段选择错误代码
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
 * 连接结果接口
 */
export interface ConnectResult {
  miniProgram: any;
  currentPage: any;
  pagePath: string;
}

/**
 * automator.launch 选项接口
 */
interface AutomatorLaunchOptions {
  projectPath: string;
  cliPath?: string;
  port?: number;
  projectConfig?: {
    setting?: {
      autoAudits?: boolean;
    };
  };
}

/**
 * 连接到微信开发者工具
 *
 * @param options 连接选项
 * @returns 连接结果
 * @throws 连接失败时抛出错误
 */
export async function connectDevtools(options: ConnectOptions): Promise<ConnectResult> {
  const { projectPath, cliPath, port, autoAudits } = options;

  if (!projectPath) {
    throw new Error("项目路径是必需的");
  }

  try {
    // 处理@playground/wx格式的路径，转换为绝对文件系统路径
    let resolvedProjectPath = projectPath;
    if (projectPath.startsWith('@playground/')) {
      // 转换为相对路径，然后解析为绝对路径
      const relativePath = projectPath.replace('@playground/', 'playground/');
      resolvedProjectPath = path.resolve(process.cwd(), relativePath);
    } else if (!path.isAbsolute(projectPath)) {
      // 如果不是绝对路径，转换为绝对路径
      resolvedProjectPath = path.resolve(process.cwd(), projectPath);
    }

    // 验证项目路径是否存在
    if (!fs.existsSync(resolvedProjectPath)) {
      throw new Error(`Project path '${resolvedProjectPath}' doesn't exist`);
    }

    // 构建 automator.launch 的选项
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

    // 启动并连接微信开发者工具
    const miniProgram = await automator.launch(launchOptions);

    // 获取当前页面
    const currentPage = await miniProgram.currentPage();
    if (!currentPage) {
      throw new Error("无法获取当前页面");
    }
    const pagePath = await currentPage.path;

    // 自动启动网络监听
    try {
      // 创建请求拦截器（直接内联函数）
      await miniProgram.mockWxMethod('request', function(this: any, options: any) {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = (typeof wx !== 'undefined' ? wx : null) as any;
        if (!wxObj) return this.origin(options);
        if (!wxObj.__networkLogs) wxObj.__networkLogs = [];

        const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const startTime = Date.now();

        const originalSuccess = options.success;
        options.success = function(res: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'request',
            url: options.url,
            method: options.method || 'GET',
            headers: options.header,
            data: options.data,
            statusCode: res.statusCode,
            response: res.data,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            success: true
          });
          if (originalSuccess) originalSuccess(res);
        };

        const originalFail = options.fail;
        options.fail = function(err: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'request',
            url: options.url,
            method: options.method || 'GET',
            headers: options.header,
            data: options.data,
            error: err.errMsg || String(err),
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            success: false
          });
          if (originalFail) originalFail(err);
        };

        return this.origin(options);
      });

      // 拦截 uploadFile
      await miniProgram.mockWxMethod('uploadFile', function(this: any, options: any) {
        // @ts-ignore
        const wxObj = (typeof wx !== 'undefined' ? wx : null) as any;
        if (!wxObj) return this.origin(options);
        if (!wxObj.__networkLogs) wxObj.__networkLogs = [];

        const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const startTime = Date.now();

        const originalSuccess = options.success;
        options.success = function(res: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'uploadFile',
            url: options.url,
            statusCode: res.statusCode,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            success: true
          });
          if (originalSuccess) originalSuccess(res);
        };

        const originalFail = options.fail;
        options.fail = function(err: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'uploadFile',
            url: options.url,
            error: err.errMsg || String(err),
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            success: false
          });
          if (originalFail) originalFail(err);
        };

        return this.origin(options);
      });

      // 拦截 downloadFile
      await miniProgram.mockWxMethod('downloadFile', function(this: any, options: any) {
        // @ts-ignore
        const wxObj = (typeof wx !== 'undefined' ? wx : null) as any;
        if (!wxObj) return this.origin(options);
        if (!wxObj.__networkLogs) wxObj.__networkLogs = [];

        const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const startTime = Date.now();

        const originalSuccess = options.success;
        options.success = function(res: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'downloadFile',
            url: options.url,
            statusCode: res.statusCode,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            success: true
          });
          if (originalSuccess) originalSuccess(res);
        };

        const originalFail = options.fail;
        options.fail = function(err: any) {
          wxObj.__networkLogs.push({
            id: requestId,
            type: 'downloadFile',
            url: options.url,
            error: err.errMsg || String(err),
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            success: false
          });
          if (originalFail) originalFail(err);
        };

        return this.origin(options);
      });

      // 拦截 Mpx 框架的 $xfetch（与 wx.request 同步注入，提高首批请求捕获率）
      await miniProgram.evaluate(function() {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        if (typeof wx === 'undefined') return;

        // @ts-ignore
        wx.__networkLogs = wx.__networkLogs || [];

        // 检测 Mpx 框架
        // @ts-ignore - getApp is available in WeChat miniprogram environment
        const app = typeof getApp !== 'undefined' ? getApp() : null;
        const hasMpxFetch = app &&
                            app.$xfetch &&
                            app.$xfetch.interceptors &&
                            typeof app.$xfetch.interceptors.request.use === 'function';

        // 调试日志
        // @ts-ignore - 在运行时环境中输出调试信息
        const debugInfo = {
          // @ts-ignore
          hasGetApp: typeof getApp !== 'undefined',
          hasApp: !!app,
          has$xfetch: !!(app && app.$xfetch),
          hasInterceptors: !!(app && app.$xfetch && app.$xfetch.interceptors),
          hasMpxFetch: hasMpxFetch
        };
        console.error('[MCP-DEBUG] Mpx检测:', debugInfo);

        // 强制安装 Mpx 拦截器（不检查标志，每次都重新安装以覆盖旧的）
        // 这样可以解决小程序未重新加载导致标志残留的问题
        // @ts-ignore
        if (hasMpxFetch) {
          console.error('[MCP] 正在安装 Mpx $xfetch 拦截器（强制覆盖）...');

          // 安装 Mpx 请求拦截器
          // @ts-ignore
          app.$xfetch.interceptors.request.use(function(config: any) {
            const requestId = 'mpx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const startTime = Date.now();

            config.__mcp_requestId = requestId;
            config.__mcp_startTime = startTime;

            // @ts-ignore
            wx.__networkLogs.push({
              id: requestId,
              type: 'request',
              method: config.method || 'GET',
              url: config.url,
              headers: config.header || config.headers,
              data: config.data,
              params: config.params,
              timestamp: new Date().toISOString(),
              source: 'getApp().$xfetch',
              phase: 'request'
            });

            return config;
          });

          // 安装 Mpx 响应拦截器
          // @ts-ignore
          app.$xfetch.interceptors.response.use(
            function onSuccess(response: any) {
              const requestId = response.requestConfig?.__mcp_requestId;
              const startTime = response.requestConfig?.__mcp_startTime || Date.now();

              // @ts-ignore
              wx.__networkLogs.push({
                id: requestId,
                type: 'response',
                statusCode: response.status,
                data: response.data,
                headers: response.header || response.headers,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                source: 'getApp().$xfetch',
                phase: 'response',
                success: true
              });

              return response;
            },
            function onError(error: any) {
              const requestId = error.requestConfig?.__mcp_requestId;
              const startTime = error.requestConfig?.__mcp_startTime || Date.now();

              // @ts-ignore
              wx.__networkLogs.push({
                id: requestId,
                type: 'response',
                statusCode: error.status || error.statusCode,
                error: error.message || error.errMsg || String(error),
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                source: 'getApp().$xfetch',
                phase: 'response',
                success: false
              });

              throw error;
            }
          );

          console.error('[MCP] Mpx $xfetch 拦截器安装完成');
        }

        // @ts-ignore
        wx.__networkInterceptorsInstalled = true;
      });

      console.error('[connectDevtools] 网络监听已自动启动（包含 Mpx 框架支持）');
    } catch (err) {
      console.warn('[connectDevtools] 网络监听启动失败:', err);
    }

    return {
      miniProgram,
      currentPage,
      pagePath
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`连接微信开发者工具失败: ${errorMessage}`);
  }
}

/**
 * 智能连接到微信开发者工具（优化版）
 * 支持多种连接模式和智能回退
 *
 * @param options 增强的连接选项
 * @returns 详细连接结果
 */
export async function connectDevtoolsEnhanced(
  options: EnhancedConnectOptions
): Promise<DetailedConnectResult> {
  const {
    mode = 'auto',
    verbose = false
  } = options;

  const startTime = Date.now();

  // 验证项目路径（在所有模式执行前统一验证）
  if (!options.projectPath) {
    throw new Error("项目路径是必需的");
  }

  // 解析并验证项目路径
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

/**
 * 判断错误是否为可通过 connectMode 解决的会话冲突错误
 */
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

/**
 * 智能连接逻辑（优化版）
 *
 * 策略说明：
 * 1. 默认使用 launchMode（依赖 automator.launch 的智能处理）
 *    - automator.launch 会自动检测IDE状态和项目匹配
 *    - 自动复用现有会话或打开新项目
 * 2. 仅在会话冲突等特定错误时回退到 connectMode
 * 3. 移除了复杂的端口检测和项目验证逻辑（交给官方库处理）
 */
async function intelligentConnect(
  options: EnhancedConnectOptions,
  startTime: number
): Promise<DetailedConnectResult> {
  if (options.verbose) {
    console.error('🎯 智能连接策略: 优先使用 launchMode（自动处理项目验证和会话复用）');
  }

  try {
    // 默认使用 launchMode
    // automator.launch() 会自动：
    // 1. 检测IDE是否运行
    // 2. 验证项目路径是否匹配
    // 3. 复用现有会话或打开新项目
    return await launchMode(options, startTime);
  } catch (error) {
    if (options.verbose) {
      console.error('⚠️ launchMode 失败，分析错误类型...');
    }

    // 仅在特定可恢复错误时回退到 connectMode
    if (options.fallbackMode && isSessionConflictError(error)) {
      if (options.verbose) {
        console.error('🔄 检测到会话冲突，尝试回退到 connectMode');
      }
      return await connectMode(options, startTime);
    }

    // 其他错误直接抛出
    throw error;
  }
}

/**
 * Connect模式：两阶段连接
 */
async function connectMode(
  options: EnhancedConnectOptions,
  startTime: number
): Promise<DetailedConnectResult> {
  try {
    // 阶段1: CLI启动
    const startupResult = await executeWithDetailedError(
      () => startupPhase(options),
      'startup'
    );

    // 阶段2: WebSocket连接
    const connectionResult = await executeWithDetailedError(
      () => connectionPhase(options, startupResult),
      'connection'
    );

    // 健康检查
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
    // 检查是否是会话冲突错误
    if (error instanceof DevToolsConnectionError &&
        error.phase === 'startup' &&
        error.details?.reason === 'session_conflict') {

      if (options.verbose) {
        console.error('🔄 检测到会话冲突，自动回退到传统连接模式（launch）...');
      }

      // 如果允许回退，自动使用launch模式
      if (options.fallbackMode) {
        return await launchMode(options, startTime);
      }
    }

    // 其他错误直接抛出
    throw error;
  }
}

/**
 * Launch模式：传统连接方式
 */
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

  // 健康检查
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

/**
 * 启动阶段：使用CLI命令启动自动化
 */
async function startupPhase(options: EnhancedConnectOptions): Promise<StartupResult> {
  const port = options.autoPort || 9420;
  const cliCommand = buildCliCommand(options);

  if (options.verbose) {
    console.error('执行CLI命令:', cliCommand.join(' '));
  }

  // 执行CLI命令
  const process = await executeCliCommand(cliCommand);

  // 等待WebSocket服务就绪
  await waitForWebSocketReady(port, options.timeout || 45000, options.verbose);

  return {
    processInfo: {
      pid: process.pid!,
      port
    },
    startTime: Date.now()
  };
}

/**
 * 连接阶段：连接到WebSocket
 */
async function connectionPhase(
  options: EnhancedConnectOptions,
  startupResult: StartupResult
): Promise<ConnectResult> {
  const wsEndpoint = `ws://localhost:${startupResult.processInfo.port}`;

  if (options.verbose) {
    console.error('连接WebSocket端点:', wsEndpoint);
  }

  // 连接到WebSocket端点
  const miniProgram = await connectWithRetry(wsEndpoint, 3);

  // 获取当前页面
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
}

/**
 * 构建CLI命令
 */
function buildCliCommand(options: EnhancedConnectOptions): string[] {
  const cliPath = options.cliPath || findDefaultCliPath();
  const resolvedProjectPath = resolveProjectPath(options.projectPath);

  const args = ['auto', '--project', resolvedProjectPath];

  // 使用正确的端口参数名（应该是 --auto-port 而不是 --port）
  if (options.autoPort) {
    args.push('--auto-port', options.autoPort.toString());
  }

  // 移除不存在的--auto-account参数
  // autoAccount参数在官方CLI帮助中没有显示，可能已弃用
  if (options.autoAccount) {
    // 保留接口兼容性但不传递给CLI
    console.warn('autoAccount参数可能不受支持，已忽略');
  }

  if (options.verbose) {
    args.push('--debug');
  }

  return [cliPath, ...args];
}

/**
 * 查找默认CLI路径
 * 优先级：环境变量 > 默认路径
 */
function findDefaultCliPath(): string {
  // 1. 优先使用环境变量
  const envCliPath = process.env.WECHAT_DEVTOOLS_CLI;
  if (envCliPath) {
    if (envCliPath.startsWith('@playground/')) {
      // @playground/ 格式需要转换为实际路径
      const relativePath = envCliPath.replace('@playground/', 'playground/');
      return path.resolve(process.cwd(), relativePath);
    }
    return path.resolve(process.cwd(), envCliPath);
  }

  const platform = process.platform;

  if (platform === 'darwin') {
    return '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  } else if (platform === 'win32') {
    return 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat';
  } else {
    // Linux: 尝试常见的 Linux 版开发者工具路径
    const linuxPaths = [
      '/opt/apps/io.github.msojocs.wechat-devtools-linux/files/bin/bin/wechat-devtools-cli',
      '/usr/share/wechat-devtools/bin/cli',
      '/usr/local/bin/wechat-devtools-cli',
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    throw new Error(`不支持的平台: ${platform}。可在 Linux 上设置环境变量 WECHAT_DEVTOOLS_CLI 指定 CLI 路径`);
  }
}

/**
 * 解析项目路径
 */
function resolveProjectPath(projectPath: string): string {
  if (projectPath.startsWith('@playground/')) {
    const relativePath = projectPath.replace('@playground/', 'playground/');
    return path.resolve(process.cwd(), relativePath);
  } else if (!path.isAbsolute(projectPath)) {
    return path.resolve(process.cwd(), projectPath);
  }
  return projectPath;
}

/**
 * 执行CLI命令
 */
async function executeCliCommand(command: string[]): Promise<ChildProcess> {
  const [cliPath, ...args] = command;

  return new Promise((resolve, reject) => {
    const process = spawn(cliPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    let resolved = false;

    if (process.stdout) {
      process.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.error('[CLI stdout]:', text.trim());
      });
    }

    if (process.stderr) {
      process.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error('[CLI stderr]:', text.trim());

        // 检测端口冲突错误
        if (text.includes('must be restarted on port')) {
          const match = text.match(/started on .+:(\d+) and must be restarted on port (\d+)/);
          if (match) {
            const [, currentPort, requestedPort] = match;
            if (!resolved) {
              resolved = true;
              process.kill();
              reject(new Error(
                `端口冲突: IDE已在端口 ${currentPort} 上运行，但请求的端口是 ${requestedPort}。\n` +
                `解决方案：\n` +
                `1. 使用当前端口：autoPort: ${currentPort}\n` +
                `2. 关闭微信开发者工具后重新连接`
              ));
            }
          }
        }

        // 检测自动化会话冲突错误
        if ((text.includes('automation') || text.includes('自动化')) &&
            (text.includes('already') || text.includes('exists') || text.includes('已存在'))) {
          if (!resolved) {
            resolved = true;
            process.kill();

            // 创建特殊的会话冲突错误，允许上层处理回退
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

        // 检测 CLI 命令失败（通用）
        if (text.includes('error') || text.includes('failed') || text.includes('失败')) {
          if (!resolved && text.length > 10) { // 确保不是误报
            console.error('[CLI 警告] 检测到潜在错误:', text.trim());
          }
        }
      });
    }

    process.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`CLI命令执行失败: ${error.message}`));
      }
    });

    process.on('exit', (code, signal) => {
      if (!resolved && code !== 0 && code !== null) {
        resolved = true;
        const errorMsg = errorOutput || `CLI进程异常退出 (code=${code}, signal=${signal})`;
        reject(new Error(errorMsg));
      }
    });

    process.on('spawn', () => {
      // CLI命令已启动，返回进程对象
      if (!resolved) {
        resolved = true;
        resolve(process);
      }
    });

    // 设置超时
    setTimeout(() => {
      if (!resolved && !process.killed) {
        resolved = true;
        process.kill();
        reject(new Error('CLI命令启动超时'));
      }
    }, 10000);
  });
}

/**
 * 等待WebSocket服务就绪
 * @public 导出供测试使用
 */
export async function waitForWebSocketReady(port: number, timeout: number, verbose: boolean = false): Promise<void> {
  const startTime = Date.now();
  let attempt = 0;

  if (verbose) {
    console.error(`等待WebSocket服务启动，端口: ${port}，超时: ${timeout}ms`);
  }

  while (Date.now() - startTime < timeout) {
    attempt++;

    if (verbose && attempt % 5 === 0) { // 每5秒显示一次进度
      const elapsed = Date.now() - startTime;
      console.error(`WebSocket检测进度: ${Math.round(elapsed/1000)}s / ${Math.round(timeout/1000)}s`);
    }

    // 尝试多种检测方式
    const isReady = await checkDevToolsRunning(port) || await checkWebSocketDirectly(port);

    if (isReady) {
      if (verbose) {
        const elapsed = Date.now() - startTime;
        console.error(`WebSocket服务已启动，耗时: ${elapsed}ms`);
      }
      return;
    }

    // 渐进式等待时间：前10次每500ms检查一次，之后每1000ms检查一次
    const waitTime = attempt <= 10 ? 500 : 1000;
    await sleep(waitTime);
  }

  const elapsed = Date.now() - startTime;
  throw new Error(`WebSocket服务启动超时，端口: ${port}，已等待: ${elapsed}ms`);
}

/**
 * 直接尝试WebSocket连接检测
 */
async function checkWebSocketDirectly(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // 尝试创建WebSocket连接
      const ws = new (require('ws'))(`ws://localhost:${port}`);

      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 2000);

      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

    } catch {
      resolve(false);
    }
  });
}

/**
 * 检查开发者工具是否运行
 */
export async function checkDevToolsRunning(port: number): Promise<boolean> {
  try {
    // 尝试连接WebSocket来检测服务状态
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
 * 返回检测到的端口号，如果未检测到则返回 null
 */
export async function detectIDEPort(verbose: boolean = false): Promise<number | null> {
  // 常用端口列表
  const commonPorts = [9420, 9440, 9430, 9450, 9460];

  if (verbose) {
    console.error('🔍 检测微信开发者工具运行端口...');
  }

  // 策略1: 尝试常用端口
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

  // 策略2: 使用 lsof 命令检查（仅macOS/Linux）
  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      const { execSync } = await import('child_process');
      // 查找微信开发者工具占用的端口，只检测9400-9500范围的自动化端口
      const output = execSync(
        "lsof -i -P | grep wechat | grep LISTEN | awk '{print $9}' | cut -d: -f2 | grep '^94[0-9][0-9]$'",
        { encoding: 'utf-8', timeout: 3000 }
      ).trim();

      if (output) {
        const ports = output.split('\n').map((p: string) => parseInt(p, 10)).filter((p: number) => !isNaN(p));

        if (verbose && ports.length > 0) {
          console.error(`  lsof检测到端口: ${ports.join(', ')}`);
        }

        // 遍历检测到的端口，验证是否为有效的自动化端口
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
      // lsof 失败，继续
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

/**
 * 带重试的WebSocket连接
 */
async function connectWithRetry(wsEndpoint: string, maxRetries: number): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await automator.connect({ wsEndpoint });
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      // 指数退避重试
      await sleep(1000 * Math.pow(2, i));
    }
  }
}

/**
 * 执行健康检查
 */
async function performHealthCheck(miniProgram: any): Promise<'healthy' | 'degraded' | 'unhealthy'> {
  try {
    // 检查基本连接
    const currentPage = await miniProgram.currentPage();
    if (!currentPage) {
      return 'unhealthy';
    }

    // 检查页面响应
    const path = await currentPage.path;
    if (!path) {
      return 'degraded';
    }

    return 'healthy';
  } catch {
    return 'unhealthy';
  }
}

/**
 * 带详细错误信息的执行包装器
 */
async function executeWithDetailedError<T>(
  operation: () => Promise<T>,
  phase: 'startup' | 'connection' | 'health_check'
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const originalError = error instanceof Error ? error : new Error(String(error));
    // 保留原始错误消息，不要用通用的"阶段失败"覆盖
    throw new DevToolsConnectionError(
      originalError.message,
      phase,
      originalError,
      { timestamp: new Date().toISOString() }
    );
  }
}

/**
 * 元素快照接口
 */
export interface ElementSnapshot {
  uid: string;
  tagName: string;
  text?: string;
  attributes?: Record<string, string>;
  position?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/**
 * 页面快照接口
 */
export interface PageSnapshot {
  path: string;
  elements: ElementSnapshot[];
}

/**
 * 元素映射信息接口
 * 用于精确定位页面元素
 */
export interface ElementMapInfo {
  selector: string;  // 基础选择器，如 "button.cube-btn"
  index: number;     // 在匹配结果中的索引，从0开始
}

/**
 * 生成简单的文本哈希（用于增强 UID 唯一性）
 */
function simpleTextHash(text: string): string {
  if (!text || text.length === 0) return '';
  // 取文本的前 8 个字符，过滤特殊字符
  const sanitized = text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').slice(0, 8);
  if (sanitized.length === 0) return '';
  return `_${sanitized}`;
}

/**
 * 生成元素的唯一标识符 (uid)
 *
 * 优先级顺序（稳定性从高到低）：
 * 1. data-testid（专门用于测试，最稳定）
 * 2. id 属性
 * 3. data-id（自定义数据属性）
 * 4. class + 文本哈希（中等稳定性）
 * 5. class:eq(index)
 * 6. nth-child（兜底）
 */
export async function generateElementUid(element: any, index: number): Promise<string> {
  try {
    const tagName = element.tagName;

    // 并行获取所有可能的标识属性
    const [className, id, testId, dataId, text] = await Promise.all([
      element.attribute('class').catch(() => ''),
      element.attribute('id').catch(() => ''),
      element.attribute('data-testid').catch(() => ''),
      element.attribute('data-id').catch(() => ''),
      element.text().catch(() => '')
    ]);

    console.error(`[generateElementUid] tagName=${tagName}, id="${id}", testId="${testId}", dataId="${dataId}", className="${className}", index=${index}`);

    let selector = tagName;

    // 优先级1: data-testid（最稳定）
    if (testId) {
      selector += `[data-testid="${testId}"]`;
    }
    // 优先级2: id 属性
    else if (id) {
      selector += `#${id}`;
    }
    // 优先级3: data-id
    else if (dataId) {
      selector += `[data-id="${dataId}"]`;
    }
    // 优先级4: class + 文本哈希
    else if (className) {
      const firstClass = className.split(' ')[0];
      const textHash = simpleTextHash(text);
      selector += `.${firstClass}${textHash}`;
    }
    // 优先级5: nth-child（兜底）
    else {
      selector += `:nth-child(${index + 1})`;
    }

    console.error(`[generateElementUid] Generated UID: ${selector}`);
    return selector;
  } catch (error) {
    console.error(`[generateElementUid] Error:`, error);
    return `${element.tagName || 'unknown'}:nth-child(${index + 1})`;
  }
}

/**
 * 获取页面元素快照
 *
 * @param page 页面对象
 * @returns 页面快照和元素映射
 */
export async function getPageSnapshot(page: any): Promise<{
  snapshot: PageSnapshot;
  elementMap: Map<string, ElementMapInfo>;
}> {
  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const elements: ElementSnapshot[] = [];
    const elementMap = new Map<string, ElementMapInfo>();

    // 等待页面加载完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 尝试多种选择器策略获取元素
    let childElements: any[] = [];
    let usedStrategy = 'unknown';

    // 策略1: 优先使用通配符（最快，一次API调用）
    try {
      childElements = await page.$$('*');
      if (childElements.length > 0) {
        usedStrategy = 'wildcard(*)';
        console.error(`✅ 策略1成功: 通配符查询获取到 ${childElements.length} 个元素`);
      }
    } catch (error) {
      console.warn('⚠️  策略1失败 (*)', error);
    }

    // 策略2: 降级到常用组件选择器（仅当策略1失败时）
    if (childElements.length === 0) {
      console.error('🔄 策略1无结果，降级到策略2（常用组件选择器）');
      const commonSelectors = [
        'view', 'text', 'button', 'image', 'input', 'textarea', 'picker', 'switch',
        'slider', 'scroll-view', 'swiper', 'icon', 'rich-text', 'progress',
        'navigator', 'form', 'checkbox', 'radio', 'cover-view', 'cover-image'
      ];

      for (const selector of commonSelectors) {
        try {
          const elements = await page.$$(selector);
          childElements.push(...elements);
          if (elements.length > 0) {
            console.error(`  - ${selector}: ${elements.length} 个元素`);
          }
        } catch (error) {
          // 忽略单个选择器失败
        }
      }

      if (childElements.length > 0) {
        usedStrategy = 'common-selectors';
        console.error(`✅ 策略2成功: 获取到 ${childElements.length} 个元素`);
      }
    }

    // 策略3: 最后尝试层级选择器
    if (childElements.length === 0) {
      console.error('🔄 策略2无结果，降级到策略3（层级选择器）');
      try {
        const rootElements = await page.$$('page > *');
        childElements = rootElements;
        if (childElements.length > 0) {
          usedStrategy = 'hierarchical(page>*)';
          console.error(`✅ 策略3成功: 获取到 ${childElements.length} 个元素`);
        }
      } catch (error) {
        console.warn('⚠️  策略3失败 (page > *)', error);
      }
    }

    if (childElements.length === 0) {
      console.warn('❌ 所有策略均未获取到元素');
      return {
        snapshot: { path: await page.path, elements: [] },
        elementMap: new Map()
      };
    }

    console.error(`📊 最终获取到 ${childElements.length} 个元素（策略：${usedStrategy}）`);

    // 用于跟踪每个基础选择器的元素计数
    const selectorIndexMap = new Map<string, number>();

    // 优化：批量并行处理元素属性
    const startTime = Date.now();

    for (let i = 0; i < childElements.length; i++) {
      const element = childElements[i];
      try {
        // 🚀 优化点1: 使用 Promise.allSettled 并行获取所有元素属性
        // 减少API调用往返次数：从 6次串行 → 1次并行
        // 新增 data-testid 和 data-id 属性用于增强 UID 稳定性
        const [
          tagNameResult,
          textResult,
          classResult,
          idResult,
          testIdResult,
          dataIdResult,
          sizeResult,
          offsetResult
        ] = await Promise.allSettled([
          Promise.resolve(element.tagName || 'unknown'),
          element.text().catch(() => ''),
          element.attribute('class').catch(() => ''),
          element.attribute('id').catch(() => ''),
          element.attribute('data-testid').catch(() => ''),
          element.attribute('data-id').catch(() => ''),
          element.size().catch(() => null),
          element.offset().catch(() => null)
        ]);

        // 提取结果
        const tagName = tagNameResult.status === 'fulfilled' ? tagNameResult.value : 'unknown';
        const text = textResult.status === 'fulfilled' ? textResult.value : '';
        const className = classResult.status === 'fulfilled' ? classResult.value : '';
        const id = idResult.status === 'fulfilled' ? idResult.value : '';
        const testId = testIdResult.status === 'fulfilled' ? testIdResult.value : '';
        const dataId = dataIdResult.status === 'fulfilled' ? dataIdResult.value : '';
        const size = sizeResult.status === 'fulfilled' ? sizeResult.value : null;
        const offset = offsetResult.status === 'fulfilled' ? offsetResult.value : null;

        // 生成 UID（增强版优先级顺序）
        // 优先级：data-testid > id > data-id > class+文本哈希 > nth-child
        let selector = tagName;
        if (testId) {
          // 优先级1: data-testid（专门用于测试，最稳定）
          selector += `[data-testid="${testId}"]`;
        } else if (id) {
          // 优先级2: id 属性
          selector += `#${id}`;
        } else if (dataId) {
          // 优先级3: data-id
          selector += `[data-id="${dataId}"]`;
        } else if (className) {
          // 优先级4: class + 文本哈希（中等稳定性）
          const firstClass = className.split(' ')[0];
          const textHash = simpleTextHash(text);
          selector += `.${firstClass}${textHash}`;
        } else {
          // 优先级5: nth-child（兜底）
          selector += `:nth-child(${i + 1})`;
        }

        const uid = selector;

        // 构建快照
        const snapshot: ElementSnapshot = {
          uid,
          tagName,
        };

        // 添加文本内容
        if (text && text.trim()) {
          snapshot.text = text.trim();
        }

        // 添加位置信息
        if (size && offset) {
          snapshot.position = {
            left: offset.left,
            top: offset.top,
            width: size.width,
            height: size.height
          };
        }

        // 添加属性信息（可选，目前不收集）
        // 如果需要属性，可以在上面的 Promise.allSettled 中添加更多属性查询

        elements.push(snapshot);

        // 生成可查询的基础选择器（与 UID 优先级一致）
        let baseSelector = tagName;
        if (testId) {
          baseSelector = `${tagName}[data-testid="${testId}"]`;
        } else if (id) {
          baseSelector = `${tagName}#${id}`;
        } else if (dataId) {
          baseSelector = `${tagName}[data-id="${dataId}"]`;
        } else if (className) {
          baseSelector = `${tagName}.${className.split(' ')[0]}`;
        }

        // 计算该选择器的元素索引（递增计数）
        const currentIndex = selectorIndexMap.get(baseSelector) || 0;
        selectorIndexMap.set(baseSelector, currentIndex + 1);

        // 存储 ElementMapInfo
        elementMap.set(uid, {
          selector: baseSelector,
          index: currentIndex
        });

      } catch (error) {
        console.warn(`⚠️  处理元素 ${i} 时出错:`, error);
      }
    }

    const processingTime = Date.now() - startTime;
    console.error(`⏱️  元素处理耗时: ${processingTime}ms (平均 ${(processingTime / childElements.length).toFixed(2)}ms/元素)`);

    const pagePath = await page.path;
    const snapshot: PageSnapshot = {
      path: pagePath,
      elements
    };

    return { snapshot, elementMap };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`获取页面快照失败: ${errorMessage}`);
  }
}

/**
 * 点击元素选项接口
 */
export interface ClickOptions {
  uid: string;
  dblClick?: boolean;
}

/**
 * 点击页面元素
 *
 * @param page 页面对象
 * @param elementMap 元素映射
 * @param options 点击选项
 */
export async function clickElement(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: ClickOptions
): Promise<void> {
  const { uid, dblClick = false } = options;

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    // 通过uid查找元素映射信息
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    console.error(`[Click] 准备点击元素 - UID: ${uid}, Selector: ${mapInfo.selector}, Index: ${mapInfo.index}`);

    // 使用选择器获取所有匹配元素
    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(`无法找到选择器为 ${mapInfo.selector} 的元素`);
    }

    // 检查索引是否有效
    if (mapInfo.index >= elements.length) {
      throw new Error(`元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`);
    }

    // 通过索引获取目标元素
    const element = elements[mapInfo.index];
    if (!element) {
      throw new Error(`无法获取索引为 ${mapInfo.index} 的元素`);
    }

    // 记录点击前的页面路径
    const beforePath = await page.path;
    console.error(`[Click] 点击前页面: ${beforePath}`);

    // 执行点击操作
    await element.tap();
    console.error(`[Click] 已执行 tap() 操作`);

    // 如果是双击，再点击一次
    if (dblClick) {
      await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟
      await element.tap();
      console.error(`[Click] 已执行第二次 tap() (双击)`);
    }

    // 等待一小段时间，让页面有机会响应
    await new Promise(resolve => setTimeout(resolve, 300));

    // 记录点击后的页面路径
    try {
      const afterPath = await page.path;
      console.error(`[Click] 点击后页面: ${afterPath}`);
      if (beforePath !== afterPath) {
        console.error(`[Click] ✅ 页面已切换: ${beforePath} → ${afterPath}`);
      } else {
        console.error(`[Click] ⚠️  页面未切换，可能是同页面操作或导航延迟`);
      }
    } catch (error) {
      console.warn(`[Click] 无法获取点击后的页面路径:`, error);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Click] 点击失败:`, error);
    throw new Error(`点击元素失败: ${errorMessage}`);
  }
}

/**
 * 截图选项接口
 */
export interface ScreenshotOptions {
  path?: string;
}

/**
 * 页面截图
 *
 * @param miniProgram MiniProgram 对象
 * @param options 截图选项
 * @returns 如果没有指定路径，返回base64数据；否则返回undefined
 */
export async function takeScreenshot(
  miniProgram: any,
  options: ScreenshotOptions = {}
): Promise<string | undefined> {
  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    const { path } = options;

    // 确保页面完全加载和稳定
    try {
      console.error('获取当前页面并等待稳定...')
      const currentPage = await miniProgram.currentPage();
      if (currentPage && typeof currentPage.waitFor === 'function') {
        // 等待页面稳定，增加等待时间
        await currentPage.waitFor(1000);
        console.error('页面等待完成')
      }
    } catch (waitError) {
      console.warn('页面等待失败，继续尝试截图:', waitError)
    }

    // 重试机制执行截图
    let result: string | undefined
    let screenshotSucceeded = false
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.error(`截图尝试 ${attempt}/3`)
        if (path) {
          // 保存到指定路径
          await miniProgram.screenshot({ path });
          if (!fs.existsSync(path)) {
            throw new Error(`截图命令返回成功，但目标文件不存在: ${path}`)
          }
          screenshotSucceeded = true
          result = undefined
          console.error(`截图保存成功: ${path}`)
          break
        } else {
          // 返回base64数据
          const base64Data = await miniProgram.screenshot();
          console.error('截图API调用完成，检查返回数据...')
          if (base64Data && typeof base64Data === 'string' && base64Data.length > 0) {
            screenshotSucceeded = true
            result = base64Data
            console.error(`截图成功，数据长度: ${base64Data.length}`)
            break
          } else {
            throw new Error(`截图返回无效数据: ${typeof base64Data}, 长度: ${base64Data ? base64Data.length : 'null'}`)
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`截图尝试 ${attempt} 失败:`, lastError.message)

        if (attempt < 3) {
          // 重试前等待更长时间，让页面稳定
          console.error(`等待 ${1000 + attempt * 500}ms 后重试...`)
          await new Promise(resolve => setTimeout(resolve, 1000 + attempt * 500))
        }
      }
    }

    if (!screenshotSucceeded) {
      const troubleshootingTips = `

⚠️  截图功能故障排除建议：
1. 确保微信开发者工具处于**模拟器模式**（非真机调试）
2. 检查工具设置:
   - 设置 → 安全设置 → 服务端口 ✅
   - 设置 → 通用设置 → 自动化测试 ✅
3. 检查 macOS 系统权限:
   - 系统偏好设置 → 安全性与隐私 → 隐私 → 屏幕录制
   - 确保微信开发者工具在允许列表中
4. 尝试重启微信开发者工具
5. 查看详细文档: docs/SCREENSHOT_ISSUE.md

最后错误: ${lastError?.message || '未知错误'}`;

      throw new Error(`截图失败，已重试3次${troubleshootingTips}`)
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // 如果错误信息已包含故障排除建议，直接抛出
    if (errorMessage.includes('故障排除建议')) {
      throw error;
    }
    // 否则添加简要提示
    throw new Error(`${errorMessage}\n\n提示: 查看 docs/SCREENSHOT_ISSUE.md 了解详细的故障排除方法`);
  }
}

/**
 * 查询结果接口
 */
export interface QueryResult {
  uid: string;
  tagName: string;
  text?: string;
  attributes?: Record<string, string>;
  position?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/**
 * 查询元素选项接口
 */
export interface QueryOptions {
  selector: string;
}

/**
 * 通过选择器查询页面元素
 *
 * @param page 页面对象
 * @param elementMap 元素映射
 * @param options 查询选项
 * @returns 匹配元素的信息数组
 */
export async function queryElements(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: QueryOptions
): Promise<QueryResult[]> {
  const { selector } = options;

  if (!selector || typeof selector !== 'string' || selector.trim() === '') {
    throw new Error("选择器不能为空");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    // 通过选择器查找元素
    const elements = await page.$$(selector);
    const results: QueryResult[] = [];

    // 用于跟踪 UID 冲突
    const uidCounter = new Map<string, number>();

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      try {
        // 使用 generateElementUid 生成基础 UID
        const baseUid = await generateElementUid(element, i);

        // 检测 UID 冲突并添加 [N] 后缀
        const count = uidCounter.get(baseUid) || 0;
        uidCounter.set(baseUid, count + 1);

        // 第一个元素不加后缀，后续元素添加 [N] 后缀
        const uid = count === 0 ? baseUid : `${baseUid}[${count + 1}]`;

        const result: QueryResult = {
          uid,
          tagName: element.tagName || 'unknown',
        };

        // 获取元素文本
        try {
          const text = await element.text();
          if (text && text.trim()) {
            result.text = text.trim();
          }
        } catch (error) {
          // 忽略无法获取文本的元素
        }

        // 获取元素位置信息
        try {
          const [size, offset] = await Promise.all([
            element.size(),
            element.offset()
          ]);

          result.position = {
            left: offset.left,
            top: offset.top,
            width: size.width,
            height: size.height
          };
        } catch (error) {
          // 忽略无法获取位置的元素
        }

        // 获取常用属性
        try {
          const attributes: Record<string, string> = {};
          const commonAttrs = ['class', 'id', 'data-testid'];
          for (const attr of commonAttrs) {
            try {
              const value = await element.attribute(attr);
              if (value) {
                attributes[attr] = value;
              }
            } catch (error) {
              // 忽略不存在的属性
            }
          }

          if (Object.keys(attributes).length > 0) {
            result.attributes = attributes;
          }
        } catch (error) {
          // 忽略属性获取错误
        }

        results.push(result);

        // 填充 elementMap：使用原始查询选择器和数组索引
        elementMap.set(uid, {
          selector: selector,  // 使用原始查询选择器，而不是 baseUid
          index: i             // 使用在查询结果中的索引位置
        });

      } catch (error) {
        console.warn(`Error processing element ${i}:`, error);
      }
    }

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`查询元素失败: ${errorMessage}`);
  }
}

/**
 * 等待条件接口
 */
export interface WaitForOptions {
  selector?: string;     // 等待元素选择器
  timeout?: number;      // 超时时间(ms)，默认5000ms
  text?: string;         // 等待文本匹配
  visible?: boolean;     // 等待元素可见状态
  disappear?: boolean;   // 等待元素消失
}

/**
 * 等待条件满足
 *
 * @param page 页面对象
 * @param options 等待选项
 * @returns 等待结果
 */
export async function waitForCondition(
  page: any,
  options: WaitForOptions | number | string
): Promise<boolean> {
  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    // 处理简单的数字超时
    if (typeof options === 'number') {
      await page.waitFor(options);
      return true;
    }

    // 处理简单的选择器字符串
    if (typeof options === 'string') {
      const startTime = Date.now();
      const timeout = 5000; // 默认5秒超时

      while (Date.now() - startTime < timeout) {
        try {
          const element = await page.$(options);
          if (element) {
            return true;
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`等待元素 ${options} 超时`);
    }

    // 处理复杂的等待条件对象
    const {
      selector,
      timeout = 5000,
      text,
      visible,
      disappear = false
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        if (selector) {
          const element = await page.$(selector);

          if (disappear) {
            // 等待元素消失
            if (!element) {
              return true;
            }
          } else {
            // 等待元素出现
            if (element) {
              // 检查文本匹配
              if (text) {
                try {
                  const elementText = await element.text();
                  if (!elementText || !elementText.includes(text)) {
                    throw new Error('文本不匹配');
                  }
                } catch (error) {
                  throw new Error('文本不匹配');
                }
              }

              // 检查可见性
              if (visible !== undefined) {
                try {
                  const size = await element.size();
                  const isVisible = size.width > 0 && size.height > 0;
                  if (isVisible !== visible) {
                    throw new Error('可见性不匹配');
                  }
                } catch (error) {
                  throw new Error('可见性不匹配');
                }
              }

              return true;
            }
          }
        } else if (typeof timeout === 'number') {
          // 简单的时间等待
          await page.waitFor(timeout);
          return true;
        }
      } catch (error) {
        // 继续等待，直到超时
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 构建错误信息
    let errorMsg = '等待条件超时: ';
    if (selector) {
      errorMsg += `选择器 ${selector}`;
      if (disappear) errorMsg += ' 消失';
      if (text) errorMsg += ` 包含文本 "${text}"`;
      if (visible !== undefined) errorMsg += ` ${visible ? '可见' : '隐藏'}`;
    }
    throw new Error(errorMsg);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`等待条件失败: ${errorMessage}`);
  }
}

/**
 * 文本输入选项接口
 */
export interface InputTextOptions {
  uid: string;
  text: string;
  clear?: boolean;
  append?: boolean;
}

/**
 * 表单控件选项接口
 */
export interface FormControlOptions {
  uid: string;
  value: any;
  trigger?: string;
}

/**
 * 获取值选项接口
 */
export interface GetValueOptions {
  uid: string;
  attribute?: string;
}

/**
 * 向元素输入文本
 *
 * @param page 页面对象
 * @param elementMap 元素映射
 * @param options 输入选项
 */
export async function inputText(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: InputTextOptions
): Promise<void> {
  const { uid, text, clear = false, append = false } = options;

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    // 通过uid查找元素映射信息
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    // 使用选择器获取所有匹配元素
    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(`无法找到选择器为 ${mapInfo.selector} 的元素`);
    }

    // 检查索引是否有效
    if (mapInfo.index >= elements.length) {
      throw new Error(`元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`);
    }

    // 通过索引获取目标元素
    const element = elements[mapInfo.index];
    if (!element) {
      throw new Error(`无法获取索引为 ${mapInfo.index} 的元素`);
    }

    // 清空元素（如果需要）
    if (clear && !append) {
      await element.clear();
    }

    // 输入文本
    if (append) {
      // 追加模式：先获取现有值
      const currentValue = await element.value().catch(() => '');
      await element.input(currentValue + text);
    } else {
      await element.input(text);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`文本输入失败: ${errorMessage}`);
  }
}

/**
 * 获取元素值
 *
 * @param page 页面对象
 * @param elementMap 元素映射
 * @param options 获取选项
 * @returns 元素值
 */
export async function getElementValue(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: GetValueOptions
): Promise<string> {
  const { uid, attribute } = options;

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    // 通过uid查找元素映射信息
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    // 使用选择器获取所有匹配元素
    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(`无法找到选择器为 ${mapInfo.selector} 的元素`);
    }

    // 检查索引是否有效
    if (mapInfo.index >= elements.length) {
      throw new Error(`元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`);
    }

    // 通过索引获取目标元素
    const element = elements[mapInfo.index];
    if (!element) {
      throw new Error(`无法获取索引为 ${mapInfo.index} 的元素`);
    }

    // 获取值
    if (attribute) {
      return await element.attribute(attribute);
    } else {
      // 尝试获取value属性，如果失败则获取text
      try {
        return await element.value();
      } catch (error) {
        return await element.text();
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`获取元素值失败: ${errorMessage}`);
  }
}

/**
 * 设置表单控件值
 *
 * @param page 页面对象
 * @param elementMap 元素映射
 * @param options 设置选项
 */
export async function setFormControl(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: FormControlOptions
): Promise<void> {
  const { uid, value, trigger = 'change' } = options;

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    // 通过uid查找元素映射信息
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    // 使用选择器获取所有匹配元素
    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(`无法找到选择器为 ${mapInfo.selector} 的元素`);
    }

    // 检查索引是否有效
    if (mapInfo.index >= elements.length) {
      throw new Error(`元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`);
    }

    // 通过索引获取目标元素
    const element = elements[mapInfo.index];
    if (!element) {
      throw new Error(`无法获取索引为 ${mapInfo.index} 的元素`);
    }

    // 设置值并触发事件
    await element.trigger(trigger, { value });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`设置表单控件失败: ${errorMessage}`);
  }
}

/**
 * 断言结果接口
 */
export interface AssertResult {
  passed: boolean;
  message: string;
  actual: any;
  expected: any;
  timestamp: number;
}

/**
 * 元素存在性断言选项接口
 */
export interface ExistenceAssertOptions {
  selector?: string;
  uid?: string;
  timeout?: number;
  shouldExist: boolean;
}

/**
 * 元素状态断言选项接口
 */
export interface StateAssertOptions {
  uid: string;
  visible?: boolean;
  enabled?: boolean;
  checked?: boolean;
  focused?: boolean;
}

/**
 * 内容断言选项接口
 */
export interface ContentAssertOptions {
  uid: string;
  text?: string;
  textContains?: string;
  textMatches?: string;
  attribute?: { key: string; value: string };
}

/**
 * 断言元素存在性
 *
 * @param page 页面对象
 * @param options 断言选项
 * @returns 断言结果
 */
export async function assertElementExists(
  page: any,
  options: ExistenceAssertOptions
): Promise<AssertResult> {
  const { selector, uid, timeout = 5000, shouldExist } = options;

  if (!selector && !uid) {
    throw new Error("必须提供selector或uid参数");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  const startTime = Date.now();
  let element = null;
  let actualExists = false;

  try {
    // 在超时时间内检查元素存在性
    while (Date.now() - startTime < timeout) {
      try {
        if (selector) {
          element = await page.$(selector);
        } else if (uid) {
          // 如果只有uid，需要先从elementMap获取selector
          // 这里假设调用者已经有了正确的映射关系
          element = await page.$(uid);
        }

        actualExists = !!element;

        if (actualExists === shouldExist) {
          return {
            passed: true,
            message: `断言通过: 元素${shouldExist ? '存在' : '不存在'}`,
            actual: actualExists,
            expected: shouldExist,
            timestamp: Date.now()
          };
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // 继续检查直到超时
      }
    }

    // 超时后返回失败结果
    return {
      passed: false,
      message: `断言失败: 期望元素${shouldExist ? '存在' : '不存在'}，实际${actualExists ? '存在' : '不存在'}`,
      actual: actualExists,
      expected: shouldExist,
      timestamp: Date.now()
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      message: `断言执行失败: ${errorMessage}`,
      actual: null,
      expected: shouldExist,
      timestamp: Date.now()
    };
  }
}

/**
 * 断言元素可见性
 *
 * @param page 页面对象
 * @param elementMap 元素映射
 * @param options 断言选项
 * @returns 断言结果
 */
export async function assertElementVisible(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: StateAssertOptions
): Promise<AssertResult> {
  const { uid, visible } = options;

  if (visible === undefined) {
    throw new Error("必须指定visible参数");
  }

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    // 通过uid查找元素映射信息
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      return {
        passed: false,
        message: `断言失败: 找不到uid为 ${uid} 的元素`,
        actual: null,
        expected: visible,
        timestamp: Date.now()
      };
    }

    // 使用选择器获取所有匹配元素
    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      return {
        passed: false,
        message: `断言失败: 无法找到选择器为 ${mapInfo.selector} 的元素`,
        actual: false,
        expected: visible,
        timestamp: Date.now()
      };
    }

    // 检查索引是否有效
    if (mapInfo.index >= elements.length) {
      return {
        passed: false,
        message: `断言失败: 元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`,
        actual: false,
        expected: visible,
        timestamp: Date.now()
      };
    }

    // 通过索引获取目标元素
    const element = elements[mapInfo.index];
    if (!element) {
      return {
        passed: false,
        message: `断言失败: 无法获取索引为 ${mapInfo.index} 的元素`,
        actual: false,
        expected: visible,
        timestamp: Date.now()
      };
    }

    // 检查可见性
    const size = await element.size();
    const actualVisible = size.width > 0 && size.height > 0;

    const passed = actualVisible === visible;
    return {
      passed,
      message: passed
        ? `断言通过: 元素${visible ? '可见' : '不可见'}`
        : `断言失败: 期望元素${visible ? '可见' : '不可见'}，实际${actualVisible ? '可见' : '不可见'}`,
      actual: actualVisible,
      expected: visible,
      timestamp: Date.now()
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      message: `断言执行失败: ${errorMessage}`,
      actual: null,
      expected: visible,
      timestamp: Date.now()
    };
  }
}

/**
 * 断言元素文本内容
 *
 * @param page 页面对象
 * @param elementMap 元素映射
 * @param options 断言选项
 * @returns 断言结果
 */
export async function assertElementText(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: ContentAssertOptions
): Promise<AssertResult> {
  const { uid, text, textContains, textMatches } = options;

  if (!text && !textContains && !textMatches) {
    throw new Error("必须指定text、textContains或textMatches参数之一");
  }

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    // 通过uid查找元素映射信息
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      return {
        passed: false,
        message: `断言失败: 找不到uid为 ${uid} 的元素`,
        actual: null,
        expected: text || textContains || textMatches,
        timestamp: Date.now()
      };
    }

    // 使用选择器获取所有匹配元素
    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      return {
        passed: false,
        message: `断言失败: 无法找到选择器为 ${mapInfo.selector} 的元素`,
        actual: null,
        expected: text || textContains || textMatches,
        timestamp: Date.now()
      };
    }

    // 检查索引是否有效
    if (mapInfo.index >= elements.length) {
      return {
        passed: false,
        message: `断言失败: 元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`,
        actual: null,
        expected: text || textContains || textMatches,
        timestamp: Date.now()
      };
    }

    // 通过索引获取目标元素
    const element = elements[mapInfo.index];
    if (!element) {
      return {
        passed: false,
        message: `断言失败: 无法获取索引为 ${mapInfo.index} 的元素`,
        actual: null,
        expected: text || textContains || textMatches,
        timestamp: Date.now()
      };
    }

    // 获取元素文本
    const actualText = await element.text();
    let passed = false;
    let expectedValue = '';
    let message = '';

    if (text) {
      // 精确匹配
      passed = actualText === text;
      expectedValue = text;
      message = passed
        ? `断言通过: 文本精确匹配`
        : `断言失败: 期望文本 "${text}"，实际 "${actualText}"`;
    } else if (textContains) {
      // 包含匹配
      passed = actualText.includes(textContains);
      expectedValue = textContains;
      message = passed
        ? `断言通过: 文本包含 "${textContains}"`
        : `断言失败: 期望包含 "${textContains}"，实际文本 "${actualText}"`;
    } else if (textMatches) {
      // 正则匹配
      const regex = new RegExp(textMatches);
      passed = regex.test(actualText);
      expectedValue = textMatches;
      message = passed
        ? `断言通过: 文本匹配正则 ${textMatches}`
        : `断言失败: 期望匹配正则 ${textMatches}，实际文本 "${actualText}"`;
    }

    return {
      passed,
      message,
      actual: actualText,
      expected: expectedValue,
      timestamp: Date.now()
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      message: `断言执行失败: ${errorMessage}`,
      actual: null,
      expected: text || textContains || textMatches,
      timestamp: Date.now()
    };
  }
}

/**
 * 断言元素属性
 *
 * @param page 页面对象
 * @param elementMap 元素映射
 * @param options 断言选项
 * @returns 断言结果
 */
export async function assertElementAttribute(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: ContentAssertOptions
): Promise<AssertResult> {
  const { uid, attribute } = options;

  if (!attribute) {
    throw new Error("必须指定attribute参数");
  }

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    // 通过uid查找元素映射信息
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      return {
        passed: false,
        message: `断言失败: 找不到uid为 ${uid} 的元素`,
        actual: null,
        expected: attribute.value,
        timestamp: Date.now()
      };
    }

    // 使用选择器获取所有匹配元素
    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      return {
        passed: false,
        message: `断言失败: 无法找到选择器为 ${mapInfo.selector} 的元素`,
        actual: null,
        expected: attribute.value,
        timestamp: Date.now()
      };
    }

    // 检查索引是否有效
    if (mapInfo.index >= elements.length) {
      return {
        passed: false,
        message: `断言失败: 元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`,
        actual: null,
        expected: attribute.value,
        timestamp: Date.now()
      };
    }

    // 通过索引获取目标元素
    const element = elements[mapInfo.index];
    if (!element) {
      return {
        passed: false,
        message: `断言失败: 无法获取索引为 ${mapInfo.index} 的元素`,
        actual: null,
        expected: attribute.value,
        timestamp: Date.now()
      };
    }

    // 获取属性值
    const actualValue = await element.attribute(attribute.key);
    const passed = actualValue === attribute.value;

    return {
      passed,
      message: passed
        ? `断言通过: 属性 ${attribute.key} 值为 "${attribute.value}"`
        : `断言失败: 期望属性 ${attribute.key} 值为 "${attribute.value}"，实际 "${actualValue}"`,
      actual: actualValue,
      expected: attribute.value,
      timestamp: Date.now()
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      message: `断言执行失败: ${errorMessage}`,
      actual: null,
      expected: attribute.value,
      timestamp: Date.now()
    };
  }
}

/**
 * 页面导航选项接口
 */
export interface NavigateOptions {
  url: string;
  params?: Record<string, any>;
  waitForLoad?: boolean;
  timeout?: number;
}

/**
 * 返回导航选项接口
 */
export interface NavigateBackOptions {
  delta?: number;
  waitForLoad?: boolean;
  timeout?: number;
}

/**
 * Tab切换选项接口
 */
export interface SwitchTabOptions {
  url: string;
  index?: number;
  waitForLoad?: boolean;
  timeout?: number;
}

/**
 * 页面状态接口
 */
export interface PageStateOptions {
  expectPath?: string;
  expectTitle?: string;
}

/**
 * 页面信息接口
 */
export interface PageInfo {
  path: string;
  title?: string;
  query?: Record<string, any>;
}

/**
 * 跳转到指定页面
 *
 * @param miniProgram MiniProgram对象
 * @param options 导航选项
 */
export async function navigateToPage(
  miniProgram: any,
  options: NavigateOptions
): Promise<void> {
  const { url, params, waitForLoad = true, timeout = 10000 } = options;

  if (!url) {
    throw new Error("页面URL是必需的");
  }

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    // 构建完整的URL
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      fullUrl += (url.includes('?') ? '&' : '?') + queryString;
    }

    // 执行页面跳转
    await miniProgram.navigateTo(fullUrl);

    // 等待页面加载完成
    if (waitForLoad) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        try {
          const currentPage = await miniProgram.currentPage();
          if (currentPage) {
            const currentPath = await currentPage.path;
            // 检查是否已经跳转到目标页面
            if (currentPath.includes(url.split('?')[0])) {
              break;
            }
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`页面跳转失败: ${errorMessage}`);
  }
}

/**
 * 返回上一页
 *
 * @param miniProgram MiniProgram对象
 * @param options 返回选项
 */
export async function navigateBack(
  miniProgram: any,
  options: NavigateBackOptions = {}
): Promise<void> {
  const { delta = 1, waitForLoad = true, timeout = 5000 } = options;

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    // 获取当前页面路径（用于验证是否成功返回）
    let currentPath = '';
    try {
      const currentPage = await miniProgram.currentPage();
      currentPath = await currentPage.path;
    } catch (error) {
      // 忽略获取当前路径的错误
    }

    // 执行返回操作
    await miniProgram.navigateBack(delta);

    // 等待页面加载完成
    if (waitForLoad) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        try {
          const newPage = await miniProgram.currentPage();
          if (newPage) {
            const newPath = await newPage.path;
            // 检查是否已经成功返回（路径发生变化）
            if (newPath !== currentPath) {
              break;
            }
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`页面返回失败: ${errorMessage}`);
  }
}

/**
 * 切换到Tab页
 *
 * @param miniProgram MiniProgram对象
 * @param options Tab切换选项
 */
export async function switchTab(
  miniProgram: any,
  options: SwitchTabOptions
): Promise<void> {
  const { url, waitForLoad = true, timeout = 5000 } = options;

  if (!url) {
    throw new Error("Tab页URL是必需的");
  }

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    // 执行Tab切换
    await miniProgram.switchTab(url);

    // 等待页面加载完成
    if (waitForLoad) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        try {
          const currentPage = await miniProgram.currentPage();
          if (currentPage) {
            const currentPath = await currentPage.path;
            // 检查是否已经切换到目标Tab页
            if (currentPath.includes(url.split('?')[0])) {
              break;
            }
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Tab切换失败: ${errorMessage}`);
  }
}

/**
 * 获取当前页面信息
 *
 * @param miniProgram MiniProgram对象
 * @returns 页面信息
 */
export async function getCurrentPageInfo(
  miniProgram: any
): Promise<PageInfo> {
  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    const currentPage = await miniProgram.currentPage();
    if (!currentPage) {
      throw new Error("无法获取当前页面");
    }

    const path = await currentPage.path;

    // 尝试获取页面标题和查询参数
    let title: string | undefined;
    let query: Record<string, any> | undefined;

    try {
      // 获取页面数据（如果可用）
      const data = await currentPage.data();
      if (data) {
        title = data.title || data.navigationBarTitleText;
        query = data.query || data.options;
      }
    } catch (error) {
      // 如果无法获取页面数据，忽略错误
    }

    return {
      path,
      title,
      query
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`获取页面信息失败: ${errorMessage}`);
  }
}

/**
 * 重新启动到指定页面
 *
 * @param miniProgram MiniProgram对象
 * @param options 导航选项
 */
export async function reLaunch(
  miniProgram: any,
  options: NavigateOptions
): Promise<void> {
  const { url, params, waitForLoad = true, timeout = 10000 } = options;

  if (!url) {
    throw new Error("页面URL是必需的");
  }

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    // 构建完整的URL
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      fullUrl += (url.includes('?') ? '&' : '?') + queryString;
    }

    // 执行重新启动
    await miniProgram.reLaunch(fullUrl);

    // 等待页面加载完成
    if (waitForLoad) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        try {
          const currentPage = await miniProgram.currentPage();
          if (currentPage) {
            const currentPath = await currentPage.path;
            // 检查是否已经重新启动到目标页面
            if (currentPath.includes(url.split('?')[0])) {
              break;
            }
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`重新启动失败: ${errorMessage}`);
  }
}
