/**
 * 诊断工具
 * 帮助用户调试连接和配置问题
 */

import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';

import { z } from 'zod';

import { defineTool, ToolCategory, extractErrorMessage, ResponseFormatter } from './ToolDefinition.js';

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
    category: ToolCategory.DEBUG,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { projectPath, verbose } = request.params;

    response.appendResponseLine('🔍 开始诊断微信开发者工具连接问题...');
    response.appendResponseLine('');

    // 1. 检查参数有效性
    response.appendResponseLine('📋 1. 参数检查');
    if (!projectPath || typeof projectPath !== 'string') {
      response.appendResponseLine(ResponseFormatter.error('projectPath 参数无效或缺失'));
      response.appendResponseLine('   修复建议: 确保传递有效的字符串路径');
      return;
    }
    response.appendResponseLine(ResponseFormatter.success(`projectPath 参数正常: ${projectPath}`));

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
      response.appendResponseLine(ResponseFormatter.success(`已是绝对路径: ${resolvedPath}`));
    }

    // 3. 路径存在性检查
    response.appendResponseLine('');
    response.appendResponseLine('🗂️ 3. 路径存在性检查');
    if (!existsSync(resolvedPath)) {
      response.appendResponseLine(ResponseFormatter.error(`项目路径不存在: ${resolvedPath}`));
      response.appendResponseLine('   修复建议:');
      response.appendResponseLine('   - 检查路径是否拼写正确');
      response.appendResponseLine('   - 确保项目目录已创建');
      response.appendResponseLine('   - 使用绝对路径避免相对路径问题');
      return;
    }
    response.appendResponseLine(ResponseFormatter.success(`项目路径存在: ${resolvedPath}`));

    // 4. 小程序项目结构检查
    response.appendResponseLine('');
    response.appendResponseLine('📦 4. 小程序项目结构检查');

    const appJsonPath = resolve(resolvedPath, 'app.json');
    const projectConfigPath = resolve(resolvedPath, 'project.config.json');

    const hasAppJson = existsSync(appJsonPath);
    const hasProjectConfig = existsSync(projectConfigPath);

    if (!hasAppJson) {
      response.appendResponseLine(ResponseFormatter.error(`缺少 app.json 文件: ${appJsonPath}`));
    } else {
      response.appendResponseLine(ResponseFormatter.success(`找到 app.json 文件: ${appJsonPath}`));
    }

    if (!hasProjectConfig) {
      response.appendResponseLine(ResponseFormatter.warning(`缺少 project.config.json 文件: ${projectConfigPath}`));
      response.appendResponseLine('   这可能不影响自动化，但建议配置该文件');
    } else {
      response.appendResponseLine(ResponseFormatter.success(`找到 project.config.json 文件: ${projectConfigPath}`));
    }

    if (!hasAppJson) {
      response.appendResponseLine('');
      response.appendResponseLine(ResponseFormatter.error('项目结构不完整，这不是一个有效的小程序项目'));
      response.appendResponseLine('   修复建议:');
      response.appendResponseLine('   - 确保指向正确的小程序项目根目录');
      response.appendResponseLine('   - 小程序项目必须包含 app.json 文件');
      return;
    }

    // 5. 连接状态检查
    response.appendResponseLine('');
    response.appendResponseLine('🔗 5. 当前连接状态检查');
    if (context.miniProgram) {
      response.appendResponseLine(ResponseFormatter.success('已连接到微信开发者工具'));
      if (context.currentPage) {
        try {
          const pagePath = await context.currentPage.path;
          response.appendResponseLine(`   当前页面: ${pagePath}`);
        } catch {
          response.appendResponseLine(ResponseFormatter.warning('获取当前页面信息失败'));
        }
      } else {
        response.appendResponseLine(ResponseFormatter.warning('已连接但无当前页面信息'));
      }
    } else {
      response.appendResponseLine(ResponseFormatter.error('未连接到微信开发者工具'));
    }

    // 6. 详细信息输出（如果启用verbose）
    if (verbose) {
      response.appendResponseLine('');
      response.appendResponseLine('🔧 6. 详细诊断信息');
      response.appendResponseLine(`   当前工作目录: ${process.cwd()}`);
      response.appendResponseLine(`   元素映射大小: ${context.elementMap.size}`);
      response.appendResponseLine(`   Console监听状态: ${context.consoleStorage.isMonitoring ? '已启动' : '未启动'}`);
      // 使用新的 navigations 结构统计消息数量
      const totalMessages = context.consoleStorage.navigations.reduce((sum, session) => sum + session.messages.length, 0);
      const totalExceptions = context.consoleStorage.navigations.reduce((sum, session) => sum + session.exceptions.length, 0);
      response.appendResponseLine(`   Console消息数量: ${totalMessages}`);
      response.appendResponseLine(`   异常消息数量: ${totalExceptions}`);
    }

    // 7. 总结和建议
    response.appendResponseLine('');
    response.appendResponseLine('📝 诊断总结');
    if (hasAppJson && existsSync(resolvedPath)) {
      response.appendResponseLine(ResponseFormatter.success('项目配置检查通过，可以尝试连接'));
      response.appendResponseLine('');
      response.appendResponseLine(ResponseFormatter.hint('建议的连接命令:'));
      response.appendResponseLine(JSON.stringify({
        name: 'connect_devtools',
        arguments: {
          projectPath: resolvedPath,
          strategy: 'auto',
        },
      }));
    } else {
      response.appendResponseLine(ResponseFormatter.error('发现配置问题，请根据上述建议修复后重试'));
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
    category: ToolCategory.DEBUG,
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
            response.appendResponseLine(`   ${selector}: 失败 - ${extractErrorMessage(error)}`);
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
            response.appendResponseLine(`   ${selector}: 失败 - ${extractErrorMessage(error)}`);
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
            response.appendResponseLine(`   ${selector}: 失败 - ${extractErrorMessage(error)}`);
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
            response.appendResponseLine(`   ${selector}: 失败 - ${extractErrorMessage(error)}`);
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
              } catch {
                response.appendResponseLine(`     [${i}] 元素信息获取失败`);
              }
            }
          }
        } catch (error) {
          response.appendResponseLine(`   ${customSelector}: 失败 - ${extractErrorMessage(error)}`);
        }
      }

      // 诊断建议
      response.appendResponseLine('');
      response.appendResponseLine(ResponseFormatter.hint('诊断建议'));
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
      const errorMessage = extractErrorMessage(error);
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
    category: ToolCategory.DEBUG,
    audience: ['developers'],
  },
  handler: async (_request, response, context) => {
    response.appendResponseLine('🌍 检查微信开发者工具自动化环境...');
    response.appendResponseLine('');

    // 检查依赖
    response.appendResponseLine('📦 依赖检查');
    try {
      await import('miniprogram-automator');
      response.appendResponseLine(ResponseFormatter.success('miniprogram-automator 模块加载成功'));
    } catch (error) {
      response.appendResponseLine(ResponseFormatter.error('miniprogram-automator 模块加载失败'));
      response.appendResponseLine(`   错误: ${extractErrorMessage(error)}`);
      response.appendResponseLine('   修复建议: npm install miniprogram-automator');
      return;
    }

    // 检查MCP服务器配置
    response.appendResponseLine('');
    response.appendResponseLine('⚙️ MCP服务器配置建议');
    response.appendResponseLine('1. 推荐使用模块化服务器：');
    response.appendResponseLine('   "command": "/path/to/weixin-devtools-mcp/build/server.js"');
    response.appendResponseLine('');
    response.appendResponseLine('2. 如需全量工具，可追加参数：');
    response.appendResponseLine('   "args": ["--tools-profile=full"]');
    response.appendResponseLine('');
    response.appendResponseLine(ResponseFormatter.hint('配置文件位置:'));
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
    response.appendResponseLine(ResponseFormatter.success('环境检查完成'));
  },
});

/**
 * 连接流程调试工具
 * 用于实时追踪和调试连接过程的每个步骤
 */
export const debugConnectionFlowTool = defineTool({
  name: 'debug_connection_flow',
  description: '实时追踪和调试连接流程的详细步骤，记录每个阶段的状态和耗时',
  schema: z.object({
    projectPath: z.string().describe('小程序项目的绝对路径'),
    mode: z.enum(['auto', 'launch', 'connect']).optional().default('auto')
      .describe('连接模式: auto(智能), launch(传统), connect(两阶段)'),
    dryRun: z.boolean().optional().default(false).describe('仅模拟连接流程,不实际连接'),
    captureSnapshot: z.boolean().optional().default(true).describe('捕获每个步骤的状态快照'),
    verbose: z.boolean().optional().default(true).describe('显示详细的调试信息'),
  }),
  annotations: {
    category: ToolCategory.DEBUG,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const { projectPath, mode, dryRun, captureSnapshot, verbose } = request.params;

    // 调试追踪器
    const debugTracker = {
      startTime: Date.now(),
      steps: [] as Array<{
        step: string;
        status: 'pending' | 'running' | 'success' | 'warning' | 'error';
        startTime: number;
        endTime?: number;
        duration?: number;
        details?: Record<string, unknown>;
        error?: string;
      }>,
      snapshots: [] as Array<{
        timestamp: number;
        state: Record<string, unknown>;
      }>,
    };

    const trackStep = (step: string, status: 'pending' | 'running' | 'success' | 'warning' | 'error', details?: Record<string, unknown>, error?: string) => {
      const now = Date.now();
      const existingStep = debugTracker.steps.find(s => s.step === step);

      if (existingStep) {
        existingStep.status = status;
        if (status !== 'running' && status !== 'pending') {
          existingStep.endTime = now;
          existingStep.duration = now - existingStep.startTime;
        }
        if (details) existingStep.details = details;
        if (error) existingStep.error = error;
      } else {
        debugTracker.steps.push({
          step,
          status,
          startTime: now,
          endTime: status !== 'running' && status !== 'pending' ? now : undefined,
          duration: status !== 'running' && status !== 'pending' ? 0 : undefined,
          details,
          error,
        });
      }
    };

    const captureStateSnapshot = (label: string) => {
      if (!captureSnapshot) return;

      debugTracker.snapshots.push({
        timestamp: Date.now(),
        state: {
          label,
          hasConnection: !!context.miniProgram,
          hasCurrentPage: !!context.currentPage,
          elementMapSize: context.elementMap.size,
          consoleMonitoring: context.consoleStorage.isMonitoring,
          networkMonitoring: context.networkStorage.isMonitoring,
          navigationsCount: context.consoleStorage.navigations.length,
          messagesCount: context.consoleStorage.messageIdMap.size,
          requestsCount: context.networkStorage.requests.length,
        },
      });
    };

    response.appendResponseLine('🔍 连接流程调试器启动');
    response.appendResponseLine('═'.repeat(60));
    response.appendResponseLine('');

    try {
      // 步骤1: 参数验证
      trackStep('参数验证', 'running');
      response.appendResponseLine('📋 步骤1: 参数验证');

      if (!projectPath || typeof projectPath !== 'string') {
        trackStep('参数验证', 'error', undefined, 'projectPath 无效');
        response.appendResponseLine(ResponseFormatter.error('projectPath 参数无效'));
        throw new Error('无效的 projectPath 参数');
      }

      let resolvedPath = projectPath;
      if (projectPath.startsWith('@playground/')) {
        const relativePath = projectPath.replace('@playground/', 'playground/');
        resolvedPath = resolve(process.cwd(), relativePath);
        response.appendResponseLine(`   🔄 解析 @playground/ 路径`);
        response.appendResponseLine(`      原始: ${projectPath}`);
        response.appendResponseLine(`      解析: ${resolvedPath}`);
      } else if (!isAbsolute(projectPath)) {
        resolvedPath = resolve(process.cwd(), projectPath);
        response.appendResponseLine(`   🔄 转换相对路径为绝对路径`);
        response.appendResponseLine(`      原始: ${projectPath}`);
        response.appendResponseLine(`      解析: ${resolvedPath}`);
      }

      trackStep('参数验证', 'success', { resolvedPath, mode });
      response.appendResponseLine(`   ${ResponseFormatter.success('参数验证通过')}`);
      response.appendResponseLine(`      项目路径: ${resolvedPath}`);
      response.appendResponseLine(`      连接模式: ${mode}`);
      response.appendResponseLine('');
      captureStateSnapshot('参数验证完成');

      // 步骤2: 项目结构验证
      trackStep('项目结构验证', 'running');
      response.appendResponseLine('📦 步骤2: 项目结构验证');

      if (!existsSync(resolvedPath)) {
        trackStep('项目结构验证', 'error', undefined, '项目路径不存在');
        response.appendResponseLine(`   ${ResponseFormatter.error(`项目路径不存在: ${resolvedPath}`)}`);
        throw new Error('项目路径不存在');
      }

      const appJsonPath = resolve(resolvedPath, 'app.json');
      const projectConfigPath = resolve(resolvedPath, 'project.config.json');
      const hasAppJson = existsSync(appJsonPath);
      const hasProjectConfig = existsSync(projectConfigPath);

      if (!hasAppJson) {
        trackStep('项目结构验证', 'error', { hasAppJson, hasProjectConfig }, '缺少 app.json');
        response.appendResponseLine(`   ${ResponseFormatter.error('缺少必需文件: app.json')}`);
        throw new Error('缺少 app.json 文件');
      }

      trackStep('项目结构验证', 'success', { hasAppJson, hasProjectConfig });
      response.appendResponseLine(`   ${ResponseFormatter.success('app.json: 存在')}`);
      response.appendResponseLine(`   ${hasProjectConfig ? ResponseFormatter.success('project.config.json: 存在') : ResponseFormatter.warning('project.config.json: 缺失(可选)')}`);
      response.appendResponseLine('');
      captureStateSnapshot('项目结构验证完成');

      // 步骤3: 检查已有连接
      trackStep('连接状态检查', 'running');
      response.appendResponseLine('🔗 步骤3: 检查已有连接');

      if (context.miniProgram) {
        try {
          const currentPage = await context.miniProgram.currentPage();
          const pagePath = await currentPage.path;

          trackStep('连接状态检查', 'warning', { reuseConnection: true, pagePath });
          response.appendResponseLine(`   ${ResponseFormatter.warning('检测到活跃连接')}`);
          response.appendResponseLine(`      当前页面: ${pagePath}`);
          response.appendResponseLine(`      操作: 复用现有连接（跳过新建连接）`);

          if (!dryRun) {
            response.appendResponseLine('');
            response.appendResponseLine(ResponseFormatter.hint('如需强制重新连接,请先断开现有连接'));
            response.appendResponseLine('');
            return; // 复用连接,不继续后续步骤
          }
        } catch {
          trackStep('连接状态检查', 'warning', { connectionInvalid: true });
          response.appendResponseLine(`   ${ResponseFormatter.warning('已有连接但已失效')}`);
          response.appendResponseLine(`      操作: 清除并准备新建连接`);
          context.miniProgram = null;
          context.currentPage = null;
        }
      } else {
        trackStep('连接状态检查', 'success', { noExistingConnection: true });
        response.appendResponseLine(`   ${ResponseFormatter.success('无已有连接,准备新建连接')}`);
      }

      response.appendResponseLine('');
      captureStateSnapshot('连接状态检查完成');

      if (dryRun) {
        response.appendResponseLine('🔄 DryRun 模式: 跳过实际连接步骤');
        response.appendResponseLine('');
      } else {
        // 步骤4: 准备连接参数
        trackStep('准备连接参数', 'running');
        response.appendResponseLine('⚙️ 步骤4: 准备连接参数');

        const connectOptions = {
          strategy: mode,
          projectPath: resolvedPath,
          timeoutMs: 45000,
          healthCheck: true,
          verbose,
        };

        trackStep('准备连接参数', 'success', connectOptions);
        response.appendResponseLine(`   ${ResponseFormatter.success('连接参数准备完成')}`);
        if (verbose) {
          response.appendResponseLine(`      连接策略: ${connectOptions.strategy}`);
          response.appendResponseLine(`      超时设置: ${connectOptions.timeoutMs}ms`);
          response.appendResponseLine(`      健康检查: ${connectOptions.healthCheck ? '启用' : '禁用'}`);
        }
        response.appendResponseLine('');
        captureStateSnapshot('连接参数准备完成');

        // 步骤5: 执行连接（使用实际的连接工具）
        trackStep('执行连接', 'running');
        response.appendResponseLine('🚀 步骤5: 执行连接');
        response.appendResponseLine(`   ⏳ 正在连接到微信开发者工具...`);
        response.appendResponseLine(`      模式: ${mode}`);

        const connectionStartTime = Date.now();

        try {
          const result = await context.connectDevtools(connectOptions);

          const connectionDuration = Date.now() - connectionStartTime;

          trackStep('执行连接', 'success', {
            duration: connectionDuration,
            strategyUsed: result.strategyUsed,
            pagePath: result.pagePath,
            status: result.status,
          });

          const miniProgramResult = result.miniProgram;

          response.appendResponseLine(`   ${ResponseFormatter.success(`连接成功 (耗时: ${connectionDuration}ms)`)}`);
          response.appendResponseLine(`      当前页面: ${result.pagePath}`);
          response.appendResponseLine(`      连接策略: ${result.strategyUsed}`);
          response.appendResponseLine(`      连接状态: ${result.status}`);
          if (result.endpoint) {
            response.appendResponseLine(`      端点: ${result.endpoint}`);
          }
          response.appendResponseLine('');
          captureStateSnapshot('连接执行完成');

          // 步骤6: 初始化监听器（必须在连接成功的 try 块内执行）
          trackStep('初始化监听器', 'running');
          response.appendResponseLine('📡 步骤6: 初始化监听器');

          // Console监听
          try {
            miniProgramResult.removeAllListeners('console');
            miniProgramResult.removeAllListeners('exception');
            context.consoleStorage.isMonitoring = true;
            context.consoleStorage.startTime = new Date().toISOString();

            response.appendResponseLine(`   ${ResponseFormatter.success('Console监听器已启动')}`);
          } catch (error) {
            trackStep('初始化监听器', 'warning', undefined, 'Console监听器启动失败');
            response.appendResponseLine(`   ${ResponseFormatter.warning(`Console监听器启动失败: ${extractErrorMessage(error)}`)}`);
          }

        } catch (error) {
          const connectionDuration = Date.now() - connectionStartTime;
          const errorMessage = extractErrorMessage(error);

          trackStep('执行连接', 'error', { duration: connectionDuration }, errorMessage);
          response.appendResponseLine(`   ${ResponseFormatter.error(`连接失败 (耗时: ${connectionDuration}ms)`)}`);
          response.appendResponseLine(`      错误: ${errorMessage}`);
          response.appendResponseLine('');
          throw error;
        }

        // 网络监听
        try {
          if (!context.networkStorage.isMonitoring) {
            context.networkStorage.isMonitoring = true;
            context.networkStorage.startTime = new Date().toISOString();
            response.appendResponseLine(`   ${ResponseFormatter.success('网络监听器已启动')}`);
          } else {
            response.appendResponseLine(`   ℹ️ 网络监听器已在运行中`);
          }
        } catch (error) {
          trackStep('初始化监听器', 'warning', undefined, '网络监听器启动失败');
          response.appendResponseLine(`   ${ResponseFormatter.warning(`网络监听器启动失败: ${extractErrorMessage(error)}`)}`);
        }

        trackStep('初始化监听器', 'success');
        response.appendResponseLine('');
        captureStateSnapshot('监听器初始化完成');
      }

      // 生成调试报告
      response.appendResponseLine(ResponseFormatter.separator());
      response.appendResponseLine(ResponseFormatter.section('调试报告'));
      response.appendResponseLine(ResponseFormatter.separator());
      response.appendResponseLine('');

      // 步骤摘要
      response.appendResponseLine('📝 步骤摘要:');
      response.appendResponseLine('');

      let successCount = 0;
      let warningCount = 0;
      let errorCount = 0;

      for (const step of debugTracker.steps) {
        if (step.status === 'success') successCount++;
        if (step.status === 'warning') warningCount++;
        if (step.status === 'error') errorCount++;

        const durationInfo = step.duration !== undefined ? ` (${step.duration}ms)` : '';
        const stepText = `${step.step}${durationInfo}`;
        const formattedLine = step.status === 'success' ? ResponseFormatter.success(stepText) :
                              step.status === 'warning' ? ResponseFormatter.warning(stepText) :
                              step.status === 'error' ? ResponseFormatter.error(stepText) :
                              `⏳ ${stepText}`;
        response.appendResponseLine(formattedLine);

        if (verbose && step.details) {
          const detailsStr = JSON.stringify(step.details, null, 2)
            .split('\n')
            .map(line => `   ${line}`)
            .join('\n');
          response.appendResponseLine(detailsStr);
        }

        if (step.error) {
          response.appendResponseLine(`   错误: ${step.error}`);
        }
      }

      response.appendResponseLine('');
      response.appendResponseLine(`总耗时: ${Date.now() - debugTracker.startTime}ms`);
      response.appendResponseLine(`成功: ${successCount} | 警告: ${warningCount} | 错误: ${errorCount}`);
      response.appendResponseLine('');

      // 状态快照
      if (captureSnapshot && debugTracker.snapshots.length > 0) {
        response.appendResponseLine('📸 状态快照:');
        response.appendResponseLine('');

        for (let i = 0; i < debugTracker.snapshots.length; i++) {
          const snapshot = debugTracker.snapshots[i];
          const relativeTime = snapshot.timestamp - debugTracker.startTime;

          response.appendResponseLine(`快照 ${i + 1}: ${snapshot.state.label} (+${relativeTime}ms)`);
          response.appendResponseLine(`   连接状态: ${snapshot.state.hasConnection ? '已连接' : '未连接'}`);
          response.appendResponseLine(`   当前页面: ${snapshot.state.hasCurrentPage ? '已设置' : '未设置'}`);
          response.appendResponseLine(`   元素映射: ${snapshot.state.elementMapSize} 个`);
          response.appendResponseLine(`   Console监听: ${snapshot.state.consoleMonitoring ? '已启动' : '未启动'}`);
          response.appendResponseLine(`   网络监听: ${snapshot.state.networkMonitoring ? '已启动' : '未启动'}`);
          response.appendResponseLine(`   导航会话: ${snapshot.state.navigationsCount} 个`);
          response.appendResponseLine(`   Console消息: ${snapshot.state.messagesCount} 条`);
          response.appendResponseLine(`   网络请求: ${snapshot.state.requestsCount} 个`);
          response.appendResponseLine('');
        }
      }

      // 诊断建议
      response.appendResponseLine(ResponseFormatter.hint('诊断建议:'));
      response.appendResponseLine('');

      if (errorCount > 0) {
        response.appendResponseLine(ResponseFormatter.warning('发现错误,建议检查:'));
        for (const step of debugTracker.steps) {
          if (step.status === 'error') {
            response.appendResponseLine(`   • ${step.step}: ${step.error || '未知错误'}`);
          }
        }
        response.appendResponseLine('');
      }

      if (warningCount > 0) {
        response.appendResponseLine('ℹ️ 发现警告,可能的优化点:');
        for (const step of debugTracker.steps) {
          if (step.status === 'warning') {
            response.appendResponseLine(`   • ${step.step}`);
          }
        }
        response.appendResponseLine('');
      }

      if (errorCount === 0 && warningCount === 0) {
        response.appendResponseLine(ResponseFormatter.success('所有步骤正常,连接流程健康!'));
        response.appendResponseLine('');
      }

      response.appendResponseLine(ResponseFormatter.hint('使用 MCP Inspector 进行后续调试:'));
      response.appendResponseLine('   npm run inspector');
      response.appendResponseLine('');

    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      response.appendResponseLine(ResponseFormatter.separator());
      response.appendResponseLine(ResponseFormatter.error('调试过程失败'));
      response.appendResponseLine(ResponseFormatter.separator());
      response.appendResponseLine('');
      response.appendResponseLine(`错误信息: ${errorMessage}`);

      if (verbose && errorStack) {
        response.appendResponseLine('');
        response.appendResponseLine('错误堆栈:');
        response.appendResponseLine(errorStack);
      }

      response.appendResponseLine('');
      response.appendResponseLine('📊 调试追踪 (失败前):');

      for (const step of debugTracker.steps) {
        const stepLine = step.status === 'success' ? ResponseFormatter.success(step.step) :
                         step.status === 'warning' ? ResponseFormatter.warning(step.step) :
                         step.status === 'error' ? ResponseFormatter.error(step.step) :
                         `⏳ ${step.step}`;
        response.appendResponseLine(stepLine);
        if (step.error) {
          response.appendResponseLine(`   错误: ${step.error}`);
        }
      }

      throw error;
    }
  },
});
