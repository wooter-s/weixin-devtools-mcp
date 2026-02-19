/**
 * 工具聚合导出
 * 参考 chrome-devtools-mcp 的 tools 聚合模式
 */

import type { ToolDefinition } from './ToolDefinition.js';
import {
  assertTextTool,
  assertAttributeTool,
  assertStateTool
} from './assert.js';
import {
  connectDevtoolsTool,
  disconnectDevtoolsTool,
  getConnectionStatusTool,
  getCurrentPageTool,
  reconnectDevtoolsTool
} from './connection.js';
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
import {
  getNetworkRequestsTool,
  stopNetworkMonitoringTool,
  clearNetworkRequestsTool
} from './network.js';
import { querySelectorTool, waitForTool } from './page.js';
import { screenshotTool } from './screenshot.js';
import { evaluateScript } from './script.js';
import { getPageSnapshotTool } from './snapshot.js';

const tools: ToolDefinition[] = [
  connectDevtoolsTool,
  reconnectDevtoolsTool,
  disconnectDevtoolsTool,
  getConnectionStatusTool,
  getCurrentPageTool,
  getPageSnapshotTool,
  querySelectorTool,
  waitForTool,
  clickTool,
  inputTextTool,
  getValueTool,
  setFormControlTool,
  assertTextTool,
  assertAttributeTool,
  assertStateTool,
  navigateToTool,
  navigateBackTool,
  switchTabTool,
  reLaunchTool,
  screenshotTool,
  evaluateScript,
  listConsoleMessagesTool,
  getConsoleMessageTool,
  getNetworkRequestsTool,
  stopNetworkMonitoringTool,
  clearNetworkRequestsTool,
  diagnoseConnectionTool,
  checkEnvironmentTool,
  debugPageElementsTool,
  debugConnectionFlowTool,
];

tools.sort((a, b) => a.name.localeCompare(b.name));

export const allTools: ToolDefinition[] = tools;

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
