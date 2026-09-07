/**
 * 页面查询和等待工具
 * 提供类似浏览器的$选择器和waitFor等待功能
 */

import { z } from 'zod';

import {
  elementTargetSchema,
  elementTargetToSelector,
  locatorSegmentSchema,
  type LocatorSegment,
} from '../elements/index.js';
import {
  queryElements,
  type PageStateCommit,
  type QueryOptions,
  type QueryResult,
} from '../tools.js';

import {
  attachPageStateObservation,
  defineTool,
  ToolCategory,
  ensureCurrentPage,
  extractErrorMessage,
  DEFAULT_WAIT_TIMEOUT,
  ResponseFormatter,
  runElementTargetOperation,
  type PageStateOperation,
} from './ToolDefinition.js';
import { jsonValueSchema, ToolResultError, toJsonValue } from './result.js';

function locatorSelector(locator: LocatorSegment): string {
  if (locator.kind === 'text') return locator.tagName ?? '*';
  return elementTargetToSelector(locator);
}

function elementResolutionCode(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;
}

/**
 * $ 选择器工具 - 通过CSS选择器查找页面元素
 */
export const findElementsTool = defineTool({
  name: 'find_elements',
  description: '在 Page 根作用域通过 selector、id、testId、dataId 或 text 查找元素并返回 opaque ref',
  // 保持根节点为 MCP 规范要求的 object；组合参数约束由 handler 返回稳定 INVALID_ARGUMENT。
  schema: z.object({
    locator: locatorSegmentSchema,
  }).strict(),
  outputSchema: z.object({
    pageRevision: z.number().int().nonnegative(),
    count: z.number().int().nonnegative(),
    elements: z.array(jsonValueSchema),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { locator } = request.params;

    try {
      const executeQuery = async (
        pageState?: PageStateOperation
      ): Promise<{
        results: QueryResult[];
        commit: PageStateCommit | undefined;
      }> => {
        let results: QueryResult[] = [];
        let commit: PageStateCommit | undefined;
        const synchronize =
          pageState?.synchronizePageState.bind(pageState) ??
          context.synchronizePageState?.bind(context);

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const baseline = synchronize
            ? await synchronize({ mode: 'guard', forceRefresh: true })
            : undefined;
          if (!baseline) {
            await context.syncCurrentPage();
          }
          ensureCurrentPage(context);
          const expectedRevision = baseline?.pageRevision ?? context.getPageRevision();
          const expectedPath = baseline?.pagePath ?? (await context.currentPage.path);

          const selector = locatorSelector(locator);
          const options: QueryOptions = { selector, pageRevision: expectedRevision };
          const queryElementMap = new Map();
          results = await queryElements(context.currentPage, queryElementMap, options);
          if (locator.kind === 'text') {
            results = results.filter((element) =>
              locator.exact === false
                ? element.text?.includes(locator.value)
                : element.text === locator.value
            );
          }
          const index = 'index' in locator ? locator.index : undefined;
          if (index !== undefined) results = results[index] ? [results[index]] : [];

          const returnedRefs = new Set(results.map((element) => element.ref));
          for (const ref of queryElementMap.keys()) {
            if (!returnedRefs.has(ref)) queryElementMap.delete(ref);
          }
          const registerElementMap =
            pageState?.registerElementMap.bind(pageState) ??
            context.registerElementMap?.bind(context);
          if (registerElementMap) {
            try {
              registerElementMap(queryElementMap, { expectedRevision, expectedPath });
            } catch (error) {
              if (elementResolutionCode(error) === 'STALE_ELEMENT' && attempt < 2) {
                continue;
              }
              throw error;
            }
          } else {
            for (const [ref, info] of queryElementMap) context.elementMap.set(ref, info);
          }

          commit = await attachPageStateObservation(context, response, {}, pageState ?? context);
          if (!commit?.domChanged) break;
          if (attempt === 2) {
            throw new ToolResultError('STALE_ELEMENT', '页面在查询期间持续变化，请刷新快照后重试');
          }
        }
        return { results, commit };
      };

      const { results, commit } = context.withPageStateOperation
        ? await context.withPageStateOperation(executeQuery)
        : await executeQuery();

      if (results.length === 0) {
        response.appendResponseLine(`未找到匹配 locator ${JSON.stringify(locator)} 的元素`);
        response.mergeStructuredContent({
          pageRevision: commit?.pageRevision ?? context.getPageRevision(),
          count: 0,
          elements: [],
        });
        return;
      }

      response.appendResponseLine(`找到 ${results.length} 个匹配元素:`);
      response.appendResponseLine('');

      for (let i = 0; i < results.length; i++) {
        const element = results[i];
        response.appendResponseLine(`[${i + 1}] ${element.tagName} (ref: ${element.ref})`);

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

      response.mergeStructuredContent({
        pageRevision: commit?.pageRevision ?? context.getPageRevision(),
        count: results.length,
        elements: toJsonValue(results),
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`查询元素失败: ${errorMessage}`));
      response.appendResponseLine(ResponseFormatter.hint('使用 get_page_snapshot 刷新页面快照'));
      throw error;
    }
  },
});

/**
 * waitFor 等待工具 - 等待条件满足
 */
export const waitForTool = defineTool({
  name: 'wait_for',
  description: '等待条件满足，支持等待元素出现、消失、文本匹配等',
  schema: z.object({
    // 支持三种模式:
    // 1. 时间等待: { delay: 1000 }
    // 2. 选择器等待: { selector: ".button" }
    // 3. 复杂条件: { selector: ".button", text: "提交", timeout: 5000 }
    delay: z.number().optional().describe('等待指定毫秒数（时间等待模式）'),
    target: elementTargetSchema.optional().describe('等待元素目标（定位等待模式）'),
    timeout: z
      .number()
      .optional()
      .default(DEFAULT_WAIT_TIMEOUT)
      .describe(`超时时间(毫秒)，默认${DEFAULT_WAIT_TIMEOUT}ms`),
    text: z.string().optional().describe('等待元素包含指定文本'),
    visible: z.boolean().optional().describe('等待元素可见状态，true为可见，false为隐藏'),
    disappear: z.boolean().optional().default(false).describe('等待元素消失，默认false'),
  }),
  outputSchema: z.object({
    matched: z.boolean(),
    durationMs: z.number().nonnegative(),
    pageRevision: z.number().int().nonnegative(),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const options = request.params;

    try {
      const startTime = Date.now();

      // 构建等待描述信息和实际等待参数
      let waitDescription = '';

      if (options.delay !== undefined) {
        // 时间等待模式
        waitDescription = `等待 ${options.delay}ms`;
        await new Promise((resolve) => setTimeout(resolve, options.delay));
      } else if (options.target) {
        const parts = [];
        parts.push(`目标 ${JSON.stringify(options.target)}`);
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
      } else {
        throw new ToolResultError('INVALID_ARGUMENT', '必须提供 delay 或 target 参数');
      }

      response.appendResponseLine(`开始 ${waitDescription}...`);
      let result = options.delay !== undefined;
      let matchedCommit: PageStateCommit | undefined;
      if (options.target) {
        const deadline = Date.now() + options.timeout;
        while (Date.now() <= deadline) {
          const poll = async (
            pageState?: PageStateOperation
          ): Promise<{
            matched: boolean;
            commit?: PageStateCommit;
          }> => {
            let candidate = false;
            try {
              const read = async (
                element: Awaited<ReturnType<typeof context.getElementByTarget>>
              ) => {
                const textMatches =
                  options.text === undefined || (await element.text()).includes(options.text);
                const size = options.visible === undefined ? null : await element.size();
                const visibleMatches =
                  options.visible === undefined ||
                  (Number(size?.width) > 0 && Number(size?.height) > 0) === options.visible;
                return !options.disappear && textMatches && visibleMatches;
              };
              candidate = pageState
                ? await pageState.withElementByTargetOperation(options.target!, read)
                : await runElementTargetOperation(context, options.target!, read);
            } catch (error) {
              const code = elementResolutionCode(error);
              if (code === 'ELEMENT_NOT_FOUND') {
                candidate = options.disappear;
              } else {
                // 歧义、非法 target、连接错误或读取错误都不能伪装成“元素已消失”。
                throw error;
              }
            }

            if (!candidate || !pageState) return { matched: candidate };
            const commit = await pageState.synchronizePageState({
              mode: 'snapshot',
              forceRefresh: true,
            });
            // 条件读取期间若 epoch 发生变化，使用新 epoch 再轮询一次。
            return commit.domChanged ? { matched: false } : { matched: true, commit };
          };

          const outcome = context.withPageStateOperation
            ? await context.withPageStateOperation(poll)
            : await poll();
          if (outcome.matched) {
            result = true;
            matchedCommit = outcome.commit;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      if (result) {
        let commit = matchedCommit;
        if (commit) {
          response.setIncludeSnapshot(true);
          response.setPageStateCommit?.(commit);
        } else {
          commit = await attachPageStateObservation(context, response);
        }
        response.appendResponseLine(ResponseFormatter.success(`等待成功，耗时 ${duration}ms`));
        response.mergeStructuredContent({
          matched: true,
          durationMs: duration,
          pageRevision: commit?.pageRevision ?? context.getPageRevision(),
        });
      } else {
        throw new Error(`等待条件超时，耗时 ${duration}ms`);
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`等待失败: ${errorMessage}`));
      throw error;
    }
  },
});
