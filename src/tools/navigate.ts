/**
 * 页面导航工具
 * 提供小程序页面跳转、返回、Tab切换等导航功能
 */

import { z } from 'zod';

import {
  navigateToPage,
  navigateBack,
  switchTab,
  reLaunch,
  toAbsolutePagePath,
  type NavigateOptions,
  type NavigateBackOptions,
  type SwitchTabOptions,
} from '../tools.js';

import {
  attachPageStateObservation,
  defineTool,
  ToolCategory,
  ensureMiniProgram,
  extractErrorMessage,
  DEFAULT_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_TIMEOUT,
  ResponseFormatter,
  runPageStateOperation,
  type PageStateOperation,
  type ToolContext,
  type ToolResponse,
} from './ToolDefinition.js';
import { jsonValueSchema, toJsonValue } from './result.js';

const navigationDataSchema = z.object({
  operation: z.enum(['navigate', 'redirect', 'back', 'switchTab', 'relaunch']),
  pagePath: z.string(),
  pageRevision: z.number().int().nonnegative(),
  details: jsonValueSchema,
});

function normalizePagePathForComparison(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  return `/${pathname.replace(/^\/+/, '')}`;
}

/**
 * 导航后刷新页面引用并失效依赖旧页面的运行时状态
 */
async function refreshPageAfterNavigation(
  context: ToolContext,
  response: ToolResponse,
  pageState?: PageStateOperation
): Promise<{ pagePath: string; pageRevision: number }> {
  // 即使跳回同一路径或 SDK 复用 Page 对象，导航也必须推进 revision。
  context.markPageMutation();
  context.invalidateSnapshotCache?.();
  context.clearElementMap?.();
  await context.splitConsoleAfterNavigation?.();
  context.splitNetworkAfterNavigation?.();

  try {
    if (typeof context.refreshCurrentPage === 'function') {
      await context.refreshCurrentPage();
    } else {
      context.currentPage = await context.miniProgram!.currentPage();
    }
    response.appendResponseLine(ResponseFormatter.success('当前页面已更新'));
    const pagePath = await context.currentPage!.path;
    const commit = await attachPageStateObservation(context, response, {}, pageState ?? context);
    return {
      pagePath: commit?.pagePath ?? pagePath,
      pageRevision: commit?.pageRevision ?? context.getPageRevision(),
    };
  } catch {
    response.appendResponseLine(ResponseFormatter.warning('无法更新当前页面信息'));
    throw new Error('导航完成但无法同步当前页面');
  }
}

/**
 * 跳转到指定页面（支持普通跳转和重定向模式）
 */
export const navigateToTool = defineTool({
  name: 'navigate_to',
  description: '跳转到指定页面',
  schema: z.object({
    url: z.string().describe('目标页面路径'),
    params: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe('页面参数（查询参数）'),
    redirect: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否使用重定向模式（关闭当前页面），默认false'),
    waitForLoad: z.boolean().optional().default(true).describe('是否等待页面加载完成，默认true'),
    timeout: z
      .number()
      .nonnegative()
      .optional()
      .default(DEFAULT_NAVIGATION_TIMEOUT)
      .describe(`等待超时时间(毫秒)，默认${DEFAULT_NAVIGATION_TIMEOUT}ms`),
  }),
  outputSchema: navigationDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { url, params, redirect, waitForLoad, timeout } = request.params;

    ensureMiniProgram(context);

    try {
      await runPageStateOperation(context, async (pageState) => {
        if (redirect) {
          // 重定向模式：关闭当前页面并跳转（统一补全绝对路径前导 "/"）
          let fullUrl = toAbsolutePagePath(url);
          if (params && Object.keys(params).length > 0) {
            const queryString = Object.entries(params)
              .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
              .join('&');
            fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
          }

          await context.miniProgram.redirectTo(fullUrl);

          // 等待页面加载完成：忽略 query/hash，但页面路径必须严格相等。
          if (waitForLoad) {
            const target = normalizePagePathForComparison(url);
            const startTime = Date.now();
            let converged = false;
            while (Date.now() - startTime < timeout) {
              try {
                const currentPage = await context.miniProgram.currentPage();
                if (currentPage) {
                  const currentPath = await currentPage.path;
                  if (normalizePagePathForComparison(currentPath) === target) {
                    converged = true;
                    break;
                  }
                }
              } catch {
                // 继续等待
              }
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            if (!converged) {
              throw new Error(`页面重定向超时 (TIMEOUT): ${timeout}ms 内页面未收敛`);
            }
          }

          response.appendResponseLine(ResponseFormatter.success('页面重定向成功'));
        } else {
          // 普通跳转模式
          const options: NavigateOptions = {
            url,
            params,
            waitForLoad,
            timeout,
          };

          await navigateToPage(context.miniProgram, options);
          response.appendResponseLine(ResponseFormatter.success('页面跳转成功'));
        }

        response.appendResponseLine(`目标页面: ${url}`);
        if (params && Object.keys(params).length > 0) {
          response.appendResponseLine(`参数: ${JSON.stringify(params)}`);
        }
        if (redirect) {
          response.appendResponseLine(`模式: 重定向（已关闭原页面）`);
        }

        // 页面跳转后，更新当前页面信息
        const observation = await refreshPageAfterNavigation(context, response, pageState);
        response.mergeStructuredContent({
          operation: redirect ? 'redirect' : 'navigate',
          ...observation,
          details: toJsonValue({ url, params: params ?? {} }),
        });
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      const action = redirect ? '重定向' : '跳转';
      response.appendResponseLine(ResponseFormatter.error(`页面${action}失败: ${errorMessage}`));
      throw error;
    }
  },
});

/**
 * 返回上一页
 */
export const navigateBackTool = defineTool({
  name: 'navigate_back',
  description: '返回上一页（当前 automator 版本仅支持 delta=1）',
  schema: z.object({
    delta: z.literal(1).optional().default(1).describe('返回层数，当前仅支持1'),
    waitForLoad: z.boolean().optional().default(true).describe('是否等待页面加载完成，默认true'),
    timeout: z
      .number()
      .nonnegative()
      .optional()
      .default(DEFAULT_WAIT_TIMEOUT)
      .describe(`等待超时时间(毫秒)，默认${DEFAULT_WAIT_TIMEOUT}ms`),
  }),
  outputSchema: navigationDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { delta, waitForLoad, timeout } = request.params;

    ensureMiniProgram(context);

    try {
      await runPageStateOperation(context, async (pageState) => {
        const options: NavigateBackOptions = {
          delta,
          waitForLoad,
          timeout,
        };

        await navigateBack(context.miniProgram, options);

        response.appendResponseLine(ResponseFormatter.success('页面返回成功'));
        response.appendResponseLine(`返回层数: ${delta}`);

        // 页面返回后，更新当前页面信息
        const observation = await refreshPageAfterNavigation(context, response, pageState);
        response.mergeStructuredContent({
          operation: 'back',
          ...observation,
          details: toJsonValue({ delta }),
        });
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`页面返回失败: ${errorMessage}`));
      throw error;
    }
  },
});

/**
 * 切换到指定Tab页
 */
export const switchTabTool = defineTool({
  name: 'switch_tab',
  description: '切换到指定Tab页',
  schema: z.object({
    url: z.string().describe('Tab页路径'),
    waitForLoad: z.boolean().optional().default(true).describe('是否等待页面加载完成，默认true'),
    timeout: z
      .number()
      .nonnegative()
      .optional()
      .default(DEFAULT_WAIT_TIMEOUT)
      .describe(`等待超时时间(毫秒)，默认${DEFAULT_WAIT_TIMEOUT}ms`),
  }),
  outputSchema: navigationDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { url, waitForLoad, timeout } = request.params;

    ensureMiniProgram(context);

    try {
      await runPageStateOperation(context, async (pageState) => {
        const options: SwitchTabOptions = {
          url,
          waitForLoad,
          timeout,
        };

        await switchTab(context.miniProgram, options);

        response.appendResponseLine(ResponseFormatter.success('Tab切换成功'));
        response.appendResponseLine(`目标Tab: ${url}`);

        // Tab切换后，更新当前页面信息
        const observation = await refreshPageAfterNavigation(context, response, pageState);
        response.mergeStructuredContent({
          operation: 'switchTab',
          ...observation,
          details: toJsonValue({ url }),
        });
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`Tab切换失败: ${errorMessage}`));
      throw error;
    }
  },
});

/**
 * 重新启动到指定页面
 */
export const reLaunchTool = defineTool({
  name: 'relaunch',
  description: '重新启动小程序并跳转到指定页面',
  schema: z.object({
    url: z.string().describe('目标页面路径'),
    params: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe('页面参数（查询参数）'),
    waitForLoad: z.boolean().optional().default(true).describe('是否等待页面加载完成，默认true'),
    timeout: z
      .number()
      .nonnegative()
      .optional()
      .default(DEFAULT_NAVIGATION_TIMEOUT)
      .describe(`等待超时时间(毫秒)，默认${DEFAULT_NAVIGATION_TIMEOUT}ms`),
  }),
  outputSchema: navigationDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { url, params, waitForLoad, timeout } = request.params;

    ensureMiniProgram(context);

    try {
      await runPageStateOperation(context, async (pageState) => {
        const options: NavigateOptions = {
          url,
          params,
          waitForLoad,
          timeout,
        };

        await reLaunch(context.miniProgram, options);

        response.appendResponseLine(ResponseFormatter.success('重新启动成功'));
        response.appendResponseLine(`目标页面: ${url}`);
        if (params && Object.keys(params).length > 0) {
          response.appendResponseLine(`参数: ${JSON.stringify(params)}`);
        }

        // 重新启动后，更新当前页面信息
        const observation = await refreshPageAfterNavigation(context, response, pageState);
        response.mergeStructuredContent({
          operation: 'relaunch',
          ...observation,
          details: toJsonValue({ url, params: params ?? {} }),
        });
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`重新启动失败: ${errorMessage}`));
      throw error;
    }
  },
});

// 注意: get_page_info 已合并到 get_current_page
// 注意: redirect_to 已合并到 navigate_to（使用 redirect: true 参数）
