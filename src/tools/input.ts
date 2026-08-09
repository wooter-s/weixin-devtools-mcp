/**
 * 输入交互工具
 * 负责页面元素的点击、填写等交互操作
 */

import type { Element } from 'miniprogram-automator';
import { z } from 'zod';

import {
  applyTextInput,
  elementTargetSchema,
  type ElementTarget,
  type TextInputCommand,
} from '../elements/index.js';

import {
  attachPageStateObservation,
  defineTool,
  ToolCategory,
  ensureCurrentPage,
  extractErrorMessage,
  ResponseFormatter,
  runElementTargetOperation,
  runPageStateOperation,
  type PageStateOperation,
  type ToolContext,
} from './ToolDefinition.js';
import { jsonValueSchema, ToolResultError, toJsonValue } from './result.js';

const targetResultSchema = z.object({
  target: jsonValueSchema,
  pageRevision: z.number().int().nonnegative(),
});

type FormControlElement = Awaited<ReturnType<ToolContext['getElementByTarget']>> & {
  slideTo?: (value: number) => Promise<void>;
};

function runElementWithinPageState<T>(
  context: ToolContext,
  pageState: PageStateOperation | undefined,
  target: ElementTarget,
  operation: (element: Element) => Promise<T>
): Promise<T> {
  return pageState
    ? pageState.withElementByTargetOperation(target, operation)
    : runElementTargetOperation(context, target, operation);
}

function formValuesEqual(expected: string | number | boolean, actual: unknown): boolean {
  if (typeof expected === 'boolean') {
    const normalized = actual === true || actual === 1 || actual === '1' || actual === 'true';
    return normalized === expected;
  }
  if (typeof expected === 'number') {
    return Number(actual) === expected;
  }
  return String(actual ?? '') === expected;
}

/**
 * 点击页面元素
 */
export const clickTool = defineTool({
  name: 'click',
  description: '点击指定 target 的页面元素',
  schema: z.object({
    target: elementTargetSchema,
    dblClick: z.boolean().optional().default(false).describe('是否为双击，默认false'),
  }),
  outputSchema: targetResultSchema.extend({ doubleClick: z.boolean() }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { target, dblClick } = request.params;

    const currentPage = context.currentPage;
    if (!currentPage) {
      throw new Error('页面未连接，无法执行点击操作');
    }

    const commit = await runPageStateOperation(context, async (pageState) => {
      await runElementWithinPageState(context, pageState, target, async (element) => {
        let tapped = false;
        try {
          await element.tap();
          tapped = true;

          if (dblClick) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            await element.tap();
          }
        } finally {
          // 第一次 tap 成功后页面就可能变化，即使双击的第二次 tap 失败也必须失效旧状态。
          if (tapped) context.markPageMutation();
        }
      });
      return attachPageStateObservation(context, response, {}, pageState ?? context);
    });

    const action = dblClick ? '双击' : '点击';
    response.appendResponseLine(ResponseFormatter.success(`${action}元素成功`));
    response.appendResponseLine(`Target: ${JSON.stringify(target)}`);
    response.mergeStructuredContent({
      target: toJsonValue(target),
      doubleClick: dblClick,
      pageRevision: commit?.pageRevision ?? context.getPageRevision(),
    });
  },
});

/**
 * 向元素输入文本
 */
export const inputTextTool = defineTool({
  name: 'input_text',
  description: '向input/textarea元素输入文本',
  // MCP 要求工具 inputSchema 的根节点必须是 object；条件参数在 handler 中继续严格校验。
  schema: z.object({
    target: elementTargetSchema,
    mode: z.enum(['replace', 'append', 'clear']),
    text: z.string().optional(),
  }),
  outputSchema: targetResultSchema.extend({
    mode: z.enum(['replace', 'append', 'clear']),
    value: z.string(),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { target, mode } = request.params;

    let command: TextInputCommand;
    if (mode === 'clear') {
      command = { mode };
    } else {
      const text = request.params.text;
      if (text === undefined) {
        throw new ToolResultError('INVALID_ARGUMENT', `${mode} 模式必须提供 text 参数`);
      }
      command = { mode, text };
    }

    const { value, commit } = await runPageStateOperation(context, async (pageState) => {
      const nextValue = await runElementWithinPageState(
        context,
        pageState,
        target,
        async (element) => {
          const previousValue = mode === 'append' ? String((await element.value()) ?? '') : '';
          await applyTextInput(element, command);
          // input() 已成功发往运行时，此后即使回读失败也必须保守地推进 revision。
          context.markPageMutation();
          const actualValue = String((await element.value()) ?? '');
          const expected =
            command.mode === 'clear'
              ? ''
              : command.mode === 'replace'
                ? command.text
                : previousValue + command.text;
          if (actualValue !== expected) {
            throw new Error(
              `输入后回读校验失败: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actualValue)}`
            );
          }
          return actualValue;
        }
      );
      return {
        value: nextValue,
        commit: await attachPageStateObservation(context, response, {}, pageState ?? context),
      };
    });
    response.appendResponseLine(ResponseFormatter.success(`${mode} 输入成功`));
    response.appendResponseLine(`Target: ${JSON.stringify(target)}`);
    response.appendResponseLine(`当前值: ${value}`);
    response.mergeStructuredContent({
      target: toJsonValue(target),
      mode,
      value,
      pageRevision: commit?.pageRevision ?? context.getPageRevision(),
    });
  },
});

/**
 * 获取元素值
 */
export const getValueTool = defineTool({
  name: 'get_value',
  description: '获取元素的值或文本内容',
  schema: z.object({
    target: elementTargetSchema,
    attribute: z.string().optional().describe('要获取的属性名，不指定则获取value或text'),
  }),
  outputSchema: targetResultSchema.extend({
    attribute: z.string().nullable(),
    value: z.string().nullable(),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { target, attribute } = request.params;

    ensureCurrentPage(context);

    try {
      const { value, pageRevision } = await runElementTargetOperation(
        context,
        target,
        async (element) => ({
          value: attribute
            ? await element.attribute(attribute)
            : await element
                .value()
                .then((result) => (result === null || result === undefined ? null : String(result)))
                .catch(() => element.text()),
          pageRevision: context.getPageRevision(),
        })
      );

      response.appendResponseLine(ResponseFormatter.success('获取元素值成功'));
      response.appendResponseLine(`Target: ${JSON.stringify(target)}`);
      if (attribute) {
        response.appendResponseLine(`属性: ${attribute}`);
      }
      response.appendResponseLine(`值: ${value}`);
      response.mergeStructuredContent({
        target: toJsonValue(target),
        attribute: attribute ?? null,
        value,
        pageRevision,
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`获取元素值失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 get_page_snapshot 刷新页面快照'));
      throw error;
    }
  },
});

/**
 * 设置表单控件值
 */
export const setFormControlTool = defineTool({
  name: 'set_form_control',
  description: '设置表单控件的值（如picker、switch、slider等）',
  schema: z.object({
    target: elementTargetSchema,
    value: z.union([z.string(), z.number(), z.boolean()]).describe('要设置的值'),
    trigger: z.string().optional().default('change').describe('触发的事件类型，默认为change'),
  }),
  outputSchema: targetResultSchema.extend({
    value: jsonValueSchema,
    trigger: z.string(),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { target, value, trigger } = request.params;

    ensureCurrentPage(context);

    try {
      const { actualValue, commit } = await runPageStateOperation(context, async (pageState) => {
        const nextValue = await runElementWithinPageState(
          context,
          pageState,
          target,
          async (resolvedElement) => {
            const element = resolvedElement as FormControlElement;
            const tagName = element.tagName.toLowerCase();

            if (tagName === 'switch') {
              if (typeof value !== 'boolean') {
                throw new ToolResultError('INVALID_ARGUMENT', 'switch 控件的 value 必须是 boolean');
              }
              const currentValue = await element.value();
              if (!formValuesEqual(value, currentValue)) {
                await element.tap();
                context.markPageMutation();
              }
            } else if (tagName === 'slider') {
              if (typeof value !== 'number') {
                throw new ToolResultError('INVALID_ARGUMENT', 'slider 控件的 value 必须是 number');
              }
              if (typeof element.slideTo !== 'function') {
                throw new ToolResultError(
                  'UNSUPPORTED_OPERATION',
                  '当前 slider 元素不支持 slideTo()'
                );
              }
              await element.slideTo(value);
              context.markPageMutation();
            } else {
              await element.trigger(trigger, { value });
              context.markPageMutation();
            }

            const nextValue = await element.value();
            if (!formValuesEqual(value, nextValue)) {
              throw new ToolResultError(
                'ELEMENT_NOT_INTERACTABLE',
                `设置后回读校验失败: 期望 ${JSON.stringify(value)}，实际 ${JSON.stringify(nextValue)}`
              );
            }
            return nextValue;
          }
        );
        return {
          actualValue: nextValue,
          commit: await attachPageStateObservation(context, response, {}, pageState ?? context),
        };
      });

      response.appendResponseLine(ResponseFormatter.success('设置表单控件成功'));
      response.appendResponseLine(`Target: ${JSON.stringify(target)}`);
      response.appendResponseLine(`值: ${JSON.stringify(actualValue)}`);
      response.appendResponseLine(`事件: ${trigger}`);
      response.mergeStructuredContent({
        target: toJsonValue(target),
        value: toJsonValue(actualValue),
        trigger,
        pageRevision: commit?.pageRevision ?? context.getPageRevision(),
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`设置表单控件失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 get_page_snapshot 刷新页面快照'));
      throw error;
    }
  },
});

// 注意: select_picker, toggle_switch, set_slider 已合并到 set_form_control
// 使用 set_form_control 即可操作 picker, switch, slider 等所有表单控件
