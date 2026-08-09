/**
 * 断言验证工具
 * 提供各种元素状态和内容的断言验证功能
 */

import { z } from 'zod';

import { elementTargetSchema } from '../elements/index.js';
import { type AssertResult } from '../tools.js';

import {
  defineTool,
  ToolCategory,
  ensureCurrentPage,
  extractErrorMessage,
  ResponseFormatter,
  runElementTargetOperation,
} from './ToolDefinition.js';
import { jsonValueSchema, ToolResultError, toJsonValue } from './result.js';

const assertResultDataSchema = z.object({
  passed: z.boolean(),
  message: z.string(),
  expected: jsonValueSchema,
  actual: jsonValueSchema,
  timestamp: z.string(),
});

const assertStateDataSchema = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({
      passed: z.boolean(),
      message: z.string(),
      expected: jsonValueSchema,
      actual: jsonValueSchema,
    })
  ),
  total: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
});

// 注意: assert_exists 和 assert_visible 已合并到 assert_state
// 使用 assert_state 工具即可验证元素的存在性和可见性

function asBooleanStateLabel(value: boolean): string {
  return value ? 'true' : 'false';
}

function isTruthyAttribute(value: string | null): boolean {
  if (value === null) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }

  return !['false', '0', 'no', 'off', 'null', 'undefined'].includes(normalized);
}

function buildBooleanStateResult(
  stateName: 'visible' | 'enabled' | 'checked' | 'focused',
  expected: boolean,
  actual: boolean
): AssertResult {
  const passed = expected === actual;
  return {
    passed,
    message: passed
      ? `[${stateName}] 断言通过: ${asBooleanStateLabel(expected)}`
      : `[${stateName}] 断言失败: 期望 ${asBooleanStateLabel(expected)}，实际 ${asBooleanStateLabel(actual)}`,
    expected,
    actual,
    timestamp: Date.now(),
  };
}

function buildAssertResult(
  message: string,
  expected: string | boolean,
  actual: string | boolean | null
): AssertResult {
  const passed = expected === actual;
  return {
    passed,
    message: passed ? message : `${message}：期望 ${String(expected)}，实际 ${String(actual)}`,
    expected,
    actual,
    timestamp: Date.now(),
  };
}

/**
 * 断言元素文本内容
 */
export const assertTextTool = defineTool({
  name: 'assert_text',
  description: '断言元素文本内容',
  schema: z.object({
    target: elementTargetSchema,
    text: z.string().optional().describe('精确匹配的文本'),
    textContains: z.string().optional().describe('包含的文本'),
    textMatches: z.string().optional().describe('正则表达式匹配'),
  }),
  outputSchema: assertResultDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { target, text, textContains, textMatches } = request.params;

    if (!text && !textContains && !textMatches) {
      throw new ToolResultError(
        'INVALID_ARGUMENT',
        '必须指定text、textContains或textMatches参数之一'
      );
    }

    ensureCurrentPage(context);

    try {
      const actualText = await runElementTargetOperation(context, target, (element) =>
        element.text()
      );
      let passed = false;
      let expected = '';
      if (text !== undefined) {
        expected = text;
        passed = actualText === text;
      } else if (textContains !== undefined) {
        expected = `contains:${textContains}`;
        passed = actualText.includes(textContains);
      } else if (textMatches !== undefined) {
        expected = `matches:${textMatches}`;
        try {
          passed = new RegExp(textMatches).test(actualText);
        } catch {
          throw new ToolResultError(
            'INVALID_ARGUMENT',
            `textMatches 不是有效正则表达式: ${textMatches}`
          );
        }
      }
      const result: AssertResult = {
        passed,
        message: passed ? '文本断言通过' : `文本断言失败：${expected}`,
        expected,
        actual: actualText,
        timestamp: Date.now(),
      };

      response.appendResponseLine(
        result.passed ? ResponseFormatter.success('断言通过') : ResponseFormatter.error('断言失败')
      );
      response.appendResponseLine(`消息: ${result.message}`);
      response.appendResponseLine(`期望: ${result.expected}`);
      response.appendResponseLine(`实际: ${result.actual}`);
      response.appendResponseLine(`时间戳: ${new Date(result.timestamp).toISOString()}`);
      response.mergeStructuredContent({
        passed: result.passed,
        message: result.message,
        expected: toJsonValue(result.expected),
        actual: toJsonValue(result.actual),
        timestamp: new Date(result.timestamp).toISOString(),
      });

      if (!result.passed) {
        throw new Error(`断言失败: ${result.message}`);
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`断言执行失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 get_page_snapshot 刷新页面快照'));
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
    target: elementTargetSchema,
    attributeKey: z.string().describe('属性名'),
    attributeValue: z.string().describe('期望的属性值'),
  }),
  outputSchema: assertResultDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { target, attributeKey, attributeValue } = request.params;

    ensureCurrentPage(context);

    try {
      const actualValue = await runElementTargetOperation(context, target, (element) =>
        element.attribute(attributeKey)
      );
      const result = buildAssertResult(`属性 ${attributeKey} 断言`, attributeValue, actualValue);

      response.appendResponseLine(
        result.passed ? ResponseFormatter.success('断言通过') : ResponseFormatter.error('断言失败')
      );
      response.appendResponseLine(`消息: ${result.message}`);
      response.appendResponseLine(`期望: ${result.expected}`);
      response.appendResponseLine(`实际: ${result.actual}`);
      response.appendResponseLine(`时间戳: ${new Date(result.timestamp).toISOString()}`);
      response.mergeStructuredContent({
        passed: result.passed,
        message: result.message,
        expected: toJsonValue(result.expected),
        actual: toJsonValue(result.actual),
        timestamp: new Date(result.timestamp).toISOString(),
      });

      if (!result.passed) {
        throw new Error(`断言失败: ${result.message}`);
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`断言执行失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 get_page_snapshot 刷新页面快照'));
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
    target: elementTargetSchema,
    visible: z.boolean().optional().describe('期望可见状态'),
    enabled: z.boolean().optional().describe('期望启用状态'),
    checked: z.boolean().optional().describe('期望选中状态（checkbox/radio）'),
    focused: z.boolean().optional().describe('期望焦点状态'),
  }),
  outputSchema: assertStateDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { target, visible, enabled, checked, focused } = request.params;

    if (
      visible === undefined &&
      enabled === undefined &&
      checked === undefined &&
      focused === undefined
    ) {
      throw new ToolResultError('INVALID_ARGUMENT', '必须指定至少一个状态参数');
    }

    ensureCurrentPage(context);

    try {
      const results = await runElementTargetOperation(context, target, async (element) => {
        const observed: AssertResult[] = [];

        if (visible !== undefined) {
          const size = await element.size();
          const actualVisible = Number(size.width) > 0 && Number(size.height) > 0;
          observed.push(buildBooleanStateResult('visible', visible, actualVisible));
        }

        if (enabled !== undefined || checked !== undefined || focused !== undefined) {
          if (enabled !== undefined) {
            const disabledAttr = await element.attribute('disabled');
            const actualEnabled = !isTruthyAttribute(disabledAttr);
            observed.push(buildBooleanStateResult('enabled', enabled, actualEnabled));
          }

          if (checked !== undefined) {
            const checkedAttr = await element.attribute('checked');
            const actualChecked = isTruthyAttribute(checkedAttr);
            observed.push(buildBooleanStateResult('checked', checked, actualChecked));
          }

          if (focused !== undefined) {
            const focusAttr = await element.attribute('focus');
            const focusedAttr = focusAttr ?? (await element.attribute('focused'));
            const actualFocused = isTruthyAttribute(focusedAttr);
            observed.push(buildBooleanStateResult('focused', focused, actualFocused));
          }
        }

        return observed;
      });

      const allPassed = results.every((result) => result.passed);
      const failedResults = results.filter((result) => !result.passed);

      response.appendResponseLine(
        allPassed ? ResponseFormatter.success('全部通过') : ResponseFormatter.error('部分失败')
      );
      response.appendResponseLine(`检查项数: ${results.length}`);
      response.appendResponseLine(`通过项数: ${results.filter((result) => result.passed).length}`);
      response.appendResponseLine(`失败项数: ${failedResults.length}`);
      response.mergeStructuredContent({
        passed: allPassed,
        checks: results.map((result) => ({
          passed: result.passed,
          message: result.message,
          expected: toJsonValue(result.expected),
          actual: toJsonValue(result.actual),
        })),
        total: results.length,
        passedCount: results.filter((result) => result.passed).length,
        failedCount: failedResults.length,
      });

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
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`断言执行失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 get_page_snapshot 刷新页面快照'));
      throw error;
    }
  },
});
