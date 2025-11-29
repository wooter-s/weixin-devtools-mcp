/**
 * Console工具单元测试
 * 验证console工具的代码结构和类型定义
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  ToolContext,
  ConsoleMessage,
  ExceptionMessage,
  ConsoleStorage} from '../../src/tools/ToolDefinition.js';
import {
  SimpleToolResponse
} from '../../src/tools/ToolDefinition.js';
import {
  listConsoleMessagesTool,
  getConsoleMessageTool
} from '../../src/tools/console.js';
import { createIdGenerator } from '../../src/utils/idGenerator.js';

describe('Console Tools Unit Tests', () => {
  // 创建模拟的工具上下文（使用新的 navigations 结构）
  const createMockContext = (): ToolContext => ({
    miniProgram: {
      on: vi.fn(),
      removeAllListeners: vi.fn(),
      listenerCount: vi.fn(() => 0),
      removeListener: vi.fn(),
    },
    currentPage: null,
    elementMap: new Map(),
    consoleStorage: {
      navigations: [{ messages: [], exceptions: [], timestamp: new Date().toISOString() }],
      messageIdMap: new Map(),
      isMonitoring: false,
      startTime: null,
      maxNavigations: 3,
      idGenerator: createIdGenerator(),
    },
    getElementByUid: vi.fn(),
  });

  it('应该正确定义所有console工具', () => {
    // 验证工具定义的基本属性
    expect(listConsoleMessagesTool.name).toBe('list_console_messages');
    expect(getConsoleMessageTool.name).toBe('get_console_message');

    // 验证工具有描述
    expect(listConsoleMessagesTool.description).toBeTruthy();
    expect(getConsoleMessageTool.description).toBeTruthy();

    // 验证工具有schema
    expect(listConsoleMessagesTool.schema).toBeTruthy();
    expect(getConsoleMessageTool.schema).toBeTruthy();

    // 验证工具有handler
    expect(typeof listConsoleMessagesTool.handler).toBe('function');
    expect(typeof getConsoleMessageTool.handler).toBe('function');
  });

  it('应该正确定义Console相关的类型', () => {
    // 创建测试用的ConsoleMessage
    const consoleMessage: ConsoleMessage = {
      type: 'log',
      args: ['test message'],
      timestamp: new Date().toISOString(),
      source: 'miniprogram'
    };

    expect(consoleMessage.type).toBe('log');
    expect(consoleMessage.args).toEqual(['test message']);
    expect(consoleMessage.timestamp).toBeTruthy();
    expect(consoleMessage.source).toBe('miniprogram');

    // 创建测试用的ExceptionMessage
    const exceptionMessage: ExceptionMessage = {
      message: 'Test error',
      stack: 'Error stack trace',
      timestamp: new Date().toISOString(),
      source: 'miniprogram'
    };

    expect(exceptionMessage.message).toBe('Test error');
    expect(exceptionMessage.stack).toBe('Error stack trace');
    expect(exceptionMessage.timestamp).toBeTruthy();
    expect(exceptionMessage.source).toBe('miniprogram');

    // 创建测试用的ConsoleStorage（使用新的 navigations 结构）
    const consoleStorage: ConsoleStorage = {
      navigations: [{
        messages: [consoleMessage],
        exceptions: [exceptionMessage],
        timestamp: new Date().toISOString()
      }],
      messageIdMap: new Map(),
      isMonitoring: true,
      startTime: new Date().toISOString(),
      maxNavigations: 3,
    };

    expect(consoleStorage.navigations).toHaveLength(1);
    expect(consoleStorage.navigations[0].messages).toHaveLength(1);
    expect(consoleStorage.navigations[0].exceptions).toHaveLength(1);
    expect(consoleStorage.isMonitoring).toBe(true);
    expect(consoleStorage.startTime).toBeTruthy();
  });

  it('应该正确处理schema验证', () => {
    // 测试 listConsoleMessagesTool 的 schema
    const listSchema = listConsoleMessagesTool.schema;
    const validListParams = {
      pageSize: 20,
      pageIdx: 0,
      types: ['log', 'error'],
      includePreservedMessages: false
    };
    const listResult = listSchema.safeParse(validListParams);
    expect(listResult.success).toBe(true);

    // 测试 getConsoleMessageTool 的 schema
    const getMessageSchema = getConsoleMessageTool.schema;
    const validGetMessageParams = { msgid: 1 };
    const getMessageResult = getMessageSchema.safeParse(validGetMessageParams);
    expect(getMessageResult.success).toBe(true);
  });

  it('应该能正确创建模拟的工具上下文（使用新存储结构）', () => {
    const context = createMockContext();

    expect(context.miniProgram).toBeTruthy();
    expect(context.currentPage).toBeNull();
    expect(context.elementMap).toBeInstanceOf(Map);
    expect(context.consoleStorage).toBeTruthy();
    expect(context.consoleStorage.navigations).toHaveLength(1);
    expect(context.consoleStorage.navigations[0].messages).toEqual([]);
    expect(context.consoleStorage.navigations[0].exceptions).toEqual([]);
    expect(context.consoleStorage.messageIdMap).toBeInstanceOf(Map);
    expect(context.consoleStorage.isMonitoring).toBe(false);
    expect(context.consoleStorage.startTime).toBeNull();
    expect(context.consoleStorage.maxNavigations).toBe(3);
    expect(typeof context.consoleStorage.idGenerator).toBe('function');
  });

  it('应该验证console消息的数据结构', () => {
    const sampleConsoleMessage: ConsoleMessage = {
      type: 'error',
      args: ['Error occurred', { details: 'some details' }],
      timestamp: '2023-12-01T10:00:00.000Z',
      source: 'miniprogram'
    };

    // 验证类型枚举值
    const validTypes: ConsoleMessage['type'][] = ['log', 'warn', 'error', 'info', 'debug'];
    expect(validTypes).toContain(sampleConsoleMessage.type);

    // 验证args可以包含各种类型
    expect(Array.isArray(sampleConsoleMessage.args)).toBe(true);
    expect(sampleConsoleMessage.args[0]).toBe('Error occurred');
    expect(typeof sampleConsoleMessage.args[1]).toBe('object');
  });

  it('应该验证exception消息的数据结构', () => {
    const sampleExceptionMessage: ExceptionMessage = {
      message: 'ReferenceError: undefined is not defined',
      stack: 'ReferenceError: undefined is not defined\n    at test.js:1:1',
      timestamp: '2023-12-01T10:00:00.000Z',
      source: 'miniprogram'
    };

    expect(typeof sampleExceptionMessage.message).toBe('string');
    expect(typeof sampleExceptionMessage.stack).toBe('string');
    expect(typeof sampleExceptionMessage.timestamp).toBe('string');
    expect(sampleExceptionMessage.source).toBe('miniprogram');
  });
});

describe('New Console Tools - list_console_messages', () => {
  let context: ToolContext;

  beforeEach(() => {
    context = {
      miniProgram: {} as any,
      currentPage: null,
      elementMap: new Map(),
      consoleStorage: {
        navigations: [{ messages: [], exceptions: [], timestamp: new Date().toISOString() }],
        messageIdMap: new Map(),
        isMonitoring: true,
        startTime: new Date().toISOString(),
        maxNavigations: 3,
        idGenerator: createIdGenerator(),
      },
      getElementByUid: vi.fn(),
    };
  });

  it('应该支持分页参数', () => {
    const schema = listConsoleMessagesTool.schema;

    // 测试有效的分页参数
    const validParams = { pageSize: 20, pageIdx: 0 };
    const result = schema.safeParse(validParams);
    expect(result.success).toBe(true);

    // 测试无效的分页参数（负数）
    const invalidParams = { pageSize: -1, pageIdx: 0 };
    const invalidResult = schema.safeParse(invalidParams);
    expect(invalidResult.success).toBe(false);
  });

  it('应该支持扩展的类型过滤（17种类型）', () => {
    const schema = listConsoleMessagesTool.schema;

    // 测试所有支持的类型
    const validTypes = ['log', 'debug', 'info', 'error', 'warn', 'dir', 'dirxml',
                        'table', 'trace', 'clear', 'group', 'groupCollapsed',
                        'groupEnd', 'assert', 'count', 'timeEnd', 'verbose'];

    const params = { types: validTypes };
    const result = schema.safeParse(params);
    expect(result.success).toBe(true);
  });

  it('应该正确返回简短格式的消息列表', async () => {
    // 添加测试消息
    const msg1: ConsoleMessage = {
      msgid: 1,
      type: 'log',
      message: 'Test log',
      args: ['Test', 'log'],
      timestamp: new Date().toISOString(),
      source: 'miniprogram'
    };
    const msg2: ConsoleMessage = {
      msgid: 2,
      type: 'error',
      message: 'Test error',
      args: ['Test', 'error'],
      timestamp: new Date().toISOString(),
      source: 'miniprogram'
    };

    context.consoleStorage.navigations[0].messages.push(msg1, msg2);
    context.consoleStorage.messageIdMap.set(1, msg1);
    context.consoleStorage.messageIdMap.set(2, msg2);

    const request = { params: {} };
    const response = new SimpleToolResponse();

    await listConsoleMessagesTool.handler(request, response, context);

    const output = response.getResponseText();

    // 验证输出包含简短格式
    expect(output).toContain('msgid=1');
    expect(output).toContain('msgid=2');
    expect(output).toContain('[log]');
    expect(output).toContain('[error]');
    expect(output).toContain('(2 args)');
  });

  it('应该正确处理分页', async () => {
    // 添加 25 条消息
    for (let i = 1; i <= 25; i++) {
      const msg: ConsoleMessage = {
        msgid: i,
        type: 'log',
        message: `Message ${i}`,
        args: [`Message ${i}`],
        timestamp: new Date().toISOString(),
        source: 'miniprogram'
      };
      context.consoleStorage.navigations[0].messages.push(msg);
      context.consoleStorage.messageIdMap.set(i, msg);
    }

    // 第一页（0-19）
    const request1 = { params: { pageSize: 20, pageIdx: 0 } };
    const response1 = new SimpleToolResponse();
    await listConsoleMessagesTool.handler(request1, response1, context);
    const output1 = response1.getResponseText();

    expect(output1).toContain('Total: 25 messages');
    expect(output1).toContain('Showing: 1-20');
    expect(output1).toContain('Next page: 1');

    // 第二页（20-24）
    const request2 = { params: { pageSize: 20, pageIdx: 1 } };
    const response2 = new SimpleToolResponse();
    await listConsoleMessagesTool.handler(request2, response2, context);
    const output2 = response2.getResponseText();

    expect(output2).toContain('Total: 25 messages');
    expect(output2).toContain('Showing: 21-25');
    expect(output2).toContain('Previous page: 0');
  });

  it('应该支持类型过滤', async () => {
    // 添加不同类型的消息
    const logMsg: ConsoleMessage = {
      msgid: 1,
      type: 'log',
      message: 'Log message',
      args: ['Log'],
      timestamp: new Date().toISOString(),
      source: 'miniprogram'
    };
    const errorMsg: ConsoleMessage = {
      msgid: 2,
      type: 'error',
      message: 'Error message',
      args: ['Error'],
      timestamp: new Date().toISOString(),
      source: 'miniprogram'
    };

    context.consoleStorage.navigations[0].messages.push(logMsg, errorMsg);
    context.consoleStorage.messageIdMap.set(1, logMsg);
    context.consoleStorage.messageIdMap.set(2, errorMsg);

    // 只获取 error 类型
    const request = { params: { types: ['error'] } };
    const response = new SimpleToolResponse();
    await listConsoleMessagesTool.handler(request, response, context);
    const output = response.getResponseText();

    expect(output).toContain('msgid=2');
    expect(output).toContain('[error]');
    expect(output).not.toContain('msgid=1');
    expect(output).not.toContain('[log]');
  });
});

describe('New Console Tools - get_console_message', () => {
  let context: ToolContext;

  beforeEach(() => {
    context = {
      miniProgram: {} as any,
      currentPage: null,
      elementMap: new Map(),
      consoleStorage: {
        navigations: [{ messages: [], exceptions: [], timestamp: new Date().toISOString() }],
        messageIdMap: new Map(),
        isMonitoring: true,
        startTime: new Date().toISOString(),
        maxNavigations: 3,
        idGenerator: createIdGenerator(),
      },
      getElementByUid: vi.fn(),
    };
  });

  it('应该通过msgid获取详细消息', async () => {
    const msg: ConsoleMessage = {
      msgid: 1,
      type: 'error',
      message: 'Detailed error',
      args: ['arg1', { key: 'value' }],
      timestamp: '2023-12-01T10:00:00.000Z',
      source: 'miniprogram'
    };

    context.consoleStorage.navigations[0].messages.push(msg);
    context.consoleStorage.messageIdMap.set(1, msg);

    const request = { params: { msgid: 1 } };
    const response = new SimpleToolResponse();

    await getConsoleMessageTool.handler(request, response, context);

    const output = response.getResponseText();

    // 验证详细格式
    expect(output).toContain('ID: 1');
    expect(output).toContain('Type: error');
    expect(output).toContain('Message: Detailed error');
    expect(output).toContain('Timestamp: 2023-12-01T10:00:00.000Z');
    expect(output).toContain('### Arguments');
    expect(output).toContain('Arg #0: arg1');
    expect(output).toContain('Arg #1:');
  });

  it('应该正确处理Exception消息', async () => {
    const exception: ExceptionMessage = {
      msgid: 2,
      message: 'ReferenceError: x is not defined',
      stack: 'ReferenceError: x is not defined\\n    at test.js:1:1',
      timestamp: '2023-12-01T10:00:00.000Z',
      source: 'miniprogram'
    };

    context.consoleStorage.navigations[0].exceptions.push(exception);
    context.consoleStorage.messageIdMap.set(2, exception);

    const request = { params: { msgid: 2 } };
    const response = new SimpleToolResponse();

    await getConsoleMessageTool.handler(request, response, context);

    const output = response.getResponseText();

    // 验证Exception专属字段
    expect(output).toContain('ID: 2');
    expect(output).toContain('Type: exception');
    expect(output).toContain('Message: ReferenceError: x is not defined');
    expect(output).toContain('### Stack Trace');
  });

  it('应该在找不到msgid时抛出错误', async () => {
    const request = { params: { msgid: 999 } };
    const response = new SimpleToolResponse();

    await expect(
      getConsoleMessageTool.handler(request, response, context)
    ).rejects.toThrow('未找到 msgid=999 的消息');
  });

  it('应该验证msgid参数', () => {
    const schema = getConsoleMessageTool.schema;

    // 有效参数
    expect(schema.safeParse({ msgid: 1 }).success).toBe(true);
    expect(schema.safeParse({ msgid: 100 }).success).toBe(true);

    // 无效参数
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ msgid: 'invalid' }).success).toBe(false);
    expect(schema.safeParse({ msgid: -1 }).success).toBe(false);
  });
});