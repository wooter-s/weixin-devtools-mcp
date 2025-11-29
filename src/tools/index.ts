/**
 * 工具模块导出
 * 统一导出所有工具定义
 */

import type { ToolDefinition } from './ToolDefinition.js';

// 导入各个模块的工具
import {
  assertTextTool,
  assertAttributeTool,
  assertStateTool
} from './assert.js';
import { connectDevtoolsEnhancedTool, getCurrentPageTool } from './connection.js';
import {
  listConsoleMessagesTool,
  getConsoleMessageTool
} from './console.js';
import {
  diagnoseConnectionTool,
  checkEnvironmentTool,
  debugPageElementsTool,
  debugConnectionFlowTool
} from './diagnose.js';
import {
  clickTool,
  inputTextTool,
  getValueTool,
  setFormControlTool
} from './input.js';
import {
  navigateToTool,
  navigateBackTool,
  switchTabTool,
  reLaunchTool
} from './navigate.js';
import { getNetworkRequestsTool } from './network.js';
import { querySelectorTool, waitForTool } from './page.js';
import { screenshotTool } from './screenshot.js';
import { evaluateScript } from './script.js';
import { getPageSnapshotTool } from './snapshot.js';

/**
 * 所有可用工具的列表
 *
 * 工具精简说明（v0.4.0）：
 * - connect_devtools 已移除，使用 connect_devtools_enhanced（智能连接）
 * - assert_exists/assert_visible 已合并到 assert_state
 * - select_picker/toggle_switch/set_slider 已合并到 set_form_control
 * - get_page_info/redirect_to 已合并到 navigate_to（支持 redirect 参数）
 * - Console/Network 监听在连接时自动启动，无需手动 start/stop
 */
export const allTools: ToolDefinition[] = [
  // 连接管理工具（2个）
  connectDevtoolsEnhancedTool,      // 智能连接方式（推荐，自动启动Console/Network监听）
  getCurrentPageTool,

  // 页面快照工具（1个）
  getPageSnapshotTool,

  // 页面查询和等待工具（2个）
  querySelectorTool,
  waitForTool,

  // 输入交互工具（4个）
  clickTool,
  inputTextTool,
  getValueTool,
  setFormControlTool,               // 统一的表单控件操作（picker/switch/slider）

  // 断言验证工具（3个）
  assertTextTool,
  assertAttributeTool,
  assertStateTool,                  // 统一的状态断言（exists/visible/enabled/checked/focused）

  // 页面导航工具（4个）
  navigateToTool,                   // 支持 redirect 参数实现重定向
  navigateBackTool,
  switchTabTool,
  reLaunchTool,

  // 调试工具（2个）
  screenshotTool,
  evaluateScript,

  // Console监控工具（2个，两阶段查询模式）
  listConsoleMessagesTool,          // 列表查询（简短格式）
  getConsoleMessageTool,            // 详情查询（完整信息）

  // 网络监控工具（1个）
  getNetworkRequestsTool,           // 获取网络请求记录

  // 诊断工具（4个）
  diagnoseConnectionTool,
  checkEnvironmentTool,
  debugPageElementsTool,
  debugConnectionFlowTool,
];

/**
 * 按名称获取工具
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return allTools.find(tool => tool.name === name);
}

/**
 * 获取所有工具名称
 */
export function getAllToolNames(): string[] {
  return allTools.map(tool => tool.name);
}

// 重新导出工具定义相关类型和函数
export * from './ToolDefinition.js';