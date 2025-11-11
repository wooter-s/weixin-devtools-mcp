/**
 * 脚本执行工具
 * 在小程序 AppService 上下文中执行 JavaScript 代码
 */

import { z } from 'zod';
import { defineTool } from './ToolDefinition.js';

export const evaluateScript = defineTool({
  name: 'evaluate_script',
  description: `在小程序 AppService 上下文中执行 JavaScript 代码并返回结果。
支持访问 wx API、getApp()、getCurrentPages() 等小程序全局对象。
返回值必须是 JSON 可序列化的类型。`,

  schema: z.object({
    function: z.string().describe(
      `JavaScript 函数声明，将在小程序 AppService 上下文中执行。
支持同步和异步函数，可访问 wx API 和 getApp()。

注意：函数会被序列化传递，无法使用闭包引用外部变量。

无参数示例：
\`() => {
  return wx.getSystemInfoSync();
}\`

或使用字符串形式：
\`"() => wx.getSystemInfoSync()"\`

异步示例：
\`async () => {
  return new Promise(resolve => {
    wx.getSystemInfo({
      success: result => resolve(result)
    });
  });
}\`

带参数示例：
\`(key, value) => {
  wx.setStorageSync(key, value);
  return { success: true };
}\`

访问全局数据示例：
\`() => {
  const app = getApp();
  return app.globalData;
}\`

访问当前页面示例：
\`() => {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  return currentPage.data;
}\``
    ),
    args: z.array(z.any()).optional().describe(
      `可选的参数数组，传递给函数执行。
参数必须是 JSON 可序列化的类型（字符串、数字、布尔值、对象、数组等）。

示例：
- 单个参数: ["testKey"]
- 多个参数: ["key", 123, { foo: "bar" }]
- 复杂对象: [{ name: "test", data: [1, 2, 3] }]`
    )
  }),

  handler: async (request, response, context) => {
    // 检查连接状态
    if (!context.miniProgram) {
      throw new Error('未连接到微信开发者工具。请先使用 connect_devtools_enhanced 建立连接。');
    }

    const { function: functionCode, args = [] } = request.params;

    try {
      // 执行脚本
      // miniProgram.evaluate 会自动处理函数序列化和参数传递
      const result = await context.miniProgram.evaluate(functionCode, ...args);

      // 序列化结果
      const serialized = JSON.stringify(result, null, 2);

      // 返回响应
      response.appendResponseLine('脚本在小程序 AppService 上下文中执行成功');
      response.appendResponseLine('');
      response.appendResponseLine('返回结果：');
      response.appendResponseLine('```json');
      response.appendResponseLine(serialized);
      response.appendResponseLine('```');

    } catch (error: any) {
      // 错误处理
      const errorMessage = error.message || String(error);
      throw new Error(`脚本执行失败: ${errorMessage}`);
    }
  }
});