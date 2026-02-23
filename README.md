# 微信开发者工具自动化 MCP 服务器

> 强大的微信小程序自动化测试解决方案，基于 Model Context Protocol 实现

[![Version](https://img.shields.io/badge/version-0.3.3-blue.svg)](https://github.com/yourusername/weixin-devtools-mcp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

## ✨ 核心特性

- 🚀 **31个专业工具（full profile）** - 覆盖连接、查询、交互、断言、导航、调试等完整测试场景
- 🤖 **智能连接** - 支持 auto/launch/connect 三种模式，自动端口检测，无需手动配置
- 🔍 **自动网络监控** - 连接时自动启动，实时拦截 wx.request/uploadFile/downloadFile
- ✅ **完整断言体系** - 3类断言工具（`assert_text`/`assert_attribute`/`assert_state`），覆盖文本、属性与状态校验
- 📸 **丰富调试能力** - 支持页面截图、Console 监听、网络请求追踪、诊断工具
- 🏗️ **模块化架构** - 基于 chrome-devtools-mcp 架构模式，易于扩展和维护
- 🧩 **可配置工具暴露** - 默认 core profile（20个工具），支持按类别开启 Console/Network/Debug
- 🧪 **全面测试覆盖** - 单元测试 + 集成测试，测试覆盖率 >80%

## 📦 安装

### 方式一：使用 npx（推荐）

**无需安装，直接使用**，npx 会自动下载并运行最新版本：

```bash
# 无需执行任何安装命令
# 直接在 Claude Desktop 配置中使用即可
```

### 方式二：全局安装

如果需要频繁使用或离线使用，可以全局安装：

```bash
npm install -g weixin-devtools-mcp
```

### 方式三：开发者安装（从源码）

如果需要修改源代码或参与开发：

```bash
# 克隆项目
git clone https://github.com/yourusername/weixin-devtools-mcp.git
cd weixin-devtools-mcp

# 安装依赖
npm install

# 构建项目
npm run build
```

## ⚙️ 配置

在 Claude Desktop 配置文件中添加 MCP 服务器：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

### 配置方式一：使用 npx（推荐）

**优点**：无需安装，自动使用最新版本

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

### 配置方式二：全局安装后使用

如果已全局安装，可以直接使用命令名：

```json
{
  "mcpServers": {
    "weixin-devtools-mcp": {
      "command": "weixin-devtools-mcp"
    }
  }
}
```

### 配置方式三：开发者本地路径

如果从源码安装，使用绝对路径：

```json
{
  "mcpServers": {
    "weixin-devtools-mcp": {
      "command": "/path/to/weixin-devtools-mcp/build/server.js"
    }
  }
}
```

### 工具 Profile 配置（v0.4+）

服务器支持按 profile 控制暴露工具，降低默认工具数量：

- `core`（默认）：20 个核心自动化工具
- `full`：31 个完整工具
- `minimal`：10 个最小工具

也支持按类别增减：

- `--enable-categories=console,network,debug`
- `--disable-categories=console,network,debug,core`

`npx` 配置示例（启用 full）：

```json
{
  "mcpServers": {
    "weixin-devtools-mcp": {
      "command": "npx",
      "args": ["-y", "weixin-devtools-mcp", "--tools-profile=full"]
    }
  }
}
```

本地二进制示例（在 core 基础上启用 network + debug）：

```json
{
  "mcpServers": {
    "weixin-devtools-mcp": {
      "command": "/path/to/weixin-devtools-mcp/build/server.js",
      "args": ["--enable-categories=network,debug"]
    }
  }
}
```

## 🚀 快速开始

### 第一个自动化测试

```typescript
// 1. 连接微信开发者工具（auto 策略）
connect_devtools({
  projectPath: "/path/to/your/miniprogram",
  strategy: "auto",
  verbose: true
})

// 2. 查找登录按钮
query_selector({ selector: "button.login-btn" })

// 3. 点击登录按钮
click({ uid: "button.login-btn" })

// 4. 等待登录成功
wait_for({ selector: ".welcome-message", timeout: 5000 })

// 5. 验证登录成功
assert_text({ uid: ".welcome-message", text: "欢迎回来" })

// 6. 获取页面截图（需在服务启动参数中启用 --enable-categories=debug）
screenshot({ path: "/tmp/login-success.png" })
```

## 🛠️ 功能概览

当前工具暴露采用 profile 机制：

- `core`（默认，20个）：
  - 连接/页面：`connect_devtools`、`reconnect_devtools`、`disconnect_devtools`、`get_connection_status`、`get_current_page`、`get_page_snapshot`、`query_selector`、`wait_for`
  - 交互：`click`、`input_text`、`get_value`、`set_form_control`
  - 断言：`assert_text`、`assert_attribute`、`assert_state`
  - 导航：`navigate_to`、`navigate_back`、`switch_tab`、`relaunch`
  - 脚本：`evaluate_script`
- 可选类别（默认关闭）：
  - `console`：`list_console_messages`、`get_console_message`
  - `network`：`list_network_requests`、`get_network_request`、`stop_network_monitoring`、`clear_network_requests`
  - `debug`：`screenshot`、`diagnose_connection`、`check_environment`、`debug_page_elements`、`debug_connection_flow`
- `full` profile：暴露全部 31 个工具。

## 💡 使用示例

### 示例 1：用户登录流程

```typescript
// 连接到开发者工具
connect_devtools({
  projectPath: "/path/to/miniprogram",
  strategy: "auto"
})

// 输入用户名
query_selector({ selector: "input#username" })
input_text({ uid: "input#username", text: "testuser" })

// 输入密码
query_selector({ selector: "input#password" })
input_text({ uid: "input#password", text: "password123" })

// 点击登录按钮
query_selector({ selector: "button.login" })
click({ uid: "button.login" })

// 等待登录成功
wait_for({ selector: ".welcome", timeout: 5000 })

// 验证欢迎消息
assert_text({ uid: ".welcome", textContains: "欢迎" })

// 检查网络请求（两阶段查询，需在服务启动参数中启用 --enable-categories=network）
const requests = list_network_requests({ urlPattern: "/api/login", successOnly: true })
get_network_request({ reqid: requests[0].reqid })
```

### 示例 2：表单填写和提交

```typescript
// 填写文本输入框
input_text({ uid: "input#name", text: "张三" })
input_text({ uid: "input#email", text: "zhangsan@example.com" })

// 选择下拉框
set_form_control({ uid: "picker#city", value: "北京" })

// 切换开关
set_form_control({ uid: "switch#agree", value: true })

// 设置滑块
set_form_control({ uid: "slider#age", value: 25 })

// 提交表单
click({ uid: "button.submit" })

// 等待提交成功
wait_for({ selector: ".success-toast", timeout: 3000 })

// 验证提交结果
assert_state({ uid: ".success-toast", visible: true })
assert_text({ uid: ".success-toast", text: "提交成功" })

// 截图保存结果
screenshot({ path: "/tmp/form-submit-success.png" })
```

## 📚 文档

- [📖 完整集成指南](docs/integration-guide.md) - 详细的安装和配置步骤
- [🔧 页面工具API](docs/page-tools.md) - 页面查询和等待工具详细文档
- [✨ 最佳实践](docs/best-practices.md) - 编写高质量自动化测试的建议
- [🧪 测试指南](docs/testing-guide.md) - 单元测试和集成测试说明
- [🏗️ 模块化架构](docs/modular-architecture.md) - 项目架构设计文档
- [📝 使用示例](docs/examples/) - 更多实际使用场景示例

## 🔧 开发指南

### 构建和测试

项目采用分层测试架构，分为协议测试、工具测试和集成测试：

```bash
# 开发模式（监听文件变化）
npm run watch

# 运行单元测试（协议 + 工具 + 工具类）
npm test

# 分类运行单元测试
npm run test:protocol      # 协议层测试
npm run test:tools         # 工具逻辑测试

# 运行集成测试（需要微信开发者工具）
npm run test:integration

# 推荐：复用现有 DevTools 会话，避免反复重启项目（默认）
INTEGRATION_CLEANUP_MODE=reuse npm run test:integration

# 如需强制隔离环境（CI 或排查端口脏状态）
INTEGRATION_CLEANUP_MODE=force npm run test:integration

# 禁用跨 suite 会话复用（仅调试时建议）
INTEGRATION_REUSE_SESSION=false npm run test:integration

# 如需每个 suite 结束后强制断开（默认不强制）
INTEGRATION_FORCE_DISCONNECT_AFTER_EACH_SUITE=true npm run test:integration

# 运行所有测试（单元 + 集成）
npm run test:all

# 生成测试覆盖率报告
npm run test:coverage

# 使用 MCP Inspector 调试
npm run inspector
```

### 添加新工具

1. 在 `src/tools/` 下创建或修改工具模块
2. 使用 `ToolDefinition` 框架定义工具
3. 在 `src/tools/index.ts` 中导出工具
4. 编写单元测试（`tests/tools/*.test.ts` 或 `tests/protocol/*.test.ts`）
5. 编写集成测试（`tests/integration/*.integration.test.ts`）
6. 更新文档

详细开发指南请参考 [CLAUDE.md](CLAUDE.md)

### 测试架构

项目采用三层测试架构（参考 chrome-devtools-mcp）：

- **协议层测试** (`tests/protocol/`) - 测试 MCP 服务器协议实现
- **工具逻辑测试** (`tests/tools/`) - 直接测试工具 handler，无需服务器
- **集成测试** (`tests/integration/`) - 端到端测试，需要真实环境

集成测试支持以下运行模式：
- `INTEGRATION_CLEANUP_MODE=reuse`：复用已有 DevTools 实例（默认）
- `INTEGRATION_CLEANUP_MODE=smart`：优雅关闭后重连
- `INTEGRATION_CLEANUP_MODE=force`：强制清理全部实例
- `INTEGRATION_REUSE_SESSION=true/false`：控制跨 suite 连接复用
- `INTEGRATION_FORCE_DISCONNECT_AFTER_EACH_SUITE=true/false`：控制每个 suite 结束后是否强制断连（默认 `false`）

## 📋 系统要求

- **Node.js** >= 16.0.0
- **微信开发者工具** 已安装并开启自动化功能
- **操作系统** macOS / Windows
- **Claude Desktop** 用于运行 MCP 服务器

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [Model Context Protocol](https://github.com/modelcontextprotocol) - MCP SDK
- [miniprogram-automator](https://www.npmjs.com/package/miniprogram-automator) - 微信小程序自动化 SDK
- [chrome-devtools-mcp](https://github.com/tinybirdco/chrome-devtools-mcp) - 架构参考

## 📞 联系方式

- 问题反馈：[GitHub Issues](https://github.com/yourusername/weixin-devtools-mcp/issues)
- 文档网站：[项目文档](docs/)

---

⭐ 如果这个项目对你有帮助，欢迎给个 Star！
