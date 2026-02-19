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
  ToolCategory,
  type ConsoleMessage,
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

// 注意: start_console_monitoring 和 stop_console_monitoring 已移除
// Console 监听在连接时自动启动，无需手动管理

/**
 * 列表查询 Console 消息工具
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
    category: ToolCategory.CONSOLE,
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

    // 按时间排序（最新的在前）- 预处理时间戳避免重复 Date 创建
    const messagesWithTime = allMessages.map(msg => ({
      msg,
      time: new Date(msg.timestamp || 0).getTime(),
    }));
    messagesWithTime.sort((a, b) => b.time - a.time);
    allMessages = messagesWithTime.map(item => item.msg);

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
    category: ToolCategory.CONSOLE,
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

// 注意: get_console 和 clear_console 已移除
// 请使用 list_console_messages 和 get_console_message 工具