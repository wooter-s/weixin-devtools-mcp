/**
 * 连接管理工具
 * 负责微信开发者工具的连接和断开
 */

import { z } from 'zod';

import { connectDevtoolsEnhanced, type EnhancedConnectOptions, DevToolsConnectionError } from '../tools.js';

import type { ConsoleMessage, ExceptionMessage } from './ToolDefinition.js';
import { defineTool } from './ToolDefinition.js';

// 注意: connect_devtools（传统模式）已移除，请使用 connect_devtools_enhanced（智能连接）

/**
 * 智能连接到微信开发者工具（增强版）
 */
export const connectDevtoolsEnhancedTool = defineTool({
  name: 'connect_devtools_enhanced',
  description: '智能连接到微信开发者工具，支持多种模式和自动回退（推荐）',
  schema: z.object({
    projectPath: z.string().describe('小程序项目的绝对路径'),
    mode: z.enum(['auto', 'launch', 'connect']).optional().default('auto')
      .describe('连接模式: auto(智能), launch(传统), connect(两阶段)'),
    cliPath: z.string().optional().describe('微信开发者工具CLI的绝对路径（可选）'),
    autoPort: z.number().optional().describe('自动化监听端口（可选，默认自动检测）'),
    autoAccount: z.string().optional().describe('指定用户openid（--auto-account）'),
    timeout: z.number().optional().default(45000).describe('连接超时时间（毫秒）'),
    fallbackMode: z.boolean().optional().default(true).describe('允许模式回退'),
    healthCheck: z.boolean().optional().default(true).describe('执行健康检查'),
    verbose: z.boolean().optional().default(false).describe('详细日志输出'),
    autoAudits: z.boolean().optional().describe('启动时是否开启自动运行体验评分'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const {
      projectPath,
      mode,
      cliPath,
      autoPort,
      autoAccount,
      timeout,
      fallbackMode,
      healthCheck,
      verbose,
      autoAudits
    } = request.params;

    // 检查是否已有活跃连接
    if (context.miniProgram) {
      try {
        // 验证连接是否仍然有效
        const currentPage = await context.miniProgram.currentPage();
        const pagePath = await currentPage.path;

        // 连接有效，复用现有连接
        response.appendResponseLine(`✅ 检测到已有活跃连接，复用现有连接`);
        response.appendResponseLine(`项目路径: ${projectPath}`);
        response.appendResponseLine(`当前页面: ${pagePath}`);
        response.appendResponseLine(`说明: 跳过重新连接，使用已建立的连接`);

        if (verbose) {
          response.appendResponseLine(`提示: 如需强制重新连接，请先关闭微信开发者工具`);
        }

        return;
      } catch (error) {
        // 连接已失效，清空并继续新建连接
        if (verbose) {
          response.appendResponseLine(`检测到已有连接但已失效，准备重新连接...`);
        }
        context.miniProgram = null;
        context.currentPage = null;
      }
    }

    try {
      const options: EnhancedConnectOptions = {
        projectPath,
        mode,
        cliPath,
        autoPort,
        autoAccount,
        timeout,
        fallbackMode,
        healthCheck,
        verbose,
        autoAudits
      };

      const result = await connectDevtoolsEnhanced(options);
      const miniProgramEnhanced = result.miniProgram;

      // 更新上下文
      context.miniProgram = miniProgramEnhanced;
      context.currentPage = result.currentPage;
      context.elementMap.clear();

      // 自动启动console监听
      try {
        // 清除之前的监听器（如果有的话）
        miniProgramEnhanced.removeAllListeners('console');
        miniProgramEnhanced.removeAllListeners('exception');

        // 启动console监听
        context.consoleStorage.isMonitoring = true;
        context.consoleStorage.startTime = new Date().toISOString();

        miniProgramEnhanced.on('console', (msg: { type?: string; args?: unknown[] }) => {
          const typedMsg = msg;
          const consoleMessage: ConsoleMessage = {
            type: (typedMsg.type as ConsoleMessage['type']) || 'log',
            args: typedMsg.args || [],
            timestamp: new Date().toISOString(),
            source: 'miniprogram'
          };
          // 使用新的 navigations 结构
          const currentSession = context.consoleStorage.navigations[0];
          if (currentSession) {
            // 分配 msgid（如果有 idGenerator）
            if (context.consoleStorage.idGenerator) {
              consoleMessage.msgid = context.consoleStorage.idGenerator();
              context.consoleStorage.messageIdMap.set(consoleMessage.msgid, consoleMessage);
            }
            currentSession.messages.push(consoleMessage);
          }
          console.log(`[Console ${typedMsg.type}]:`, typedMsg.args);
        });

        miniProgramEnhanced.on('exception', (err: { message?: string; stack?: string }) => {
          const typedErr = err;
          const exceptionMessage: ExceptionMessage = {
            message: typedErr.message || String(err),
            stack: typedErr.stack,
            timestamp: new Date().toISOString(),
            source: 'miniprogram'
          };
          // 使用新的 navigations 结构
          const currentSession = context.consoleStorage.navigations[0];
          if (currentSession) {
            // 分配 msgid（如果有 idGenerator）
            if (context.consoleStorage.idGenerator) {
              exceptionMessage.msgid = context.consoleStorage.idGenerator();
              context.consoleStorage.messageIdMap.set(exceptionMessage.msgid, exceptionMessage);
            }
            currentSession.exceptions.push(exceptionMessage);
          }
          console.log(`[Exception]:`, typedErr.message, typedErr.stack);
        });

        response.appendResponseLine(`Console监听已自动启动`);
      } catch (consoleError) {
        response.appendResponseLine(`警告: Console监听启动失败 - ${consoleError instanceof Error ? consoleError.message : String(consoleError)}`);
      }

      // 自动启动网络监听（使用evaluate()方式绕过框架限制）
      try {
        if (!context.networkStorage.isMonitoring) {
          // 使用evaluate()注入拦截器（与第一个工具相同的逻辑）
          await miniProgramEnhanced.evaluate(function() {
            // @ts-ignore
            if (typeof wx === 'undefined' || wx.__networkInterceptorsInstalled) return;
            // @ts-ignore
            wx.__networkLogs = wx.__networkLogs || [];
            // @ts-ignore - 设置存储上限（环形缓冲区）
            wx.__networkLogsLimit = 1000;
            // @ts-ignore - 重置禁用标志
            wx.__networkInterceptorsDisabled = false;

            // 辅助函数：添加日志并自动裁剪
            // @ts-ignore
            wx.__pushNetworkLog = function(log: any) {
              // @ts-ignore - 检查是否已禁用
              if (wx.__networkInterceptorsDisabled) return;
              // @ts-ignore
              wx.__networkLogs.push(log);
              // @ts-ignore - 环形缓冲区：超出限制时移除最旧的
              while (wx.__networkLogs.length > wx.__networkLogsLimit) {
                // @ts-ignore
                wx.__networkLogs.shift();
              }
            };

            // Mpx 拦截器已在 tools.ts 的 connectDevtools() 中统一注入
            // 此处仅保留 wx.request 回退拦截器（用于非 Mpx 框架或直接调用 wx API 的场景）

            // @ts-ignore - 保存原始方法（通过getter获取）
            const _originalRequest = wx.request;
            // @ts-ignore
            const _originalUploadFile = wx.uploadFile;
            // @ts-ignore
            const _originalDownloadFile = wx.downloadFile;

            // @ts-ignore - 先删除getter
            delete wx.request;
            // @ts-ignore
            Object.defineProperty(wx, 'request', {
              configurable: true,
              value: function(options: any) {
                // @ts-ignore - 检查是否已禁用
                if (wx.__networkInterceptorsDisabled) {
                  return _originalRequest.call(this, options);
                }
                const id = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
                const start = Date.now();
                const origSuccess = options.success;
                const origFail = options.fail;
                options.success = function(res: any) {
                  // @ts-ignore
                  wx.__pushNetworkLog({ id, type: 'request', url: options.url, method: options.method || 'GET',
                    headers: options.header, data: options.data, statusCode: res.statusCode,
                    response: res.data, duration: Date.now() - start, timestamp: new Date().toISOString(), success: true });
                  if (origSuccess) origSuccess.call(this, res);
                };
                options.fail = function(err: any) {
                  // @ts-ignore
                  wx.__pushNetworkLog({ id, type: 'request', url: options.url, method: options.method || 'GET',
                    headers: options.header, data: options.data, error: err.errMsg || String(err),
                    duration: Date.now() - start, timestamp: new Date().toISOString(), success: false });
                  if (origFail) origFail.call(this, err);
                };
                return _originalRequest.call(this, options);
              }
            });

            // @ts-ignore - 先删除getter
            delete wx.uploadFile;
            // @ts-ignore
            Object.defineProperty(wx, 'uploadFile', {
              configurable: true,
              value: function(options: any) {
                // @ts-ignore - 检查是否已禁用
                if (wx.__networkInterceptorsDisabled) {
                  return _originalUploadFile.call(this, options);
                }
                const id = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
                const start = Date.now();
                const origSuccess = options.success;
                const origFail = options.fail;
                options.success = function(res: any) {
                  // @ts-ignore
                  wx.__pushNetworkLog({ id, type: 'uploadFile', url: options.url, headers: options.header,
                    data: { filePath: options.filePath, name: options.name, formData: options.formData },
                    statusCode: res.statusCode, response: res.data, duration: Date.now() - start,
                    timestamp: new Date().toISOString(), success: true });
                  if (origSuccess) origSuccess.call(this, res);
                };
                options.fail = function(err: any) {
                  // @ts-ignore
                  wx.__pushNetworkLog({ id, type: 'uploadFile', url: options.url, headers: options.header,
                    data: { filePath: options.filePath, name: options.name, formData: options.formData },
                    error: err.errMsg || String(err), duration: Date.now() - start,
                    timestamp: new Date().toISOString(), success: false });
                  if (origFail) origFail.call(this, err);
                };
                return _originalUploadFile.call(this, options);
              }
            });

            // @ts-ignore - 先删除getter
            delete wx.downloadFile;
            // @ts-ignore
            Object.defineProperty(wx, 'downloadFile', {
              configurable: true,
              value: function(options: any) {
                // @ts-ignore - 检查是否已禁用
                if (wx.__networkInterceptorsDisabled) {
                  return _originalDownloadFile.call(this, options);
                }
                const id = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
                const start = Date.now();
                const origSuccess = options.success;
                const origFail = options.fail;
                options.success = function(res: any) {
                  // @ts-ignore
                  wx.__pushNetworkLog({ id, type: 'downloadFile', url: options.url, headers: options.header,
                    statusCode: res.statusCode, response: { tempFilePath: res.tempFilePath, filePath: res.filePath },
                    duration: Date.now() - start, timestamp: new Date().toISOString(), success: true });
                  if (origSuccess) origSuccess.call(this, res);
                };
                options.fail = function(err: any) {
                  // @ts-ignore
                  wx.__pushNetworkLog({ id, type: 'downloadFile', url: options.url, headers: options.header,
                    error: err.errMsg || String(err), duration: Date.now() - start,
                    timestamp: new Date().toISOString(), success: false });
                  if (origFail) origFail.call(this, err);
                };
                return _originalDownloadFile.call(this, options);
              }
            });

            // @ts-ignore
            wx.__networkInterceptorsInstalled = true;
          });

          context.networkStorage.isMonitoring = true;
          context.networkStorage.startTime = new Date().toISOString();
        }

        response.appendResponseLine(`网络监听已自动启动（增强型拦截）`);
      } catch (networkError) {
        response.appendResponseLine(`警告: 网络监听启动失败 - ${networkError instanceof Error ? networkError.message : String(networkError)}`);
      }

      // 根据结果显示详细信息
      response.appendResponseLine(`✅ 智能连接成功`);
      response.appendResponseLine(`项目路径: ${projectPath}`);
      response.appendResponseLine(`当前页面: ${result.pagePath}`);
      response.appendResponseLine(`连接模式: ${result.connectionMode}`);
      response.appendResponseLine(`启动耗时: ${result.startupTime}ms`);
      response.appendResponseLine(`健康状态: ${result.healthStatus}`);

      if (result.processInfo) {
        response.appendResponseLine(`进程信息: PID=${result.processInfo.pid}, Port=${result.processInfo.port}`);
      }

    } catch (error) {
      // 处理增强错误信息
      if (error instanceof DevToolsConnectionError) {
        response.appendResponseLine(`❗ ${error.phase}阶段失败: ${error.message}`);
        if (error.originalError) {
          response.appendResponseLine(`原始错误: ${error.originalError.message}`);
        }
        if (error.details && verbose) {
          response.appendResponseLine(`详细信息: ${JSON.stringify(error.details, null, 2)}`);
        }
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        response.appendResponseLine(`连接失败: ${errorMessage}`);
      }
      throw error;
    }
  },
});

/**
 * 获取当前页面信息
 */
export const getCurrentPageTool = defineTool({
  name: 'get_current_page',
  description: '获取当前页面信息并设置为活动页面',
  schema: z.object({}),
  annotations: {
    audience: ['developers'],
  },
  handler: async (_request, response, context) => {
    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    try {
      context.currentPage = await context.miniProgram.currentPage();
      const pagePath = await context.currentPage.path;

      response.appendResponseLine(`当前页面: ${pagePath}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`获取当前页面失败: ${errorMessage}`);
      throw error;
    }
  },
});
