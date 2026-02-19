#!/usr/bin/env node

/**
 * 跨平台设置可执行权限脚本
 * 在 Unix 系统上设置 chmod 755，在 Windows 上跳过（Windows 不需要）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_DIR = path.resolve(__dirname, '../build');
const EXECUTABLE_FILES = ['server.js'];

/**
 * 检查是否为 Unix 系统（需要设置可执行权限）
 */
function isUnixLike() {
  return process.platform !== 'win32';
}

/**
 * 设置文件可执行权限
 */
function setExecutable(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  文件不存在: ${path.basename(filePath)}`);
    return false;
  }

  if (isUnixLike()) {
    try {
      fs.chmodSync(filePath, 0o755);
      console.log(`✓ ${path.basename(filePath)} 已设置可执行权限`);
      return true;
    } catch (error) {
      console.error(`✗ 设置权限失败 ${path.basename(filePath)}: ${error.message}`);
      return false;
    }
  } else {
    console.log(`ℹ️  ${path.basename(filePath)} (Windows 不需要设置权限)`);
    return true;
  }
}

/**
 * 验证 shebang 行
 */
function verifyShebang(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf8');
  const firstLine = content.split('\n')[0];

  if (!firstLine.startsWith('#!/usr/bin/env node')) {
    console.warn(`⚠️  ${path.basename(filePath)} 缺少 shebang 行`);
    return false;
  }
  return true;
}

// 主函数
function main() {
  console.log('设置构建文件权限...\n');

  if (!fs.existsSync(BUILD_DIR)) {
    console.error('✗ build 目录不存在，请先运行 tsc');
    process.exit(1);
  }

  let success = true;

  for (const file of EXECUTABLE_FILES) {
    const filePath = path.join(BUILD_DIR, file);

    // 验证 shebang
    verifyShebang(filePath);

    // 设置权限
    if (!setExecutable(filePath)) {
      success = false;
    }
  }

  console.log('\n' + (success ? '✓ 所有文件处理完成' : '⚠️  部分文件处理失败'));
  process.exit(success ? 0 : 1);
}

main();
