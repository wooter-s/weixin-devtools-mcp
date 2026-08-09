/**
 * 页面快照工具
 * 负责获取页面元素快照和 opaque ref 映射
 */

import { writeFile } from 'fs/promises';

import { z } from 'zod';

import {
  formatSnapshot,
  estimateTokens,
  type SnapshotFormat,
} from '../formatters/snapshotFormatter.js';

import {
  defineTool,
  ToolCategory,
  ensureCurrentPage,
  extractErrorMessage,
  ResponseFormatter,
} from './ToolDefinition.js';
import { jsonValueSchema, toJsonValue } from './result.js';

/**
 * 获取页面快照
 */
export const getPageSnapshotTool = defineTool({
  name: 'get_page_snapshot',
  description: `获取当前页面的元素快照，包含所有元素的 opaque ref

输出格式选项：
- compact: 紧凑文本格式（推荐，token使用减少60-70%）
- minimal: 最小化格式（只包含ref、tagName、text）
- json: 完整结构化JSON格式

示例：
compact格式：
  ref=ref_a1b2_0 view "Welcome" pos=[0,64] size=[375x667]
  ref=ref_a1b2_1 button "Submit" pos=[100,400] size=[175x44]

minimal格式：
  ref_a1b2_0 view "Welcome"
  ref_a1b2_1 button "Submit"`,
  schema: z.object({
    format: z.enum(['compact', 'minimal', 'json']).default('compact').describe('输出格式'),
    includePosition: z
      .boolean()
      .default(true)
      .describe('是否包含位置信息（compact和json格式有效）'),
    includeAttributes: z
      .boolean()
      .default(false)
      .describe('是否包含属性信息（compact和json格式有效）'),
    maxElements: z.number().positive().optional().describe('限制返回的元素数量'),
    filePath: z.string().optional().describe('保存快照到文件的路径（可选）'),
  }),
  outputSchema: z.object({
    snapshotId: z.string(),
    pageRevision: z.number().int().nonnegative(),
    path: z.string(),
    count: z.number().int().nonnegative(),
    format: z.enum(['compact', 'minimal', 'json']),
    tokenEstimate: z.number().int().nonnegative(),
    filePath: z.string().nullable(),
    elements: z.array(jsonValueSchema),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { format, includePosition, includeAttributes, maxElements, filePath } = request.params;

    try {
      if (!context.synchronizePageState) {
        await context.syncCurrentPage();
        ensureCurrentPage(context);
      }
      const commit = context.synchronizePageState
        ? await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true })
        : undefined;
      const getSnapshot = context.getPageSnapshotCached?.bind(context);
      if (!commit && !getSnapshot) {
        throw new Error('当前上下文不支持页面快照缓存接口');
      }

      // 生产上下文原子提交 snapshot/ref；旧式测试上下文保留缓存接口兼容。
      const { snapshot } = commit ?? (await getSnapshot!({ forceRefresh: true }));
      if (commit) response.setPageStateCommit?.(commit);

      // 应用 maxElements 限制（用于显示和token估算）
      const limitedElements = maxElements
        ? snapshot.elements.slice(0, maxElements)
        : snapshot.elements;
      const limitedSnapshot = { ...snapshot, elements: limitedElements };

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
        response.appendResponseLine(ResponseFormatter.success(`页面快照已保存到: ${filePath}`));
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
        response.mergeStructuredContent({
          snapshotId: snapshot.snapshotId,
          pageRevision: snapshot.pageRevision,
          path: snapshot.path,
          count: limitedElements.length,
          format,
          tokenEstimate: estimates[format as SnapshotFormat],
          filePath: null,
          elements: toJsonValue(limitedElements),
        });
      } else {
        response.appendResponseLine(`   页面路径: ${snapshot.path}`);
        response.appendResponseLine(`   元素数量: ${limitedElements.length}`);
        response.appendResponseLine(`   输出格式: ${format}`);
        const estimates = estimateTokens(limitedSnapshot);
        response.mergeStructuredContent({
          snapshotId: snapshot.snapshotId,
          pageRevision: snapshot.pageRevision,
          path: snapshot.path,
          count: limitedElements.length,
          format,
          tokenEstimate: estimates[format as SnapshotFormat],
          filePath,
          elements: toJsonValue(limitedElements),
        });
      }

      // 设置包含快照信息
      response.setIncludeSnapshot(true);
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`获取页面快照失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 get_page_snapshot 刷新页面快照'));
      throw error;
    }
  },
});
