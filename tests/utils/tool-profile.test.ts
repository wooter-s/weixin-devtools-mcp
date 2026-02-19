import { describe, it, expect } from 'vitest';

import {
  parseToolProfileConfig,
  resolveToolsByProfile,
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

  it('full profile 应返回全部 30 个工具', () => {
    const result = resolveToolsByProfile(allTools, {
      profile: 'full',
      enabledCategories: new Set(),
      disabledCategories: new Set(),
    });

    expect(result.activeTools).toHaveLength(30);
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
    expect(result.disabledTools.has('get_network_requests')).toBe(true);
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
});
