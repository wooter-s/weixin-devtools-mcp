/**
 * 手动验证脚本：检查截图能力是否可用
 * 实现方式：仅使用原生 miniprogram-automator API（不依赖项目封装）
 *
 * 使用方法：
 *   npm run test:manual:screenshot
 * 备用命令：
 *   node --loader ts-node/esm tests/manual/verify-screenshot-success.ts
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import automator from 'miniprogram-automator';

const PROJECT_PATH = path.resolve(process.cwd(), 'playground/wx');
const OUTPUT_DIR = '/tmp/weixin-devtools-mcp-screenshots';
const LAUNCH_TIMEOUT_MS = 45_000;

function nowStamp(): string {
  const now = new Date();
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hour = pad(now.getHours());
  const minute = pad(now.getMinutes());
  const second = pad(now.getSeconds());
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

async function verifyScreenshot(): Promise<void> {
  let miniProgram: {
    currentPage: () => Promise<{ path: string } | null>;
    screenshot: (options: { path: string }) => Promise<void>;
    close: () => Promise<void>;
  } | null = null;

  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // const screenshotPath = path.join(OUTPUT_DIR, `home-${nowStamp()}.png`);
    const screenshotPath = `home-${nowStamp()}.png`

    console.log('[INFO] 开始连接微信开发者工具...');
    console.log(`[INFO] 项目路径: ${PROJECT_PATH}`);
    console.log(`[INFO] 目标截图: ${screenshotPath}`);

    miniProgram = await automator.launch({
      projectPath: PROJECT_PATH,
      timeout: LAUNCH_TIMEOUT_MS,
    });

    const currentPage = await miniProgram.currentPage();
    const pagePath = currentPage?.path ?? '<unknown>';
    console.log(`[INFO] 连接成功，当前页面: ${pagePath}`);

    await miniProgram.screenshot({ path: screenshotPath });

    const stats = await fs.stat(screenshotPath);
    if (stats.size <= 0) {
      throw new Error(`截图文件大小无效: ${stats.size} bytes`);
    }

    console.log(`[PASS] 截图成功，文件大小: ${stats.size} bytes`);
    console.log(`[PASS] 文件路径: ${screenshotPath}`);
    process.exitCode = 0;
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error('[FAIL] 截图验证失败');
    console.error(message);
    process.exitCode = 1;
  } finally {
    if (miniProgram) {
      try {
        await miniProgram.close();
        console.log('[INFO] 已关闭微信开发者工具连接');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[WARN] 关闭连接失败: ${message}`);
      }
    }
  }
}

void verifyScreenshot();
