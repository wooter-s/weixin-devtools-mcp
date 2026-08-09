/**
 * 截图工具
 * 负责页面截图功能，支持保存到文件或返回base64数据
 */

import { z } from 'zod';

import { takeScreenshot, type ScreenshotOptions } from '../tools.js';

import { defineTool, ToolCategory, ensureMiniProgram, extractErrorMessage, ResponseFormatter } from './ToolDefinition.js';

/**
 * 页面截图
 */
export const screenshotTool = defineTool({
  name: 'screenshot',
  description: '对当前页面截图，支持返回base64数据或保存到文件',
  schema: z.object({
    path: z.string().optional().describe('图片保存路径（可选），如果不提供则返回base64编码的图片数据'),
  }),
  outputSchema: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('path'), path: z.string(), mimeType: z.literal('image/png') }),
    z.object({ mode: z.literal('inline'), mimeType: z.literal('image/png'), encodedLength: z.number().int().nonnegative() }),
  ]),
  annotations: {
    category: ToolCategory.DEBUG,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    ensureMiniProgram(context);

    const { path } = request.params;

    try {
      const options: ScreenshotOptions = {};
      if (path) options.path = path;

      const result = await takeScreenshot(context.miniProgram, options);

      if (path) {
        response.appendResponseLine(ResponseFormatter.success(`截图已保存到: ${path}`));
        response.mergeStructuredContent({
          mode: 'path',
          path,
          mimeType: 'image/png',
        });
      } else if (result) {
        response.appendResponseLine(ResponseFormatter.success('截图获取成功'));
        response.appendResponseLine(`Base64数据长度: ${result.length} 字符`);
        response.appendResponseLine(`格式: ${result.startsWith('data:image') ? 'data URL' : 'base64'}`);

        // 附加图片到响应
        response.attachImage(result, 'image/png');
        response.mergeStructuredContent({
          mode: 'inline',
          mimeType: 'image/png',
          encodedLength: result.length,
        });
      }

    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`截图失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 connect_devtools 工具建立连接'));
      throw error;
    }
  },
});
