/**
 * Console和Exception监听工具（P0+P1优化版）
 * 实现对微信开发者工具console输出和异常的监听和获取
 *
 * 新增功能：
 * - Stable ID 系统支持两阶段查询
 * - 真正的分页支持（pageSize + pageIdx）
 * - 扩展类型过滤（15+种类型）
 * - 导航历史保留（最多3次）
 * - 向后兼容的 API
 */

import { z } from 'zod';

import {
  FILTERABLE_MESSAGE_TYPES,
  formatConsoleEventShort,
  formatConsoleEventVerbose,
  formatPaginationInfo,
  type ConsoleMessageData,
  type ExceptionMessageData,
} from '../formatters/consoleFormatter.js';
import { createIdGenerator } from '../utils/idGenerator.js';

import {
  defineTool,
  ToolCategories,
  type ConsoleMessage,
  type ExceptionMessage,
  type ConsoleMessageType,
} from './ToolDefinition.js';

/**
 * 初始化 ConsoleStorage（新结构）
 */
function initializeConsoleStorage(context: any): void {
  if (!context.consoleStorage.navigations) {
    context.consoleStorage = {
      navigations: [{ messages: [], exceptions: [], timestamp: new Date().toISOString() }],
      messageIdMap: new Map(),
      isMonitoring: false,
      startTime: null,
      maxNavigations: 3,
      idGenerator: createIdGenerator(),
    };
  }
}

/**
 * 启动Console监听工具（重构版）
 */
export const startConsoleMonitoringTool = defineTool({
  name: 'start_console_monitoring',
  description: '启动对微信开发者工具console和exception的监听',
  schema: z.object({
    clearExisting: z.boolean().optional().default(false).describe('是否清除已有的日志记录'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { clearExisting } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    // 初始化存储结构
    initializeConsoleStorage(context);

    // 清除现有日志
    if (clearExisting) {
      context.consoleStorage.navigations = [
        { messages: [], exceptions: [], timestamp: new Date().toISOString() }
      ];
      context.consoleStorage.messageIdMap.clear();
    }

    // 确保有 ID 生成器
    if (!context.consoleStorage.idGenerator) {
      context.consoleStorage.idGenerator = createIdGenerator();
    }

    const idGenerator = context.consoleStorage.idGenerator;

    // 设置监听状态
    context.consoleStorage.isMonitoring = true;
    context.consoleStorage.startTime = new Date().toISOString();

    try {
      // 监听console事件
      context.miniProgram.on('console', (msg: any) => {
        const msgid = idGenerator();
        const consoleMessage: ConsoleMessage = {
          msgid,
          type: (msg.type || 'log') as ConsoleMessageType,
          message: msg.args?.length > 0 ? String(msg.args[0]) : '',
          args: msg.args || [],
          timestamp: new Date().toISOString(),
          source: 'miniprogram',
        };

        // 添加到当前导航会话
        const currentNav = context.consoleStorage.navigations[0];
        currentNav.messages.push(consoleMessage);

        // 添加到 ID 映射
        context.consoleStorage.messageIdMap.set(msgid, consoleMessage);

        console.log(`[Console ${msg.type}] msgid=${msgid}:`, msg.args);
      });

      // 监听exception事件
      context.miniProgram.on('exception', (err: any) => {
        const msgid = idGenerator();
        const exceptionMessage: ExceptionMessage = {
          msgid,
          message: err.message || String(err),
          stack: err.stack,
          timestamp: new Date().toISOString(),
          source: 'miniprogram',
        };

        // 添加到当前导航会话
        const currentNav = context.consoleStorage.navigations[0];
        currentNav.exceptions.push(exceptionMessage);

        // 添加到 ID 映射
        context.consoleStorage.messageIdMap.set(msgid, exceptionMessage);

        console.log(`[Exception] msgid=${msgid}:`, err.message, err.stack);
      });

      // TODO: 未来可添加导航事件监听
      // context.miniProgram.on('pageNavigate', () => {
      //   // 创建新的导航会话
      //   context.consoleStorage.navigations.unshift({
      //     messages: [],
      //     exceptions: [],
      //     timestamp: new Date().toISOString()
      //   });
      //   // 限制保留数量
      //   context.consoleStorage.navigations.splice(context.consoleStorage.maxNavigations);
      // });

      response.appendResponseLine('Console监听已启动');
      response.appendResponseLine(`监听开始时间: ${context.consoleStorage.startTime}`);
      response.appendResponseLine(`清除历史记录: ${clearExisting ? '是' : '否'}`);
      response.appendResponseLine(`Stable ID 系统: 已启用`);
      response.appendResponseLine(`导航历史保留: 最多 ${context.consoleStorage.maxNavigations} 次`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`启动Console监听失败: ${errorMessage}`);
    }
  },
});

/**
 * 停止Console监听工具
 */
export const stopConsoleMonitoringTool = defineTool({
  name: 'stop_console_monitoring',
  description: '停止对微信开发者工具console和exception的监听',
  schema: z.object({}),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    try {
      // 移除所有监听器
      context.miniProgram.removeAllListeners('console');
      context.miniProgram.removeAllListeners('exception');

      // 统计消息数量
      const storage = context.consoleStorage;
      let totalMessages = 0;
      let totalExceptions = 0;

      if (storage.navigations) {
        for (const nav of storage.navigations) {
          totalMessages += nav.messages.length;
          totalExceptions += nav.exceptions.length;
        }
      }

      // 更新监听状态
      const wasMonitoring = context.consoleStorage.isMonitoring;
      context.consoleStorage.isMonitoring = false;

      response.appendResponseLine(wasMonitoring ? 'Console监听已停止' : 'Console监听未在运行');
      response.appendResponseLine(`监听期间收集到 ${totalMessages} 条console日志`);
      response.appendResponseLine(`监听期间收集到 ${totalExceptions} 条exception记录`);
      response.appendResponseLine(`ID 映射表大小: ${storage.messageIdMap?.size || 0}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`停止Console监听失败: ${errorMessage}`);
    }
  },
});

/**
 * 列表查询 Console 消息工具（P0新增）
 */
export const listConsoleMessagesTool = defineTool({
  name: 'list_console_messages',
  description: '列表查询console消息（简短格式，支持分页和过滤）。用于快速浏览大量消息，获取 msgid 后可用 get_console_message 查看详情。',
  schema: z.object({
    pageSize: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('每页消息数量，默认为50'),
    pageIdx: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('页码（从0开始），默认为0'),
    types: z
      .array(z.enum(FILTERABLE_MESSAGE_TYPES as any))
      .optional()
      .describe('过滤消息类型，支持15+种类型，不指定则返回所有类型'),
    includePreservedMessages: z
      .boolean()
      .default(false)
      .optional()
      .describe('是否包含历史导航的消息（最近3次导航）'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const {
      pageSize = 50,
      pageIdx = 0,
      types,
      includePreservedMessages = false,
    } = request.params;

    if (!context.consoleStorage) {
      throw new Error('Console存储未初始化');
    }

    initializeConsoleStorage(context);

    // 收集消息
    let allMessages: Array<ConsoleMessageData | ExceptionMessageData> = [];

    const navigationsToInclude = includePreservedMessages
      ? context.consoleStorage.navigations.slice(0, context.consoleStorage.maxNavigations)
      : [context.consoleStorage.navigations[0]];

    for (const nav of navigationsToInclude) {
      // 添加 console 消息
      for (const msg of nav.messages) {
        if (msg.msgid !== undefined) {
          allMessages.push({
            msgid: msg.msgid,
            type: msg.type,
            message: msg.message,
            args: msg.args,
            timestamp: msg.timestamp,
            source: msg.source,
          });
        }
      }

      // 添加 exception 消息
      for (const exc of nav.exceptions) {
        if (exc.msgid !== undefined) {
          allMessages.push({
            msgid: exc.msgid,
            type: 'exception',
            message: exc.message,
            stack: exc.stack,
            timestamp: exc.timestamp,
            source: exc.source,
          });
        }
      }
    }

    // 类型过滤
    if (types && types.length > 0) {
      const normalizedTypes = new Set(types);
      allMessages = allMessages.filter(msg => normalizedTypes.has(msg.type as any));
    }

    // 按时间排序（最新的在前）
    allMessages.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    // 分页
    const total = allMessages.length;
    const start = pageIdx * pageSize;
    const end = Math.min(start + pageSize, total);
    const pagedMessages = allMessages.slice(start, end);

    // 格式化输出
    response.appendResponseLine('## Console Messages (List View)');
    response.appendResponseLine(`监听状态: ${context.consoleStorage.isMonitoring ? '运行中' : '已停止'}`);
    response.appendResponseLine(`监听开始时间: ${context.consoleStorage.startTime || '未设置'}`);
    response.appendResponseLine('');

    const paginationInfo = formatPaginationInfo(total, pageSize, pageIdx);
    for (const line of paginationInfo.info) {
      response.appendResponseLine(line);
    }

    response.appendResponseLine('');
    response.appendResponseLine('### Messages');

    if (pagedMessages.length > 0) {
      for (const msg of pagedMessages) {
        response.appendResponseLine(formatConsoleEventShort(msg));
      }
    } else {
      response.appendResponseLine('<no messages found>');
    }

    response.appendResponseLine('');
    response.appendResponseLine('💡 提示: 使用 get_console_message 工具按 msgid 查看详细信息');
  },
});

/**
 * 详情查询 Console 消息工具（P0新增）
 */
export const getConsoleMessageTool = defineTool({
  name: 'get_console_message',
  description: '通过 msgid 获取单条console消息的详细信息（完整的参数和堆栈跟踪）',
  schema: z.object({
    msgid: z.number().positive().describe('消息的 Stable ID（从 list_console_messages 获取）'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { msgid } = request.params;

    if (!context.consoleStorage) {
      throw new Error('Console存储未初始化');
    }

    initializeConsoleStorage(context);

    // 从 ID 映射表查找
    const message = context.consoleStorage.messageIdMap.get(msgid);

    if (!message) {
      throw new Error(`未找到 msgid=${msgid} 的消息。请使用 list_console_messages 查看可用的消息。`);
    }

    // 构造详细数据
    let detailData: ConsoleMessageData | ExceptionMessageData;

    if ('stack' in message) {
      // Exception 消息
      detailData = {
        msgid: message.msgid!,
        type: 'exception',
        message: message.message,
        stack: message.stack,
        timestamp: message.timestamp,
        source: message.source,
      };
    } else {
      // Console 消息（类型收窄）
      const consoleMsg = message as ConsoleMessage;
      detailData = {
        msgid: consoleMsg.msgid!,
        type: consoleMsg.type,
        message: consoleMsg.message,
        args: consoleMsg.args,
        timestamp: consoleMsg.timestamp,
        source: consoleMsg.source,
      };
    }

    // 格式化输出
    response.appendResponseLine('## Console Message (Detail View)');
    response.appendResponseLine('');
    response.appendResponseLine(formatConsoleEventVerbose(detailData));
  },
});

/**
 * 获取Console日志工具（向后兼容）
 */
export const getConsoleTool = defineTool({
  name: 'get_console',
  description: '获取收集到的console日志和exception异常信息（兼容旧版API，建议使用 list_console_messages）',
  schema: z.object({
    type: z.enum(['all', 'console', 'exception']).optional().default('all').describe('获取的数据类型'),
    limit: z.number().optional().default(50).describe('限制返回条数'),
    since: z.string().optional().describe('获取指定时间之后的记录，格式：ISO 8601'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { type, limit, since } = request.params;

    if (!context.consoleStorage) {
      throw new Error('Console存储未初始化');
    }

    initializeConsoleStorage(context);

    const sinceTime = since ? new Date(since) : null;

    // 过滤函数
    const filterByTime = (item: ConsoleMessage | ExceptionMessage) => {
      if (!sinceTime) return true;
      return new Date(item.timestamp) >= sinceTime;
    };

    // 收集消息（向后兼容：只从当前导航获取）
    const currentNav = context.consoleStorage.navigations[0];
    let consoleMessages: ConsoleMessage[] = [];
    let exceptionMessages: ExceptionMessage[] = [];

    if (type === 'all' || type === 'console') {
      consoleMessages = currentNav.messages.filter(filterByTime).slice(-limit);
    }

    if (type === 'all' || type === 'exception') {
      exceptionMessages = currentNav.exceptions.filter(filterByTime).slice(-limit);
    }

    // 生成响应（保持旧版格式）
    response.appendResponseLine('=== Console数据获取结果 ===');
    response.appendResponseLine(`监听状态: ${context.consoleStorage.isMonitoring ? '运行中' : '已停止'}`);
    response.appendResponseLine(`监听开始时间: ${context.consoleStorage.startTime || '未设置'}`);

    if (consoleMessages.length > 0) {
      response.appendResponseLine(`\n--- Console日志 (${consoleMessages.length} 条) ---`);
      consoleMessages.forEach((msg, index) => {
        const msgidInfo = msg.msgid ? ` [msgid=${msg.msgid}]` : '';
        response.appendResponseLine(`${index + 1}. [${msg.type}] ${msg.timestamp}${msgidInfo}`);
        response.appendResponseLine(`   内容: ${msg.message || JSON.stringify(msg.args)}`);
      });
    }

    if (exceptionMessages.length > 0) {
      response.appendResponseLine(`\n--- Exception异常 (${exceptionMessages.length} 条) ---`);
      exceptionMessages.forEach((err, index) => {
        const msgidInfo = err.msgid ? ` [msgid=${err.msgid}]` : '';
        response.appendResponseLine(`${index + 1}. ${err.timestamp}${msgidInfo}`);
        response.appendResponseLine(`   消息: ${err.message}`);
        if (err.stack) {
          response.appendResponseLine(`   堆栈: ${err.stack.split('\n')[0]}...`);
        }
      });
    }

    response.appendResponseLine('\n=== 获取完成 ===');
    response.appendResponseLine('💡 提示: 建议使用 list_console_messages 和 get_console_message 工具以获得更好的体验');
  },
});

/**
 * 清除Console日志工具
 */
export const clearConsoleTool = defineTool({
  name: 'clear_console',
  description: '清除已收集的console日志和exception异常信息',
  schema: z.object({
    type: z.enum(['all', 'console', 'exception']).optional().default('all').describe('清除的数据类型'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { type } = request.params;

    if (!context.consoleStorage) {
      throw new Error('Console存储未初始化');
    }

    initializeConsoleStorage(context);

    let clearedConsole = 0;
    let clearedException = 0;

    // 根据类型清除数据
    const currentNav = context.consoleStorage.navigations[0];

    if (type === 'all' || type === 'console') {
      clearedConsole = currentNav.messages.length;
      // 从 ID 映射中移除
      for (const msg of currentNav.messages) {
        if (msg.msgid !== undefined) {
          context.consoleStorage.messageIdMap.delete(msg.msgid);
        }
      }
      currentNav.messages = [];
    }

    if (type === 'all' || type === 'exception') {
      clearedException = currentNav.exceptions.length;
      // 从 ID 映射中移除
      for (const exc of currentNav.exceptions) {
        if (exc.msgid !== undefined) {
          context.consoleStorage.messageIdMap.delete(exc.msgid);
        }
      }
      currentNav.exceptions = [];
    }

    response.appendResponseLine('Console数据清除完成');
    response.appendResponseLine(`清除Console日志: ${clearedConsole} 条`);
    response.appendResponseLine(`清除Exception异常: ${clearedException} 条`);
    response.appendResponseLine(`剩余 ID 映射: ${context.consoleStorage.messageIdMap.size}`);
  },
});