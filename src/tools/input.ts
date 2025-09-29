/**
 * 输入交互工具
 * 负责页面元素的点击、填写等交互操作
 */

import { z } from 'zod';
import { defineTool, ToolCategories } from './ToolDefinition.js';
import {
  clickElement,
  inputText,
  getElementValue,
  setFormControl,
  type ClickOptions,
  type InputTextOptions,
  type GetValueOptions,
  type FormControlOptions
} from '../tools.js';

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
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, dblClick } = request.params;

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: ClickOptions = { uid, dblClick };
      await clickElement(context.currentPage, context.elementMap, options);

      const action = dblClick ? '双击' : '点击';
      response.appendResponseLine(`${action}元素成功`);
      response.appendResponseLine(`UID: ${uid}`);

      // 点击后可能页面发生变化，建议包含快照
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`点击元素失败: ${errorMessage}`);
      throw error;
    }
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
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, text, clear, append } = request.params;

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: InputTextOptions = { uid, text, clear, append };
      await inputText(context.currentPage, context.elementMap, options);

      let action = '输入文本';
      if (clear) action = '清空并输入文本';
      if (append) action = '追加文本';

      response.appendResponseLine(`${action}成功`);
      response.appendResponseLine(`UID: ${uid}`);
      response.appendResponseLine(`内容: ${text}`);

      // 输入后页面可能发生变化
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`输入文本失败: ${errorMessage}`);
      throw error;
    }
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

/**
 * 选择器选择选项（picker专用）
 */
export const selectPickerTool = defineTool({
  name: 'select_picker',
  description: '选择picker控件的选项',
  schema: z.object({
    uid: z.string().describe('picker元素的唯一标识符'),
    value: z.union([z.number(), z.string(), z.array(z.any())]).describe('选项值，可以是索引、文本或多选数组'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, value } = request.params;

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: FormControlOptions = { uid, value, trigger: 'change' };
      await setFormControl(context.currentPage, context.elementMap, options);

      response.appendResponseLine(`选择picker选项成功`);
      response.appendResponseLine(`UID: ${uid}`);
      response.appendResponseLine(`选项: ${JSON.stringify(value)}`);

      // 选择后页面可能发生变化
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`选择picker选项失败: ${errorMessage}`);
      throw error;
    }
  },
});

/**
 * 切换开关状态（switch专用）
 */
export const toggleSwitchTool = defineTool({
  name: 'toggle_switch',
  description: '切换switch开关的状态',
  schema: z.object({
    uid: z.string().describe('switch元素的唯一标识符'),
    checked: z.boolean().describe('开关状态，true为开启，false为关闭'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, checked } = request.params;

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: FormControlOptions = { uid, value: checked, trigger: 'change' };
      await setFormControl(context.currentPage, context.elementMap, options);

      response.appendResponseLine(`切换开关状态成功`);
      response.appendResponseLine(`UID: ${uid}`);
      response.appendResponseLine(`状态: ${checked ? '开启' : '关闭'}`);

      // 切换后页面可能发生变化
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`切换开关状态失败: ${errorMessage}`);
      throw error;
    }
  },
});

/**
 * 设置滑块值（slider专用）
 */
export const setSliderTool = defineTool({
  name: 'set_slider',
  description: '设置slider滑块的值',
  schema: z.object({
    uid: z.string().describe('slider元素的唯一标识符'),
    value: z.number().describe('滑块值'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { uid, value } = request.params;

    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    try {
      const options: FormControlOptions = { uid, value, trigger: 'change' };
      await setFormControl(context.currentPage, context.elementMap, options);

      response.appendResponseLine(`设置滑块值成功`);
      response.appendResponseLine(`UID: ${uid}`);
      response.appendResponseLine(`值: ${value}`);

      // 设置后页面可能发生变化
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`设置滑块值失败: ${errorMessage}`);
      throw error;
    }
  },
});