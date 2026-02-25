/**
 * 截图核心逻辑
 * 从 src/tools.ts 提取
 */

import fs from "fs";

import type { ScreenshotOptions } from './types.js';

/**
 * 页面截图
 */
export async function takeScreenshot(
  miniProgram: any,
  options: ScreenshotOptions = {}
): Promise<string | undefined> {
  if (!miniProgram) {
    throw new Error("MiniProgram对象是必需的");
  }

  try {
    const { path } = options;

    try {
      console.error('获取当前页面并等待稳定...')
      const currentPage = await miniProgram.currentPage();
      if (currentPage && typeof currentPage.waitFor === 'function') {
        await currentPage.waitFor(1000);
        console.error('页面等待完成')
      }
    } catch (waitError) {
      console.warn('页面等待失败，继续尝试截图:', waitError)
    }

    let result: string | undefined
    let screenshotSucceeded = false
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.error(`截图尝试 ${attempt}/3`)
        if (path) {
          await miniProgram.screenshot({ path });
          if (!fs.existsSync(path)) {
            throw new Error(`截图命令返回成功，但目标文件不存在: ${path}`)
          }
          screenshotSucceeded = true
          result = undefined
          console.error(`截图保存成功: ${path}`)
          break
        } else {
          const base64Data = await miniProgram.screenshot();
          console.error('截图API调用完成，检查返回数据...')
          if (base64Data && typeof base64Data === 'string' && base64Data.length > 0) {
            screenshotSucceeded = true
            result = base64Data
            console.error(`截图成功，数据长度: ${base64Data.length}`)
            break
          } else {
            throw new Error(`截图返回无效数据: ${typeof base64Data}, 长度: ${base64Data ? base64Data.length : 'null'}`)
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`截图尝试 ${attempt} 失败:`, lastError.message)

        if (attempt < 3) {
          console.error(`等待 ${1000 + attempt * 500}ms 后重试...`)
          await new Promise(resolve => setTimeout(resolve, 1000 + attempt * 500))
        }
      }
    }

    if (!screenshotSucceeded) {
      const troubleshootingTips = `

⚠️  截图功能故障排除建议：
1. 确保微信开发者工具处于**模拟器模式**（非真机调试）
2. 检查工具设置:
   - 设置 → 安全设置 → 服务端口 ✅
   - 设置 → 通用设置 → 自动化测试 ✅
3. 检查 macOS 系统权限:
   - 系统偏好设置 → 安全性与隐私 → 隐私 → 屏幕录制
   - 确保微信开发者工具在允许列表中
4. 尝试重启微信开发者工具
5. 查看详细文档: docs/SCREENSHOT_ISSUE.md

最后错误: ${lastError?.message || '未知错误'}`;

      throw new Error(`截图失败，已重试3次${troubleshootingTips}`)
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('故障排除建议')) {
      throw error;
    }
    throw new Error(`${errorMessage}\n\n提示: 查看 docs/SCREENSHOT_ISSUE.md 了解详细的故障排除方法`);
  }
}
