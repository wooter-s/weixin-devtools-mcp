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
  type NavigateOptions,
  type NavigateBackOptions,
  type SwitchTabOptions
} from '../tools.js';

import { defineTool, ToolCategory } from './ToolDefinition.js';

/**
 * 跳转到指定页面（支持普通跳转和重定向模式）
 */
export const navigateToTool = defineTool({
  name: 'navigate_to',
  description: '跳转到指定页面',
  schema: z.object({
    url: z.string().describe('目标页面路径'),
    params: z.record(z.string(), z.any()).optional().describe('页面参数（查询参数）'),
    redirect: z.boolean().optional().default(false).describe('是否使用重定向模式（关闭当前页面），默认false'),
    waitForLoad: z.boolean().optional().default(true).describe('是否等待页面加载完成，默认true'),
    timeout: z.number().optional().default(10000).describe('等待超时时间(毫秒)，默认10000ms'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { url, params, redirect, waitForLoad, timeout } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    try {
      if (redirect) {
        // 重定向模式：关闭当前页面并跳转
        let fullUrl = url;
        if (params && Object.keys(params).length > 0) {
          const queryString = Object.entries(params)
            .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
            .join('&');
          fullUrl += (url.includes('?') ? '&' : '?') + queryString;
        }

        await context.miniProgram.redirectTo(fullUrl);

        // 等待页面加载完成
        if (waitForLoad) {
          const startTime = Date.now();
          while (Date.now() - startTime < timeout) {
            try {
              const currentPage = await context.miniProgram.currentPage();
              if (currentPage) {
                const currentPath = await currentPage.path;
                if (currentPath.includes(url.split('?')[0])) {
                  break;
                }
              }
            } catch {
              // 继续等待
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        response.appendResponseLine(`页面重定向成功`);
      } else {
        // 普通跳转模式
        const options: NavigateOptions = {
          url,
          params,
          waitForLoad,
          timeout
        };

        await navigateToPage(context.miniProgram, options);
        response.appendResponseLine(`页面跳转成功`);
      }

      response.appendResponseLine(`目标页面: ${url}`);
      if (params && Object.keys(params).length > 0) {
        response.appendResponseLine(`参数: ${JSON.stringify(params)}`);
      }
      if (redirect) {
        response.appendResponseLine(`模式: 重定向（已关闭原页面）`);
      }

      // 页面跳转后，更新当前页面信息
      try {
        context.currentPage = await context.miniProgram.currentPage();
        response.appendResponseLine(`当前页面已更新`);
      } catch {
        response.appendResponseLine(`警告: 无法更新当前页面信息`);
      }

      // 页面跳转后建议获取新快照
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const action = redirect ? '重定向' : '跳转';
      response.appendResponseLine(`页面${action}失败: ${errorMessage}`);
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
    timeout: z.number().optional().default(5000).describe('等待超时时间(毫秒)，默认5000ms'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { delta, waitForLoad, timeout } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    try {
      const options: NavigateBackOptions = {
        delta,
        waitForLoad,
        timeout
      };

      await navigateBack(context.miniProgram, options);

      response.appendResponseLine(`页面返回成功`);
      response.appendResponseLine(`返回层数: ${delta}`);

      // 页面返回后，更新当前页面信息
      try {
        context.currentPage = await context.miniProgram.currentPage();
        response.appendResponseLine(`当前页面已更新`);
      } catch {
        response.appendResponseLine(`警告: 无法更新当前页面信息`);
      }

      // 页面返回后建议获取新快照
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`页面返回失败: ${errorMessage}`);
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
    timeout: z.number().optional().default(5000).describe('等待超时时间(毫秒)，默认5000ms'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { url, waitForLoad, timeout } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    try {
      const options: SwitchTabOptions = {
        url,
        waitForLoad,
        timeout
      };

      await switchTab(context.miniProgram, options);

      response.appendResponseLine(`Tab切换成功`);
      response.appendResponseLine(`目标Tab: ${url}`);

      // Tab切换后，更新当前页面信息
      try {
        context.currentPage = await context.miniProgram.currentPage();
        response.appendResponseLine(`当前页面已更新`);
      } catch {
        response.appendResponseLine(`警告: 无法更新当前页面信息`);
      }

      // Tab切换后建议获取新快照
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`Tab切换失败: ${errorMessage}`);
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
    params: z.record(z.string(), z.any()).optional().describe('页面参数（查询参数）'),
    waitForLoad: z.boolean().optional().default(true).describe('是否等待页面加载完成，默认true'),
    timeout: z.number().optional().default(10000).describe('等待超时时间(毫秒)，默认10000ms'),
  }),
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { url, params, waitForLoad, timeout } = request.params;

    if (!context.miniProgram) {
      throw new Error('请先连接到微信开发者工具');
    }

    try {
      const options: NavigateOptions = {
        url,
        params,
        waitForLoad,
        timeout
      };

      await reLaunch(context.miniProgram, options);

      response.appendResponseLine(`重新启动成功`);
      response.appendResponseLine(`目标页面: ${url}`);
      if (params && Object.keys(params).length > 0) {
        response.appendResponseLine(`参数: ${JSON.stringify(params)}`);
      }

      // 重新启动后，更新当前页面信息
      try {
        context.currentPage = await context.miniProgram.currentPage();
        response.appendResponseLine(`当前页面已更新`);
      } catch {
        response.appendResponseLine(`警告: 无法更新当前页面信息`);
      }

      // 重新启动后建议获取新快照
      response.setIncludeSnapshot(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`重新启动失败: ${errorMessage}`);
      throw error;
    }
  },
});

// 注意: get_page_info 已合并到 get_current_page
// 注意: redirect_to 已合并到 navigate_to（使用 redirect: true 参数）
