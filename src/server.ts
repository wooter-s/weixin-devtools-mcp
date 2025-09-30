#!/usr/bin/env node

/**
 * 微信开发者工具自动化 MCP 服务器 (模块化版本)
 * 基于 chrome-devtools-mcp 架构模式重构
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  allTools,
  ToolContext,
  ToolRequest,
  SimpleToolResponse,
  ToolDefinition
} from './tools/index.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * 全局上下文状态
 */
const globalContext: ToolContext = {
  miniProgram: null,
  currentPage: null,
  elementMap: new Map<string, string>(),
  consoleStorage: {
    consoleMessages: [],
    exceptionMessages: [],
    isMonitoring: false,
    startTime: null,
  },
};

/**
 * 创建 MCP 服务器
 */
const server = new Server(
  {
    name: "weixin-devtools-mcp",
    version: "0.3.3",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * 工具处理器映射
 */
const toolHandlers = new Map<string, ToolDefinition>();

/**
 * 注册工具到 MCP 服务器
 */
function registerTool(tool: ToolDefinition): void {
  toolHandlers.set(tool.name, tool);
}

/**
 * 处理资源列表请求
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = [];

  // 连接状态资源
  resources.push({
    uri: "weixin://connection/status",
    mimeType: "application/json",
    name: "连接状态",
    description: "微信开发者工具连接状态"
  });

  // 如果已连接，提供页面快照资源
  if (globalContext.miniProgram && globalContext.currentPage) {
    resources.push({
      uri: "weixin://page/snapshot",
      mimeType: "application/json",
      name: "页面快照",
      description: "当前页面的元素快照"
    });
  }

  return { resources };
});

/**
 * 处理资源读取请求
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);

  if (url.pathname === "/connection/status") {
    const status = {
      connected: !!globalContext.miniProgram,
      hasCurrentPage: !!globalContext.currentPage,
      pagePath: globalContext.currentPage ? await globalContext.currentPage.path : null,
      elementCount: globalContext.elementMap.size
    };

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(status, null, 2)
      }]
    };
  }

  if (url.pathname === "/page/snapshot") {
    if (!globalContext.currentPage) {
      throw new Error("当前没有活动页面");
    }

    try {
      // 这里可以实现获取页面快照的逻辑
      const snapshot = {
        path: await globalContext.currentPage.path,
        elementCount: globalContext.elementMap.size,
        timestamp: new Date().toISOString()
      };

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(snapshot, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`获取页面快照失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`未知的资源: ${request.params.uri}`);
});

/**
 * 处理工具列表请求
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = allTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.schema, {
      strictUnions: true
    }),
    annotations: tool.annotations
  }));

  return { tools };
});

/**
 * 处理工具调用请求
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const tool = toolHandlers.get(toolName);

  if (!tool) {
    throw new Error(`未知的工具: ${toolName}`);
  }

  try {
    // 验证参数
    const validatedParams = tool.schema.parse(request.params.arguments || {});

    // 创建工具请求和响应对象
    const toolRequest: ToolRequest = { params: validatedParams };
    const toolResponse = new SimpleToolResponse();

    // 执行工具处理器
    await tool.handler(toolRequest, toolResponse, globalContext);

    // 构建响应内容
    const content: any[] = [];

    // 添加文本响应
    const responseText = toolResponse.getResponseText();
    if (responseText) {
      content.push({
        type: "text",
        text: responseText
      });
    }

    // 添加附加的图片
    const attachedImages = toolResponse.getAttachedImages();
    for (const image of attachedImages) {
      content.push({
        type: "image",
        data: image.data,
        mimeType: image.mimeType
      });
    }

    return { content };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: `工具执行失败: ${errorMessage}`
      }],
      isError: true
    };
  }
});

/**
 * 注册所有工具
 */
for (const tool of allTools) {
  registerTool(tool);
}

/**
 * 启动服务器
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});