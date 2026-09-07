import { describe, it, expect } from 'vitest';

import {
  parseToolProfileConfig,
  resolveToolsByProfile,
  summarizeToolProfile,
} from '../../src/config/tool-profile.js';
import { ToolCategory } from '../../src/tools/ToolDefinition.js';
import { allTools } from '../../src/tools/tools.js';

describe('tool-profile 配置测试', () => {
  it('未传入参数时应使用默认 core profile', () => {
    const config = parseToolProfileConfig({
      argv: [],
      env: {},
    });

    expect(config.profile).toBe('core');
    expect(config.enabledCategories.size).toBe(0);
    expect(config.disabledCategories.size).toBe(0);
  });

  it('CLI 参数应优先于环境变量', () => {
    const config = parseToolProfileConfig({
      argv: ['--tools-profile=full', '--enable-categories=debug'],
      env: {
        WEIXIN_MCP_TOOLS_PROFILE: 'minimal',
        WEIXIN_MCP_ENABLE_CATEGORIES: 'network',
      },
    });

    expect(config.profile).toBe('full');
    expect(config.enabledCategories.has(ToolCategory.DEBUG)).toBe(true);
    expect(config.enabledCategories.has(ToolCategory.NETWORK)).toBe(false);
  });

  it('无效 profile 和类别应直接拒绝，而不是静默回退', () => {
    expect(() => parseToolProfileConfig({ argv: ['--tools-profile=ful'], env: {} }))
      .toThrow('无效的 tools profile');
    expect(() => parseToolProfileConfig({ argv: ['--enable-categories=netwrok'], env: {} }))
      .toThrow('无效的 enable-categories');
  });

  it.each([
    'tools-profile',
    'enable-categories',
    'disable-categories',
  ])('CLI 选项 --%s 显式缺值时应直接拒绝', optionName => {
    expect(() => parseToolProfileConfig({ argv: [`--${optionName}`], env: {} }))
      .toThrow(`缺少 --${optionName} 的值`);
    expect(() => parseToolProfileConfig({ argv: [`--${optionName}=`], env: {} }))
      .toThrow(`缺少 --${optionName} 的值`);
    expect(() => parseToolProfileConfig({
      argv: [`--${optionName}`, '--unrelated-option=value'],
      env: {},
    })).toThrow(`缺少 --${optionName} 的值`);
  });

  it('full profile 应返回全部 31 个工具', () => {
    const result = resolveToolsByProfile(allTools, {
      profile: 'full',
      enabledCategories: new Set(),
      disabledCategories: new Set(),
    });

    expect(result.activeTools).toHaveLength(31);
    expect(result.disabledTools.size).toBe(0);
  });

  it('core profile 应返回核心 20 个工具', () => {
    const result = resolveToolsByProfile(allTools, {
      profile: 'core',
      enabledCategories: new Set(),
      disabledCategories: new Set(),
    });

    expect(result.activeTools).toHaveLength(20);
    expect(result.disabledTools.has('list_console_messages')).toBe(true);
    expect(result.disabledTools.has('diagnose_connection')).toBe(true);
    expect(result.disabledTools.has('list_network_requests')).toBe(true);
  });

  it('core profile 启用 debug 类别后应包含诊断工具', () => {
    const result = resolveToolsByProfile(allTools, {
      profile: 'core',
      enabledCategories: new Set([ToolCategory.DEBUG]),
      disabledCategories: new Set(),
    });

    const toolNames = result.activeTools.map(tool => tool.name);
    expect(toolNames).toContain('diagnose_connection');
    expect(toolNames).toContain('check_environment');
    expect(toolNames).toContain('debug_page_elements');
  });

  it('应从最终启用结果生成 profile 摘要', () => {
    const config = {
      profile: 'core' as const,
      enabledCategories: new Set([ToolCategory.NETWORK]),
      disabledCategories: new Set<ToolCategory>(),
    };
    const activation = resolveToolsByProfile(allTools, config);
    const summary = summarizeToolProfile(
      config,
      activation,
      tool => tool.annotations?.category ?? ToolCategory.CORE,
    );

    expect(summary).toMatchObject({
      profile: 'core',
      activeToolCount: 24,
      disabledToolCount: 7,
      activeCategories: [ToolCategory.CORE, ToolCategory.NETWORK],
      inactiveCategories: [ToolCategory.CONSOLE, ToolCategory.DEBUG],
    });
  });
});
