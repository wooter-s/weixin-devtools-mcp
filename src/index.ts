#!/usr/bin/env node

/**
 * 微信开发者工具自动化 MCP 服务器
 * 提供微信小程序自动化测试功能，包括：
 * - 连接微信开发者工具
 * - 获取页面快照和元素信息
 * - 点击页面元素
 * - 其他自动化操作
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 导入微信小程序自动化 SDK
import automator from "miniprogram-automator";
import path from "path";

// 导入模块化工具系统
import {
  allTools,
  ToolDefinition,
  ToolContext,
  ToolRequest,
  ToolResponse,
  ConsoleStorage
} from './tools/index.js';

/**
 * 元素快照接口
 */
interface ElementSnapshot {
  uid: string;           // 元素唯一标识符（使用选择器路径）
  tagName: string;       // 标签名
  text?: string;         // 元素文本
  attributes?: Record<string, string>;   // 元素属性
  position?: {           // 元素位置信息
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/**
 * 页面快照接口
 */
interface PageSnapshot {
  path: string;          // 页面路径
  elements: ElementSnapshot[];  // 所有元素
}

/**
 * 全局状态管理
 */
const state = {
  miniProgram: null as any,  // MiniProgram 实例
  currentPage: null as any,  // 当前页面实例
  elementMap: new Map<string, string>(), // uid -> selector 映射
  consoleStorage: {
    consoleMessages: [],
    exceptionMessages: [],
    isMonitoring: false,
    startTime: null
  } as ConsoleStorage, // Console存储
};

/**
 * 模块化工具适配器基础设施
 */

// MockResponse 适配器类 - 适配模块化工具的响应接口
class MockResponse implements ToolResponse {
  private lines: string[] = [];
  private includeSnapshot = false;
  private attachedImages: Array<{ data: string; mimeType: string }> = [];

  appendResponseLine(line: string): void {
    this.lines.push(line);
  }

  setIncludeSnapshot(include: boolean): void {
    this.includeSnapshot = include;
  }

  attachImage(data: string, mimeType: string): void {
    this.attachedImages.push({ data, mimeType });
  }

  getLines(): string[] {
    return this.lines;
  }

  getAttachedImages(): Array<{ data: string; mimeType: string }> {
    return this.attachedImages;
  }
}

// 状态转换函数 - 将全局状态转换为ToolContext
function createToolContext(): ToolContext {
  return {
    miniProgram: state.miniProgram,
    currentPage: state.currentPage,
    elementMap: state.elementMap,
    consoleStorage: state.consoleStorage
  };
}

// 创建工具处理器映射
const toolHandlers = new Map<string, ToolDefinition>();
allTools.forEach(tool => {
  toolHandlers.set(tool.name, tool);
});

// 工具定义转换函数 - 将模块化工具转换为传统MCP格式
function convertToolDefinition(tool: ToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: true
    }
  };
}

/**
 * 创建 MCP 服务器，提供微信开发者工具自动化功能
 */
const server = new Server(
  {
    name: "weixin-devtools-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * 生成元素的唯一标识符 (uid)
 * 使用CSS选择器路径作为uid
 */
async function generateElementUid(element: any, index: number): Promise<string> {
  try {
    const tagName = element.tagName;
    const className = await element.attribute('class').catch(() => '');
    const id = await element.attribute('id').catch(() => '');

    let selector = tagName;
    if (id) {
      selector += `#${id}`;
    } else if (className) {
      selector += `.${className.split(' ')[0]}`;
    } else {
      selector += `:nth-child(${index + 1})`;
    }

    return selector;
  } catch (error) {
    return `${element.tagName || 'unknown'}:nth-child(${index + 1})`;
  }
}

/**
 * 递归获取页面所有元素的快照
 */
async function getElementsSnapshot(container: any, prefix: string = ''): Promise<ElementSnapshot[]> {
  const elements: ElementSnapshot[] = [];

  try {
    // 获取所有子元素
    const childElements = await container.$$('*').catch(() => []);

    for (let i = 0; i < childElements.length; i++) {
      const element = childElements[i];
      try {
        const uid = await generateElementUid(element, i);
        const fullUid = prefix ? `${prefix} ${uid}` : uid;

        const snapshot: ElementSnapshot = {
          uid: fullUid,
          tagName: element.tagName || 'unknown',
        };

        // 获取元素文本
        try {
          const text = await element.text();
          if (text && text.trim()) {
            snapshot.text = text.trim();
          }
        } catch (error) {
          // 忽略无法获取文本的元素
        }

        // 获取元素位置信息
        try {
          const [size, offset] = await Promise.all([
            element.size(),
            element.offset()
          ]);

          snapshot.position = {
            left: offset.left,
            top: offset.top,
            width: size.width,
            height: size.height
          };
        } catch (error) {
          // 忽略无法获取位置的元素
        }

        // 获取常用属性
        try {
          const attributes: Record<string, string> = {};
          const commonAttrs = ['class', 'id', 'data-*'];
          for (const attr of commonAttrs) {
            try {
              const value = await element.attribute(attr);
              if (value) {
                attributes[attr] = value;
              }
            } catch (error) {
              // 忽略不存在的属性
            }
          }

          if (Object.keys(attributes).length > 0) {
            snapshot.attributes = attributes;
          }
        } catch (error) {
          // 忽略属性获取错误
        }

        elements.push(snapshot);

        // 存储uid到selector的映射
        state.elementMap.set(fullUid, fullUid);

      } catch (error) {
        console.warn(`Error processing element ${i}:`, error);
      }
    }
  } catch (error) {
    console.warn('Error getting elements snapshot:', error);
  }

  return elements;
}

/**
 * 处理资源列表请求
 * 提供可用的资源，如连接状态和页面快照
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
  if (state.miniProgram && state.currentPage) {
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
      connected: !!state.miniProgram,
      hasCurrentPage: !!state.currentPage,
      pagePath: state.currentPage ? await state.currentPage.path : null
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
    if (!state.currentPage) {
      throw new Error("当前没有活动页面");
    }

    try {
      const elements = await getElementsSnapshot(state.currentPage);
      const snapshot: PageSnapshot = {
        path: await state.currentPage.path,
        elements
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
 * 提供可用的微信自动化工具（包含所有模块化工具）
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // 动态生成工具列表，包含所有29个工具
  const tools = allTools.map(tool => convertToolDefinition(tool));

  return { tools };
});

/**
 * 处理工具调用请求
 * 执行微信自动化相关操作
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "connect_devtools": {
      // 安全地提取参数，避免将undefined转换为字符串"undefined"
      const projectPathArg = request.params.arguments?.projectPath;
      if (!projectPathArg || typeof projectPathArg !== 'string') {
        throw new Error("项目路径是必需的，且必须是有效的字符串路径");
      }
      const projectPath = String(projectPathArg);

      const cliPath = request.params.arguments?.cliPath ? String(request.params.arguments.cliPath) : undefined;
      const port = request.params.arguments?.port ? Number(request.params.arguments.port) : undefined;

      try {
        // 处理@playground/wx格式的路径，转换为绝对文件系统路径
        let resolvedProjectPath = projectPath;
        if (projectPath.startsWith('@playground/')) {
          // 转换为相对路径，然后解析为绝对路径
          const relativePath = projectPath.replace('@playground/', 'playground/');
          resolvedProjectPath = path.resolve(process.cwd(), relativePath);
        } else if (!path.isAbsolute(projectPath)) {
          // 如果不是绝对路径，转换为绝对路径
          resolvedProjectPath = path.resolve(process.cwd(), projectPath);
        }

        const options: any = { projectPath: resolvedProjectPath };
        if (cliPath) options.cliPath = cliPath;
        if (port) options.port = port;

        // 启动并连接微信开发者工具
        state.miniProgram = await automator.launch(options);

        // 获取当前页面
        state.currentPage = await state.miniProgram.currentPage();

        return {
          content: [{
            type: "text",
            text: `成功连接到微信开发者工具\n项目路径: ${resolvedProjectPath}\n当前页面: ${state.currentPage ? await state.currentPage.path : '未知'}`
          }]
        };
      } catch (error) {
        throw new Error(`连接微信开发者工具失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    case "get_current_page": {
      if (!state.miniProgram) {
        throw new Error("请先连接到微信开发者工具");
      }

      try {
        state.currentPage = await state.miniProgram.currentPage();
        const pagePath = await state.currentPage.path;

        return {
          content: [{
            type: "text",
            text: `当前页面: ${pagePath}`
          }]
        };
      } catch (error) {
        throw new Error(`获取当前页面失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    case "get_page_snapshot": {
      if (!state.currentPage) {
        throw new Error("请先获取当前页面");
      }

      try {
        // 清空之前的元素映射
        state.elementMap.clear();

        // 获取页面快照
        const elements = await getElementsSnapshot(state.currentPage);
        const snapshot: PageSnapshot = {
          path: await state.currentPage.path,
          elements
        };

        return {
          content: [{
            type: "text",
            text: `页面快照获取成功\n页面路径: ${snapshot.path}\n元素数量: ${elements.length}\n\n${JSON.stringify(snapshot, null, 2)}`
          }]
        };
      } catch (error) {
        throw new Error(`获取页面快照失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    case "click": {
      const uid = String(request.params.arguments?.uid);
      const dblClick = Boolean(request.params.arguments?.dblClick);

      if (!uid) {
        throw new Error("元素uid是必需的");
      }

      if (!state.currentPage) {
        throw new Error("请先获取当前页面");
      }

      try {
        // 通过uid查找元素
        const selector = state.elementMap.get(uid);
        if (!selector) {
          throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
        }

        // 获取元素并点击
        const element = await state.currentPage.$(selector);
        if (!element) {
          throw new Error(`无法找到选择器为 ${selector} 的元素`);
        }

        // 执行点击操作
        await element.tap();

        // 如果是双击，再点击一次
        if (dblClick) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟
          await element.tap();
        }

        return {
          content: [{
            type: "text",
            text: `${dblClick ? '双击' : '点击'}元素成功\nUID: ${uid}\n选择器: ${selector}`
          }]
        };
      } catch (error) {
        throw new Error(`点击元素失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    case "screenshot": {
      if (!state.miniProgram) {
        throw new Error("请先连接到微信开发者工具");
      }

      const path = request.params.arguments?.path ? String(request.params.arguments.path) : undefined;

      try {
        // 确保页面状态稳定
        if (!state.currentPage) {
          state.currentPage = await state.miniProgram.currentPage();
        }

        // 确保页面完全加载和稳定
        try {
          if (state.currentPage && typeof state.currentPage.waitFor === 'function') {
            // 等待页面稳定，增加等待时间
            await state.currentPage.waitFor(1000);
          }
        } catch (waitError) {
          console.warn('页面等待失败，继续尝试截图:', waitError)
        }

        // 重试机制执行截图
        let result: string | undefined = undefined
        let lastError: Error | undefined

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            if (path) {
              // 保存到指定路径
              await state.miniProgram.screenshot({ path });
              result = path
              break
            } else {
              // 返回base64数据
              const base64Data = await state.miniProgram.screenshot();
              if (base64Data && typeof base64Data === 'string' && base64Data.length > 0) {
                result = base64Data
                break
              } else {
                throw new Error('截图返回空数据')
              }
            }
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))

            if (attempt < 3) {
              // 重试前等待更长时间，让页面稳定
              await new Promise(resolve => setTimeout(resolve, 1000 + attempt * 500))
            }
          }
        }

        if (!result && !path) {
          throw new Error(`截图失败，已重试3次。最后错误: ${lastError?.message || '未知错误'}`)
        }

        if (path) {
          return {
            content: [{
              type: "text",
              text: `截图已保存到: ${path}`
            }]
          };
        } else {
          const base64Data = result as string
          return {
            content: [{
              type: "text",
              text: `截图获取成功\nBase64数据长度: ${base64Data.length} 字符\n格式: ${base64Data.startsWith('data:image') ? 'data URL' : 'base64'}`
            }, {
              type: "image",
              data: base64Data,
              mimeType: "image/png"
            }]
          };
        }
      } catch (error) {
        throw new Error(`截图失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    default: {
      // 使用模块化工具处理器处理新工具
      const toolHandler = toolHandlers.get(request.params.name);
      if (toolHandler) {
        try {
          const toolContext = createToolContext();
          const mockResponse = new MockResponse();

          // 创建模拟的请求对象
          const toolRequest: ToolRequest = {
            params: request.params.arguments || {}
          };

          // 调用模块化工具处理器
          await toolHandler.handler(toolRequest, mockResponse, toolContext);

          // 更新全局状态（从ToolContext同步回来）
          state.miniProgram = toolContext.miniProgram;
          state.currentPage = toolContext.currentPage;
          state.elementMap = toolContext.elementMap;
          state.consoleStorage = toolContext.consoleStorage;

          // 返回响应
          const responseLines = mockResponse.getLines();
          if (responseLines.length === 0) {
            responseLines.push(`工具 ${request.params.name} 执行成功`);
          }

          return {
            content: [{
              type: "text",
              text: responseLines.join('\n')
            }]
          };
        } catch (error) {
          throw new Error(`工具 ${request.params.name} 执行失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      throw new Error(`未知的工具: ${request.params.name}`);
    }
  }
});


/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
