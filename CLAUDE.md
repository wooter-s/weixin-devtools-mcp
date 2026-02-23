# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

微信开发者工具自动化 MCP 服务器，提供31个工具用于微信小程序的自动化测试。基于 TypeScript 和 `miniprogram-automator` SDK 实现。

## Common Commands

### 开发和构建
```bash
# 构建项目（TypeScript → JavaScript + 设置可执行权限）
npm run build

# 开发模式（监听文件变化自动重新构建）
npm run watch

# 使用 MCP Inspector 调试
npm run inspector
```

### 测试

项目采用分层测试架构，参考 chrome-devtools-mcp 模式：

```
tests/
├── protocol/          # 协议层测试（需要MCP服务器）
│   ├── server.test.ts
│   └── index.test.ts
├── tools/            # 工具逻辑测试（直接调用handler，无需服务器）
│   ├── connection.test.ts
│   ├── console.test.ts
│   ├── navigate.test.ts
│   ├── network.test.ts
│   ├── page.test.ts
│   └── screenshot.test.ts
├── integration/      # 集成测试（需要真实环境）
│   ├── connect-devtools.integration.test.ts
│   ├── console.integration.test.ts
│   ├── enhanced-connection.integration.test.ts
│   ├── navigation.integration.test.ts
│   ├── network.integration.test.ts
│   └── network-auto-start.integration.test.ts
└── utils/            # 测试工具
    └── test-utils.ts
```

**测试命令**：

```bash
# 单元测试（协议 + 工具 + 工具类，224个测试）
npm test

# 分类运行单元测试
npm run test:protocol      # 协议层测试（19个）
npm run test:tools         # 工具逻辑测试（196个）

# 集成测试（需要微信开发者工具 + playground/wx/）
npm run test:integration   # 46个集成测试

# 所有测试（单元 + 集成）
npm run test:all

# 测试覆盖率
npm run test:coverage

# 监听模式
npm run test:watch                # 单元测试监听
npm run test:integration:watch    # 集成测试监听
```

**集成测试要求**：
- 微信开发者工具已安装并开启自动化功能
- 测试项目位于 `playground/wx/`
- 通过环境变量 `RUN_INTEGRATION_TESTS=true` 控制执行
- 不设置该环境变量时，集成测试会自动跳过

### 运行单个测试

```bash
# 协议测试
npx vitest tests/protocol/server.test.ts

# 工具测试
npx vitest tests/tools/console.test.ts

# 集成测试
RUN_INTEGRATION_TESTS=true npx vitest tests/integration/console.integration.test.ts

# 指定测试用例
npm test -- tests/tools/console.test.ts -t "测试用例名称"
```

## Architecture

### MCP 服务器入口点

**`build/server.js`**
- 源文件：`src/server.ts`
- 特点：完全模块化的工具系统，代码简洁
- 代码量：~245行
- 工具处理：所有31个工具统一通过 `allTools` 数组和 `ToolDefinition` 框架处理
- 配置：`npm install -g weixin-devtools-mcp` 默认使用此入口（package.json bin配置）

### 模块化工具系统

核心设计模式参考 chrome-devtools-mcp：

```
src/tools/
├── ToolDefinition.ts    # 核心框架
│   ├── defineTool()     # 工具定义辅助函数
│   ├── ToolContext      # 共享状态接口（5个字段）
│   ├── ToolHandler      # 工具处理器类型
│   └── ToolResponse     # 响应构建接口
│
├── index.ts             # 统一导出 allTools[] (31个工具)
│
└── [8个功能模块]
    ├── connection.ts    # 连接管理（3工具）
    ├── page.ts          # 页面查询（2工具：query_selector、wait_for）
    ├── snapshot.ts      # 页面快照（1工具）
    ├── input.ts         # 交互操作（7工具）
    ├── assert.ts        # 断言验证（5工具）
    ├── navigate.ts      # 页面导航（6工具）
    ├── console.ts       # Console监听（6工具：含两阶段查询）
    ├── network.ts       # 网络监控（5工具）
    ├── screenshot.ts    # 截图工具（1工具）
    └── diagnose.ts      # 诊断工具（4工具）
```

**工具定义模式**：
```typescript
// 每个工具都遵循相同的定义模式
export const exampleTool = defineTool({
  name: "tool_name",
  description: "工具描述",
  schema: z.object({ /* Zod schema */ }),
  handler: async (request, response, context) => {
    // 1. 从 context 获取共享状态
    // 2. 执行业务逻辑
    // 3. 通过 response.appendResponseLine() 返回结果
    // 4. 更新 context 状态（自动同步到全局）
  }
});
```

### 状态管理（ToolContext）

所有工具通过 `ToolContext` 共享5个关键状态：

1. **`miniProgram`**: MiniProgram实例（来自miniprogram-automator）
2. **`currentPage`**: 当前活动页面实例
3. **`elementMap`**: Map<uid, ElementMapInfo> - 元素UID到选择器的映射
4. **`consoleStorage`**: Console消息和异常存储（监听状态 + 消息数组）
5. **`networkStorage`**: 网络请求拦截数据（监听状态 + 请求数组 + 原始方法）

**关键设计**：
- 工具间通过 context 传递状态，无全局变量污染
- `elementMap` 支持 UID引用机制（`get_page_snapshot`生成UID，`click`等工具使用UID操作元素）
- 网络监控在 `connect_devtools_enhanced` 连接时自动启动

### UID 引用机制

支持跨工具的元素引用：

```typescript
// 1. 获取页面快照（生成所有元素的UID）
get_page_snapshot()
// 输出：{ uid: "button.submit", tagName: "button", ... }

// 2. 使用UID操作元素
click({ uid: "button.submit" })
input_text({ uid: "input#username", text: "user" })
assert_text({ uid: ".message", text: "成功" })
```

UID生成规则：优先使用 id > class > nth-child 构建稳定的CSS选择器路径。

## Technical Details

### 关键依赖
- `@modelcontextprotocol/sdk` (v0.6.0) - MCP协议实现
- `miniprogram-automator` (^0.12.1) - 微信小程序自动化SDK
- `zod` + `zod-to-json-schema` - 参数验证和schema转换
- `vitest` - 测试框架

### TypeScript配置
- Target: ES2022, Module: Node16 (ESM)
- `"type": "module"` in package.json
- 严格模式启用
- 输出目录：`./build`

### 构建过程
1. TypeScript编译（`tsc`）
2. 自动设置可执行权限（`build/server.js`）
3. prepare hook确保发布前构建

### MCP服务器配置

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "weixin-devtools-mcp": {
      "command": "npx",
      "args": ["-y", "weixin-devtools-mcp"]
    }
  }
}
```

或使用本地路径（开发者）：
```json
{
  "mcpServers": {
    "weixin-devtools-mcp": {
      "command": "/path/to/weixin-devtools-mcp/build/server.js"
    }
  }
}
```

## Development Notes

### 添加新工具

1. 在 `src/tools/` 下选择合适的功能模块（或创建新模块）
2. 使用 `defineTool()` 定义工具，包括：
   - name：工具名称（遵循 snake_case）
   - description：清晰的功能描述
   - schema：Zod schema定义参数
   - handler：实现业务逻辑
3. 在 `src/tools/index.ts` 的 `allTools` 数组中添加导出
4. 编写单元测试（`tests/*.test.ts`）
5. 编写集成测试（`tests/*.integration.test.ts`）
6. 更新文档

### 测试策略

项目采用三层测试架构（参考 chrome-devtools-mcp）：

**1. 协议层测试** (`tests/protocol/`)
- 测试 MCP 服务器的完整协议实现
- 需要启动真实的 MCP 服务器进程（StdioServerTransport）
- 验证工具列表、schema、请求-响应流程
- **19个测试**，覆盖 server.ts

**2. 工具逻辑测试** (`tests/tools/`)
- 直接调用工具 handler，无需启动 MCP 服务器
- 使用 mock 对象模拟 miniProgram、page等依赖
- 快速执行，专注于工具业务逻辑测试
- **196个测试**，覆盖所有31个工具的核心逻辑

**3. 集成测试** (`tests/integration/`)
- 测试真实环境下的端到端流程
- 需要运行的微信开发者工具和测试项目
- 通过 `RUN_INTEGRATION_TESTS=true` 环境变量控制
- **45个测试**，验证连接、导航、网络监控等完整流程

**测试覆盖率**：
- 目标：>80% 代码覆盖率
- 当前：224个单元测试 + 46个集成测试
- 运行 `npm run test:coverage` 查看详细报告

### 重要实现细节

1. **网络监控自动启动**：`connect_devtools` 连接成功后自动启动网络监听，无需手动调用启动工具
2. **导航API修复**（v0.3.3）：所有导航工具从 `await page.navigateTo()` 模式改为 `await miniProgram.navigateTo(page, ...)`
3. **错误处理**：所有工具都进行连接状态检查和元素存在性验证
4. **响应构建**：通过 `response.appendResponseLine()` 构建多行响应，支持 `attachImage()` 添加图片

### 版本说明

**代码版本**：v0.3.3（src/server.ts）
**package.json版本**：v0.0.1（发布版本号）

这个差异是正常的：代码版本用于跟踪功能迭代，package.json版本在发布时更新。

## Prerequisites

- **Node.js** >= 16.0.0
- **微信开发者工具**：已安装并开启以下设置
  - 设置 → 安全 → 服务端口：已开启
  - 设置 → 安全 → CLI/HTTP调用功能：已开启
- **测试项目**：集成测试需要 `playground/wx/` 目录下的有效小程序项目

## Quick Reference

### 工具分类概览

| 类别 | 数量 | 核心工具 |
|------|------|----------|
| 连接管理 | 3 | connect_devtools_enhanced（推荐） |
| 页面查询 | 2 | query_selector（选择器查找）、wait_for（条件等待） |
| 交互操作 | 7 | click, input_text, select_picker, toggle_switch |
| 断言验证 | 5 | assert_exists, assert_visible, assert_text |
| 页面导航 | 6 | navigate_to, navigate_back, switch_tab, relaunch |
| Console监控 | 6 | start/stop_console_monitoring, list_console_messages, get_console_message |
| 网络监控 | 4 | 自动启动，list_network_requests + get_network_request（两阶段查询） |
| 诊断工具 | 4 | diagnose_connection, check_environment, debug_page_elements, debug_connection_flow |

### 典型工作流

```typescript
// 1. 智能连接（自动端口检测）
connect_devtools_enhanced({ projectPath: "/path/to/project", mode: "auto" })

// 2. 页面查询和等待
query_selector({ selector: "button.login" })
wait_for({ selector: ".success", timeout: 5000 })

// 3. 交互操作
click({ uid: "button.login" })
input_text({ uid: "input#username", text: "user" })

// 4. 断言验证
assert_text({ uid: ".message", text: "成功" })
assert_visible({ uid: ".modal", visible: true })

// 5. Console 监控（两阶段查询优化）
start_console_monitoring()  // 开始监听 console 消息

// 第一阶段：列表查询（短格式，节省 token）
const messages = list_console_messages({
  types: ["error", "warn"],  // 过滤类型
  pageSize: 20               // 限制数量
})
// 返回：[{ msgid: 1, type: "error", preview: "Error: ..." }, ...]

// 第二阶段：获取详细信息（仅对感兴趣的消息）
const detail = get_console_message({ msgid: 1 })
// 返回完整信息：{ msgid, type, args: [...], timestamp, ... }

// 6. 网络监控和截图
screenshot({ path: "/tmp/result.png" })
const list = list_network_requests({ urlPattern: "/api/", successOnly: true })
get_network_request({ reqid: list[0].reqid })

// 7. 连接调试（当遇到连接问题时）
debug_connection_flow({
  projectPath: "/path/to/project",
  mode: "auto",
  dryRun: false,          // 设为 true 仅模拟，不实际连接
  captureSnapshot: true,  // 捕获每个步骤的状态
  verbose: true           // 显示详细调试信息
})
// 输出: 6个步骤的详细追踪、耗时统计、状态快照、诊断建议
```

### 连接问题调试工作流

当遇到连接失败时，使用以下调试流程：

```typescript
// 步骤 1: 使用 debug_connection_flow 深度调试
debug_connection_flow({
  projectPath: "/path/to/project",
  mode: "auto",
  verbose: true,
  captureSnapshot: true
})
// 查看输出中的每个步骤状态和诊断建议

// 步骤 2: 如果步骤 1 显示配置问题，运行环境诊断
diagnose_connection({
  projectPath: "/path/to/project",
  verbose: true
})
// 检查 CLI、端口、项目配置等

// 步骤 3: 检查系统环境
check_environment()
// 验证 Node.js 版本、微信开发者工具安装等

// 快速测试脚本
// node test-debug-connection-flow.js
```

## Documentation

完整文档位于 `docs/` 目录：
- `integration-guide.md` - 安装配置详细指南
- `page-tools.md` - query_selector 和 wait_for API文档
- `best-practices.md` - 测试脚本最佳实践
- `testing-guide.md` - 测试策略和覆盖率
- `examples/` - 登录、购物等场景示例
