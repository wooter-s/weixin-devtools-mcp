/**
 * 断言验证工具
 * 提供各种元素状态和内容的断言验证功能
 */

import { z } from 'zod';

import {
  assertElementVisible,
  assertElementText,
  assertElementAttribute,
  type StateAssertOptions,
  type ContentAssertOptions,
  type AssertResult
} from '../tools.js';

import { defineTool, ToolCategory } from './ToolDefinition.js';

// 注意: assert_exists 和 assert_visible 已合并到 assert_state
// 使用 assert_state 工具即可验证元素的存在性和可见性

/**
 * 断言元素文本内容
 */
export const assertTextTool = defineTool({
  name: 'assert_text',
  description: '断言元素文本内容',
  schema: z.object({
    uid: z.string().describe('元素UID'),
    text: z.string().optional().describe('精确匹配的文本'),
    textContains: z.string().optional().describe('包含的文本'),
    textMatches: z.string().optional().describe('正则表达式匹配'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, text, textContains, textMatches } = request.params;

    if (!text && !textContains && !textMatches) {
      throw new Error('必须指定text、textContains或textMatches参数之一');
    }

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: ContentAssertOptions = {
        uid,
        text,
        textContains,
        textMatches
      };

      const result: AssertResult = await assertElementText(
        context.currentPage,
        context.elementMap,
        options
      );

      // 根据断言结果返回信息
      response.appendResponseLine(`断言结果: ${result.passed ? '通过' : '失败'}`);
      response.appendResponseLine(`消息: ${result.message}`);
      response.appendResponseLine(`期望: ${result.expected}`);
      response.appendResponseLine(`实际: ${result.actual}`);
      response.appendResponseLine(`时间戳: ${new Date(result.timestamp).toISOString()}`);

      if (!result.passed) {
        throw new Error(`断言失败: ${result.message}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`断言执行失败: ${errorMessage}`);
      throw error;
    }
  },
});

/**
 * 断言元素属性
 */
export const assertAttributeTool = defineTool({
  name: 'assert_attribute',
  description: '断言元素属性值',
  schema: z.object({
    uid: z.string().describe('元素UID'),
    attributeKey: z.string().describe('属性名'),
    attributeValue: z.string().describe('期望的属性值'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, attributeKey, attributeValue } = request.params;

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: ContentAssertOptions = {
        uid,
        attribute: {
          key: attributeKey,
          value: attributeValue
        }
      };

      const result: AssertResult = await assertElementAttribute(
        context.currentPage,
        context.elementMap,
        options
      );

      // 根据断言结果返回信息
      response.appendResponseLine(`断言结果: ${result.passed ? '通过' : '失败'}`);
      response.appendResponseLine(`消息: ${result.message}`);
      response.appendResponseLine(`期望: ${result.expected}`);
      response.appendResponseLine(`实际: ${result.actual}`);
      response.appendResponseLine(`时间戳: ${new Date(result.timestamp).toISOString()}`);

      if (!result.passed) {
        throw new Error(`断言失败: ${result.message}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`断言执行失败: ${errorMessage}`);
      throw error;
    }
  },
});

/**
 * 断言元素状态（通用）
 */
export const assertStateTool = defineTool({
  name: 'assert_state',
  description: '断言元素的各种状态',
  schema: z.object({
    uid: z.string().describe('元素UID'),
    visible: z.boolean().optional().describe('期望可见状态'),
    enabled: z.boolean().optional().describe('期望启用状态'),
    checked: z.boolean().optional().describe('期望选中状态（checkbox/radio）'),
    focused: z.boolean().optional().describe('期望焦点状态'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, visible, enabled, checked, focused } = request.params;

    if (visible === undefined && enabled === undefined && checked === undefined && focused === undefined) {
      throw new Error('必须指定至少一个状态参数');
    }

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const results: AssertResult[] = [];

      // 可见性断言
      if (visible !== undefined) {
        const options: StateAssertOptions = { uid, visible };
        const result = await assertElementVisible(
          context.currentPage,
          context.elementMap,
          options
        );
        results.push(result);
      }

      // TODO: 这里可以添加更多状态断言，如enabled、checked、focused
      // 目前只实现了visible，其他状态需要扩展底层函数

      // 汇总结果
      const allPassed = results.every(r => r.passed);
      const failedResults = results.filter(r => !r.passed);

      response.appendResponseLine(`断言结果: ${allPassed ? '全部通过' : '部分失败'}`);
      response.appendResponseLine(`检查项数: ${results.length}`);
      response.appendResponseLine(`通过项数: ${results.filter(r => r.passed).length}`);
      response.appendResponseLine(`失败项数: ${failedResults.length}`);

      if (failedResults.length > 0) {
        response.appendResponseLine('');
        response.appendResponseLine('失败详情:');
        failedResults.forEach((result, index) => {
          response.appendResponseLine(`${index + 1}. ${result.message}`);
        });
      }

      if (!allPassed) {
        throw new Error(`状态断言失败: ${failedResults.length}/${results.length} 项失败`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`断言执行失败: ${errorMessage}`);
      throw error;
    }
  },
});