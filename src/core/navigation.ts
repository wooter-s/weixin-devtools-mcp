/**
 * 页面导航核心逻辑
 * 从 src/tools.ts 提取
 */

import type { Page } from 'miniprogram-automator';

import { DEFAULT_NAVIGATION_TIMEOUT, DEFAULT_WAIT_TIMEOUT } from '../tools/ToolDefinition.js';
import { extractErrorMessage } from '../utils/error.js';

import type { NavigateOptions, NavigateBackOptions, SwitchTabOptions, PageInfo } from './types.js';

/**
 * 归一化为绝对页面路径。
 * SDK 的 navigateTo/reLaunch/switchTab/redirectTo 要求绝对路径（以 "/" 开头）；
 * 对 app.json 风格的相对路径（如 "pages/home/index"）SDK 会按当前页面解析，
 * 拼出 "pages/home/pages/home/index" 之类的错误路径。这里对既非绝对（"/"）
 * 也非显式相对（"."）的路径补全前导 "/"。
 */
export function toAbsolutePagePath(url: string): string {
  if (!url) {
    return url;
  }
  return url.startsWith('/') || url.startsWith('.') ? url : `/${url}`;
}

/** 去除 query/hash，并统一为单个前导斜杠，避免相似路径被误判为目标页。 */
function normalizeNavigationPath(path: string): string {
  const pathEnd = path.search(/[?#]/);
  const pathname = pathEnd === -1 ? path : path.slice(0, pathEnd);
  return `/${pathname.replace(/^\/+/, '')}`;
}

async function waitForNavigationConvergence(
  operation: string,
  timeout: number,
  isConverged: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await isConverged()) {
        return;
      }
    } catch {
      // 页面对象可能在导航过程中短暂不可用，继续等待至 deadline。
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, Math.min(100, remaining)));
    }
  }

  throw new Error(`${operation}超时 (TIMEOUT): ${timeout}ms 内页面未收敛`);
}

/**
 * 跳转到指定页面
 */
export async function navigateToPage(
  miniProgram: any,
  options: NavigateOptions
): Promise<void> {
  const { url, params, waitForLoad = true, timeout = DEFAULT_NAVIGATION_TIMEOUT } = options;

  if (!url) {
    throw new Error("页面URL是必需的");
  }

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    let fullUrl = toAbsolutePagePath(url);
    if (params && Object.keys(params).length > 0) {
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
    }

    await miniProgram.navigateTo(fullUrl);

    if (waitForLoad) {
      const target = normalizeNavigationPath(url);
      await waitForNavigationConvergence('页面跳转', timeout, async () => {
        const currentPage = await miniProgram.currentPage();
        if (!currentPage) return false;
        const currentPath = await currentPage.path;
        return normalizeNavigationPath(currentPath) === target;
      });
    }

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    throw new Error(`页面跳转失败: ${errorMessage}`);
  }
}

/**
 * 返回上一页
 */
export async function navigateBack(
  miniProgram: any,
  options: NavigateBackOptions = {}
): Promise<void> {
  const { delta = 1, waitForLoad = true, timeout = DEFAULT_WAIT_TIMEOUT } = options;

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  if (delta !== 1) {
    throw new Error('当前 miniprogram-automator 版本仅支持返回上一页（delta=1）');
  }

  try {
    let previousPage: Page | undefined;
    let previousPath: string | undefined;
    try {
      previousPage = await miniProgram.currentPage();
      if (previousPage) {
        previousPath = await previousPage.path;
      }
    } catch {
      // 忽略获取当前页面的错误，导航后仍可通过新 Page 实例判断收敛。
    }

    await miniProgram.navigateBack();

    if (waitForLoad) {
      await waitForNavigationConvergence('页面返回', timeout, async () => {
        const newPage = await miniProgram.currentPage();
        if (!newPage) return false;
        if (newPage !== previousPage) return true;
        const newPath = await newPage.path;
        return newPath !== previousPath;
      });
    }

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    throw new Error(`页面返回失败: ${errorMessage}`);
  }
}

/**
 * 切换到Tab页
 */
export async function switchTab(
  miniProgram: any,
  options: SwitchTabOptions
): Promise<void> {
  const { url, waitForLoad = true, timeout = DEFAULT_WAIT_TIMEOUT } = options;

  if (!url) {
    throw new Error("Tab页URL是必需的");
  }

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    await miniProgram.switchTab(toAbsolutePagePath(url));

    if (waitForLoad) {
      const target = normalizeNavigationPath(url);
      await waitForNavigationConvergence('Tab 页面加载', timeout, async () => {
        const currentPage = await miniProgram.currentPage();
        if (!currentPage) return false;
        const currentPath = await currentPage.path;
        return normalizeNavigationPath(currentPath) === target;
      });
    }

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    throw new Error(`Tab切换失败: ${errorMessage}`);
  }
}

/**
 * 获取当前页面信息
 */
export async function getCurrentPageInfo(
  miniProgram: any
): Promise<PageInfo> {
  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    const currentPage = await miniProgram.currentPage();
    if (!currentPage) {
      throw new Error("无法获取当前页面");
    }

    const path = await currentPage.path;

    let title: string | undefined;
    let query: Record<string, any> | undefined;

    try {
      const data = await currentPage.data();
      if (data) {
        title = data.title || data.navigationBarTitleText;
        query = data.query || data.options;
      }
    } catch (error) {
      // 如果无法获取页面数据，忽略错误
    }

    return {
      path,
      title,
      query
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    throw new Error(`获取页面信息失败: ${errorMessage}`);
  }
}

/**
 * 重新启动到指定页面
 */
export async function reLaunch(
  miniProgram: any,
  options: NavigateOptions
): Promise<void> {
  const { url, params, waitForLoad = true, timeout = DEFAULT_NAVIGATION_TIMEOUT } = options;

  if (!url) {
    throw new Error("页面URL是必需的");
  }

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    let fullUrl = toAbsolutePagePath(url);
    if (params && Object.keys(params).length > 0) {
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
    }

    await miniProgram.reLaunch(fullUrl);

    if (waitForLoad) {
      const target = normalizeNavigationPath(url);
      await waitForNavigationConvergence('重新启动页面加载', timeout, async () => {
        const currentPage = await miniProgram.currentPage();
        if (!currentPage) return false;
        const currentPath = await currentPage.path;
        return normalizeNavigationPath(currentPath) === target;
      });
    }

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    throw new Error(`重新启动失败: ${errorMessage}`);
  }
}
