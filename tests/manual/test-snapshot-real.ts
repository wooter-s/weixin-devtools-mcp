/**
 * 手动测试脚本：验证 get_page_snapshot 的所有功能
 *
 * 使用方法：
 * 1. 确保微信开发者工具已安装并开启自动化功能
 * 2. 确保 playground/wx/ 项目存在
 * 3. 运行：npx ts-node tests/manual/test-snapshot-real.ts
 */

import fs from 'fs/promises';
import path from 'path';

import automator from 'miniprogram-automator';

import { SimpleToolResponse } from '../../src/tools/ToolDefinition.js';
import type { ToolContext } from '../../src/tools/ToolDefinition.js';
import { getPageSnapshotTool } from '../../src/tools/snapshot.js';

const TEST_PROJECT_PATH = path.resolve(process.cwd(), 'playground/wx');
const OUTPUT_DIR = path.resolve(process.cwd(), 'tests/manual/output');

// 测试结果接口
interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  output?: string;
  validation?: {
    elementCount?: number;
    formatCorrect?: boolean;
    tokenEstimate?: number;
    fileSaved?: boolean;
  };
}

const results: TestResult[] = [];

// 输出测试结果
function logResult(result: TestResult) {
  const icon = result.success ? '✅' : '❌';
  console.log(`\n${icon} ${result.name} (${result.duration}ms)`);
  if (result.validation) {
    console.log('   验证结果:', JSON.stringify(result.validation, null, 2));
  }
  if (result.error) {
    console.log('   错误:', result.error);
  }
  results.push(result);
}

// 主测试函数
async function runTests() {
  console.log('🚀 开始测试 get_page_snapshot...\n');
  console.log(`📂 测试项目: ${TEST_PROJECT_PATH}`);
  console.log(`📁 输出目录: ${OUTPUT_DIR}\n`);

  // 创建输出目录
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let miniProgram: any = null;

  try {
    // 1. 启动微信开发者工具
    console.log('🔧 正在启动微信开发者工具...');
    const startTime = Date.now();
    miniProgram = await automator.launch({
      projectPath: TEST_PROJECT_PATH,
    });
    console.log(`✅ 启动完成 (${Date.now() - startTime}ms)\n`);

    const currentPage = await miniProgram.currentPage();

    // 创建 ToolContext
    const createContext = (): ToolContext => ({
      miniProgram,
      currentPage,
      elementMap: new Map(),
      consoleStorage: {
        consoleMessages: [],
        exceptionMessages: [],
        isMonitoring: false,
        startTime: null,
      },
      networkStorage: {
        requests: [],
        isMonitoring: false,
        startTime: null,
        originalMethods: {},
      },
    });

    // 测试1: compact 格式（默认）
    await testCompactFormat(createContext());

    // 测试2: minimal 格式
    await testMinimalFormat(createContext());

    // 测试3: json 格式
    await testJsonFormat(createContext());

    // 测试4: includePosition = false
    await testIncludePosition(createContext());

    // 测试5: includeAttributes = true
    await testIncludeAttributes(createContext());

    // 测试6: maxElements 限制
    await testMaxElements(createContext());

    // 测试7: 保存到文件
    await testSaveToFile(createContext());

    // 测试8: Token 估算准确性
    await testTokenEstimation(createContext());

  } catch (error) {
    console.error('❌ 测试初始化失败:', error);
    process.exit(1);
  } finally {
    if (miniProgram) {
      await miniProgram.close();
      console.log('\n🔒 微信开发者工具已关闭');
    }
  }

  // 输出测试总结
  printSummary();
}

// 测试1: compact 格式
async function testCompactFormat(context: ToolContext) {
  const startTime = Date.now();
  const response = new SimpleToolResponse();

  try {
    await getPageSnapshotTool.handler(
      { params: { format: 'compact' } },
      response,
      context
    );

    const output = response.getResponseText();
    const success =
      output.includes('📊 页面快照获取成功') &&
      output.includes('输出格式: compact') &&
      /uid=[\w.#]+/.test(output) &&
      /pos=\[/.test(output);

    const elementCount = context.elementMap.size;
    const tokenMatch = output.match(/Token估算: ~(\d+) tokens/);

    logResult({
      name: '测试 compact 格式',
      success,
      duration: Date.now() - startTime,
      validation: {
        elementCount,
        formatCorrect: success,
        tokenEstimate: tokenMatch ? parseInt(tokenMatch[1]) : undefined,
      },
      output: output.substring(0, 500),
    });
  } catch (error) {
    logResult({
      name: '测试 compact 格式',
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 测试2: minimal 格式
async function testMinimalFormat(context: ToolContext) {
  const startTime = Date.now();
  const response = new SimpleToolResponse();

  try {
    await getPageSnapshotTool.handler(
      { params: { format: 'minimal' } },
      response,
      context
    );

    const output = response.getResponseText();
    const success =
      output.includes('输出格式: minimal') &&
      !/pos=\[/.test(output) && // minimal不包含位置
      /[\w.#]+ \w+ /.test(output); // 包含 uid tagName

    logResult({
      name: '测试 minimal 格式',
      success,
      duration: Date.now() - startTime,
      validation: {
        formatCorrect: success,
        elementCount: context.elementMap.size,
      },
      output: output.substring(0, 500),
    });
  } catch (error) {
    logResult({
      name: '测试 minimal 格式',
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 测试3: json 格式
async function testJsonFormat(context: ToolContext) {
  const startTime = Date.now();
  const response = new SimpleToolResponse();

  try {
    await getPageSnapshotTool.handler(
      { params: { format: 'json' } },
      response,
      context
    );

    const output = response.getResponseText();
    const jsonMatch = output.match(/\{[\s\S]*"path"[\s\S]*"elements"[\s\S]*\}/);

    let success = false;
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        success = parsed.path && Array.isArray(parsed.elements);
      } catch (e) {
        success = false;
      }
    }

    logResult({
      name: '测试 json 格式',
      success,
      duration: Date.now() - startTime,
      validation: {
        formatCorrect: success,
        elementCount: context.elementMap.size,
      },
      output: output.substring(0, 500),
    });
  } catch (error) {
    logResult({
      name: '测试 json 格式',
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 测试4: includePosition = false
async function testIncludePosition(context: ToolContext) {
  const startTime = Date.now();
  const response = new SimpleToolResponse();

  try {
    await getPageSnapshotTool.handler(
      { params: { format: 'compact', includePosition: false } },
      response,
      context
    );

    const output = response.getResponseText();
    const success =
      !output.match(/pos=\[/) &&
      !output.match(/size=\[/);

    logResult({
      name: '测试 includePosition=false',
      success,
      duration: Date.now() - startTime,
      validation: {
        formatCorrect: success,
      },
      output: output.substring(0, 500),
    });
  } catch (error) {
    logResult({
      name: '测试 includePosition=false',
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 测试5: includeAttributes = true
async function testIncludeAttributes(context: ToolContext) {
  const startTime = Date.now();
  const response = new SimpleToolResponse();

  try {
    await getPageSnapshotTool.handler(
      { params: { format: 'compact', includeAttributes: true } },
      response,
      context
    );

    const output = response.getResponseText();
    // 有些元素可能有属性，检查格式是否正确
    const success = output.includes('输出格式: compact');

    logResult({
      name: '测试 includeAttributes=true',
      success,
      duration: Date.now() - startTime,
      validation: {
        formatCorrect: success,
      },
      output: output.substring(0, 500),
    });
  } catch (error) {
    logResult({
      name: '测试 includeAttributes=true',
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 测试6: maxElements 限制
async function testMaxElements(context: ToolContext) {
  const startTime = Date.now();
  const response = new SimpleToolResponse();

  try {
    await getPageSnapshotTool.handler(
      { params: { format: 'compact', maxElements: 10 } },
      response,
      context
    );

    const output = response.getResponseText();
    const success =
      output.includes('元素数量: 10') &&
      context.elementMap.size === 10;

    logResult({
      name: '测试 maxElements=10',
      success,
      duration: Date.now() - startTime,
      validation: {
        elementCount: context.elementMap.size,
        formatCorrect: success,
      },
      output: output.substring(0, 500),
    });
  } catch (error) {
    logResult({
      name: '测试 maxElements=10',
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 测试7: 保存到文件
async function testSaveToFile(context: ToolContext) {
  const startTime = Date.now();
  const response = new SimpleToolResponse();
  const filePath = path.join(OUTPUT_DIR, 'snapshot-test.txt');

  try {
    await getPageSnapshotTool.handler(
      { params: { format: 'compact', filePath } },
      response,
      context
    );

    const output = response.getResponseText();
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);

    let fileContent = '';
    if (fileExists) {
      fileContent = await fs.readFile(filePath, 'utf-8');
    }

    const success =
      output.includes('✅ 页面快照已保存到') &&
      fileExists &&
      fileContent.length > 0;

    logResult({
      name: '测试保存到文件',
      success,
      duration: Date.now() - startTime,
      validation: {
        fileSaved: fileExists,
        formatCorrect: success,
      },
      output: `文件保存: ${filePath}`,
    });
  } catch (error) {
    logResult({
      name: '测试保存到文件',
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 测试8: Token 估算准确性
async function testTokenEstimation(context: ToolContext) {
  const startTime = Date.now();

  try {
    // 获取三种格式的token估算
    const compactResponse = new SimpleToolResponse();
    await getPageSnapshotTool.handler(
      { params: { format: 'compact' } },
      compactResponse,
      context
    );

    const minimalResponse = new SimpleToolResponse();
    await getPageSnapshotTool.handler(
      { params: { format: 'minimal' } },
      minimalResponse,
      context
    );

    const jsonResponse = new SimpleToolResponse();
    await getPageSnapshotTool.handler(
      { params: { format: 'json' } },
      jsonResponse,
      context
    );

    const compactTokens = parseInt(compactResponse.getResponseText().match(/Token估算: ~(\d+) tokens/)?.[1] || '0');
    const minimalTokens = parseInt(minimalResponse.getResponseText().match(/Token估算: ~(\d+) tokens/)?.[1] || '0');
    const jsonTokens = parseInt(jsonResponse.getResponseText().match(/Token估算: ~(\d+) tokens/)?.[1] || '0');

    // 验证：minimal < compact < json
    const success =
      minimalTokens > 0 &&
      compactTokens > 0 &&
      jsonTokens > 0 &&
      minimalTokens < compactTokens &&
      compactTokens < jsonTokens;

    logResult({
      name: '测试 Token 估算准确性',
      success,
      duration: Date.now() - startTime,
      validation: {
        formatCorrect: success,
      },
      output: `minimal: ${minimalTokens}, compact: ${compactTokens}, json: ${jsonTokens}`,
    });
  } catch (error) {
    logResult({
      name: '测试 Token 估算准确性',
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 打印测试总结
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));

  const total = results.length;
  const passed = results.filter(r => r.success).length;
  const failed = total - passed;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n总测试数: ${total}`);
  console.log(`通过: ${passed} ✅`);
  console.log(`失败: ${failed} ❌`);
  console.log(`总耗时: ${totalDuration}ms`);
  console.log(`平均耗时: ${Math.round(totalDuration / total)}ms`);

  if (failed > 0) {
    console.log('\n失败的测试:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error || '验证失败'}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  // 退出码
  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
  console.error('❌ 测试运行失败:', error);
  process.exit(1);
});
