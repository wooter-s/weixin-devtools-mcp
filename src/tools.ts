/**
 * 微信开发者工具 MCP 工具函数
 * 提供可测试的纯函数实现
 */

import automator from "miniprogram-automator";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import { promisify } from "util";
const sleep = promisify(setTimeout);

/**
 * 连接选项接口
 */
export interface ConnectOptions {
  projectPath: string;
  cliPath?: string;
  port?: number;
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
export class DevToolsConnectionError extends Error {
  constructor(
    message: string,
    public phase: 'startup' | 'connection' | 'health_check',
    public originalError?: Error,
    public details?: Record<string, any>
  ) {
    super(message);
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
 * 连接到微信开发者工具
 *
 * @param options 连接选项
 * @returns 连接结果
 * @throws 连接失败时抛出错误
 */
export async function connectDevtools(options: ConnectOptions): Promise<ConnectResult> {
  const { projectPath, cliPath, port } = options;

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

    // 构建 automator.launch 的选项
    const launchOptions: any = { projectPath: resolvedProjectPath };
    if (cliPath) launchOptions.cliPath = cliPath;
    if (port) launchOptions.port = port;

    // 启动并连接微信开发者工具
    const miniProgram = await automator.launch(launchOptions);

    // 获取当前页面
    const currentPage = await miniProgram.currentPage();
    if (!currentPage) {
      throw new Error("无法获取当前页面");
    }
    const pagePath = await currentPage.path;

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
    fallbackMode = true,
    healthCheck = true,
    verbose = false
  } = options;

  const startTime = Date.now();

  if (verbose) {
    console.log(`开始连接微信开发者工具，模式: ${mode}`);
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
 * 智能连接逻辑
 */
async function intelligentConnect(
  options: EnhancedConnectOptions,
  startTime: number
): Promise<DetailedConnectResult> {
  const port = options.autoPort || options.port || 9420;

  // 检测开发者工具是否已运行
  const isRunning = await checkDevToolsRunning(port);

  if (options.verbose) {
    console.log(`微信开发者工具运行状态: ${isRunning ? '运行中' : '未运行'}`);
  }

  if (isRunning) {
    // 如果已启动，尝试直接连接
    try {
      return await connectMode(options, startTime);
    } catch (error) {
      if (options.verbose) {
        console.log('直接连接失败，尝试回退到启动模式');
      }

      // 如果允许回退，使用Launch模式
      if (options.fallbackMode) {
        return await launchMode(options, startTime);
      }
      throw error;
    }
  } else {
    // 未启动，使用两阶段启动
    return await connectMode(options, startTime);
  }
}

/**
 * Connect模式：两阶段连接
 */
async function connectMode(
  options: EnhancedConnectOptions,
  startTime: number
): Promise<DetailedConnectResult> {
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
    port: options.autoPort || options.port
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
    console.log('执行CLI命令:', cliCommand.join(' '));
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
    console.log('连接WebSocket端点:', wsEndpoint);
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

  // 使用正确的端口参数名
  if (options.autoPort) {
    args.push('--port', options.autoPort.toString());
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
 */
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

    if (process.stdout) {
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
    }

    if (process.stderr) {
      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
    }

    process.on('error', (error) => {
      reject(new Error(`CLI命令执行失败: ${error.message}`));
    });

    process.on('spawn', () => {
      // CLI命令已启动，返回进程对象
      resolve(process);
    });

    // 设置超时
    setTimeout(() => {
      if (!process.killed) {
        process.kill();
        reject(new Error('CLI命令启动超时'));
      }
    }, 10000);
  });
}

/**
 * 等待WebSocket服务就绪
 */
async function waitForWebSocketReady(port: number, timeout: number, verbose: boolean = false): Promise<void> {
  const startTime = Date.now();
  let attempt = 0;
  const maxAttempts = Math.ceil(timeout / 1000); // 每秒检查一次

  if (verbose) {
    console.log(`等待WebSocket服务启动，端口: ${port}，超时: ${timeout}ms`);
  }

  while (Date.now() - startTime < timeout) {
    attempt++;

    if (verbose && attempt % 5 === 0) { // 每5秒显示一次进度
      const elapsed = Date.now() - startTime;
      console.log(`WebSocket检测进度: ${Math.round(elapsed/1000)}s / ${Math.round(timeout/1000)}s`);
    }

    // 尝试多种检测方式
    const isReady = await checkDevToolsRunning(port) || await checkWebSocketDirectly(port);

    if (isReady) {
      if (verbose) {
        const elapsed = Date.now() - startTime;
        console.log(`WebSocket服务已启动，耗时: ${elapsed}ms`);
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
    const response = await fetch(`http://localhost:${port}/json/version`, {
      signal: AbortSignal.timeout(1000)
    });
    return response.ok;
  } catch {
    return false;
  }
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
    throw new DevToolsConnectionError(
      `${phase}阶段失败`,
      phase,
      error instanceof Error ? error : new Error(String(error)),
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
 * 生成元素的唯一标识符 (uid)
 */
export async function generateElementUid(element: any, index: number): Promise<string> {
  try {
    const tagName = element.tagName;
    const className = await element.attribute('class').catch(() => '');
    const id = await element.attribute('id').catch(() => '');

    let selector = tagName;
    if (id) {
      selector += `#${id}`;
    } else if (className) {
      selector += `.${className.split(' ')[0]}`;
    } else {
      selector += `:nth-child(${index + 1})`;
    }

    return selector;
  } catch (error) {
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
  elementMap: Map<string, string>;
}> {
  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const elements: ElementSnapshot[] = [];
    const elementMap = new Map<string, string>();

    // 等待页面加载完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 尝试多种选择器策略获取元素
    let childElements: any[] = [];

    // 策略1: 尝试获取所有元素
    try {
      childElements = await page.$$('*');
      console.log(`策略1 (*) 获取到 ${childElements.length} 个元素`);
    } catch (error) {
      console.log('策略1 (*) 失败:', error);
    }

    // 策略2: 如果策略1失败，尝试小程序常用组件
    if (childElements.length === 0) {
      const commonSelectors = [
        'view', 'text', 'button', 'image', 'input', 'textarea', 'picker', 'switch',
        'slider', 'scroll-view', 'swiper', 'icon', 'rich-text', 'progress',
        'navigator', 'form', 'checkbox', 'radio', 'cover-view', 'cover-image'
      ];

      for (const selector of commonSelectors) {
        try {
          const elements = await page.$$(selector);
          childElements.push(...elements);
          console.log(`策略2 (${selector}) 获取到 ${elements.length} 个元素`);
        } catch (error) {
          console.log(`策略2 (${selector}) 失败:`, error);
        }
      }
    }

    // 策略3: 如果还是没有元素，尝试根据层级查找
    if (childElements.length === 0) {
      try {
        const rootElements = await page.$$('page > *');
        childElements = rootElements;
        console.log(`策略3 (page > *) 获取到 ${childElements.length} 个元素`);
      } catch (error) {
        console.log('策略3 (page > *) 失败:', error);
      }
    }

    console.log(`最终获取到 ${childElements.length} 个元素`);

    for (let i = 0; i < childElements.length; i++) {
      const element = childElements[i];
      try {
        const uid = await generateElementUid(element, i);

        const snapshot: ElementSnapshot = {
          uid,
          tagName: element.tagName || 'unknown',
        };

        // 获取元素文本
        try {
          const text = await element.text();
          if (text && text.trim()) {
            snapshot.text = text.trim();
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

          snapshot.position = {
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
          const commonAttrs = ['class', 'id', 'data-*'];
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
            snapshot.attributes = attributes;
          }
        } catch (error) {
          // 忽略属性获取错误
        }

        elements.push(snapshot);
        elementMap.set(uid, uid);

      } catch (error) {
        console.warn(`Error processing element ${i}:`, error);
      }
    }

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
  elementMap: Map<string, string>,
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
    // 通过uid查找元素
    const selector = elementMap.get(uid);
    if (!selector) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    // 获取元素并点击
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`无法找到选择器为 ${selector} 的元素`);
    }

    // 执行点击操作
    await element.tap();

    // 如果是双击，再点击一次
    if (dblClick) {
      await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟
      await element.tap();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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
      console.log('获取当前页面并等待稳定...')
      const currentPage = await miniProgram.currentPage();
      if (currentPage && typeof currentPage.waitFor === 'function') {
        // 等待页面稳定，增加等待时间
        await currentPage.waitFor(1000);
        console.log('页面等待完成')
      }
    } catch (waitError) {
      console.warn('页面等待失败，继续尝试截图:', waitError)
    }

    // 重试机制执行截图
    let result: string | undefined
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`截图尝试 ${attempt}/3`)
        if (path) {
          // 保存到指定路径
          await miniProgram.screenshot({ path });
          result = undefined
          console.log(`截图保存成功: ${path}`)
          break
        } else {
          // 返回base64数据
          const base64Data = await miniProgram.screenshot();
          console.log('截图API调用完成，检查返回数据...')
          if (base64Data && typeof base64Data === 'string' && base64Data.length > 0) {
            result = base64Data
            console.log(`截图成功，数据长度: ${base64Data.length}`)
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
          console.log(`等待 ${1000 + attempt * 500}ms 后重试...`)
          await new Promise(resolve => setTimeout(resolve, 1000 + attempt * 500))
        }
      }
    }

    if (!result && !path) {
      throw new Error(`截图失败，已重试3次。最后错误: ${lastError?.message || '未知错误'}`)
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`截图失败: ${errorMessage}`);
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
  elementMap: Map<string, string>,
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

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      try {
        const uid = `${selector}:nth-child(${i + 1})`;

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

        // 更新元素映射，使用实际的CSS选择器
        const actualSelector = `${selector}:nth-child(${i + 1})`;
        elementMap.set(uid, actualSelector);

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
  elementMap: Map<string, string>,
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
    // 通过uid查找元素
    const selector = elementMap.get(uid);
    if (!selector) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    // 获取元素
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`无法找到选择器为 ${selector} 的元素`);
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
  elementMap: Map<string, string>,
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
    // 通过uid查找元素
    const selector = elementMap.get(uid);
    if (!selector) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    // 获取元素
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`无法找到选择器为 ${selector} 的元素`);
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
  elementMap: Map<string, string>,
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
    // 通过uid查找元素
    const selector = elementMap.get(uid);
    if (!selector) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    // 获取元素
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`无法找到选择器为 ${selector} 的元素`);
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
  elementMap: Map<string, string>,
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
    // 通过uid查找元素
    const selector = elementMap.get(uid);
    if (!selector) {
      return {
        passed: false,
        message: `断言失败: 找不到uid为 ${uid} 的元素`,
        actual: null,
        expected: visible,
        timestamp: Date.now()
      };
    }

    // 获取元素
    const element = await page.$(selector);
    if (!element) {
      return {
        passed: false,
        message: `断言失败: 无法找到选择器为 ${selector} 的元素`,
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
  elementMap: Map<string, string>,
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
    // 通过uid查找元素
    const selector = elementMap.get(uid);
    if (!selector) {
      return {
        passed: false,
        message: `断言失败: 找不到uid为 ${uid} 的元素`,
        actual: null,
        expected: text || textContains || textMatches,
        timestamp: Date.now()
      };
    }

    // 获取元素
    const element = await page.$(selector);
    if (!element) {
      return {
        passed: false,
        message: `断言失败: 无法找到选择器为 ${selector} 的元素`,
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
  elementMap: Map<string, string>,
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
    // 通过uid查找元素
    const selector = elementMap.get(uid);
    if (!selector) {
      return {
        passed: false,
        message: `断言失败: 找不到uid为 ${uid} 的元素`,
        actual: null,
        expected: attribute.value,
        timestamp: Date.now()
      };
    }

    // 获取元素
    const element = await page.$(selector);
    if (!element) {
      return {
        passed: false,
        message: `断言失败: 无法找到选择器为 ${selector} 的元素`,
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
    await miniProgram.navigateTo({ url: fullUrl });

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
    await miniProgram.navigateBack({ delta });

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
    await miniProgram.switchTab({ url });

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
    await miniProgram.reLaunch({ url: fullUrl });

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
