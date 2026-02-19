/**
 * 输入交互工具
 * 负责页面元素的点击、填写等交互操作
 */

import { z } from 'zod';

import {
  getElementValue,
  setFormControl,
  type GetValueOptions,
  type FormControlOptions
} from '../tools.js';

import { defineTool, ToolCategory } from './ToolDefinition.js';

/**
 * 点击页面元素
 */
export const clickTool = defineTool({
  name: 'click',
  description: '点击指定uid的页面元素',
  schema: z.object({
    uid: z.string().describe('页面快照中元素的唯一标识符'),
    dblClick: z.boolean().optional().default(false).describe('是否为双击，默认false'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, dblClick } = request.params;

    // 使用统一的元素获取方法
    const element = await context.getElementByUid(uid);

    // 获取当前页面引用（getElementByUid 已验证页面存在）
    const currentPage = context.currentPage;
    if (!currentPage) {
      throw new Error('页面未连接，无法执行点击操作');
    }

    // 记录点击前的页面路径
    const beforePath = currentPage.path;
    console.error(`[Click] 点击前页面: ${beforePath}`);

    // 执行点击操作
    await element.tap();
    console.error(`[Click] 已执行 tap() 操作`);

    // 如果是双击，再点击一次
    if (dblClick) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await element.tap();
      console.error(`[Click] 已执行第二次 tap() (双击)`);
    }

    // 等待页面响应
    await new Promise(resolve => setTimeout(resolve, 300));

    // 记录点击后的页面路径
    try {
      const updatedPage = context.currentPage;
      const afterPath = updatedPage?.path;
      console.error(`[Click] 点击后页面: ${afterPath}`);
      if (beforePath !== afterPath) {
        console.error(`[Click] ✅ 页面已切换: ${beforePath} → ${afterPath}`);
      }
    } catch (error) {
      console.warn(`[Click] 无法获取点击后的页面路径:`, error);
    }

    const action = dblClick ? '双击' : '点击';
    response.appendResponseLine(`${action}元素成功`);
    response.appendResponseLine(`UID: ${uid}`);

    // 点击后可能页面发生变化，建议包含快照
    response.setIncludeSnapshot(true);
  },
});

/**
 * 向元素输入文本
 */
export const inputTextTool = defineTool({
  name: 'input_text',
  description: '向input/textarea元素输入文本',
  schema: z.object({
    uid: z.string().describe('页面快照中元素的唯一标识符'),
    text: z.string().describe('要输入的文本内容'),
    clear: z.boolean().optional().default(false).describe('是否先清空元素内容，默认false'),
    append: z.boolean().optional().default(false).describe('是否追加到现有内容，默认false'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, text, clear, append } = request.params;

    // 使用统一的元素获取方法
    const element = await context.getElementByUid(uid);

    // 处理输入逻辑
    if (clear) {
      // 清空并输入
      element.value = '';
      await element.input(text);
      console.error(`[InputText] 清空并输入: ${text}`);
    } else if (append) {
      // 追加内容
      const currentValue = element.value || '';
      await element.input(currentValue + text);
      console.error(`[InputText] 追加文本: ${text}`);
    } else {
      // 直接输入
      await element.input(text);
      console.error(`[InputText] 输入文本: ${text}`);
    }

    let action = '输入文本';
    if (clear) action = '清空并输入文本';
    if (append) action = '追加文本';

    response.appendResponseLine(`${action}成功`);
    response.appendResponseLine(`UID: ${uid}`);
    response.appendResponseLine(`内容: ${text}`);

    // 输入后页面可能发生变化
    response.setIncludeSnapshot(true);
  },
});

/**
 * 获取元素值
 */
export const getValueTool = defineTool({
  name: 'get_value',
  description: '获取元素的值或文本内容',
  schema: z.object({
    uid: z.string().describe('页面快照中元素的唯一标识符'),
    attribute: z.string().optional().describe('要获取的属性名，不指定则获取value或text'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, attribute } = request.params;

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: GetValueOptions = { uid, attribute };
      const value = await getElementValue(context.currentPage, context.elementMap, options);

      response.appendResponseLine(`获取元素值成功`);
      response.appendResponseLine(`UID: ${uid}`);
      if (attribute) {
        response.appendResponseLine(`属性: ${attribute}`);
      }
      response.appendResponseLine(`值: ${value}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`获取元素值失败: ${errorMessage}`);
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
    uid: z.string().describe('页面快照中元素的唯一标识符'),
    value: z.any().describe('要设置的值'),
    trigger: z.string().optional().default('change').describe('触发的事件类型，默认为change'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, value, trigger } = request.params;

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: FormControlOptions = { uid, value, trigger };
      await setFormControl(context.currentPage, context.elementMap, options);

      response.appendResponseLine(`设置表单控件成功`);
      response.appendResponseLine(`UID: ${uid}`);
      response.appendResponseLine(`值: ${JSON.stringify(value)}`);
      response.appendResponseLine(`事件: ${trigger}`);

      // 设置后页面可能发生变化
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`设置表单控件失败: ${errorMessage}`);
      throw error;
    }
  },
});

// 注意: select_picker, toggle_switch, set_slider 已合并到 set_form_control
// 使用 set_form_control 即可操作 picker, switch, slider 等所有表单控件