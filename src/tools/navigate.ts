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
  type SwitchTabOptions
} from '../tools.js';

import { defineTool, ToolCategory, ensureMiniProgram, extractErrorMessage, DEFAULT_NAVIGATION_TIMEOUT, DEFAULT_WAIT_TIMEOUT, ResponseFormatter, type ToolContext, type ToolResponse } from './ToolDefinition.js';

/**
 * 导航后刷新页面引用并失效依赖旧页面的运行时状态
 */
async function refreshPageAfterNavigation(context: ToolContext, response: ToolResponse): Promise<void> {
  context.invalidateSnapshotCache?.();
  context.clearElementMap?.();
  context.splitConsoleAfterNavigation?.();
  context.splitNetworkAfterNavigation?.();

  try {
    if (typeof context.refreshCurrentPage === 'function') {
      await context.refreshCurrentPage();
    } else {
      context.currentPage = await context.miniProgram!.currentPage();
    }
    response.appendResponseLine(ResponseFormatter.success('当前页面已更新'));
  } catch {
    response.appendResponseLine(ResponseFormatter.warning('无法更新当前页面信息'));
  }
  response.setIncludeSnapshot(true);
}

/**
 * 跳转到指定页面（支持普通跳转和重定向模式）
 */
export const navigateToTool = defineTool({
  name: 'navigate_to',
  description: '跳转到指定页面',
  schema: z.object({
    url: z.string().describe('目标页面路径'),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe('页面参数（查询参数）'),
    redirect: z.boolean().optional().default(false).describe('是否使用重定向模式（关闭当前页面），默认false'),
    waitForLoad: z.boolean().optional().default(true).describe('是否等待页面加载完成，默认true'),
    timeout: z.number().optional().default(DEFAULT_NAVIGATION_TIMEOUT).describe(`等待超时时间(毫秒)，默认${DEFAULT_NAVIGATION_TIMEOUT}ms`),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { url, params, redirect, waitForLoad, timeout } = request.params;

    ensureMiniProgram(context);

    try {
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

        // 等待页面加载完成（path 比较去除前导 "/" 以兼容绝对/相对输入）
        if (waitForLoad) {
          const target = url.split('?')[0].replace(/^\/+/, '');
          const startTime = Date.now();
          while (Date.now() - startTime < timeout) {
            try {
              const currentPage = await context.miniProgram.currentPage();
              if (currentPage) {
                const currentPath = await currentPage.path;
                if (currentPath.replace(/^\/+/, '').includes(target)) {
                  break;
                }
              }
            } catch {
              // 继续等待
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        response.appendResponseLine(ResponseFormatter.success('页面重定向成功'));
      } else {
        // 普通跳转模式
        const options: NavigateOptions = {
          url,
          params,
          waitForLoad,
          timeout
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
      await refreshPageAfterNavigation(context, response);

    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      const action = redirect ? '重定向' : '跳转';
      response.appendResponseLine(ResponseFormatter.error(`页面${action}失败: ${errorMessage}`));
      throw error;
    }
  },
});

/**
 * 返回上一页或指定层数
 */
export const navigateBackTool = defineTool({
  name: 'navigate_back',
  description: '返回上一页或指定层数',
  schema: z.object({
    delta: z.number().optional().default(1).describe('返回层数，默认1'),
    waitForLoad: z.boolean().optional().default(true).describe('是否等待页面加载完成，默认true'),
    timeout: z.number().optional().default(DEFAULT_WAIT_TIMEOUT).describe(`等待超时时间(毫秒)，默认${DEFAULT_WAIT_TIMEOUT}ms`),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { delta, waitForLoad, timeout } = request.params;

    ensureMiniProgram(context);

    try {
      const options: NavigateBackOptions = {
        delta,
        waitForLoad,
        timeout
      };

      await navigateBack(context.miniProgram, options);

      response.appendResponseLine(ResponseFormatter.success('页面返回成功'));
      response.appendResponseLine(`返回层数: ${delta}`);

      // 页面返回后，更新当前页面信息
      await refreshPageAfterNavigation(context, response);

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
    timeout: z.number().optional().default(DEFAULT_WAIT_TIMEOUT).describe(`等待超时时间(毫秒)，默认${DEFAULT_WAIT_TIMEOUT}ms`),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { url, waitForLoad, timeout } = request.params;

    ensureMiniProgram(context);

    try {
      const options: SwitchTabOptions = {
        url,
        waitForLoad,
        timeout
      };

      await switchTab(context.miniProgram, options);

      response.appendResponseLine(ResponseFormatter.success('Tab切换成功'));
      response.appendResponseLine(`目标Tab: ${url}`);

      // Tab切换后，更新当前页面信息
      await refreshPageAfterNavigation(context, response);

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
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe('页面参数（查询参数）'),
    waitForLoad: z.boolean().optional().default(true).describe('是否等待页面加载完成，默认true'),
    timeout: z.number().optional().default(DEFAULT_NAVIGATION_TIMEOUT).describe(`等待超时时间(毫秒)，默认${DEFAULT_NAVIGATION_TIMEOUT}ms`),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { url, params, waitForLoad, timeout } = request.params;

    ensureMiniProgram(context);

    try {
      const options: NavigateOptions = {
        url,
        params,
        waitForLoad,
        timeout
      };

      await reLaunch(context.miniProgram, options);

      response.appendResponseLine(ResponseFormatter.success('重新启动成功'));
      response.appendResponseLine(`目标页面: ${url}`);
      if (params && Object.keys(params).length > 0) {
        response.appendResponseLine(`参数: ${JSON.stringify(params)}`);
      }

      // 重新启动后，更新当前页面信息
      await refreshPageAfterNavigation(context, response);

    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      response.appendResponseLine(ResponseFormatter.error(`重新启动失败: ${errorMessage}`));
      throw error;
    }
  },
});

// 注意: get_page_info 已合并到 get_current_page
// 注意: redirect_to 已合并到 navigate_to（使用 redirect: true 参数）
