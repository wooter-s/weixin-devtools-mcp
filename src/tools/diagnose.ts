/**
 * 诊断工具
 * 帮助用户调试连接和配置问题
 */

import { z } from 'zod';
import { defineTool, ToolCategories } from './ToolDefinition.js';
import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';

/**
 * 诊断连接问题工具
 */
export const diagnoseConnectionTool = defineTool({
  name: 'diagnose_connection',
  description: '诊断微信开发者工具连接问题，检查配置和环境',
  schema: z.object({
    projectPath: z.string().describe('要检查的小程序项目路径'),
    verbose: z.boolean().optional().default(false).describe('是否输出详细诊断信息'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { projectPath, verbose } = request.params;

    response.appendResponseLine('🔍 开始诊断微信开发者工具连接问题...');
    response.appendResponseLine('');

    // 1. 检查参数有效性
    response.appendResponseLine('📋 1. 参数检查');
    if (!projectPath || typeof projectPath !== 'string') {
      response.appendResponseLine('❌ projectPath 参数无效或缺失');
      response.appendResponseLine('   修复建议: 确保传递有效的字符串路径');
      return;
    }
    response.appendResponseLine(`✅ projectPath 参数正常: ${projectPath}`);

    // 2. 路径解析检查
    response.appendResponseLine('');
    response.appendResponseLine('📁 2. 路径解析检查');

    let resolvedPath = projectPath;
    if (projectPath.startsWith('@playground/')) {
      const relativePath = projectPath.replace('@playground/', 'playground/');
      resolvedPath = resolve(process.cwd(), relativePath);
      response.appendResponseLine(`🔄 检测到 @playground/ 格式路径`);
      response.appendResponseLine(`   原始路径: ${projectPath}`);
      response.appendResponseLine(`   解析后路径: ${resolvedPath}`);
    } else if (!isAbsolute(projectPath)) {
      resolvedPath = resolve(process.cwd(), projectPath);
      response.appendResponseLine(`🔄 检测到相对路径，转换为绝对路径`);
      response.appendResponseLine(`   原始路径: ${projectPath}`);
      response.appendResponseLine(`   解析后路径: ${resolvedPath}`);
    } else {
      response.appendResponseLine(`✅ 已是绝对路径: ${resolvedPath}`);
    }

    // 3. 路径存在性检查
    response.appendResponseLine('');
    response.appendResponseLine('🗂️ 3. 路径存在性检查');
    if (!existsSync(resolvedPath)) {
      response.appendResponseLine(`❌ 项目路径不存在: ${resolvedPath}`);
      response.appendResponseLine('   修复建议:');
      response.appendResponseLine('   - 检查路径是否拼写正确');
      response.appendResponseLine('   - 确保项目目录已创建');
      response.appendResponseLine('   - 使用绝对路径避免相对路径问题');
      return;
    }
    response.appendResponseLine(`✅ 项目路径存在: ${resolvedPath}`);

    // 4. 小程序项目结构检查
    response.appendResponseLine('');
    response.appendResponseLine('📦 4. 小程序项目结构检查');

    const appJsonPath = resolve(resolvedPath, 'app.json');
    const projectConfigPath = resolve(resolvedPath, 'project.config.json');

    const hasAppJson = existsSync(appJsonPath);
    const hasProjectConfig = existsSync(projectConfigPath);

    if (!hasAppJson) {
      response.appendResponseLine(`❌ 缺少 app.json 文件: ${appJsonPath}`);
    } else {
      response.appendResponseLine(`✅ 找到 app.json 文件: ${appJsonPath}`);
    }

    if (!hasProjectConfig) {
      response.appendResponseLine(`⚠️ 缺少 project.config.json 文件: ${projectConfigPath}`);
      response.appendResponseLine('   这可能不影响自动化，但建议配置该文件');
    } else {
      response.appendResponseLine(`✅ 找到 project.config.json 文件: ${projectConfigPath}`);
    }

    if (!hasAppJson) {
      response.appendResponseLine('');
      response.appendResponseLine('❌ 项目结构不完整，这不是一个有效的小程序项目');
      response.appendResponseLine('   修复建议:');
      response.appendResponseLine('   - 确保指向正确的小程序项目根目录');
      response.appendResponseLine('   - 小程序项目必须包含 app.json 文件');
      return;
    }

    // 5. 连接状态检查
    response.appendResponseLine('');
    response.appendResponseLine('🔗 5. 当前连接状态检查');
    if (context.miniProgram) {
      response.appendResponseLine('✅ 已连接到微信开发者工具');
      if (context.currentPage) {
        try {
          const pagePath = await context.currentPage.path;
          response.appendResponseLine(`   当前页面: ${pagePath}`);
        } catch (error) {
          response.appendResponseLine('⚠️ 获取当前页面信息失败');
        }
      } else {
        response.appendResponseLine('⚠️ 已连接但无当前页面信息');
      }
    } else {
      response.appendResponseLine('❌ 未连接到微信开发者工具');
    }

    // 6. 详细信息输出（如果启用verbose）
    if (verbose) {
      response.appendResponseLine('');
      response.appendResponseLine('🔧 6. 详细诊断信息');
      response.appendResponseLine(`   当前工作目录: ${process.cwd()}`);
      response.appendResponseLine(`   元素映射大小: ${context.elementMap.size}`);
      response.appendResponseLine(`   Console监听状态: ${context.consoleStorage.isMonitoring ? '已启动' : '未启动'}`);
      response.appendResponseLine(`   Console消息数量: ${context.consoleStorage.consoleMessages.length}`);
      response.appendResponseLine(`   异常消息数量: ${context.consoleStorage.exceptionMessages.length}`);
    }

    // 7. 总结和建议
    response.appendResponseLine('');
    response.appendResponseLine('📝 诊断总结');
    if (hasAppJson && existsSync(resolvedPath)) {
      response.appendResponseLine('✅ 项目配置检查通过，可以尝试连接');
      response.appendResponseLine('');
      response.appendResponseLine('💡 建议的连接命令:');
      response.appendResponseLine(`connect_devtools(projectPath: "${resolvedPath}")`);
    } else {
      response.appendResponseLine('❌ 发现配置问题，请根据上述建议修复后重试');
    }

    // 8. 常见问题解决方案
    response.appendResponseLine('');
    response.appendResponseLine('🛠️ 常见问题解决方案');
    response.appendResponseLine('1. 路径包含"undefined": 确保传递了有效的projectPath参数');
    response.appendResponseLine('2. 项目路径不存在: 检查路径拼写和目录是否已创建');
    response.appendResponseLine('3. 连接超时: 确保微信开发者工具已打开并启用自动化功能');
    response.appendResponseLine('4. 权限问题: 在开发者工具中开启CLI/HTTP调用权限');
    response.appendResponseLine('5. 端口冲突: 尝试指定不同的端口号');
  },
});

/**
 * 页面元素调试工具
 */
export const debugPageElementsTool = defineTool({
  name: 'debug_page_elements',
  description: '调试页面元素获取问题，测试不同的选择器策略',
  schema: z.object({
    testAllStrategies: z.boolean().optional().default(true).describe('是否测试所有选择器策略'),
    customSelector: z.string().optional().describe('自定义选择器进行测试'),
  }),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { testAllStrategies, customSelector } = request.params;

    if (!context.currentPage) {
      throw new Error('请先连接到微信开发者工具并获取当前页面');
    }

    response.appendResponseLine('🔍 开始调试页面元素获取...');
    response.appendResponseLine('');

    const page = context.currentPage;

    try {
      // 获取页面基本信息
      response.appendResponseLine('📱 页面基本信息');
      try {
        const pagePath = await page.path;
        response.appendResponseLine(`   页面路径: ${pagePath}`);
      } catch (error) {
        response.appendResponseLine(`   页面路径获取失败: ${error}`);
      }

      // 等待页面加载
      response.appendResponseLine('');
      response.appendResponseLine('⏱️ 等待页面加载...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      response.appendResponseLine('   页面加载等待完成');

      if (testAllStrategies) {
        response.appendResponseLine('');
        response.appendResponseLine('🧪 测试各种选择器策略');

        // 策略1: 通用选择器
        response.appendResponseLine('');
        response.appendResponseLine('策略1: 通用选择器');
        const universalSelectors = ['*', 'body *', 'html *'];

        for (const selector of universalSelectors) {
          try {
            const elements = await page.$$(selector);
            response.appendResponseLine(`   ${selector}: ${elements.length} 个元素`);
          } catch (error) {
            response.appendResponseLine(`   ${selector}: 失败 - ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // 策略2: 小程序组件选择器
        response.appendResponseLine('');
        response.appendResponseLine('策略2: 小程序组件选择器');
        const miniProgramSelectors = [
          'view', 'text', 'button', 'image', 'input', 'textarea',
          'picker', 'switch', 'slider', 'scroll-view', 'swiper',
          'icon', 'rich-text', 'progress', 'navigator', 'form',
          'checkbox', 'radio', 'cover-view', 'cover-image'
        ];

        let totalElements = 0;
        for (const selector of miniProgramSelectors) {
          try {
            const elements = await page.$$(selector);
            if (elements.length > 0) {
              response.appendResponseLine(`   ${selector}: ${elements.length} 个元素`);
              totalElements += elements.length;
            }
          } catch (error) {
            response.appendResponseLine(`   ${selector}: 失败 - ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        response.appendResponseLine(`   小程序组件总计: ${totalElements} 个元素`);

        // 策略3: 层级选择器
        response.appendResponseLine('');
        response.appendResponseLine('策略3: 层级选择器');
        const hierarchySelectors = ['page > *', 'page view', 'page text', 'page button'];

        for (const selector of hierarchySelectors) {
          try {
            const elements = await page.$$(selector);
            response.appendResponseLine(`   ${selector}: ${elements.length} 个元素`);
          } catch (error) {
            response.appendResponseLine(`   ${selector}: 失败 - ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // 策略4: 属性选择器
        response.appendResponseLine('');
        response.appendResponseLine('策略4: 属性选择器');
        const attributeSelectors = ['[class]', '[id]', '[data-*]', '[wx:*]'];

        for (const selector of attributeSelectors) {
          try {
            const elements = await page.$$(selector);
            response.appendResponseLine(`   ${selector}: ${elements.length} 个元素`);
          } catch (error) {
            response.appendResponseLine(`   ${selector}: 失败 - ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // 自定义选择器测试
      if (customSelector) {
        response.appendResponseLine('');
        response.appendResponseLine('🎯 自定义选择器测试');
        try {
          const elements = await page.$$(customSelector);
          response.appendResponseLine(`   ${customSelector}: ${elements.length} 个元素`);

          if (elements.length > 0 && elements.length <= 5) {
            response.appendResponseLine('   元素详细信息:');
            for (let i = 0; i < elements.length; i++) {
              const element = elements[i];
              try {
                const tagName = element.tagName || 'unknown';
                const text = await element.text().catch(() => '');
                response.appendResponseLine(`     [${i}] ${tagName}${text ? ` - "${text.substring(0, 50)}"` : ''}`);
              } catch (error) {
                response.appendResponseLine(`     [${i}] 元素信息获取失败`);
              }
            }
          }
        } catch (error) {
          response.appendResponseLine(`   ${customSelector}: 失败 - ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // 诊断建议
      response.appendResponseLine('');
      response.appendResponseLine('💡 诊断建议');
      response.appendResponseLine('1. 如果所有选择器都返回0个元素，请检查:');
      response.appendResponseLine('   - 页面是否已完全加载');
      response.appendResponseLine('   - 是否在正确的页面上');
      response.appendResponseLine('   - 微信开发者工具的自动化权限是否正确设置');
      response.appendResponseLine('');
      response.appendResponseLine('2. 如果只有特定组件有效，建议:');
      response.appendResponseLine('   - 使用具体的组件选择器而不是通用选择器');
      response.appendResponseLine('   - 组合使用多个选择器获取完整的元素列表');
      response.appendResponseLine('');
      response.appendResponseLine('3. 优化建议:');
      response.appendResponseLine('   - 为关键元素添加class或id属性');
      response.appendResponseLine('   - 使用data-testid属性便于自动化测试');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`调试过程中发生错误: ${errorMessage}`);
      throw error;
    }
  },
});

/**
 * 环境检查工具
 */
export const checkEnvironmentTool = defineTool({
  name: 'check_environment',
  description: '检查微信开发者工具自动化环境配置',
  schema: z.object({}),
  annotations: {
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    response.appendResponseLine('🌍 检查微信开发者工具自动化环境...');
    response.appendResponseLine('');

    // 检查依赖
    response.appendResponseLine('📦 依赖检查');
    try {
      const automator = await import('miniprogram-automator');
      response.appendResponseLine('✅ miniprogram-automator 模块加载成功');
    } catch (error) {
      response.appendResponseLine('❌ miniprogram-automator 模块加载失败');
      response.appendResponseLine(`   错误: ${error instanceof Error ? error.message : String(error)}`);
      response.appendResponseLine('   修复建议: npm install miniprogram-automator');
      return;
    }

    // 检查MCP服务器配置
    response.appendResponseLine('');
    response.appendResponseLine('⚙️ MCP服务器配置建议');
    response.appendResponseLine('1. 原版服务器 (兼容性)：');
    response.appendResponseLine('   "command": "/path/to/weixin-devtools-mcp/build/index.js"');
    response.appendResponseLine('');
    response.appendResponseLine('2. 新版模块化服务器 (推荐)：');
    response.appendResponseLine('   "command": "/path/to/weixin-devtools-mcp/build/server.js"');
    response.appendResponseLine('');
    response.appendResponseLine('💡 配置文件位置:');
    response.appendResponseLine('   macOS: ~/Library/Application Support/Claude/claude_desktop_config.json');
    response.appendResponseLine('   Windows: %APPDATA%/Claude/claude_desktop_config.json');

    // 检查工具可用性
    response.appendResponseLine('');
    response.appendResponseLine('🔧 可用工具统计');
    response.appendResponseLine(`   总工具数量: ${context ? 'MCP服务器已初始化' : 'MCP服务器未初始化'}`);

    if (context.miniProgram) {
      response.appendResponseLine('   连接状态: 已连接');
    } else {
      response.appendResponseLine('   连接状态: 未连接');
    }

    response.appendResponseLine('');
    response.appendResponseLine('✅ 环境检查完成');
  },
});