/**
 * ConsoleCollector - Console 消息收集器
 *
 * 专门用于收集和管理 Console 消息和异常
 * 继承自通用 Collector 基类
 */

import type { ConsoleMessageType } from '../tools/ToolDefinition.js';

import { Collector, type CollectorOptions, type QueryOptions } from './Collector.js';

/**
 * Console 消息接口
 */
export interface ConsoleMessage {
  /** Stable ID（由 Collector 自动分配） */
  msgid?: number;
  /** 消息类型 */
  type: ConsoleMessageType;
  /** 格式化的消息文本 */
  message?: string;
  /** console 方法的原始参数 */
  args: unknown[];
  /** 时间戳 */
  timestamp: string;
  /** 来源 */
  source?: string;
}

/**
 * Exception 异常信息接口
 */
export interface ExceptionMessage {
  /** Stable ID（由 Collector 自动分配） */
  msgid?: number;
  /** 异常消息 */
  message: string;
  /** 堆栈信息 */
  stack?: string;
  /** 时间戳 */
  timestamp: string;
  /** 来源 */
  source?: string;
}

/**
 * Console 消息类型（包含 Console 消息和异常）
 */
export type ConsoleEntry = ConsoleMessage | ExceptionMessage;

/**
 * Console 查询选项
 */
export interface ConsoleQueryOptions extends QueryOptions<ConsoleEntry> {
  /** 过滤消息类型 */
  types?: ConsoleMessageType[];
}

/**
 * 检查是否为 ConsoleMessage
 */
export function isConsoleMessage(entry: ConsoleEntry): entry is ConsoleMessage {
  return 'type' in entry;
}

/**
 * 检查是否为 ExceptionMessage
 */
export function isExceptionMessage(entry: ConsoleEntry): entry is ExceptionMessage {
  return !('type' in entry) && 'message' in entry;
}

/**
 * Console 消息收集器
 */
export class ConsoleCollector extends Collector<ConsoleEntry> {
  constructor(options?: CollectorOptions) {
    super(options);
  }

  /**
   * 添加 Console 消息
   * @returns 分配的 msgid
   */
  addMessage(message: Omit<ConsoleMessage, 'msgid'>): number {
    const id = this.collect(message as ConsoleMessage);
    // 同步 msgid 到消息对象
    const storedMessage = this.getById(id) as ConsoleMessage;
    if (storedMessage) {
      storedMessage.msgid = id;
    }
    return id;
  }

  /**
   * 添加异常信息
   * @returns 分配的 msgid
   */
  addException(exception: Omit<ExceptionMessage, 'msgid'>): number {
    const id = this.collect(exception as ExceptionMessage);
    // 同步 msgid 到异常对象
    const storedException = this.getById(id) as ExceptionMessage;
    if (storedException) {
      storedException.msgid = id;
    }
    return id;
  }

  /**
   * 通过 msgid 获取消息
   */
  getMessageById(msgid: number): ConsoleEntry | undefined {
    return this.getById(msgid);
  }

  /**
   * 获取 Console 消息（支持类型过滤）
   */
  getMessages(options: ConsoleQueryOptions = {}): ConsoleEntry[] {
    const { types, ...baseOptions } = options;

    // 构建过滤函数
    let filter = baseOptions.filter;
    if (types && types.length > 0) {
      const typeSet = new Set(types);
      const originalFilter = filter;
      filter = (entry: ConsoleEntry) => {
        // 类型过滤
        const typeMatch = isConsoleMessage(entry)
          ? typeSet.has(entry.type)
          : typeSet.has('error'); // ExceptionMessage 视为 error 类型

        // 如果有原始过滤器，还需要满足原始过滤条件
        if (originalFilter) {
          return typeMatch && originalFilter(entry);
        }
        return typeMatch;
      };
    }

    return this.getData({ ...baseOptions, filter });
  }

  /**
   * 只获取 Console 消息（不包括异常）
   */
  getConsoleMessagesOnly(options: ConsoleQueryOptions = {}): ConsoleMessage[] {
    const entries = this.getMessages(options);
    return entries.filter(isConsoleMessage);
  }

  /**
   * 只获取异常信息
   */
  getExceptionsOnly(options: Omit<ConsoleQueryOptions, 'types'> = {}): ExceptionMessage[] {
    const entries = this.getData(options);
    return entries.filter(isExceptionMessage);
  }

  /**
   * 获取错误数量（包括 error 类型消息和异常）
   */
  getErrorCount(): number {
    let count = 0;
    const entries = this.getData({ includePreserved: false });
    for (const entry of entries) {
      if (isExceptionMessage(entry) || (isConsoleMessage(entry) && entry.type === 'error')) {
        count++;
      }
    }
    return count;
  }

  /**
   * 获取警告数量
   */
  getWarningCount(): number {
    let count = 0;
    const entries = this.getData({ includePreserved: false });
    for (const entry of entries) {
      if (isConsoleMessage(entry) && entry.type === 'warn') {
        count++;
      }
    }
    return count;
  }

  /**
   * 格式化消息预览（用于列表显示）
   */
  formatPreview(entry: ConsoleEntry, maxLength = 100): string {
    let text: string;

    if (isConsoleMessage(entry)) {
      if (entry.message) {
        text = entry.message;
      } else if (entry.args.length > 0) {
        text = entry.args
          .map(arg => {
            if (typeof arg === 'string') return arg;
            if (typeof arg === 'object') return JSON.stringify(arg);
            return String(arg);
          })
          .join(' ');
      } else {
        text = '';
      }
    } else {
      text = entry.message;
    }

    // 截断长文本
    if (text.length > maxLength) {
      return text.slice(0, maxLength) + '...';
    }
    return text;
  }
}
