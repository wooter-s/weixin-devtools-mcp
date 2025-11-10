/**
 * Console工具单元测试
 * 验证console工具的代码结构和类型定义
 */

import { describe, it, expect, vi } from 'vitest';
import {
  startConsoleMonitoringTool,
  stopConsoleMonitoringTool,
  getConsoleTool,
  clearConsoleTool
} from '../../src/tools/console.js';
import {
  ToolContext,
  ConsoleMessage,
  ExceptionMessage,
  ConsoleStorage
} from '../../src/tools/ToolDefinition.js';

describe('Console Tools Unit Tests', () => {
  // 创建模拟的工具上下文
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
      consoleMessages: [],
      exceptionMessages: [],
      isMonitoring: false,
      startTime: null,
    },
  });

  it('应该正确定义console工具', () => {
    // 验证工具定义的基本属性
    expect(startConsoleMonitoringTool.name).toBe('start_console_monitoring');
    expect(stopConsoleMonitoringTool.name).toBe('stop_console_monitoring');
    expect(getConsoleTool.name).toBe('get_console');
    expect(clearConsoleTool.name).toBe('clear_console');

    // 验证工具有描述
    expect(startConsoleMonitoringTool.description).toBeTruthy();
    expect(stopConsoleMonitoringTool.description).toBeTruthy();
    expect(getConsoleTool.description).toBeTruthy();
    expect(clearConsoleTool.description).toBeTruthy();

    // 验证工具有schema
    expect(startConsoleMonitoringTool.schema).toBeTruthy();
    expect(stopConsoleMonitoringTool.schema).toBeTruthy();
    expect(getConsoleTool.schema).toBeTruthy();
    expect(clearConsoleTool.schema).toBeTruthy();

    // 验证工具有handler
    expect(typeof startConsoleMonitoringTool.handler).toBe('function');
    expect(typeof stopConsoleMonitoringTool.handler).toBe('function');
    expect(typeof getConsoleTool.handler).toBe('function');
    expect(typeof clearConsoleTool.handler).toBe('function');
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

    // 创建测试用的ConsoleStorage
    const consoleStorage: ConsoleStorage = {
      consoleMessages: [consoleMessage],
      exceptionMessages: [exceptionMessage],
      isMonitoring: true,
      startTime: new Date().toISOString()
    };

    expect(consoleStorage.consoleMessages).toHaveLength(1);
    expect(consoleStorage.exceptionMessages).toHaveLength(1);
    expect(consoleStorage.isMonitoring).toBe(true);
    expect(consoleStorage.startTime).toBeTruthy();
  });

  it('应该正确处理schema验证', () => {
    // 测试startConsoleMonitoringTool的schema
    const startSchema = startConsoleMonitoringTool.schema;
    const validStartParams = { clearExisting: true };
    const startResult = startSchema.safeParse(validStartParams);
    expect(startResult.success).toBe(true);

    // 测试getConsoleTool的schema
    const getSchema = getConsoleTool.schema;
    const validGetParams = {
      type: 'all' as const,
      limit: 50,
      since: '2023-01-01T00:00:00.000Z'
    };
    const getResult = getSchema.safeParse(validGetParams);
    expect(getResult.success).toBe(true);

    // 测试clearConsoleTool的schema
    const clearSchema = clearConsoleTool.schema;
    const validClearParams = { type: 'console' as const };
    const clearResult = clearSchema.safeParse(validClearParams);
    expect(clearResult.success).toBe(true);
  });

  it('应该能正确创建模拟的工具上下文', () => {
    const context = createMockContext();

    expect(context.miniProgram).toBeTruthy();
    expect(context.currentPage).toBeNull();
    expect(context.elementMap).toBeInstanceOf(Map);
    expect(context.consoleStorage).toBeTruthy();
    expect(context.consoleStorage.consoleMessages).toEqual([]);
    expect(context.consoleStorage.exceptionMessages).toEqual([]);
    expect(context.consoleStorage.isMonitoring).toBe(false);
    expect(context.consoleStorage.startTime).toBeNull();
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