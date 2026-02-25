/**
 * 页面导航核心逻辑
 * 从 src/tools.ts 提取
 */

import type { NavigateOptions, NavigateBackOptions, SwitchTabOptions, PageInfo } from './types.js';

/**
 * 跳转到指定页面
 */
export async function navigateToPage(
  miniProgram: any,
  options: NavigateOptions
): Promise<void> {
  const { url, params, waitForLoad = true, timeout = 10000 } = options;

  if (!url) {
    throw new Error("页面URL是必需的");
  }

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      fullUrl += (url.includes('?') ? '&' : '?') + queryString;
    }

    await miniProgram.navigateTo(fullUrl);

    if (waitForLoad) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        try {
          const currentPage = await miniProgram.currentPage();
          if (currentPage) {
            const currentPath = await currentPage.path;
            if (currentPath.includes(url.split('?')[0])) {
              break;
            }
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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
  const { delta = 1, waitForLoad = true, timeout = 5000 } = options;

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    let currentPath = '';
    try {
      const currentPage = await miniProgram.currentPage();
      currentPath = await currentPage.path;
    } catch (error) {
      // 忽略获取当前路径的错误
    }

    await miniProgram.navigateBack(delta);

    if (waitForLoad) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        try {
          const newPage = await miniProgram.currentPage();
          if (newPage) {
            const newPath = await newPage.path;
            if (newPath !== currentPath) {
              break;
            }
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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
  const { url, waitForLoad = true, timeout = 5000 } = options;

  if (!url) {
    throw new Error("Tab页URL是必需的");
  }

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    await miniProgram.switchTab(url);

    if (waitForLoad) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        try {
          const currentPage = await miniProgram.currentPage();
          if (currentPage) {
            const currentPath = await currentPage.path;
            if (currentPath.includes(url.split('?')[0])) {
              break;
            }
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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
    const errorMessage = error instanceof Error ? error.message : String(error);
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
  const { url, params, waitForLoad = true, timeout = 10000 } = options;

  if (!url) {
    throw new Error("页面URL是必需的");
  }

  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      fullUrl += (url.includes('?') ? '&' : '?') + queryString;
    }

    await miniProgram.reLaunch(fullUrl);

    if (waitForLoad) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        try {
          const currentPage = await miniProgram.currentPage();
          if (currentPage) {
            const currentPath = await currentPage.path;
            if (currentPath.includes(url.split('?')[0])) {
              break;
            }
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`重新启动失败: ${errorMessage}`);
  }
}
