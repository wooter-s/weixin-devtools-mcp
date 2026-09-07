#!/usr/bin/env node
/* eslint-disable no-undef */

/**
 * debug_connection_flow 工具测试脚本
 *
 * 用途：演示如何使用 MCP Inspector 或直接调用来测试 debug_connection_flow 工具
 *
 * 使用方法：
 * 1. 通过 MCP Inspector:
 *    npm run inspector
 *    然后在 Inspector UI 中调用 debug_connection_flow 工具
 *
 * 2. 通过本脚本直接测试（模拟调用）:
 *    node scripts/diagnostics/debug-connection-flow-examples.mjs
 *
 * 3. 指定项目路径:
 *    node scripts/diagnostics/debug-connection-flow-examples.mjs /path/to/your/project
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 默认测试项目路径
const DEFAULT_PROJECT_PATH = join(__dirname, '..', '..', 'playground', 'wx');

// 从命令行参数获取项目路径
const projectPath = process.argv[2] || DEFAULT_PROJECT_PATH;

console.log('='.repeat(70));
console.log('Debug Connection Flow 示例脚本');
console.log('='.repeat(70));
console.log();

// 检查项目路径
if (!existsSync(projectPath)) {
  console.error(`❌ 错误: 项目路径不存在: ${projectPath}`);
  console.log();
  console.log('使用方法:');
  console.log('  node scripts/diagnostics/debug-connection-flow-examples.mjs [项目路径]');
  console.log();
  console.log('示例:');
  console.log('  node scripts/diagnostics/debug-connection-flow-examples.mjs ./playground/wx');
  console.log('  node scripts/diagnostics/debug-connection-flow-examples.mjs /Users/username/my-miniapp');
  process.exit(1);
}

console.log('📋 测试配置:');
console.log(`   项目路径: ${projectPath}`);
console.log();

console.log('📌 测试场景:');
console.log();

// 测试场景 1: 基本连接流程调试
console.log('场景 1: 基本连接流程调试（auto 模式）');
console.log('-'.repeat(70));
console.log('MCP Inspector 调用示例:');
console.log(JSON.stringify({
  method: 'tools/call',
  params: {
    name: 'debug_connection_flow',
    arguments: {
      projectPath: projectPath,
      mode: 'auto',
      dryRun: false,
      captureSnapshot: true,
      verbose: true
    }
  }
}, null, 2));
console.log();

// 测试场景 2: 干运行模式（不实际连接）
console.log('场景 2: 干运行模式（模拟连接流程）');
console.log('-'.repeat(70));
console.log('MCP Inspector 调用示例:');
console.log(JSON.stringify({
  method: 'tools/call',
  params: {
    name: 'debug_connection_flow',
    arguments: {
      projectPath: projectPath,
      mode: 'auto',
      dryRun: true,        // 仅模拟，不实际连接
      captureSnapshot: true,
      verbose: true
    }
  }
}, null, 2));
console.log();

// 测试场景 3: Launch 模式调试
console.log('场景 3: Launch 模式连接调试');
console.log('-'.repeat(70));
console.log('MCP Inspector 调用示例:');
console.log(JSON.stringify({
  method: 'tools/call',
  params: {
    name: 'debug_connection_flow',
    arguments: {
      projectPath: projectPath,
      mode: 'launch',      // 强制使用传统 launch 模式
      dryRun: false,
      captureSnapshot: true,
      verbose: true
    }
  }
}, null, 2));
console.log();

// 测试场景 4: Connect 模式调试
console.log('场景 4: Connect 模式连接调试');
console.log('-'.repeat(70));
console.log('MCP Inspector 调用示例:');
console.log(JSON.stringify({
  method: 'tools/call',
  params: {
    name: 'debug_connection_flow',
    arguments: {
      projectPath: projectPath,
      mode: 'connect',     // 强制使用两阶段 connect 模式
      dryRun: false,
      captureSnapshot: true,
      verbose: true
    }
  }
}, null, 2));
console.log();

// 测试场景 5: 简化输出（不详细显示）
console.log('场景 5: 简化输出模式');
console.log('-'.repeat(70));
console.log('MCP Inspector 调用示例:');
console.log(JSON.stringify({
  method: 'tools/call',
  params: {
    name: 'debug_connection_flow',
    arguments: {
      projectPath: projectPath,
      mode: 'auto',
      dryRun: false,
      captureSnapshot: false,  // 不捕获状态快照
      verbose: false           // 不显示详细信息
    }
  }
}, null, 2));
console.log();

console.log('='.repeat(70));
console.log('📖 使用说明:');
console.log('='.repeat(70));
console.log();
console.log('1. 启动 MCP Inspector:');
console.log('   npm run inspector');
console.log();
console.log('2. 在 Inspector UI 中:');
console.log('   a) 找到 "debug_connection_flow" 工具');
console.log('   b) 填写参数（参考上面的示例）');
console.log('   c) 点击 "Call Tool" 按钮');
console.log();
console.log('3. 查看输出:');
console.log('   - 每个连接步骤的详细信息');
console.log('   - 每个步骤的耗时统计');
console.log('   - 状态快照（如果启用）');
console.log('   - 诊断建议（如果有问题）');
console.log('   - 错误信息（如果连接失败）');
console.log();
console.log('4. 参数说明:');
console.log('   - projectPath (必填): 小程序项目的绝对路径');
console.log('   - mode (可选): 连接模式 auto/launch/connect，默认 auto');
console.log('   - dryRun (可选): 是否仅模拟连接流程，默认 false');
console.log('   - captureSnapshot (可选): 是否捕获状态快照，默认 true');
console.log('   - verbose (可选): 是否显示详细信息，默认 true');
console.log();
console.log('5. 常见调试场景:');
console.log('   - 连接失败: 使用 verbose=true 查看详细步骤');
console.log('   - 性能分析: 查看每个步骤的耗时');
console.log('   - 状态检查: 使用 captureSnapshot=true 查看每个阶段的状态');
console.log('   - 测试模式: 使用 dryRun=true 模拟连接流程');
console.log();
console.log('='.repeat(70));
console.log('💡 提示:');
console.log('='.repeat(70));
console.log();
console.log('- 建议首次使用 dryRun=true 来验证配置是否正确');
console.log('- 如果连接失败，使用 verbose=true 和 captureSnapshot=true 获取详细信息');
console.log('- 可以通过 mode 参数测试不同的连接模式');
console.log('- 工具输出包含诊断建议，帮助快速定位问题');
console.log();
console.log('完整文档: claudedocs/MCP_DEBUGGING_GUIDE.md');
console.log('='.repeat(70));
