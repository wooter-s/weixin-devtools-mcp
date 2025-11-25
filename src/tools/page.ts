/**
 * 页面查询和等待工具
 * 提供类似浏览器的$选择器和waitFor等待功能
 */

import { z } from 'zod';

import {
  queryElements,
  waitForCondition,
  type QueryOptions,
  type WaitForOptions
} from '../tools.js';

import { defineTool, ToolCategories } from './ToolDefinition.js';

/**
 * $ 选择器工具 - 通过CSS选择器查找页面元素
 */
export const querySelectorTool = defineTool({
  name: '$',
  description: '通过CSS选择器查找页面元素，返回匹配元素的详细信息',
  schema: z.object({
    selector: z.string().min(1, '选择器不能为空').describe('CSS选择器，如：view.container、#myId、.myClass、text=按钮'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { selector } = request.params;

    // 验证选择器
    if (!selector || typeof selector !== 'string' || selector.trim() === '') {
      throw new Error('选择器不能为空');
    }

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: QueryOptions = { selector };
      const results = await queryElements(context.currentPage, context.elementMap, options);

      if (results.length === 0) {
        response.appendResponseLine(`未找到匹配选择器 "${selector}" 的元素`);
        return;
      }

      response.appendResponseLine(`找到 ${results.length} 个匹配元素:`);
      response.appendResponseLine('');

      for (let i = 0; i < results.length; i++) {
        const element = results[i];
        response.appendResponseLine(`[${i + 1}] ${element.tagName} (uid: ${element.uid})`);

        if (element.text) {
          response.appendResponseLine(`    文本: ${element.text}`);
        }

        if (element.attributes) {
          const attrs = Object.entries(element.attributes)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
          response.appendResponseLine(`    属性: ${attrs}`);
        }

        if (element.position) {
          const { left, top, width, height } = element.position;
          response.appendResponseLine(`    位置: (${left}, ${top}) 大小: ${width}x${height}`);
        }

        response.appendResponseLine('');
      }

      // 查询可能会发现新元素，包含快照信息
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`查询元素失败: ${errorMessage}`);
      throw error;
    }
  },
});

/**
 * waitFor 等待工具 - 等待条件满足
 */
export const waitForTool = defineTool({
  name: 'waitFor',
  description: '等待条件满足，支持等待元素出现、消失、文本匹配等',
  schema: z.object({
    // 支持三种模式:
    // 1. 时间等待: { delay: 1000 }
    // 2. 选择器等待: { selector: ".button" }
    // 3. 复杂条件: { selector: ".button", text: "提交", timeout: 5000 }
    delay: z.number().optional().describe('等待指定毫秒数（时间等待模式）'),
    selector: z.string().optional().describe('等待元素选择器（选择器等待模式）'),
    timeout: z.number().optional().default(5000).describe('超时时间(毫秒)，默认5000ms'),
    text: z.string().optional().describe('等待元素包含指定文本'),
    visible: z.boolean().optional().describe('等待元素可见状态，true为可见，false为隐藏'),
    disappear: z.boolean().optional().default(false).describe('等待元素消失，默认false'),
  }).refine(
    (data) => data.delay !== undefined || data.selector !== undefined,
    { message: '必须提供 delay（时间等待）或 selector（选择器等待）' }
  ),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const options = request.params;

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const startTime = Date.now();

      // 构建等待描述信息和实际等待参数
      let waitDescription = '';
      let waitParam: number | string | WaitForOptions;

      if (options.delay !== undefined) {
        // 时间等待模式
        waitDescription = `等待 ${options.delay}ms`;
        waitParam = options.delay;
      } else if (options.selector) {
        // 选择器等待模式
        const parts = [];
        parts.push(`选择器 "${options.selector}"`);
        if (options.disappear) parts.push('消失');
        else parts.push('出现');
        if (options.text) parts.push(`包含文本 "${options.text}"`);
        if (options.visible !== undefined) {
          parts.push(options.visible ? '可见' : '隐藏');
        }
        waitDescription = `等待 ${parts.join(' 且 ')}`;
        if (options.timeout) {
          waitDescription += ` (超时: ${options.timeout}ms)`;
        }

        // 构建 WaitForOptions 参数
        waitParam = {
          selector: options.selector,
          timeout: options.timeout,
          ...(options.text && { text: options.text }),
          ...(options.visible !== undefined && { visible: options.visible }),
          ...(options.disappear !== undefined && { disappear: options.disappear }),
        };
      } else {
        throw new Error('必须提供 delay 或 selector 参数');
      }

      response.appendResponseLine(`开始 ${waitDescription}...`);

      const result = await waitForCondition(context.currentPage, waitParam);

      const endTime = Date.now();
      const duration = endTime - startTime;

      if (result) {
        response.appendResponseLine(`等待成功，耗时 ${duration}ms`);

        // 等待完成后，页面可能发生变化
        response.setIncludeSnapshot(true);
      } else {
        response.appendResponseLine(`等待失败，耗时 ${duration}ms`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`等待失败: ${errorMessage}`);
      throw error;
    }
  },
});