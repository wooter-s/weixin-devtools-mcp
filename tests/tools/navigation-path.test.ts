/**
 * toAbsolutePagePath 纯函数测试
 * 锁定页面路径归一化逻辑：SDK 的 navigateTo/reLaunch/switchTab/redirectTo
 * 要求绝对路径（以 "/" 开头），相对路径会被按当前页面解析导致路径错误。
 */
import { describe, it, expect, vi } from 'vitest';

import {
  navigateBack,
  navigateToPage,
  reLaunch,
  switchTab,
  toAbsolutePagePath,
} from '../../src/core/navigation.js';

describe('toAbsolutePagePath', () => {
  it('对 app.json 风格的相对路径补全前导 "/"', () => {
    expect(toAbsolutePagePath('pages/home/index')).toBe('/pages/home/index');
    expect(toAbsolutePagePath('subpackages/dev-tool/pages/debug')).toBe(
      '/subpackages/dev-tool/pages/debug'
    );
  });

  it('已是绝对路径时保持不变', () => {
    expect(toAbsolutePagePath('/pages/home/index')).toBe('/pages/home/index');
  });

  it('显式相对路径（以 "." 开头）保持不变', () => {
    expect(toAbsolutePagePath('./detail')).toBe('./detail');
    expect(toAbsolutePagePath('../list')).toBe('../list');
  });

  it('空字符串原样返回', () => {
    expect(toAbsolutePagePath('')).toBe('');
  });
});

describe('导航加载等待', () => {
  it.each([
    {
      name: 'navigateToPage',
      method: 'navigateTo',
      execute: (miniProgram: object) => navigateToPage(miniProgram, {
        url: '/pages/target/index?from=request#anchor',
        timeout: 1000,
      }),
    },
    {
      name: 'switchTab',
      method: 'switchTab',
      execute: (miniProgram: object) => switchTab(miniProgram, {
        url: '/pages/target/index?from=request#anchor',
        timeout: 1000,
      }),
    },
    {
      name: 'reLaunch',
      method: 'reLaunch',
      execute: (miniProgram: object) => reLaunch(miniProgram, {
        url: '/pages/target/index?from=request#anchor',
        timeout: 1000,
      }),
    },
  ])('$name 仅在归一化路径严格相等时收敛', async ({ method, execute }) => {
    vi.useFakeTimers();
    try {
      const currentPage = vi.fn()
        .mockResolvedValueOnce({ path: '/pages/target/index-extra' })
        .mockResolvedValueOnce({ path: '/archive/pages/target/index' })
        .mockResolvedValueOnce({ path: 'pages/target/index#runtime' });
      const miniProgram = {
        currentPage,
        [method]: vi.fn().mockResolvedValue(undefined),
      };

      const navigation = execute(miniProgram);
      await vi.runAllTimersAsync();

      await expect(navigation).resolves.toBeUndefined();
      expect(currentPage).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('navigateToPage 未收敛时抛出 TIMEOUT 错误', async () => {
    const miniProgram = {
      navigateTo: vi.fn().mockResolvedValue(undefined),
      currentPage: vi.fn().mockResolvedValue({ path: '/pages/current/index' }),
    };

    await expect(navigateToPage(miniProgram, {
      url: '/pages/target/index',
      timeout: 0,
    })).rejects.toThrow(/TIMEOUT|超时/);
  });

  it('switchTab 未收敛时抛出 TIMEOUT 错误', async () => {
    const miniProgram = {
      switchTab: vi.fn().mockResolvedValue(undefined),
      currentPage: vi.fn().mockResolvedValue({ path: '/pages/current/index' }),
    };

    await expect(switchTab(miniProgram, {
      url: '/pages/tab/index',
      timeout: 0,
    })).rejects.toThrow(/TIMEOUT|超时/);
  });

  it('reLaunch 未收敛时抛出 TIMEOUT 错误', async () => {
    const miniProgram = {
      reLaunch: vi.fn().mockResolvedValue(undefined),
      currentPage: vi.fn().mockResolvedValue({ path: '/pages/current/index' }),
    };

    await expect(reLaunch(miniProgram, {
      url: '/pages/relaunch/index',
      timeout: 0,
    })).rejects.toThrow(/TIMEOUT|超时/);
  });

  it('navigateBack 接受路径相同但 Page 实例已变化', async () => {
    const previousPage = { path: '/pages/repeated/index' };
    const nextPage = { path: '/pages/repeated/index' };
    const miniProgram = {
      navigateBack: vi.fn().mockResolvedValue(undefined),
      currentPage: vi.fn()
        .mockResolvedValueOnce(previousPage)
        .mockResolvedValueOnce(nextPage),
    };

    await expect(navigateBack(miniProgram, { timeout: 100 })).resolves.toBeUndefined();
    expect(miniProgram.currentPage).toHaveBeenCalledTimes(2);
    expect(miniProgram.navigateBack).toHaveBeenCalledWith();
  });

  it('navigateBack 对 SDK 不支持的多级返回明确报错', async () => {
    const miniProgram = {
      navigateBack: vi.fn().mockResolvedValue(undefined),
      currentPage: vi.fn(),
    };

    await expect(navigateBack(miniProgram, { delta: 2 }))
      .rejects.toThrow('仅支持返回上一页');
    expect(miniProgram.navigateBack).not.toHaveBeenCalled();
  });

  it('navigateBack 接受同一 Page 实例的路径变化', async () => {
    let currentPath = '/pages/detail/index';
    const page = {
      get path() {
        return currentPath;
      },
    };
    const miniProgram = {
      navigateBack: vi.fn().mockImplementation(async () => {
        currentPath = '/pages/home/index';
      }),
      currentPage: vi.fn().mockResolvedValue(page),
    };

    await expect(navigateBack(miniProgram, { timeout: 100 })).resolves.toBeUndefined();
  });

  it('navigateBack 的 Page 实例和路径均未变化时抛出 TIMEOUT 错误', async () => {
    const page = { path: '/pages/current/index' };
    const miniProgram = {
      navigateBack: vi.fn().mockResolvedValue(undefined),
      currentPage: vi.fn().mockResolvedValue(page),
    };

    await expect(navigateBack(miniProgram, { timeout: 0 }))
      .rejects.toThrow(/TIMEOUT|超时/);
  });
});
