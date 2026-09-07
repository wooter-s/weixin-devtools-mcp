#!/usr/bin/env node
/* eslint-disable no-undef */

/**
 * 微信开发者工具连接诊断脚本
 *
 * 用于诊断连接问题的详细检查脚本
 */

import { execSync } from 'child_process';
import { access, constants } from 'fs';
import { promisify } from 'util';
import path from 'path';

const accessAsync = promisify(access);

async function diagnoseConnection() {
  console.log('🔍 微信开发者工具连接诊断');
  console.log('================================');
  console.log('');

  let issuesFound = 0;

  // 1. 检查微信开发者工具是否运行
  console.log('1️⃣ 检查微信开发者工具进程...');
  try {
    const processes = execSync('ps aux | grep -i wechat | grep -v grep', { encoding: 'utf8' });
    if (processes.trim()) {
      console.log('   ✅ 微信开发者工具正在运行');
      console.log('   进程信息:');
      processes.split('\n').filter(line => line.trim()).forEach(line => {
        const parts = line.split(/\s+/);
        const processName = parts.slice(10).join(' ');
        console.log(`      ${processName}`);
      });
    } else {
      console.log('   ❌ 微信开发者工具未运行');
      console.log('   📋 解决方案: 启动微信开发者工具');
      issuesFound++;
    }
  } catch {
    console.log('   ⚠️  无法检查进程状态');
  }
  console.log('');

  // 2. 检查CLI路径
  console.log('2️⃣ 检查CLI路径...');
  const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  try {
    await accessAsync(cliPath, constants.F_OK);
    console.log('   ✅ CLI文件存在');

    // 检查CLI是否可执行
    try {
      await accessAsync(cliPath, constants.X_OK);
      console.log('   ✅ CLI文件可执行');
    } catch {
      console.log('   ❌ CLI文件不可执行');
      console.log('   📋 解决方案: chmod +x ' + cliPath);
      issuesFound++;
    }
  } catch {
    console.log('   ❌ CLI文件不存在');
    console.log('   📋 解决方案: 确认微信开发者工具安装路径');
    issuesFound++;
  }
  console.log('');

  // 3. 检查项目路径
  console.log('3️⃣ 检查项目路径...');
  const projectPath = path.resolve(process.cwd(), 'playground/wx');
  try {
    await accessAsync(projectPath, constants.F_OK);
    console.log('   ✅ 项目路径存在: ' + projectPath);

    // 检查必要文件
    const requiredFiles = ['app.json', 'project.config.json'];
    for (const file of requiredFiles) {
      try {
        await accessAsync(path.join(projectPath, file), constants.F_OK);
        console.log(`   ✅ ${file} 存在`);
      } catch {
        console.log(`   ❌ ${file} 不存在`);
        issuesFound++;
      }
    }
  } catch {
    console.log('   ❌ 项目路径不存在: ' + projectPath);
    console.log('   📋 解决方案: 确认playground/wx目录存在');
    issuesFound++;
  }
  console.log('');

  // 4. 检查端口连接
  console.log('4️⃣ 检查端口连接...');
  const ports = [44892, 9420]; // 用户配置的端口和默认端口

  for (const port of ports) {
    try {
      console.log(`   检查端口 ${port}...`);
      execSync(`nc -z localhost ${port}`, { encoding: 'utf8', timeout: 3000 });
      console.log(`   ✅ 端口 ${port} 可访问`);
    } catch {
      console.log(`   ❌ 端口 ${port} 不可访问`);
      if (port === 44892) {
        console.log('   📋 这是用户配置的端口，可能需要检查安全设置');
        issuesFound++;
      }
    }
  }
  console.log('');

  // 5. 检查网络连接
  console.log('5️⃣ 检查基础网络连接...');
  try {
    execSync('ping -c 1 127.0.0.1', { timeout: 3000 });
    console.log('   ✅ 本地网络连接正常');
  } catch {
    console.log('   ❌ 本地网络连接异常');
    issuesFound++;
  }
  console.log('');

  // 总结
  console.log('📊 诊断总结');
  console.log('================================');
  if (issuesFound === 0) {
    console.log('✅ 未发现明显问题');
    console.log('');
    console.log('如果仍然无法连接，请检查:');
    console.log('1. 微信开发者工具的安全设置是否正确');
    console.log('2. 是否在工具中打开了正确的项目');
    console.log('3. 尝试重启微信开发者工具');
  } else {
    console.log(`❌ 发现 ${issuesFound} 个问题`);
    console.log('');
    console.log('📋 建议的解决步骤:');
    console.log('1. 启动微信开发者工具');
    console.log('2. 在工具中打开 playground/wx 项目');
    console.log('3. 进入 设置 → 安全设置');
    console.log('4. 开启"服务端口"选项');
    console.log('5. 确认端口号为 44892');
    console.log('6. 重新运行连接测试');
  }
  console.log('');

  // 提供详细的安全设置指导
  console.log('🔧 微信开发者工具安全设置指导');
  console.log('================================');
  console.log('1. 打开微信开发者工具');
  console.log('2. 点击右上角"设置"按钮');
  console.log('3. 选择"安全设置"');
  console.log('4. 确保以下选项已开启:');
  console.log('   ☑️  服务端口');
  console.log('   ☑️  (可选) CLI/HTTP 调用');
  console.log('5. 查看端口号 (应该显示为 44892)');
  console.log('6. 如果端口号不是 44892，可以修改为 44892');
  console.log('7. 保存设置并重启开发者工具');
}

diagnoseConnection().catch(error => {
  console.error('💥 诊断脚本执行失败:', error);
  process.exit(1);
});