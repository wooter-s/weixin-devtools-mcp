#!/usr/bin/env node
/* eslint-disable no-undef */

/**
 * MCP配置诊断工具
 * 帮助用户诊断和修复Claude Desktop MCP配置问题
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function getClaudeConfigPath() {
  const platform = os.platform();

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
  } else if (platform === 'win32') {
    return path.join(os.homedir(), 'AppData/Roaming/Claude/claude_desktop_config.json');
  } else {
    return path.join(os.homedir(), '.config/claude/claude_desktop_config.json');
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCurrentProjectPath() {
  return path.resolve(__dirname, '..', '..');
}

function checkFileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function checkFileExecutable(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return (stats.mode & parseInt('111', 8)) !== 0;
  } catch {
    return false;
  }
}

async function testMcpServer(serverPath) {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ success: false, error: 'Server startup timeout' });
    }, 3000);

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('error', (eventError) => {
      clearTimeout(timeout);
      resolve({ success: false, error: eventError.message });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 || output.includes('Server')) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, error: `Exit code: ${code}`, output });
      }
    });

    // Send a test message to see if server responds
    setTimeout(() => {
      try {
        child.stdin.write('{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}\n');
      } catch {
        // Ignore errors
      }
    }, 1000);
  });
}

async function main() {
  colorLog(COLORS.cyan, '🔧 微信开发者工具 MCP 配置诊断工具');
  colorLog(COLORS.cyan, '═'.repeat(50));
  console.log();

  // 1. 检查项目状态
  colorLog(COLORS.blue, '📁 检查项目状态...');
  const projectPath = getCurrentProjectPath();
  const buildDir = path.join(projectPath, 'build');
  const indexJs = path.join(buildDir, 'index.js');
  const serverJs = path.join(buildDir, 'server.js');

  console.log(`   项目路径: ${projectPath}`);
  console.log(`   构建目录: ${checkFileExists(buildDir) ? '✅ 存在' : '❌ 不存在'}`);
  console.log(`   原版服务器 (index.js): ${checkFileExists(indexJs) ? '✅ 存在' : '❌ 不存在'}`);
  console.log(`   模块化服务器 (server.js): ${checkFileExists(serverJs) ? '✅ 存在' : '❌ 不存在'}`);

  if (checkFileExists(indexJs)) {
    console.log(`   index.js 可执行权限: ${checkFileExecutable(indexJs) ? '✅ 正确' : '❌ 缺失'}`);
  }
  if (checkFileExists(serverJs)) {
    console.log(`   server.js 可执行权限: ${checkFileExecutable(serverJs) ? '✅ 正确' : '❌ 缺失'}`);
  }

  console.log();

  // 2. 检查Claude Desktop配置
  colorLog(COLORS.blue, '⚙️ 检查Claude Desktop配置...');
  const configPath = getClaudeConfigPath();
  console.log(`   配置文件路径: ${configPath}`);

  if (!checkFileExists(configPath)) {
    colorLog(COLORS.red, '❌ Claude Desktop配置文件不存在');
    colorLog(COLORS.yellow, '💡 需要创建配置文件');
  } else {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);

      console.log(`   配置文件: ✅ 存在`);

      if (config.mcpServers) {
        const servers = Object.keys(config.mcpServers);
        console.log(`   已配置的MCP服务器: ${servers.length > 0 ? servers.join(', ') : '无'}`);

        // 检查是否有微信开发者工具相关配置
        const weixinServers = servers.filter(name =>
          name.includes('weixin') || name.includes('devtools')
        );

        if (weixinServers.length > 0) {
          console.log(`   微信开发者工具服务器: ${weixinServers.join(', ')}`);

          // 检查路径配置
          for (const serverName of weixinServers) {
            const serverConfig = config.mcpServers[serverName];
            const commandPath = serverConfig.command;

            console.log(`   ${serverName} 命令路径: ${commandPath}`);

            if (commandPath.includes('/path/to/')) {
              colorLog(COLORS.red, `   ❌ ${serverName} 使用占位符路径，需要更新`);
            } else if (!path.isAbsolute(commandPath)) {
              colorLog(COLORS.yellow, `   ⚠️ ${serverName} 使用相对路径，建议使用绝对路径`);
            } else if (!checkFileExists(commandPath)) {
              colorLog(COLORS.red, `   ❌ ${serverName} 路径文件不存在: ${commandPath}`);
            } else {
              colorLog(COLORS.green, `   ✅ ${serverName} 路径配置正确`);
            }
          }
        } else {
          colorLog(COLORS.yellow, '   ⚠️ 未找到微信开发者工具MCP服务器配置');
        }
      } else {
        colorLog(COLORS.yellow, '   ⚠️ 配置文件中没有mcpServers部分');
      }

    } catch (error) {
      colorLog(COLORS.red, `   ❌ 配置文件解析错误: ${error.message}`);
    }
  }

  console.log();

  // 3. 测试MCP服务器
  colorLog(COLORS.blue, '🧪 测试MCP服务器...');

  if (checkFileExists(indexJs)) {
    console.log('   测试原版服务器 (index.js)...');
    const indexResult = await testMcpServer(indexJs);
    if (indexResult.success) {
      colorLog(COLORS.green, '   ✅ 原版服务器启动正常');
    } else {
      colorLog(COLORS.red, `   ❌ 原版服务器启动失败: ${indexResult.error}`);
      if (indexResult.output) {
        console.log(`   输出: ${indexResult.output.substring(0, 200)}`);
      }
    }
  }

  if (checkFileExists(serverJs)) {
    console.log('   测试模块化服务器 (server.js)...');
    const serverResult = await testMcpServer(serverJs);
    if (serverResult.success) {
      colorLog(COLORS.green, '   ✅ 模块化服务器启动正常');
    } else {
      colorLog(COLORS.red, `   ❌ 模块化服务器启动失败: ${serverResult.error}`);
      if (serverResult.output) {
        console.log(`   输出: ${serverResult.output.substring(0, 200)}`);
      }
    }
  }

  console.log();

  // 4. 生成正确配置
  colorLog(COLORS.blue, '📋 生成正确的配置...');

  const correctConfig = {
    mcpServers: {}
  };

  if (checkFileExists(indexJs)) {
    correctConfig.mcpServers['weixin-devtools-mcp'] = {
      command: indexJs
    };
  }

  if (checkFileExists(serverJs)) {
    correctConfig.mcpServers['weixin-devtools-mcp-v2'] = {
      command: serverJs
    };
  }

  if (Object.keys(correctConfig.mcpServers).length > 0) {
    colorLog(COLORS.green, '✅ 正确的Claude Desktop配置:');
    console.log();
    colorLog(COLORS.cyan, JSON.stringify(correctConfig, null, 2));
    console.log();

    colorLog(COLORS.yellow, '💡 使用说明:');
    console.log('   1. 复制上面的JSON配置');
    console.log('   2. 打开Claude Desktop配置文件:');
    console.log(`      ${configPath}`);
    console.log('   3. 将配置粘贴到文件中（如果文件不存在则创建）');
    console.log('   4. 保存文件并重启Claude Desktop');
    console.log();

    colorLog(COLORS.bright, '🎯 推荐使用:');
    console.log('   • weixin-devtools-mcp (原版) - 稳定兼容');
    console.log('   • weixin-devtools-mcp-v2 (模块化) - 功能更丰富');
  } else {
    colorLog(COLORS.red, '❌ 没有找到可用的MCP服务器文件');
    colorLog(COLORS.yellow, '💡 请先运行 npm run build 构建项目');
  }

  console.log();
  colorLog(COLORS.cyan, '🔧 诊断完成！');
}

main().catch(error => {
  colorLog(COLORS.red, `💥 诊断过程中发生错误: ${error.message}`);
  process.exit(1);
});