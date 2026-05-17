/**
 * diagnose.ts 工具测试
 * 覆盖 diagnose_connection / check_environment / debug_page_elements / debug_connection_flow
 */

import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  diagnoseConnectionTool,
  checkEnvironmentTool,
  debugPageElementsTool,
  debugConnectionFlowTool,
} from '../../src/tools/diagnose.js';
import { createMockContext, createMockResponse, createMockPage } from '../utils/test-factories.js';

describe('diagnose_connection tool', () => {
  const projectPath = path.resolve(process.cwd(), 'playground/wx');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('已连接状态下应显示连接信息', async () => {
    const response = createMockResponse();
    const mockPage = createMockPage({ path: '/pages/home/index' });
    const context = createMockContext({
      miniProgram: { currentPage: vi.fn(async () => mockPage) } as any,
      currentPage: mockPage as any,
    });

    await diagnoseConnectionTool.handler(
      { params: { projectPath, verbose: false } },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('✅ 已连接到微信开发者工具');
    expect(text).toContain('诊断总结');
  });

  it('未连接状态下应显示未连接提示', async () => {
    const response = createMockResponse();
    const context = createMockContext();

    await diagnoseConnectionTool.handler(
      { params: { projectPath, verbose: false } },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('❌ 未连接到微信开发者工具');
  });

  it('verbose 模式应输出详细诊断信息', async () => {
    const response = createMockResponse();
    const context = createMockContext();

    await diagnoseConnectionTool.handler(
      { params: { projectPath, verbose: true } },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('详细诊断信息');
    expect(text).toContain('当前工作目录');
    expect(text).toContain('元素映射大小');
    expect(text).toContain('Console监听状态');
  });

  it('无效路径应报告路径不存在', async () => {
    const response = createMockResponse();
    const context = createMockContext();

    await diagnoseConnectionTool.handler(
      { params: { projectPath: '/nonexistent/path/to/project', verbose: false } },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('❌ 项目路径不存在');
  });

  it('缺少 app.json 的路径应报告项目结构不完整', async () => {
    const response = createMockResponse();
    const context = createMockContext();
    // 使用当前工作目录（存在但没有 app.json）
    const cwdPath = process.cwd();

    await diagnoseConnectionTool.handler(
      { params: { projectPath: cwdPath, verbose: false } },
      response as any,
      context,
    );

    const text = response.getResponseText();
    // 项目根目录没有 app.json，应报告缺失
    expect(text).toContain('缺少 app.json');
  });

  it('相对路径应被正确解析', async () => {
    const response = createMockResponse();
    const context = createMockContext();

    await diagnoseConnectionTool.handler(
      { params: { projectPath: 'playground/wx', verbose: false } },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('检测到相对路径');
  });
});

describe('check_environment tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应输出环境检查结果', async () => {
    const response = createMockResponse();
    const context = createMockContext();

    await checkEnvironmentTool.handler(
      { params: {} },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('检查微信开发者工具自动化环境');
    expect(text).toContain('环境检查完成');
  });

  it('已连接状态应显示连接状态为已连接', async () => {
    const response = createMockResponse();
    const context = createMockContext({
      miniProgram: { currentPage: vi.fn() } as any,
    });

    await checkEnvironmentTool.handler(
      { params: {} },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('连接状态: 已连接');
  });

  it('未连接状态应显示连接状态为未连接', async () => {
    const response = createMockResponse();
    const context = createMockContext();

    await checkEnvironmentTool.handler(
      { params: {} },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('连接状态: 未连接');
  });
});

describe('debug_page_elements tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未连接时应抛出错误', async () => {
    const response = createMockResponse();
    const context = createMockContext();

    await expect(
      debugPageElementsTool.handler(
        { params: { testAllStrategies: true } },
        response as any,
        context,
      ),
    ).rejects.toThrow('请先连接到微信开发者工具并获取当前页面');
  });

  it('已连接时应执行元素调试', async () => {
    const response = createMockResponse();
    const mockPage = createMockPage({
      path: '/pages/index/index',
      $$: vi.fn(async () => []),
    });
    const context = createMockContext({
      currentPage: mockPage as any,
    });

    await debugPageElementsTool.handler(
      { params: { testAllStrategies: true } },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('开始调试页面元素获取');
    expect(text).toContain('诊断建议');
  });

  it('自定义选择器应被测试', async () => {
    const response = createMockResponse();
    const mockPage = createMockPage({
      path: '/pages/index/index',
      $$: vi.fn(async () => []),
    });
    const context = createMockContext({
      currentPage: mockPage as any,
    });

    await debugPageElementsTool.handler(
      { params: { testAllStrategies: false, customSelector: '.my-class' } },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('自定义选择器测试');
    expect(text).toContain('.my-class');
  });
});

describe('debug_connection_flow tool', () => {
  const projectPath = path.resolve(process.cwd(), 'playground/wx');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应通过 context.connectDevtools 建立连接', async () => {
    const response = createMockResponse();
    const connectedMiniProgram = {
      removeAllListeners: vi.fn(),
    };

    const context = createMockContext({
      connectDevtools: vi.fn(async () => ({
        connectionId: 'conn_debug',
        strategyUsed: 'auto' as const,
        endpoint: 'ws://127.0.0.1:9420',
        miniProgram: connectedMiniProgram,
        currentPage: { path: '/pages/home/index' },
        pagePath: '/pages/home/index',
        health: { level: 'healthy' as const, checks: [], checkedAt: '2026-01-01T00:00:00.000Z' },
        status: 'connected' as const,
        timing: { totalMs: 1200, connectMs: 900, healthMs: 300 },
        warnings: [],
      })),
    });

    await debugConnectionFlowTool.handler(
      {
        params: {
          projectPath,
          mode: 'auto',
          dryRun: false,
          captureSnapshot: false,
          verbose: false,
        },
      },
      response as any,
      context,
    );

    expect(context.connectDevtools).toHaveBeenCalledWith({
      strategy: 'auto',
      projectPath,
      timeoutMs: 45000,
      healthCheck: true,
      verbose: false,
    });
    expect(response.getResponseText()).toContain('连接策略: auto');
    expect(response.getResponseText()).toContain('连接状态: connected');
  });

  it('检测到可复用连接时不应触发新连接', async () => {
    const response = createMockResponse();
    const context = createMockContext({
      miniProgram: {
        currentPage: vi.fn(async () => ({ path: '/pages/existing/index' })),
      } as any,
    });

    await debugConnectionFlowTool.handler(
      {
        params: {
          projectPath,
          mode: 'auto',
          dryRun: false,
          captureSnapshot: false,
          verbose: false,
        },
      },
      response as any,
      context,
    );

    expect(context.connectDevtools).not.toHaveBeenCalled();
    expect(response.getResponseText()).toContain('复用现有连接');
  });

  it('连接失败时应输出错误信息并抛出异常', async () => {
    const response = createMockResponse();
    const context = createMockContext({
      connectDevtools: vi.fn(async () => {
        throw new Error('连接超时: 无法连接到开发者工具');
      }),
    });

    await expect(
      debugConnectionFlowTool.handler(
        {
          params: {
            projectPath,
            mode: 'auto',
            dryRun: false,
            captureSnapshot: false,
            verbose: false,
          },
        },
        response as any,
        context,
      ),
    ).rejects.toThrow('连接超时');

    const text = response.getResponseText();
    expect(text).toContain('❌ 连接失败');
    expect(text).toContain('调试过程失败');
  });

  it('dryRun 模式应跳过实际连接', async () => {
    const response = createMockResponse();
    const context = createMockContext();

    await debugConnectionFlowTool.handler(
      {
        params: {
          projectPath,
          mode: 'auto',
          dryRun: true,
          captureSnapshot: false,
          verbose: false,
        },
      },
      response as any,
      context,
    );

    expect(context.connectDevtools).not.toHaveBeenCalled();
    const text = response.getResponseText();
    expect(text).toContain('DryRun 模式');
  });

  it('captureSnapshot 启用时应记录状态快照', async () => {
    const response = createMockResponse();
    const context = createMockContext({
      connectDevtools: vi.fn(async () => ({
        connectionId: 'conn_snap',
        strategyUsed: 'auto' as const,
        endpoint: 'ws://127.0.0.1:9420',
        miniProgram: { removeAllListeners: vi.fn() },
        currentPage: { path: '/pages/index/index' },
        pagePath: '/pages/index/index',
        health: { level: 'healthy' as const, checks: [], checkedAt: '2026-01-01T00:00:00.000Z' },
        status: 'connected' as const,
        timing: { totalMs: 500, connectMs: 400, healthMs: 100 },
        warnings: [],
      })),
    });

    await debugConnectionFlowTool.handler(
      {
        params: {
          projectPath,
          mode: 'auto',
          dryRun: false,
          captureSnapshot: true,
          verbose: false,
        },
      },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('状态快照');
    expect(text).toContain('快照 1');
  });

  it('verbose 模式应输出详细连接参数', async () => {
    const response = createMockResponse();
    const context = createMockContext({
      connectDevtools: vi.fn(async () => ({
        connectionId: 'conn_verbose',
        strategyUsed: 'auto' as const,
        endpoint: 'ws://127.0.0.1:9420',
        miniProgram: { removeAllListeners: vi.fn() },
        currentPage: { path: '/pages/index/index' },
        pagePath: '/pages/index/index',
        health: { level: 'healthy' as const, checks: [], checkedAt: '2026-01-01T00:00:00.000Z' },
        status: 'connected' as const,
        timing: { totalMs: 300, connectMs: 200, healthMs: 100 },
        warnings: [],
      })),
    });

    await debugConnectionFlowTool.handler(
      {
        params: {
          projectPath,
          mode: 'auto',
          dryRun: false,
          captureSnapshot: false,
          verbose: true,
        },
      },
      response as any,
      context,
    );

    const text = response.getResponseText();
    expect(text).toContain('超时设置: 45000ms');
    expect(text).toContain('健康检查: 启用');
  });
});
