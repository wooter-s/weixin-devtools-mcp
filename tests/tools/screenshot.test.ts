import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { takeScreenshot } from '../../src/tools.js';

interface MockPage {
  waitFor?: (timeout: number) => Promise<void>;
}

interface MockMiniProgram {
  currentPage: () => Promise<MockPage>;
  screenshot: (options?: { path: string }) => Promise<string | undefined>;
}

function createMockMiniProgram(
  screenshotImpl: (options?: { path: string }) => Promise<string | undefined>
): MockMiniProgram {
  return {
    currentPage: async () => ({
      waitFor: async () => undefined,
    }),
    screenshot: screenshotImpl,
  };
}

describe('takeScreenshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('base64 模式下应返回截图数据', async () => {
    const miniProgram = createMockMiniProgram(async () => 'base64-image-data');

    const resultPromise = takeScreenshot(miniProgram);
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toBe('base64-image-data');
  });

  it('path 模式连续失败时应抛出错误', async () => {
    const miniProgram = createMockMiniProgram(async () => {
      throw new Error('fail to capture screenshot');
    });

    const resultPromise = takeScreenshot(miniProgram, { path: '/tmp/never-created.png' });
    const assertion = expect(resultPromise).rejects.toThrow(
      /截图失败，已重试3次[\s\S]*fail to capture screenshot/
    );
    await vi.runAllTimersAsync();

    await assertion;
  });

  it('path 模式文件未生成时应抛出错误', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const miniProgram = createMockMiniProgram(async () => undefined);

    const resultPromise = takeScreenshot(miniProgram, { path: '/tmp/not-found.png' });
    const assertion = expect(resultPromise).rejects.toThrow(
      /截图失败，已重试3次[\s\S]*目标文件不存在/
    );
    await vi.runAllTimersAsync();

    await assertion;
  });
});
