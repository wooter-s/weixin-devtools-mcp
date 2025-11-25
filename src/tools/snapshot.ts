/**
 * 页面快照工具
 * 负责获取页面元素快照和UID映射
 */

import { writeFile } from 'fs/promises';

import { z } from 'zod';

import { formatSnapshot, estimateTokens, type SnapshotFormat } from '../formatters/snapshotFormatter.js';
import { getPageSnapshot, type PageSnapshot } from '../tools.js';

import { defineTool, ToolCategories } from './ToolDefinition.js';


/**
 * 获取页面快照
 */
export const getPageSnapshotTool = defineTool({
  name: 'get_page_snapshot',
  description: `获取当前页面的元素快照，包含所有元素的uid信息

输出格式选项：
- compact: 紧凑文本格式（推荐，token使用减少60-70%）
- minimal: 最小化格式（只包含uid、tagName、text）
- json: 完整JSON格式（保持向后兼容）

示例：
compact格式：
  uid=view.container view "Welcome" pos=[0,64] size=[375x667]
  uid=button.submit button "Submit" pos=[100,400] size=[175x44]

minimal格式：
  view.container view "Welcome"
  button.submit button "Submit"`,
  schema: z.object({
    format: z.enum(['compact', 'minimal', 'json']).default('compact').describe('输出格式'),
    includePosition: z.boolean().default(true).describe('是否包含位置信息（compact和json格式有效）'),
    includeAttributes: z.boolean().default(false).describe('是否包含属性信息（compact和json格式有效）'),
    maxElements: z.number().positive().optional().describe('限制返回的元素数量'),
    filePath: z.string().optional().describe('保存快照到文件的路径（可选）'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    if (!context.currentPage) {
      throw new Error('请先获取当前页面');
    }

    const { format, includePosition, includeAttributes, maxElements, filePath } = request.params;

    try {
      // 清空之前的元素映射
      context.elementMap.clear();

      // 获取页面快照
      const { snapshot, elementMap } = await getPageSnapshot(context.currentPage);

      // 应用 maxElements 限制（用于显示和token估算）
      const limitedElements = maxElements
        ? snapshot.elements.slice(0, maxElements)
        : snapshot.elements;
      const limitedSnapshot = { ...snapshot, elements: limitedElements };

      // 更新上下文中的元素映射（应用 maxElements 限制）
      if (maxElements) {
        // 只保留前 maxElements 个元素的映射
        const limitedUids = new Set(limitedElements.map(el => el.uid));
        elementMap.forEach((value, key) => {
          if (limitedUids.has(key)) {
            context.elementMap.set(key, value);
          }
        });
      } else {
        // 没有限制时，添加所有元素映射
        elementMap.forEach((value, key) => {
          context.elementMap.set(key, value);
        });
      }

      // 格式化快照（使用限制后的快照）
      const formattedSnapshot = formatSnapshot(limitedSnapshot, {
        format: format as SnapshotFormat,
        includePosition,
        includeAttributes,
        maxElements,
      });

      // 如果指定了文件路径，保存到文件
      if (filePath) {
        await writeFile(filePath, formattedSnapshot, 'utf-8');
        response.appendResponseLine(`✅ 页面快照已保存到: ${filePath}`);
      }

      // Token估算信息（仅在非文件输出模式下显示）
      if (!filePath) {
        const estimates = estimateTokens(limitedSnapshot);
        response.appendResponseLine(`📊 页面快照获取成功`);
        response.appendResponseLine(`   页面路径: ${snapshot.path}`);
        response.appendResponseLine(`   元素数量: ${limitedElements.length}`);
        response.appendResponseLine(`   输出格式: ${format}`);
        response.appendResponseLine(`   Token估算: ~${estimates[format as SnapshotFormat]} tokens`);
        response.appendResponseLine('');

        // 输出格式化的快照
        response.appendResponseLine(formattedSnapshot);
      } else {
        response.appendResponseLine(`   页面路径: ${snapshot.path}`);
        response.appendResponseLine(`   元素数量: ${limitedElements.length}`);
        response.appendResponseLine(`   输出格式: ${format}`);
      }

      // 设置包含快照信息
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`❌ 获取页面快照失败: ${errorMessage}`);
      throw error;
    }
  },
});