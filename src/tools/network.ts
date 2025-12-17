/**
 * 网络请求监听工具
 * 通过拦截 wx.request, wx.uploadFile, wx.downloadFile 实现网络监控
 */

import { z } from 'zod';

import type { NetworkRequest } from './ToolDefinition.js';
import { defineTool } from './ToolDefinition.js';

// 注意: start_network_monitoring 和 stop_network_monitoring 已移除
// 网络监听在连接时自动启动，无需手动管理

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
 * 停止网络监听工具
 */
export const stopNetworkMonitoringTool = defineTool({
  name: 'stop_network_monitoring',
  description: '停止网络请求监听，禁用拦截器',
  schema: z.object({
    clearLogs: z.boolean().optional().default(false).describe('是否同时清空已收集的日志'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { clearLogs } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    if (!context.networkStorage) {
      throw new Error('网络存储未初始化');
    }

    try {
      // 设置禁用标志
      await context.miniProgram.evaluate(function() {
        // @ts-ignore - wx is available in WeChat miniprogram environment
        const wxObj = typeof wx !== 'undefined' ? wx : null;
        if (wxObj) {
          wxObj.__networkInterceptorsDisabled = true;
        }
      });

      // 更新本地状态
      context.networkStorage.isMonitoring = false;

      let clearedCount = 0;
      if (clearLogs) {
        // 清空远程日志
        clearedCount = await context.miniProgram.evaluate(function() {
          // @ts-ignore
          const wxObj = typeof wx !== 'undefined' ? wx : null;
          if (wxObj && wxObj.__networkLogs) {
            const count = wxObj.__networkLogs.length;
            wxObj.__networkLogs = [];
            return count;
          }
          return 0;
        });
      }

      response.appendResponseLine('=== 网络监听已停止 ===');
      response.appendResponseLine(`监听状态: 已停止`);
      if (clearLogs) {
        response.appendResponseLine(`已清空日志: ${clearedCount} 条`);
      }
      response.appendResponseLine('');
      response.appendResponseLine('💡 提示: 使用 connect_devtools_enhanced 重新连接可恢复监听');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`停止网络监听失败: ${errorMessage}`);
    }
  },
});

/**
 * 清空网络请求记录工具
 */
export const clearNetworkRequestsTool = defineTool({
  name: 'clear_network_requests',
  description: '清空已收集的网络请求记录',
  schema: z.object({
    clearRemote: z.boolean().optional().default(true).describe('是否同时清空小程序端的日志'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { clearRemote } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    if (!context.networkStorage) {
      throw new Error('网络存储未初始化');
    }

    try {
      // 记录当前数量
      const localCountBefore = context.networkStorage.requests?.length || 0;

      // 清空本地存储
      context.networkStorage.requests = [];

      // 清空远程日志
      let remoteCount = 0;
      if (clearRemote) {
        remoteCount = await context.miniProgram.evaluate(function() {
          // @ts-ignore
          const wxObj = typeof wx !== 'undefined' ? wx : null;
          if (wxObj && wxObj.__networkLogs) {
            const count = wxObj.__networkLogs.length;
            wxObj.__networkLogs = [];
            return count;
          }
          return 0;
        });
      }

      response.appendResponseLine('=== 网络请求记录已清空 ===');
      response.appendResponseLine(`本地清空: ${localCountBefore} 条`);
      if (clearRemote) {
        response.appendResponseLine(`远程清空: ${remoteCount} 条`);
      }
      response.appendResponseLine('');
      response.appendResponseLine('💡 提示: 网络监听仍在运行，新的请求会继续被收集');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`清空网络请求失败: ${errorMessage}`);
    }
  },
});
