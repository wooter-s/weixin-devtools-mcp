/**
 * 工具暴露配置
 * 支持 profile 与类别开关，按需裁剪 ListTools 返回内容
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDefinition } from '../tools/ToolDefinition.js';

import { ToolCategory } from './tool-category.js';

export type ToolsProfile = 'core' | 'full' | 'minimal';

export interface ToolProfileConfig {
  profile: ToolsProfile;
  enabledCategories: ReadonlySet<ToolCategory>;
  disabledCategories: ReadonlySet<ToolCategory>;
}

export interface ToolActivationResult<T> {
  activeTools: T[];
  disabledTools: Map<string, T>;
}

export type ToolDescriptor = Tool & {
  _meta: {
    category: ToolCategory;
    audience?: string[];
    experimental?: boolean;
  };
};

const DEFAULT_PROFILE: ToolsProfile = 'core';
const VALID_CATEGORIES = new Set<string>(Object.values(ToolCategory));

const CORE_TOOL_NAMES = new Set<string>([
  'connect_devtools',
  'reconnect_devtools',
  'disconnect_devtools',
  'get_connection_status',
  'get_current_page',
  'get_page_snapshot',
  'find_elements',
  'wait_for',
  'click',
  'input_text',
  'get_value',
  'set_form_control',
  'assert_text',
  'assert_attribute',
  'assert_state',
  'navigate_to',
  'navigate_back',
  'switch_tab',
  'relaunch',
  'evaluate_script',
]);

const MINIMAL_TOOL_NAMES = new Set<string>([
  'connect_devtools',
  'get_connection_status',
  'find_elements',
  'wait_for',
  'click',
  'input_text',
  'get_value',
  'navigate_to',
  'navigate_back',
  'assert_text',
]);

interface ParseConfigOptions {
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
}

function readCliOption(argv: readonly string[], optionName: string): string | undefined {
  const inlinePrefix = `--${optionName}=`;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith(inlinePrefix)) {
      return argument.slice(inlinePrefix.length);
    }

    if (argument === `--${optionName}`) {
      const next = argv[index + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        return next;
      }
    }
  }

  return undefined;
}

function normalizeProfile(profileValue: string | undefined): ToolsProfile {
  const normalized = profileValue?.trim().toLowerCase();
  if (normalized === 'full' || normalized === 'minimal' || normalized === 'core') {
    return normalized;
  }
  return DEFAULT_PROFILE;
}

function parseCategoryList(rawValue: string | undefined): Set<ToolCategory> {
  const categories = new Set<ToolCategory>();
  if (!rawValue) {
    return categories;
  }

  const parts = rawValue.split(',');
  for (const part of parts) {
    const normalized = part.trim().toLowerCase();
    if (normalized.length === 0) {
      continue;
    }

    if (VALID_CATEGORIES.has(normalized)) {
      categories.add(normalized as ToolCategory);
    }
  }

  return categories;
}

/**
 * 解析工具 profile 配置
 */
export function parseToolProfileConfig(options?: ParseConfigOptions): ToolProfileConfig {
  const argv = options?.argv ?? process.argv.slice(2);
  const env = options?.env ?? process.env;

  const cliProfile = readCliOption(argv, 'tools-profile');
  const envProfile = env.WEIXIN_MCP_TOOLS_PROFILE;
  const profile = normalizeProfile(cliProfile ?? envProfile);

  const cliEnabledCategories = readCliOption(argv, 'enable-categories');
  const envEnabledCategories = env.WEIXIN_MCP_ENABLE_CATEGORIES;
  const enabledCategories = parseCategoryList(cliEnabledCategories ?? envEnabledCategories);

  const cliDisabledCategories = readCliOption(argv, 'disable-categories');
  const envDisabledCategories = env.WEIXIN_MCP_DISABLE_CATEGORIES;
  const disabledCategories = parseCategoryList(cliDisabledCategories ?? envDisabledCategories);

  return {
    profile,
    enabledCategories,
    disabledCategories,
  };
}

function getBaseActiveNames<T extends { name: string }>(
  profile: ToolsProfile,
  tools: readonly T[],
): Set<string> {
  if (profile === 'full') {
    return new Set(tools.map(tool => tool.name));
  }

  if (profile === 'minimal') {
    return new Set(MINIMAL_TOOL_NAMES);
  }

  return new Set(CORE_TOOL_NAMES);
}

/**
 * 根据 profile 与类别开关计算激活工具
 */
function resolveByProfile<T extends { name: string }>(
  tools: readonly T[],
  config: ToolProfileConfig,
  getCategory: (tool: T) => ToolCategory,
): ToolActivationResult<T> {
  const activeNames = getBaseActiveNames(config.profile, tools);

  for (const tool of tools) {
    const toolCategory = getCategory(tool);

    if (config.enabledCategories.has(toolCategory)) {
      activeNames.add(tool.name);
    }
  }

  for (const tool of tools) {
    const toolCategory = getCategory(tool);
    if (config.disabledCategories.has(toolCategory)) {
      activeNames.delete(tool.name);
    }
  }

  const activeTools = tools.filter(tool => activeNames.has(tool.name));
  const disabledTools = new Map<string, T>(
    tools
      .filter(tool => !activeNames.has(tool.name))
      .map(tool => [tool.name, tool])
  );

  return {
    activeTools,
    disabledTools,
  };
}

/** 根据 profile 与类别开关计算运行时工具实现。 */
export function resolveToolsByProfile(
  tools: readonly ToolDefinition[],
  config: ToolProfileConfig,
): ToolActivationResult<ToolDefinition> {
  return resolveByProfile(
    tools,
    config,
    tool => tool.annotations?.category ?? ToolCategory.CORE,
  );
}

/** 根据同一套规则过滤构建期生成的公开工具描述符。 */
export function resolveToolDescriptorsByProfile(
  tools: readonly ToolDescriptor[],
  config: ToolProfileConfig,
): ToolActivationResult<ToolDescriptor> {
  return resolveByProfile(tools, config, tool => tool._meta.category);
}
