# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

这是一个微信开发者工具自动化 MCP (Model Context Protocol) 服务器项目，基于 TypeScript 开发。项目提供微信小程序自动化测试功能。

## Architecture

- **Entry Points**:
  - `src/index.ts` - 原版 MCP 服务器实现（兼容性）
  - `src/server.ts` - 新版模块化 MCP 服务器实现
- **Tools Structure**: `src/tools/` - 模块化工具组织，基于 chrome-devtools-mcp 架构模式
  - `ToolDefinition.ts` - 工具定义框架和类型系统
  - `connection.ts` - 连接管理工具
  - `snapshot.ts` - 页面快照工具
  - `page.ts` - 页面查询和等待工具（$选择器和waitFor）
  - `input.ts` - 交互操作工具
  - `screenshot.ts` - 截图工具
  - `index.ts` - 统一导出
- **Build Output**: `build/` - TypeScript 编译输出
  - `index.js` - 原版服务器
  - `server.js` - 新版模块化服务器
- **Documentation**: `docs/` - 项目文档
  - `README.md` - 文档导航和快速开始
  - `integration-guide.md` - 完整集成指南（推荐新用户阅读）
  - `page-tools.md` - 页面查询和等待工具详细API文档
  - `best-practices.md` - 最佳实践和性能优化指南
  - `examples/` - 使用示例目录
    - `login-automation.md` - 登录流程自动化示例
    - `shopping-automation.md` - 电商购物流程示例
  - `weixin/devtools/小程序自动化/` - 微信开发者工具自动化官方文档
  - `modular-architecture.md` - 模块化架构文档
  - `console-monitoring.md` - Console监听功能文档
  - `testing-guide.md` - 测试指南
  - `chrome-devtools-mcp-architecture-analysis.md` - 架构参考分析

## Core Components

### 状态管理
- `miniProgram`: MiniProgram 实例，维护与开发者工具的连接
- `currentPage`: 当前活动页面实例
- `elementMap`: UID 到选择器的映射表
- `consoleStorage`: Console消息和异常存储
- `networkStorage`: 网络请求拦截和存储（自动启动）

### 资源 (Resources)
- `weixin://connection/status` - 微信开发者工具连接状态
- `weixin://page/snapshot` - 当前页面元素快照

### 工具 (Tools)

项目提供 **31个工具**，按功能分为8大类别：

#### 1. 连接管理（3个工具）
- `connect_devtools` - 传统连接方式（兼容性）
- `connect_devtools_enhanced` - 智能连接，支持auto/launch/connect三种模式，自动端口检测（推荐）
- `get_current_page` - 获取当前活动页面信息

#### 2. 页面查询和快照（3个工具）
- `$` - 通过CSS选择器查找元素，返回详细信息
- `waitFor` - 等待条件满足（时间/元素出现/元素消失/文本匹配）
- `get_page_snapshot` - 获取完整页面快照和所有元素UID

#### 3. 交互操作（7个工具）
- `click` - 点击元素（支持单击/双击）
- `input_text` - 向input/textarea输入文本
- `get_value` - 获取元素的值或文本内容
- `set_form_control` - 设置表单控件的值
- `select_picker` - 选择picker控件选项
- `toggle_switch` - 切换switch开关状态
- `set_slider` - 设置slider滑块值

#### 4. 断言验证（5个工具）
- `assert_exists` - 断言元素存在或不存在
- `assert_visible` - 断言元素可见或不可见
- `assert_text` - 断言元素文本内容（精确/包含/正则）
- `assert_attribute` - 断言元素属性值
- `assert_state` - 断言元素状态（选中/启用/聚焦/可见）

#### 5. 页面导航（6个工具）
- `navigate_to` - 跳转到指定页面
- `navigate_back` - 返回上一页
- `switch_tab` - 切换到指定Tab页
- `relaunch` - 重启小程序并跳转到指定页面
- `redirect_to` - 关闭当前页并跳转
- `get_page_info` - 获取当前页面详细信息

#### 6. 调试工具（4个工具）
- `screenshot` - 页面截图（返回base64或保存文件）
- `start_console_monitoring` - 开始监听console和exception
- `stop_console_monitoring` - 停止console监听
- `get_console` - 获取收集的console消息
- `clear_console` - 清空console缓存

#### 7. 网络监控（5个工具）
- `start_network_monitoring` - 开始监听网络请求（wx.request/uploadFile/downloadFile）
- `stop_network_monitoring` - 停止网络监听
- `get_network_requests` - 获取拦截的网络请求（支持过滤）
- `clear_network_requests` - 清空网络请求记录
- `diagnose_interceptor` - 诊断网络拦截器状态

#### 8. 诊断工具（3个工具）
- `diagnose_connection` - 诊断连接问题，检查配置和环境
- `check_environment` - 检查自动化环境配置
- `debug_page_elements` - 调试页面元素获取问题

## Common Commands

### 构建和开发
```bash
# 安装依赖（包括miniprogram-automator）
npm install

# 完整构建（包括设置可执行权限）
npm run build

# 开发模式，监听文件变化自动重新构建
npm run watch

# 准备发布（自动构建）
npm run prepare
```

### 测试
```bash
# 运行单元测试（不需要真实环境）
npm test

# 运行带覆盖率的测试
npm run test:coverage

# 运行集成测试（需要真实的微信开发者工具环境和测试项目）
npm run test:integration

# 运行所有测试（单元测试 + 集成测试）
npm run test:all

# 监听模式运行测试
npm run test:watch
npm run test:integration:watch
```

**测试策略**：
- **单元测试**（tests/*.test.ts）：测试工具逻辑，使用mock对象，无需真实环境
- **集成测试**（tests/*.integration.test.ts）：测试真实连接和操作，需要微信开发者工具
- 集成测试通过环境变量 `RUN_INTEGRATION_TESTS=true` 控制
- 测试覆盖率目标：>80% 代码覆盖率

### 调试
```bash
# 使用 MCP Inspector 调试
npm run inspector

# 开发模式监听
npm run watch
```

### 安装和配置
MCP 服务器需要在 Claude Desktop 中配置：
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

配置示例：

**原版服务器（兼容性）**：
```json
{
  "mcpServers": {
    "weixin-devtools-mcp": {
      "command": "/path/to/weixin-devtools-mcp/build/index.js"
    }
  }
}
```

**新版模块化服务器（推荐）**：
```json
{
  "mcpServers": {
    "weixin-devtools-mcp-v2": {
      "command": "/path/to/weixin-devtools-mcp/build/server.js"
    }
  }
}
```

## Usage Workflow

### 基本流程
1. **连接开发者工具**：使用 `connect_devtools_enhanced`（推荐）或 `connect_devtools`
2. **页面查询**：使用 `$` 查找元素或 `get_page_snapshot` 获取完整快照
3. **等待状态**：使用 `waitFor` 等待页面加载或状态变化
4. **交互操作**：使用 `click`、`input_text` 等工具操作元素
5. **验证结果**：使用 `assert_*` 系列工具验证操作结果
6. **调试支持**：使用 `screenshot`、`get_console`、`get_network_requests` 等工具调试

### 快速示例

```typescript
// 1. 智能连接（自动检测端口）
connect_devtools_enhanced({
  projectPath: "/path/to/miniprogram",
  mode: "auto",
  verbose: true
})

// 2. 查找并点击按钮
$({ selector: "button.submit" })
click({ uid: "button.submit" })

// 3. 等待并验证结果
waitFor({ selector: ".success-message", timeout: 5000 })
assert_text({ uid: ".success-message", text: "操作成功" })

// 4. 调试支持
screenshot({ path: "/tmp/result.png" })
get_console() // 查看日志
get_network_requests() // 查看网络请求
```

详细使用示例请参考：
- [登录流程自动化](docs/examples/login-automation.md)
- [电商购物流程](docs/examples/shopping-automation.md)
- [完整集成指南](docs/integration-guide.md)

### 网络监控特性

网络监控在连接时**自动启动**，无需手动调用 `start_network_monitoring`：
- 自动拦截 `wx.request`、`wx.uploadFile`、`wx.downloadFile`
- 记录请求参数、响应数据、状态码、耗时等
- 支持按类型、URL、状态过滤
- 使用 `get_network_requests()` 获取记录
- 使用 `diagnose_interceptor()` 诊断拦截器状态

## Technical Details

### 依赖库
- `@modelcontextprotocol/sdk`: MCP 协议实现
- `miniprogram-automator`: 微信小程序自动化 SDK

### TypeScript 配置
- Target: ES2022
- Module: Node16 (ESM)
- 严格模式启用
- 输出目录: `./build`

### 数据结构
- `ElementSnapshot`: 元素快照信息（UID、标签名、文本、位置等）
- `PageSnapshot`: 页面快照信息（路径、所有元素）
- Global State: 连接状态、当前页面、元素映射

### UID 生成策略
- 基于 CSS 选择器路径生成稳定的元素标识符
- 优先使用 ID > 类名 > nth-child 选择器
- 支持嵌套元素的完整路径

### 错误处理
- 连接状态检查
- 元素存在性验证
- 详细的错误信息反馈

## Development Notes

### 架构设计
- **双入口点**：`build/index.js`（原版）和 `build/server.js`（模块化版本）
- **模块化工具系统**：基于 chrome-devtools-mcp 架构模式，每个工具独立模块
- **全局状态管理**：使用 `ToolContext` 在工具间共享状态
- **自动功能启动**：网络监控在连接时自动启动，无需手动调用

### 开发实践
- 构建过程会自动为 `build/index.js` 和 `build/server.js` 设置可执行权限
- MCP 服务器通过 stdio 通信，调试时建议使用 MCP Inspector
- 项目使用 ESM 模块系统 (`"type": "module"`)
- 所有 MCP 请求处理器都使用异步函数实现
- 需要微信开发者工具开启自动化功能和 CLI/HTTP 调用权限

### 添加新工具
1. 在 `src/tools/` 下创建或修改工具模块
2. 使用 `ToolDefinition` 框架定义工具
3. 在 `src/tools/index.ts` 中导出工具
4. 编写单元测试（`tests/*.test.ts`）
5. 编写集成测试（`tests/*.integration.test.ts`）
6. 更新此文档的工具列表

### 测试开发
- **单元测试**：使用 mock 对象，专注于工具逻辑测试
- **集成测试**：需要真实环境，使用 `RUN_INTEGRATION_TESTS=true` 标志
- **测试项目**：集成测试使用 `playground/wx/` 作为测试小程序
- 运行集成测试前确保微信开发者工具已打开并加载测试项目

## Prerequisites

- 微信开发者工具（已安装并开启自动化功能）
- Node.js 环境 (>= 16.0.0)
- 有效的小程序项目路径
- 开发者工具 CLI 权限设置

## Version History

### v0.3.3 (Current) - 导航功能修复
- 🐛 **关键修复**: 修复所有导航 API 调用错误
  - 修复 `navigateTo`、`redirectTo`、`reLaunch`、`switchTab`、`navigateBack`
  - 修复从 v0.1.0 以来导致导航功能完全无法使用的根本问题
- ✅ 所有 130 个单元测试通过
- 🧪 新增导航功能集成测试套件
- 📝 添加详细的修复文档 ([docs/NAVIGATION_FIX.md](docs/NAVIGATION_FIX.md))
- 🎯 轻微性能改善（减少不必要的对象创建）

### v0.3.2 - 自动端口检测
- 🔍 新增自动端口检测功能
- 🔌 无需手动指定端口即可智能连接
- 📊 支持常用端口扫描和系统命令检测
- 📝 完整的端口检测文档

### v0.3.0 - 智能连接优化
- ✨ 新增 `connect_devtools_enhanced` 智能连接工具
- 🤖 支持三种连接模式: auto/launch/connect
- 🛡️ 两阶段连接，故障隔离和错误恢复
- 👥 支持多账号切换 (--auto-account)
- 🔍 内置健康检查和连接监控
- 🔄 智能回退机制和重试逻辑
- 📊 详细的性能指标和诊断信息
- 🔙 完全向后兼容，无缝升级

### v0.2.0
- ✨ 新增 `$` CSS选择器查询工具
- ✨ 新增 `waitFor` 条件等待工具
- 🏗️ 完全模块化架构重构
- 📚 完整的文档体系
- 🧪 全面的测试覆盖
- 🐛 Console监听功能改进

### v0.1.0
- 🎯 基础MCP服务器实现
- 🔌 微信开发者工具连接
- 📸 页面快照和截图功能
- 🖱️ 基础点击操作

## Quick Start Guide

新用户推荐阅读顺序：
1. [docs/integration-guide.md](docs/integration-guide.md) - 完整安装和配置指南
2. [docs/page-tools.md](docs/page-tools.md) - 页面查询和等待工具API
3. [docs/examples/](docs/examples/) - 通过实例学习使用
4. [docs/best-practices.md](docs/best-practices.md) - 编写高质量测试脚本
5. [docs/testing-guide.md](docs/testing-guide.md) - 测试策略和覆盖率