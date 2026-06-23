/**
 * screenshot.ts 工具测试
 * 覆盖 takeScreenshot 函数和 screenshotTool handler
 */

import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { takeScreenshot } from '../../src/tools.js';
import { screenshotTool } from '../../src/tools/screenshot.js';
import { createMockContext, createMockResponse, createMockMiniProgram } from '../utils/test-factories.js';

interface MockPage {
  waitFor?: (timeout: number) => Promise<void>;
}

interface MockMiniProgramLegacy {
  currentPage: () => Promise<MockPage>;
  screenshot: (options?: { path: string }) => Promise<string | undefined>;
}

function createLegacyMockMiniProgram(
  screenshotImpl: (options?: { path: string }) => Promise<string | undefined>
): MockMiniProgramLegacy {
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
    const miniProgram = createLegacyMockMiniProgram(async () => 'base64-image-data');

    const resultPromise = takeScreenshot(miniProgram);
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toBe('base64-image-data');
  });

  it('path 模式连续失败时应抛出错误', async () => {
    const miniProgram = createLegacyMockMiniProgram(async () => {
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
    const miniProgram = createLegacyMockMiniProgram(async () => undefined);

    const resultPromise = takeScreenshot(miniProgram, { path: '/tmp/not-found.png' });
    const assertion = expect(resultPromise).rejects.toThrow(
      /截图失败，已重试3次[\s\S]*目标文件不存在/
    );
    await vi.runAllTimersAsync();

    await assertion;
  });
});

describe('screenshotTool handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('base64 模式应返回截图数据并附加图片', async () => {
    const response = createMockResponse();
    const mockMP = createMockMiniProgram({
      screenshot: vi.fn(async () => 'base64-screenshot-data'),
      currentPage: vi.fn(async () => ({
        waitFor: vi.fn(async () => undefined),
      })),
    });
    const context = createMockContext({
      miniProgram: mockMP as any,
    });

    await screenshotTool.handler(
      { params: {} },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('截图获取成功');
    expect(text).toContain('Base64数据长度');
    expect(response.attachImage).toHaveBeenCalledWith('base64-screenshot-data', 'image/png');
  });

  it('path 模式应保存截图到文件', async () => {
    const response = createMockResponse();
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mockMP = createMockMiniProgram({
      screenshot: vi.fn(async () => undefined),
      currentPage: vi.fn(async () => ({
        waitFor: vi.fn(async () => undefined),
      })),
    });
    const context = createMockContext({
      miniProgram: mockMP as any,
    });

    await screenshotTool.handler(
      { params: { path: '/tmp/test-screenshot.png' } },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('截图已保存到: /tmp/test-screenshot.png');
  });

  it('未连接时应抛出错误', async () => {
    const response = createMockResponse();
    const context = createMockContext();

    await expect(
      screenshotTool.handler(
        { params: {} },
        response as any,
        context,
      ),
    ).rejects.toThrow('请先连接到微信开发者工具。使用 connect_devtools 工具建立连接。');
  });

  it('截图失败时应输出错误信息并抛出', async () => {
    const response = createMockResponse();
    const mockMP = createMockMiniProgram({
      screenshot: vi.fn(async () => {
        throw new Error('截图失败，已重试3次');
      }),
      currentPage: vi.fn(async () => ({
        waitFor: vi.fn(async () => undefined),
      })),
    });
    const context = createMockContext({
      miniProgram: mockMP as any,
    });

    await expect(
      screenshotTool.handler(
        { params: {} },
        response as any,
        context,
      ),
    ).rejects.toThrow('截图失败');

    const text = response.getResponseText();
    expect(text).toContain('截图失败');
  });

  it('data URL 格式应被正确识别', async () => {
    const response = createMockResponse();
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const mockMP = createMockMiniProgram({
      screenshot: vi.fn(async () => dataUrl),
      currentPage: vi.fn(async () => ({
        waitFor: vi.fn(async () => undefined),
      })),
    });
    const context = createMockContext({
      miniProgram: mockMP as any,
    });

    await screenshotTool.handler(
      { params: {} },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('格式: data URL');
    expect(response.attachImage).toHaveBeenCalledWith(dataUrl, 'image/png');
  });
});
