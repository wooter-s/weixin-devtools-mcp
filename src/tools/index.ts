/**
 * 工具模块导出
 * 统一导出所有工具定义
 */

import type { ToolDefinition } from './ToolDefinition.js';

// 导入各个模块的工具
import {
  assertExistsTool,
  assertVisibleTool,
  assertTextTool,
  assertAttributeTool,
  assertStateTool
} from './assert.js';
import { connectDevtoolsTool, connectDevtoolsEnhancedTool, getCurrentPageTool } from './connection.js';
import {
  startConsoleMonitoringTool,
  stopConsoleMonitoringTool,
  listConsoleMessagesTool,
  getConsoleMessageTool,
  getConsoleTool,
  clearConsoleTool
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
  setFormControlTool,
  selectPickerTool,
  toggleSwitchTool,
  setSliderTool
} from './input.js';
import {
  navigateToTool,
  navigateBackTool,
  switchTabTool,
  reLaunchTool,
  getPageInfoTool,
  redirectToTool
} from './navigate.js';
import {
  startNetworkMonitoringTool,
  stopNetworkMonitoringTool,
  getNetworkRequestsTool,
  clearNetworkRequestsTool,
  diagnoseInterceptorTool
} from './network.js';
import { querySelectorTool, waitForTool } from './page.js';
import { screenshotTool } from './screenshot.js';
import { evaluateScript } from './script.js';
import { getPageSnapshotTool } from './snapshot.js';

/**
 * 所有可用工具的列表
 */
export const allTools: ToolDefinition[] = [
  // 连接管理工具
  connectDevtoolsTool,              // 传统连接方式（兼容性）
  connectDevtoolsEnhancedTool,      // 智能连接方式（推荐）
  getCurrentPageTool,

  // 页面快照工具
  getPageSnapshotTool,

  // 页面查询和等待工具
  querySelectorTool,
  waitForTool,

  // 输入交互工具
  clickTool,
  inputTextTool,
  getValueTool,
  setFormControlTool,
  selectPickerTool,
  toggleSwitchTool,
  setSliderTool,

  // 断言验证工具
  assertExistsTool,
  assertVisibleTool,
  assertTextTool,
  assertAttributeTool,
  assertStateTool,

  // 页面导航工具
  navigateToTool,
  navigateBackTool,
  switchTabTool,
  reLaunchTool,
  getPageInfoTool,
  redirectToTool,

  // 调试工具
  screenshotTool,
  evaluateScript,
  startConsoleMonitoringTool,
  stopConsoleMonitoringTool,
  listConsoleMessagesTool,
  getConsoleMessageTool,
  getConsoleTool,
  clearConsoleTool,

  // 网络监控工具
  startNetworkMonitoringTool,
  stopNetworkMonitoringTool,
  getNetworkRequestsTool,
  clearNetworkRequestsTool,
  diagnoseInterceptorTool,

  // 诊断工具
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