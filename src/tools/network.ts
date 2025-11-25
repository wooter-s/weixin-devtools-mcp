/**
 * 网络请求监听工具
 * 通过拦截 wx.request, wx.uploadFile, wx.downloadFile 实现网络监控
 */

import { z } from 'zod';

import type { NetworkRequest} from './ToolDefinition.js';
import { defineTool, NetworkRequestType } from './ToolDefinition.js';

/**
 * 创建请求拦截器函数
 * 注意: 这个函数会被序列化后在小程序环境执行,不能使用闭包变量
 * 保持函数简单,只记录信息然后调用原始方法
 */
function createRequestInterceptor() {
  return function(this: any, options: any) {
    // 初始化全局存储
    // 关键修复: 在小程序环境中直接访问 wx 对象,不通过 globalThis
    // wx 是小程序提供的全局对象,直接可用
    // @ts-ignore - wx is available in WeChat miniprogram environment
    const wxObj = (typeof wx !== 'undefined' ? wx : null) as any;

    if (!wxObj) {
      // wx 对象不存在,无法记录,直接调用原始方法
      return this.origin(options);
    }

    if (!wxObj.__networkLogs) {
      wxObj.__networkLogs = [];
    }

    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const startTime = Date.now();

    // 包装 success 回调
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

    // 包装 fail 回调
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

    // 调用原始方法
    return this.origin(options);
  };
}

/**
 * 创建 uploadFile 拦截器函数
 */
function createUploadFileInterceptor() {
  return function(this: any, options: any) {
    // @ts-ignore - wx is available in WeChat miniprogram environment
    const wxObj = (typeof wx !== 'undefined' ? wx : null) as any;

    if (!wxObj) {
      return this.origin(options);
    }

    if (!wxObj.__networkLogs) {
      wxObj.__networkLogs = [];
    }

    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const startTime = Date.now();

    const originalSuccess = options.success;
    options.success = function(res: any) {
      wxObj.__networkLogs.push({
        id: requestId,
        type: 'uploadFile',
        url: options.url,
        headers: options.header,
        data: {
          filePath: options.filePath,
          name: options.name,
          formData: options.formData
        },
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
        type: 'uploadFile',
        url: options.url,
        headers: options.header,
        data: {
          filePath: options.filePath,
          name: options.name,
          formData: options.formData
        },
        error: err.errMsg || String(err),
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: false
      });

      if (originalFail) originalFail(err);
    };

    return this.origin(options);
  };
}

/**
 * 创建 downloadFile 拦截器函数
 */
function createDownloadFileInterceptor() {
  return function(this: any, options: any) {
    // @ts-ignore - wx is available in WeChat miniprogram environment
    const wxObj = (typeof wx !== 'undefined' ? wx : null) as any;

    if (!wxObj) {
      return this.origin(options);
    }

    if (!wxObj.__networkLogs) {
      wxObj.__networkLogs = [];
    }

    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const startTime = Date.now();

    const originalSuccess = options.success;
    options.success = function(res: any) {
      wxObj.__networkLogs.push({
        id: requestId,
        type: 'downloadFile',
        url: options.url,
        headers: options.header,
        statusCode: res.statusCode,
        response: {
          tempFilePath: res.tempFilePath,
          filePath: res.filePath
        },
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
        headers: options.header,
        error: err.errMsg || String(err),
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: false
      });

      if (originalFail) originalFail(err);
    };

    return this.origin(options);
  };
}

/**
 * 启动网络监听工具
 *
 * 使用evaluate()直接在小程序环境注入拦截代码
 * 这种方式可以绕过Mpx等框架的API缓存问题
 */
export const startNetworkMonitoringTool = defineTool({
  name: 'start_network_monitoring',
  description: '启动对微信小程序网络请求的监听，拦截 wx.request、wx.uploadFile、wx.downloadFile',
  schema: z.object({
    clearExisting: z.boolean().optional().default(false).describe('是否清除已有的网络请求记录'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { clearExisting } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    if (context.networkStorage.isMonitoring) {
      response.appendResponseLine('网络监听已在运行中');
      response.appendResponseLine(`当前已记录 ${context.networkStorage.requests.length} 个网络请求`);
      return;
    }

    // 清除现有记录
    if (clearExisting) {
      context.networkStorage.requests = [];
    }

    try {
      // 使用evaluate()方式在小程序环境中直接注入拦截代码
      // 支持双模式：Mpx框架拦截器 + wx.request回退方案
      await context.miniProgram.evaluate(function(shouldClear: boolean) {
        // @ts-ignore - wx在小程序环境中可用
        if (typeof wx === 'undefined') {
          throw new Error('wx对象不可用');
        }

        // 初始化或清除存储
        // @ts-ignore
        if (!wx.__networkLogs || shouldClear) {
          // @ts-ignore
          wx.__networkLogs = [];
        }

        // 检查是否已经注入过拦截器
        // @ts-ignore
        if (wx.__networkInterceptorsInstalled && !shouldClear) {
          console.log('[MCP-DEBUG] 拦截器已安装，跳过重复安装');
          return; // 已安装，跳过
        }

        // 如果需要清除，先删除旧的标记
        if (shouldClear) {
          console.log('[MCP-DEBUG] 强制重装：清除旧的安装标记');
          // @ts-ignore
          delete wx.__networkInterceptorsInstalled;
          // 同时清空pending队列和config缓存
          // @ts-ignore
          wx.__pendingQueue = [];
          // @ts-ignore
          wx.__requestConfigMap = {};
        }

        // ===== 模式1：检测并使用Mpx框架拦截器 =====
        console.log('[MCP-DEBUG] 开始检测Mpx框架...');

        // @ts-ignore - getApp is available in WeChat miniprogram environment
        const app = getApp();
        console.log('[MCP-DEBUG] getApp() 结果:', {
          hasApp: !!app,
          appType: typeof app,
          hasXfetch: !!(app && app.$xfetch),
          xfetchType: app && app.$xfetch ? typeof app.$xfetch : 'undefined'
        });

        const hasMpxFetch = app &&
                            app.$xfetch &&
                            app.$xfetch.interceptors &&
                            typeof app.$xfetch.interceptors.request.use === 'function';

        console.log('[MCP-DEBUG] Mpx检测结果:', {
          hasMpxFetch: hasMpxFetch,
          hasInterceptors: !!(app && app.$xfetch && app.$xfetch.interceptors),
          hasRequestUse: !!(app && app.$xfetch && app.$xfetch.interceptors && app.$xfetch.interceptors.request),
          hasResponseUse: !!(app && app.$xfetch && app.$xfetch.interceptors && app.$xfetch.interceptors.response)
        });

        if (hasMpxFetch) {
          console.log('[MCP] ✅ 检测到Mpx框架，使用getApp().$xfetch拦截器模式');
          console.log('[MCP] 📝 使用Pending队列方案解决业务拦截器改变响应结构的问题');

          // 初始化pending队列和config缓存
          // @ts-ignore
          if (!wx.__pendingQueue) {
            // @ts-ignore
            wx.__pendingQueue = [];
          }
          // @ts-ignore
          if (!wx.__requestConfigMap) {
            // @ts-ignore
            wx.__requestConfigMap = {};
          }

          // 如果需要重装,清空旧的Mpx拦截器handlers(防止累加)
          if (shouldClear) {
            console.log('[MCP-DEBUG] 准备清空handlers, shouldClear=', shouldClear);
            console.log('[MCP-DEBUG] request拦截器结构:', {
              hasInterceptors: !!app.$xfetch.interceptors.request,
              hasHandlers: !!app.$xfetch.interceptors.request.handlers,
              handlersType: typeof app.$xfetch.interceptors.request.handlers,
              handlersIsArray: Array.isArray(app.$xfetch.interceptors.request.handlers)
            });

            // @ts-ignore
            if (app.$xfetch.interceptors.request && app.$xfetch.interceptors.request.handlers) {
              // @ts-ignore
              app.$xfetch.interceptors.request.handlers = [];
              console.log('[MCP-DEBUG] ✅ 已清空旧的request拦截器handlers');
            } else {
              console.log('[MCP-DEBUG] ⚠️  request.handlers不存在或不是数组');
            }

            // @ts-ignore
            if (app.$xfetch.interceptors.response && app.$xfetch.interceptors.response.handlers) {
              // @ts-ignore
              app.$xfetch.interceptors.response.handlers = [];
              console.log('[MCP-DEBUG] ✅ 已清空旧的response拦截器handlers');
            } else {
              console.log('[MCP-DEBUG] ⚠️  response.handlers不存在或不是数组');
            }
          }

          // 请求拦截器 - 记录请求开始并缓存config
          // @ts-ignore
          getApp().$xfetch.interceptors.request.use(function(config: any) {
            const requestId = 'mpx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const startTime = Date.now();

            console.log('[MCP-DEBUG] 🔵 请求拦截器被触发:', {
              requestId: requestId,
              method: config.method,
              url: config.url,
              hasData: !!config.data,
              hasParams: !!config.params,
              timestamp: new Date().toISOString()
            });

            // 保存完整的config到缓存(因为响应拦截器可能拿不到requestConfig)
            // @ts-ignore
            wx.__requestConfigMap[requestId] = {
              url: config.url,
              method: config.method || 'GET',
              header: config.header || config.headers,
              data: config.data,
              params: config.params,
              timeout: config.timeout || 30000
            };

            // 添加到pending队列(FIFO)
            // @ts-ignore
            wx.__pendingQueue.push({
              id: requestId,
              url: config.url,
              method: config.method || 'GET',
              startTime: startTime
            });

            // 清理超时的pending请求(避免队列堆积)
            const timeout = config.timeout || 30000;
            // @ts-ignore
            wx.__pendingQueue = wx.__pendingQueue.filter((item: any) =>
              Date.now() - item.startTime < timeout + 5000  // 额外5秒容错
            );

            // @ts-ignore - wx is available in WeChat miniprogram environment
            wx.__networkLogs.push({
              id: requestId,
              type: 'request',
              method: config.method || 'GET',
              url: config.url,
              headers: config.header || config.headers,
              data: config.data,
              params: config.params,
              timestamp: new Date(startTime).toISOString(),
              source: 'getApp().$xfetch',
              pending: true,  // 标记为待完成状态
              success: undefined  // 初始化success字段，避免状态判断问题
            });

            // @ts-ignore - wx在小程序环境可用
            console.log('[MCP-DEBUG] ✅ 请求已记录, pending队列:', wx.__pendingQueue.length, ', 日志数:', wx.__networkLogs.length);

            return config; // 必须返回config继续请求链
          });

          // 响应拦截器 - 使用Pending队列匹配请求/响应
          // @ts-ignore
          getApp().$xfetch.interceptors.response.use(
            function onSuccess(data: any) {
              try {
                // 注意: data可能只是业务数据(如{goodsList, tripId})，而不是完整的response对象
                // 因为业务拦截器(commonResInterceptor)改变了响应结构

                console.log('[MCP-DEBUG] 🟢 响应拦截器被触发(成功)');
                console.log('[MCP-DEBUG] 🔍 响应数据类型:', typeof data, ', 键:', Object.keys(data || {}));

                // 从Pending队列获取最早的请求(FIFO匹配)
                // @ts-ignore
                const requestInfo = wx.__pendingQueue.shift();

                if (!requestInfo) {
                  console.log('[MCP-DEBUG] ⚠️  Pending队列为空，无法匹配请求');
                  return data;
                }

                const duration = Date.now() - requestInfo.startTime;

                console.log('[MCP-DEBUG] 📦 从队列取出请求:', {
                  requestId: requestInfo.id,
                  url: requestInfo.url,
                  method: requestInfo.method,
                  duration: duration + 'ms'
                });

                // 从缓存获取完整的请求配置
                // @ts-ignore
                const savedConfig = wx.__requestConfigMap[requestInfo.id];

                if (!savedConfig) {
                  console.log('[MCP-DEBUG] ⚠️  未找到缓存的config');
                }

                // @ts-ignore
                // 找到对应的日志记录并更新
                let logIndex = wx.__networkLogs.findIndex((log: any) => log.id === requestInfo.id);

                // 增强：如果按ID找不到，尝试按URL和时间窗口匹配（fallback策略）
                if (logIndex === -1) {
                  console.log('[MCP-DEBUG] ⚠️  按ID未找到日志，尝试URL匹配...');
                  // @ts-ignore
                  logIndex = wx.__networkLogs.findIndex((log: any) =>
                    log.url === requestInfo.url &&
                    log.pending === true &&
                    Math.abs(new Date(log.timestamp).getTime() - requestInfo.startTime) < 10000 // 10秒窗口
                  );

                  if (logIndex !== -1) {
                    console.log('[MCP-DEBUG] ✅ 通过URL匹配找到日志, 索引:', logIndex);
                  }
                }

                if (logIndex !== -1) {
                  // @ts-ignore
                  const existingLog = wx.__networkLogs[logIndex];
                  // @ts-ignore
                  wx.__networkLogs[logIndex] = {
                    ...existingLog,
                    statusCode: 200,  // 能到这里说明成功
                    response: data,   // 只能拿到业务数据
                    duration: duration,
                    completedAt: new Date().toISOString(),
                    pending: false,
                    success: true
                  };
                  console.log('[MCP-DEBUG] ✅ 请求记录已更新 (合并响应), 索引:', logIndex);
                } else {
                  console.log('[MCP-DEBUG] ❌ 完全未找到匹配的日志记录, requestId:', requestInfo.id, ', url:', requestInfo.url);
                }

                // 清理config缓存
                // @ts-ignore
                if (savedConfig) {
                  // @ts-ignore
                  delete wx.__requestConfigMap[requestInfo.id];
                }

                // @ts-ignore - wx在小程序环境可用
                console.log('[MCP-DEBUG] 📊 状态 - 日志:', wx.__networkLogs.length, ', pending:', wx.__pendingQueue.length, ', config缓存:', Object.keys(wx.__requestConfigMap || {}).length);

                return data; // 必须返回data继续拦截器链
              } catch (error) {
                console.log('[MCP-DEBUG] ❌ 响应拦截器异常:', error);
                return data; // 即使出错也要返回data，不能中断业务逻辑
              }
            },
            function onError(error: any) {
              try {
                console.log('[MCP-DEBUG] 🔴 响应拦截器被触发(错误)');
                console.log('[MCP-DEBUG] 🔍 错误对象:', error);

                // 从Pending队列获取最早的请求(FIFO匹配)
                // @ts-ignore
                const requestInfo = wx.__pendingQueue.shift();

                if (!requestInfo) {
                  console.log('[MCP-DEBUG] ⚠️  Pending队列为空，无法匹配错误请求');
                  return Promise.reject(error);
                }

                const duration = Date.now() - requestInfo.startTime;

                console.log('[MCP-DEBUG] 📦 从队列取出请求(错误):', {
                  requestId: requestInfo.id,
                  url: requestInfo.url,
                  error: error.errMsg || error.msg || error.message || String(error),
                  duration: duration + 'ms'
                });

                // @ts-ignore
                // 找到对应的日志记录并更新
                let logIndex = wx.__networkLogs.findIndex((log: any) => log.id === requestInfo.id);

                // 增强：如果按ID找不到，尝试按URL和时间窗口匹配（fallback策略）
                if (logIndex === -1) {
                  console.log('[MCP-DEBUG] ⚠️  按ID未找到日志（错误场景），尝试URL匹配...');
                  // @ts-ignore
                  logIndex = wx.__networkLogs.findIndex((log: any) =>
                    log.url === requestInfo.url &&
                    log.pending === true &&
                    Math.abs(new Date(log.timestamp).getTime() - requestInfo.startTime) < 10000 // 10秒窗口
                  );

                  if (logIndex !== -1) {
                    console.log('[MCP-DEBUG] ✅ 通过URL匹配找到日志（错误场景）, 索引:', logIndex);
                  }
                }

                if (logIndex !== -1) {
                  // @ts-ignore
                  const existingLog = wx.__networkLogs[logIndex];
                  // @ts-ignore
                  wx.__networkLogs[logIndex] = {
                    ...existingLog,
                    error: error.errMsg || error.msg || error.message || String(error),
                    statusCode: error.status || error.statusCode,
                    duration: duration,
                    completedAt: new Date().toISOString(),
                    pending: false,
                    success: false
                  };
                  console.log('[MCP-DEBUG] ✅ 请求记录已更新 (合并错误), 索引:', logIndex);
                } else {
                  console.log('[MCP-DEBUG] ❌ 完全未找到匹配的日志记录（错误场景）, requestId:', requestInfo.id, ', url:', requestInfo.url);
                }

                // 清理config缓存
                // @ts-ignore
                if (wx.__requestConfigMap && wx.__requestConfigMap[requestInfo.id]) {
                  // @ts-ignore
                  delete wx.__requestConfigMap[requestInfo.id];
                }

                // @ts-ignore - wx在小程序环境可用
                console.log('[MCP-DEBUG] 📊 状态 - 日志:', wx.__networkLogs.length, ', pending:', wx.__pendingQueue.length);

                return Promise.reject(error); // 保持错误传播
              } catch (innerError) {
                console.log('[MCP-DEBUG] ❌ 错误拦截器异常:', innerError);
                return Promise.reject(error); // 即使出错也要传播原始错误，不能中断业务逻辑
              }
            }
          );

          // @ts-ignore - wx is available in WeChat miniprogram environment
          wx.__networkInterceptorsInstalled = 'mpx';
          console.log('[MCP] ✅ Mpx拦截器安装完成');
          // @ts-ignore - wx is available in WeChat miniprogram environment
          console.log('[MCP-DEBUG] 拦截器已标记为已安装: wx.__networkInterceptorsInstalled =', wx.__networkInterceptorsInstalled);
        } else {
          console.log('[MCP] ⚠️  未检测到Mpx框架或$xfetch不可用');
        }

        // ===== 模式2：wx.request回退方案（用于非Mpx框架或直接调用wx API的场景） =====
        if (!hasMpxFetch) {
          console.log('[MCP] ⚠️  未检测到Mpx框架，使用wx.request拦截模式');
        } else {
          console.log('[MCP-DEBUG] Mpx模式下，同时安装wx.request回退拦截器（双保险）');
        }

        // 保存原始方法引用（通过getter获取）
        // @ts-ignore
        const _originalRequest = wx.request;
        // @ts-ignore
        const _originalUploadFile = wx.uploadFile;
        // @ts-ignore
        const _originalDownloadFile = wx.downloadFile;

        console.log('[MCP-DEBUG] 原始方法类型:', {
          requestType: typeof _originalRequest,
          uploadFileType: typeof _originalUploadFile,
          downloadFileType: typeof _originalDownloadFile
        });

        // 拦截 wx.request
        // 关键：先删除getter属性，然后重新定义为普通属性
        // @ts-ignore
        delete wx.request;
        // @ts-ignore
        Object.defineProperty(wx, 'request', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: function(options: any) {
            const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const startTime = Date.now();

            console.log('[MCP-DEBUG] 🔵 wx.request 被调用:', {
              requestId: requestId,
              method: options.method || 'GET',
              url: options.url,
              hasData: !!options.data,
              timestamp: new Date().toISOString()
            });

            // 包装success回调
            const originalSuccess = options.success;
            options.success = function(res: any) {
              console.log('[MCP-DEBUG] 🟢 wx.request 成功回调:', {
                requestId: requestId,
                statusCode: res.statusCode,
                duration: Date.now() - startTime
              });

              // @ts-ignore
              wx.__networkLogs.push({
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
                source: 'wx.request',
                success: true
              });

              // @ts-ignore - wx is available in WeChat miniprogram environment
              console.log('[MCP-DEBUG] ✅ wx.request 已记录, 当前总数:', wx.__networkLogs.length);

              if (originalSuccess) originalSuccess.call(this, res);
            };

            // 包装fail回调
            const originalFail = options.fail;
            options.fail = function(err: any) {
              console.log('[MCP-DEBUG] 🔴 wx.request 失败回调:', {
                requestId: requestId,
                error: err.errMsg,
                duration: Date.now() - startTime
              });

              // @ts-ignore
              wx.__networkLogs.push({
                id: requestId,
                type: 'request',
                url: options.url,
                method: options.method || 'GET',
                headers: options.header,
                data: options.data,
                error: err.errMsg || String(err),
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                source: 'wx.request',
                success: false
              });

              // @ts-ignore - wx is available in WeChat miniprogram environment
              console.log('[MCP-DEBUG] ✅ wx.request 错误已记录, 当前总数:', wx.__networkLogs.length);

              if (originalFail) originalFail.call(this, err);
            };

            // 调用原始方法
            return _originalRequest.call(this, options);
          }
        });

        console.log('[MCP-DEBUG] ✅ wx.request 拦截器已安装');

        // 拦截 wx.uploadFile
        // 关键：先删除getter属性
        // @ts-ignore
        delete wx.uploadFile;
        // @ts-ignore
        Object.defineProperty(wx, 'uploadFile', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: function(options: any) {
            const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const startTime = Date.now();

            const originalSuccess = options.success;
            options.success = function(res: any) {
              // @ts-ignore
              wx.__networkLogs.push({
                id: requestId,
                type: 'uploadFile',
                url: options.url,
                headers: options.header,
                data: {
                  filePath: options.filePath,
                  name: options.name,
                  formData: options.formData
                },
                statusCode: res.statusCode,
                response: res.data,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                source: 'wx.uploadFile',
                success: true
              });
              if (originalSuccess) originalSuccess.call(this, res);
            };

            const originalFail = options.fail;
            options.fail = function(err: any) {
              // @ts-ignore
              wx.__networkLogs.push({
                id: requestId,
                type: 'uploadFile',
                url: options.url,
                headers: options.header,
                data: {
                  filePath: options.filePath,
                  name: options.name,
                  formData: options.formData
                },
                error: err.errMsg || String(err),
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                source: 'wx.uploadFile',
                success: false
              });
              if (originalFail) originalFail.call(this, err);
            };

            return _originalUploadFile.call(this, options);
          }
        });

        // 拦截 wx.downloadFile
        // 关键：先删除getter属性
        // @ts-ignore
        delete wx.downloadFile;
        // @ts-ignore
        Object.defineProperty(wx, 'downloadFile', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: function(options: any) {
            const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const startTime = Date.now();

            const originalSuccess = options.success;
            options.success = function(res: any) {
              // @ts-ignore
              wx.__networkLogs.push({
                id: requestId,
                type: 'downloadFile',
                url: options.url,
                headers: options.header,
                statusCode: res.statusCode,
                response: {
                  tempFilePath: res.tempFilePath,
                  filePath: res.filePath
                },
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                source: 'wx.downloadFile',
                success: true
              });
              if (originalSuccess) originalSuccess.call(this, res);
            };

            const originalFail = options.fail;
            options.fail = function(err: any) {
              // @ts-ignore
              wx.__networkLogs.push({
                id: requestId,
                type: 'downloadFile',
                url: options.url,
                headers: options.header,
                error: err.errMsg || String(err),
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                source: 'wx.downloadFile',
                success: false
              });
              if (originalFail) originalFail.call(this, err);
            };

            return _originalDownloadFile.call(this, options);
          }
        });

        // 标记拦截器已安装
        // @ts-ignore
        wx.__networkInterceptorsInstalled = true;
      }, clearExisting);

      // 设置监听状态
      context.networkStorage.isMonitoring = true;
      context.networkStorage.startTime = new Date().toISOString();

      response.appendResponseLine('✅ 网络监听已启动（使用增强型拦截）');
      response.appendResponseLine(`监听开始时间: ${context.networkStorage.startTime}`);
      response.appendResponseLine(`清除历史记录: ${clearExisting ? '是' : '否'}`);
      response.appendResponseLine('');
      response.appendResponseLine('已拦截以下方法:');
      response.appendResponseLine('  - wx.request');
      response.appendResponseLine('  - wx.uploadFile');
      response.appendResponseLine('  - wx.downloadFile');
      response.appendResponseLine('');
      response.appendResponseLine('💡 使用 evaluate() 方式注入，可绕过 Mpx 等框架限制');
      response.appendResponseLine('   所有网络请求都将被捕获，使用 get_network_requests 查看');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`启动网络监听失败: ${errorMessage}`);
    }
  },
});

/**
 * 停止网络监听工具
 *
 * 注意：使用evaluate()注入的拦截器无法完全恢复
 * 只能清除标记，实际拦截器会继续工作
 */
export const stopNetworkMonitoringTool = defineTool({
  name: 'stop_network_monitoring',
  description: '停止对微信小程序网络请求的监听，恢复原始的网络方法',
  schema: z.object({}),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    if (!context.networkStorage.isMonitoring) {
      response.appendResponseLine('网络监听未在运行');
      return;
    }

    try {
      // 从小程序环境读取最终的请求数据并清除标记
      const result = await context.miniProgram.evaluate(function() {
        // @ts-ignore
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (!wxObj) {
          return { logs: [], success: false };
        }

        const logs = wxObj.__networkLogs || [];

        // 清除安装标记（允许重新安装）
        // 注意：实际的拦截器无法恢复，因为我们使用了Object.defineProperty
        // 这是evaluate()方式的一个限制，但好处是可以绕过框架缓存
        wxObj.__networkInterceptorsInstalled = false;

        return { logs, success: true };
      });

      if (!result.success) {
        throw new Error('无法访问wx对象');
      }

      const logs = result.logs as NetworkRequest[];

      // 更新监听状态
      context.networkStorage.isMonitoring = false;

      response.appendResponseLine('✅ 网络监听已停止');
      response.appendResponseLine(`监听期间收集到 ${logs.length} 个网络请求`);

      // 统计各类型请求数量
      const stats = logs.reduce((acc, req) => {
        acc[req.type] = (acc[req.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      response.appendResponseLine('');
      response.appendResponseLine('请求类型统计:');
      if (stats.request) response.appendResponseLine(`  - request: ${stats.request}`);
      if (stats.uploadFile) response.appendResponseLine(`  - uploadFile: ${stats.uploadFile}`);
      if (stats.downloadFile) response.appendResponseLine(`  - downloadFile: ${stats.downloadFile}`);
      response.appendResponseLine('');
      response.appendResponseLine('⚠️ 注意: 拦截器将继续工作（evaluate方式的特性）');
      response.appendResponseLine('   使用 clear_network_requests 清除数据');
      response.appendResponseLine('   使用 start_network_monitoring 重新开始记录');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`停止网络监听失败: ${errorMessage}`);
    }
  },
});

/**
 * 获取网络请求工具
 */
export const getNetworkRequestsTool = defineTool({
  name: 'get_network_requests',
  description: '获取收集到的网络请求记录，支持按类型、URL、状态过滤',
  schema: z.object({
    type: z.enum(['all', 'request', 'uploadFile', 'downloadFile']).optional().default('all').describe('请求类型过滤'),
    urlPattern: z.string().optional().describe('URL 匹配模式（支持正则表达式）'),
    successOnly: z.boolean().optional().default(false).describe('仅返回成功的请求'),
    limit: z.number().optional().default(50).describe('限制返回条数'),
    since: z.string().optional().describe('获取指定时间之后的记录，格式：ISO 8601'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { type, urlPattern, successOnly, limit, since } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    if (!context.networkStorage) {
      throw new Error('网络存储未初始化');
    }

    try {
      // 从小程序环境读取网络请求数据
      const logs: NetworkRequest[] = await context.miniProgram.evaluate(function() {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        return wxObj?.__networkLogs || [];
      });

      const sinceTime = since ? new Date(since) : null;
      const urlRegex = urlPattern ? new RegExp(urlPattern) : null;

      // 过滤函数
      const filters = [
        // 过滤无效记录（type='response' 或 url为空/undefined）
        (req: NetworkRequest) => {
          // 过滤掉 type='response' 的记录（不应该存在）
          if (req.type === 'response' as any) {
            return false;
          }
          // 过滤掉 URL 为空或 'undefined' 的记录
          if (!req.url || req.url === 'undefined') {
            return false;
          }
          // 过滤掉 ID 为空或 'N/A' 的记录
          if (!req.id || req.id === 'N/A') {
            return false;
          }
          return true;
        },
        // 类型过滤
        (req: NetworkRequest) => type === 'all' || req.type === type,
        // 时间过滤
        (req: NetworkRequest) => !sinceTime || new Date(req.timestamp) >= sinceTime,
        // URL 过滤
        (req: NetworkRequest) => !urlRegex || urlRegex.test(req.url),
        // 成功状态过滤
        (req: NetworkRequest) => !successOnly || req.success,
      ];

      const filteredRequests = logs
        .filter(req => filters.every(filter => filter(req)))
        .slice(-limit);

      // 生成响应
      response.appendResponseLine('=== 网络请求记录 ===');
      response.appendResponseLine(`监听状态: ${context.networkStorage.isMonitoring ? '运行中' : '已停止'}`);
      response.appendResponseLine(`监听开始时间: ${context.networkStorage.startTime || '未设置'}`);
      response.appendResponseLine(`总请求数: ${logs.length}`);
      response.appendResponseLine(`过滤后: ${filteredRequests.length} 条`);
      response.appendResponseLine('');

      if (filteredRequests.length === 0) {
        response.appendResponseLine('暂无符合条件的网络请求记录');
        return;
      }

    filteredRequests.forEach((req, index) => {
      response.appendResponseLine(`--- 请求 ${index + 1} ---`);
      response.appendResponseLine(`ID: ${req.id || 'N/A'}`);
      response.appendResponseLine(`类型: ${req.type}`);

      // 过滤掉旧的、无效的记录
      if (!req.url || req.url === 'undefined') {
        response.appendResponseLine(`⚠️ 无效记录（可能是旧数据）`);
        response.appendResponseLine('');
        return;
      }

      response.appendResponseLine(`URL: ${req.url}`);

      if (req.method) {
        response.appendResponseLine(`方法: ${req.method}`);
      }

      // 优化的状态判断逻辑
      const isPending = req.pending === true;
      const isCompleted = req.pending === false;
      const isSuccess = req.success === true;
      const isFailed = req.success === false;

      if (isPending) {
        response.appendResponseLine(`状态: ⏳ 请求中（未收到响应）`);
      } else if (isCompleted) {
        if (isSuccess) {
          response.appendResponseLine(`状态: ✅ 成功`);
        } else if (isFailed) {
          response.appendResponseLine(`状态: ❌ 失败`);
        } else {
          response.appendResponseLine(`状态: ⚠️ 未知（success=${req.success}）`);
        }
      } else {
        // 兼容旧格式（wx.request等，没有pending字段）
        if (isSuccess) {
          response.appendResponseLine(`状态: ✅ 成功`);
        } else if (isFailed) {
          response.appendResponseLine(`状态: ❌ 失败`);
        } else {
          response.appendResponseLine(`状态: ⚠️ 未知状态`);
        }
      }

      if (req.statusCode) {
        response.appendResponseLine(`状态码: ${req.statusCode}`);
      }

      if (req.duration !== undefined) {
        response.appendResponseLine(`耗时: ${req.duration}ms`);
      }

      response.appendResponseLine(`时间: ${req.timestamp}`);

      if (req.source) {
        response.appendResponseLine(`来源: ${req.source}`);
      }

      // === 请求信息 ===
      if (req.headers && Object.keys(req.headers).length > 0) {
        response.appendResponseLine(`请求头: ${JSON.stringify(req.headers)}`);
      }

      if (req.data) {
        const dataStr = typeof req.data === 'string'
          ? req.data
          : JSON.stringify(req.data);
        const truncatedData = dataStr.length > 200
          ? dataStr.substring(0, 200) + '...'
          : dataStr;
        response.appendResponseLine(`请求数据: ${truncatedData}`);
      }

      if (req.params) {
        response.appendResponseLine(`请求参数: ${JSON.stringify(req.params)}`);
      }

      // === 响应信息 ===
      if (req.response) {
        const respStr = typeof req.response === 'string'
          ? req.response
          : JSON.stringify(req.response);
        const truncatedResp = respStr.length > 200
          ? respStr.substring(0, 200) + '...'
          : respStr;
        response.appendResponseLine(`响应数据: ${truncatedResp}`);
      }

      if (req.responseHeaders && Object.keys(req.responseHeaders).length > 0) {
        response.appendResponseLine(`响应头: ${JSON.stringify(req.responseHeaders)}`);
      }

      if (req.error) {
        response.appendResponseLine(`错误信息: ${req.error}`);
      }

      if (req.completedAt) {
        response.appendResponseLine(`完成时间: ${req.completedAt}`);
      }

      response.appendResponseLine('');
      });

      response.appendResponseLine('=== 获取完成 ===');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`获取网络请求失败: ${errorMessage}`);
    }
  },
});

/**
 * 诊断拦截器状态工具 - 用于调试
 */
export const diagnoseInterceptorTool = defineTool({
  name: 'diagnose_interceptor',
  description: '诊断网络拦截器安装状态和运行情况',
  schema: z.object({}),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    try {
      const result = await context.miniProgram.evaluate(() => {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = typeof wx !== 'undefined' ? wx : null;

        // 测试console.log
        console.log('[INTERCEPTOR-DIAGNOSE] === 开始诊断拦截器 ===');
        console.log('[INTERCEPTOR-DIAGNOSE] wx对象存在:', !!wxObj);

        // @ts-ignore - getApp is available in WeChat miniprogram environment
        const hasGetApp = typeof getApp !== 'undefined';
        // @ts-ignore - getApp is available in WeChat miniprogram environment
        const app = hasGetApp ? getApp() : null;

        const diagnosticInfo = {
          environment: {
            hasWx: !!wxObj,
            hasGetApp: hasGetApp,
          },
          interceptor: {
            installed: !!(wxObj && wxObj.__networkInterceptorsInstalled),
            hasNetworkLogs: !!(wxObj && wxObj.__networkLogs),
            networkLogsLength: wxObj && wxObj.__networkLogs ? wxObj.__networkLogs.length : 0,
          },
          mpx: {
            hasGetApp: hasGetApp,
            hasApp: !!app,
            has$xfetch: !!(app && app.$xfetch),
          },
          networkLogs: wxObj && wxObj.__networkLogs ? wxObj.__networkLogs.slice(-5) : [],
        };

        console.log('[INTERCEPTOR-DIAGNOSE] 诊断信息:', JSON.stringify(diagnosticInfo, null, 2));
        console.log('[INTERCEPTOR-DIAGNOSE] === 诊断完成 ===');

        return diagnosticInfo;
      });

      response.appendResponseLine('=== 拦截器诊断结果 ===\n');
      response.appendResponseLine(`环境检查:`);
      response.appendResponseLine(`  wx对象: ${result.environment.hasWx ? '✅' : '❌'}`);
      response.appendResponseLine(`  getApp: ${result.environment.hasGetApp ? '✅' : '❌'}`);
      response.appendResponseLine('');
      response.appendResponseLine(`拦截器状态:`);
      response.appendResponseLine(`  已安装: ${result.interceptor.installed ? '✅' : '❌'}`);
      response.appendResponseLine(`  日志数组: ${result.interceptor.hasNetworkLogs ? '✅' : '❌'}`);
      response.appendResponseLine(`  记录数量: ${result.interceptor.networkLogsLength}`);
      response.appendResponseLine('');
      response.appendResponseLine(`Mpx框架:`);
      response.appendResponseLine(`  getApp可用: ${result.mpx.hasGetApp ? '✅' : '❌'}`);
      response.appendResponseLine(`  App实例: ${result.mpx.hasApp ? '✅' : '❌'}`);
      response.appendResponseLine(`  $xfetch: ${result.mpx.has$xfetch ? '✅' : '❌'}`);
      response.appendResponseLine('');

      if (result.networkLogs && result.networkLogs.length > 0) {
        response.appendResponseLine(`最近${result.networkLogs.length}条网络日志:`);
        result.networkLogs.forEach((log: any, index: number) => {
          response.appendResponseLine(`  ${index + 1}. [${log.type}] ${log.url || log.method}`);
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`诊断失败: ${errorMessage}`);
    }
  },
});

/**
 * 清除网络请求工具
 */
export const clearNetworkRequestsTool = defineTool({
  name: 'clear_network_requests',
  description: '清除已收集的网络请求记录',
  schema: z.object({
    type: z.enum(['all', 'request', 'uploadFile', 'downloadFile']).optional().default('all').describe('清除的请求类型'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { type } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    if (!context.networkStorage) {
      throw new Error('网络存储未初始化');
    }

    try {
      // 获取当前数量
      const beforeCount: number = await context.miniProgram.evaluate(function() {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        return (wxObj?.__networkLogs || []).length;
      });

      // 在小程序环境清除数据
      const afterCount: number = await context.miniProgram.evaluate(function(typeToDelete: string) {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (!wxObj || !wxObj.__networkLogs) {
          return 0;
        }

        if (typeToDelete === 'all') {
          wxObj.__networkLogs = [];
        } else {
          wxObj.__networkLogs = wxObj.__networkLogs.filter((req: any) => req.type !== typeToDelete);
        }

        return wxObj.__networkLogs.length;
      }, type);

      const clearedCount = beforeCount - afterCount;

      response.appendResponseLine('✅ 网络请求记录清除完成');
      response.appendResponseLine(`清除类型: ${type}`);
      response.appendResponseLine(`清除数量: ${clearedCount} 条`);
      response.appendResponseLine(`剩余数量: ${afterCount} 条`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`清除网络请求失败: ${errorMessage}`);
    }
  },
});
