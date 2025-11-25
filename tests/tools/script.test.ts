/**
 * Script工具单元测试
 * 验证 evaluate_script 工具的功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ToolContext} from '../../src/tools/ToolDefinition.js';
import { SimpleToolResponse } from '../../src/tools/ToolDefinition.js';
import { evaluateScript } from '../../src/tools/script.js';

describe('Script Tool Unit Tests', () => {
  // 创建模拟的工具上下文
  // 注意：使用 Symbol 作为默认值，避免 null/undefined 被 ?? 操作符替换
  const DEFAULT_RESULT = Symbol('default');
  const createMockContext = (evaluateResult: any = DEFAULT_RESULT): ToolContext => ({
    miniProgram: {
      evaluate: vi.fn().mockResolvedValue(
        evaluateResult === DEFAULT_RESULT ? { success: true } : evaluateResult
      ),
    },
    currentPage: null,
    elementMap: new Map(),
    consoleStorage: {
      consoleMessages: [],
      exceptionMessages: [],
      isMonitoring: false,
      startTime: null,
    },
    networkStorage: {
      requests: [],
      isMonitoring: false,
      startTime: null,
      originalMethods: {},
    },
  });

  const createMockResponse = () => new SimpleToolResponse();

  describe('工具定义', () => {
    it('应该有正确的工具名称', () => {
      expect(evaluateScript.name).toBe('evaluate_script');
    });

    it('应该有描述信息', () => {
      expect(evaluateScript.description).toBeTruthy();
      expect(evaluateScript.description).toContain('AppService');
    });

    it('应该有schema定义', () => {
      expect(evaluateScript.schema).toBeTruthy();
    });

    it('应该有handler函数', () => {
      expect(typeof evaluateScript.handler).toBe('function');
    });
  });

  describe('基本执行', () => {
    it('应该执行简单的返回值函数', async () => {
      const context = createMockContext(42);
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => 42' } },
        response,
        context
      );

      expect(context.miniProgram.evaluate).toHaveBeenCalledWith('() => 42');
      const responseText = response.getResponseText();
      expect(responseText).toContain('执行成功');
      expect(responseText).toContain('42');
    });

    it('应该执行返回字符串的函数', async () => {
      const context = createMockContext('hello world');
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => "hello world"' } },
        response,
        context
      );

      expect(context.miniProgram.evaluate).toHaveBeenCalledWith('() => "hello world"');
      const responseText = response.getResponseText();
      expect(responseText).toContain('hello world');
    });

    it('应该执行返回对象的函数', async () => {
      const context = createMockContext({ foo: 'bar', count: 123 });
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => ({ foo: "bar", count: 123 })' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('foo');
      expect(responseText).toContain('bar');
      expect(responseText).toContain('123');
    });

    it('应该执行返回数组的函数', async () => {
      const context = createMockContext([1, 2, 3, 4, 5]);
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => [1, 2, 3, 4, 5]' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('[');
      expect(responseText).toContain('1');
      expect(responseText).toContain('5');
    });
  });

  describe('带参数执行', () => {
    it('应该传递单个参数', async () => {
      const context = createMockContext('test-key');
      const response = createMockResponse();

      await evaluateScript.handler(
        {
          params: {
            function: '(key) => key',
            args: ['test-key']
          }
        },
        response,
        context
      );

      expect(context.miniProgram.evaluate).toHaveBeenCalledWith(
        '(key) => key',
        'test-key'
      );
      const responseText = response.getResponseText();
      expect(responseText).toContain('test-key');
    });

    it('应该传递多个参数', async () => {
      const context = createMockContext({ key: 'test', value: 123 });
      const response = createMockResponse();

      await evaluateScript.handler(
        {
          params: {
            function: '(key, value) => ({ key, value })',
            args: ['test', 123]
          }
        },
        response,
        context
      );

      expect(context.miniProgram.evaluate).toHaveBeenCalledWith(
        '(key, value) => ({ key, value })',
        'test',
        123
      );
    });

    it('应该传递复杂对象参数', async () => {
      const complexArg = { name: 'test', data: [1, 2, 3], nested: { foo: 'bar' } };
      const context = createMockContext(complexArg);
      const response = createMockResponse();

      await evaluateScript.handler(
        {
          params: {
            function: '(obj) => obj',
            args: [complexArg]
          }
        },
        response,
        context
      );

      expect(context.miniProgram.evaluate).toHaveBeenCalledWith(
        '(obj) => obj',
        complexArg
      );
    });

    it('应该处理空参数数组', async () => {
      const context = createMockContext(true);
      const response = createMockResponse();

      await evaluateScript.handler(
        {
          params: {
            function: '() => true',
            args: []
          }
        },
        response,
        context
      );

      expect(context.miniProgram.evaluate).toHaveBeenCalledWith('() => true');
    });

    it('应该处理未提供参数的情况', async () => {
      const context = createMockContext(false);
      const response = createMockResponse();

      await evaluateScript.handler(
        {
          params: {
            function: '() => false'
          }
        },
        response,
        context
      );

      expect(context.miniProgram.evaluate).toHaveBeenCalledWith('() => false');
    });
  });

  describe('异步函数', () => {
    it('应该支持async函数', async () => {
      const context = createMockContext('async result');
      const response = createMockResponse();

      await evaluateScript.handler(
        {
          params: {
            function: 'async () => "async result"'
          }
        },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('async result');
    });

    it('应该支持Promise返回', async () => {
      const context = createMockContext({ status: 'success' });
      const response = createMockResponse();

      await evaluateScript.handler(
        {
          params: {
            function: '() => Promise.resolve({ status: "success" })'
          }
        },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('success');
    });
  });

  describe('错误处理', () => {
    it('应该在未连接时抛出错误', async () => {
      const context = createMockContext();
      context.miniProgram = null as any;
      const response = createMockResponse();

      await expect(
        evaluateScript.handler(
          { params: { function: '() => true' } },
          response,
          context
        )
      ).rejects.toThrow('未连接到微信开发者工具');
    });

    it('应该处理执行错误', async () => {
      const context = createMockContext();
      context.miniProgram.evaluate = vi.fn().mockRejectedValue(
        new Error('脚本语法错误')
      );
      const response = createMockResponse();

      await expect(
        evaluateScript.handler(
          { params: { function: '() => {' } },
          response,
          context
        )
      ).rejects.toThrow('脚本执行失败');
    });

    it('应该处理序列化错误', async () => {
      // 创建一个包含循环引用的对象（无法JSON序列化）
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      const context = createMockContext(circularObj);
      const response = createMockResponse();

      // JSON.stringify会抛出错误
      await expect(
        evaluateScript.handler(
          { params: { function: '() => circularObject' } },
          response,
          context
        )
      ).rejects.toThrow();
    });
  });

  describe('返回值格式', () => {
    it('应该返回格式化的JSON', async () => {
      const context = createMockContext({ a: 1, b: 2 });
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => ({ a: 1, b: 2 })' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      // 应该包含代码块标记
      expect(responseText).toContain('```json');
      expect(responseText).toContain('```');
      // 应该格式化（带缩进）
      expect(responseText).toMatch(/\n {2}/); // 至少有2个空格的缩进
    });

    it('应该在响应中包含成功消息', async () => {
      const context = createMockContext(null);
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => null' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('AppService');
      expect(responseText).toContain('执行成功');
    });
  });

  describe('特殊场景', () => {
    it('应该处理null返回值', async () => {
      const context = createMockContext(null);
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => null' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('null');
    });

    it('应该处理undefined返回值', async () => {
      const context = createMockContext(undefined);
      const response = createMockResponse();

      // undefined 应该能正常处理，不抛出错误
      await expect(
        evaluateScript.handler(
          { params: { function: '() => undefined' } },
          response,
          context
        )
      ).resolves.toBeUndefined();

      // 验证响应中包含执行成功的消息
      const responseText = response.getResponseText();
      expect(responseText).toContain('执行成功');
    });

    it('应该处理布尔值返回', async () => {
      const context = createMockContext(true);
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => true' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('true');
    });

    it('应该处理空对象返回', async () => {
      const context = createMockContext({});
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => ({})' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('{}');
    });

    it('应该处理空数组返回', async () => {
      const context = createMockContext([]);
      const response = createMockResponse();

      await evaluateScript.handler(
        { params: { function: '() => []' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('[]');
    });
  });
});
