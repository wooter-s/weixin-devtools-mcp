#!/usr/bin/env node
/* eslint-disable no-undef */

/**
 * 截图功能深度诊断脚本
 * 检查各种可能影响截图的因素
 */

import automator from 'miniprogram-automator';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取 miniprogram-automator 版本
const automatorPackageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '..', '..', '..', 'node_modules/miniprogram-automator/package.json'), 'utf-8')
);

async function diagnosticScreenshot() {
  console.log('=== 微信开发者工具截图功能深度诊断 ===\n');

  let miniProgram = null;

  try {
    const projectPath = path.resolve(__dirname, '..', '..', '..', 'playground/wx');

    console.log('诊断步骤1: 检查连接配置');
    console.log(`项目路径: ${projectPath}`);
    console.log(`miniprogram-automator版本: ${automatorPackageJson.version}`);
    console.log();

    console.log('诊断步骤2: 使用不同的启动选项连接');
    // 尝试使用默认启动选项
    console.log('尝试方式1: 默认启动选项');
    try {
      miniProgram = await automator.launch({
        projectPath: projectPath
      });
      console.log('✅ 连接成功\n');
    } catch (launchError) {
      console.error('❌ 连接失败:', launchError.message);
      return;
    }

    console.log('诊断步骤3: 检查 MiniProgram 实例信息');
    console.log('可用方法:', Object.getOwnPropertyNames(Object.getPrototypeOf(miniProgram)));
    console.log();

    console.log('诊断步骤4: 检查当前页面状态');
    const currentPage = await miniProgram.currentPage();
    const pagePath = await currentPage.path;
    console.log(`当前页面: ${pagePath}`);

    // 检查页面是否有 waitFor 方法
    if (typeof currentPage.waitFor === 'function') {
      console.log('✅ 页面支持 waitFor 方法');
      await currentPage.waitFor(1000);
      console.log('✅ waitFor 执行成功');
    } else {
      console.log('❌ 页面不支持 waitFor 方法');
    }
    console.log();

    console.log('诊断步骤5: 尝试不同的截图方式');

    // 方式1: 无参数调用（应该返回base64）
    console.log('方式1: 无参数调用（base64）');
    try {
      const result1 = await miniProgram.screenshot();
      console.log('✅ 调用成功');
      console.log(`返回类型: ${typeof result1}`);
      console.log(`返回值长度: ${result1 ? result1.length : 0}`);
      if (result1) {
        console.log(`前50字符: ${String(result1).substring(0, 50)}...`);
      }
    } catch (error1) {
      console.error('❌ 失败:', error1.message);
      console.error('错误详情:', error1);
    }
    console.log();

    // 方式2: 带path参数
    console.log('方式2: 带path参数');
    const screenshotPath = path.resolve(process.cwd(), 'tests/manual/output/diagnostic-screenshot.png');
    try {
      await miniProgram.screenshot({ path: screenshotPath });
      console.log('✅ 调用成功');
      console.log(`文件路径: ${screenshotPath}`);
    } catch (error2) {
      console.error('❌ 失败:', error2.message);
    }
    console.log();

    // 方式3: 等待更长时间后再截图
    console.log('方式3: 等待5秒后再截图');
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
      const result3 = await miniProgram.screenshot();
      console.log('✅ 调用成功');
      console.log(`返回类型: ${typeof result3}`);
      console.log(`返回值长度: ${result3 ? result3.length : 0}`);
    } catch (error3) {
      console.error('❌ 失败:', error3.message);
    }
    console.log();

    console.log('诊断步骤6: 检查开发者工具版本信息');
    try {
      // 尝试获取版本信息（如果API支持）
      if (typeof miniProgram.version === 'function') {
        const version = await miniProgram.version();
        console.log('开发者工具版本:', version);
      } else {
        console.log('⚠️  无法通过API获取版本信息');
      }
    } catch (versionError) {
      console.log('⚠️  版本检查失败:', versionError.message);
    }

  } catch (error) {
    console.error('\n❌ 诊断过程出错:');
    console.error('错误类型:', error.constructor.name);
    console.error('错误信息:', error.message);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
  } finally {
    if (miniProgram) {
      console.log('\n清理: 关闭连接...');
      try {
        await miniProgram.close();
        console.log('✅ 连接已关闭');
      } catch (closeError) {
        console.error('❌ 关闭连接失败:', closeError.message);
      }
    }
  }

  console.log('\n=== 诊断完成 ===');
  console.log('\n建议排查方向:');
  console.log('1. 检查微信开发者工具是否在模拟器模式（非真机调试）');
  console.log('2. 检查微信开发者工具设置 → 安全 → 服务端口是否开启');
  console.log('3. 检查微信开发者工具设置 → 编辑器 → 是否开启自动化测试');
  console.log('4. 尝试重启微信开发者工具');
  console.log('5. 检查miniprogram-automator版本是否与工具版本兼容');
}

// 运行诊断
diagnosticScreenshot().catch(error => {
  console.error('诊断脚本执行失败:', error);
  process.exit(1);
});
