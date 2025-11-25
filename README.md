# 微信开发者工具自动化 MCP 服务器

> 强大的微信小程序自动化测试解决方案，基于 Model Context Protocol 实现

[![Version](https://img.shields.io/badge/version-0.3.3-blue.svg)](https://github.com/yourusername/weixin-devtools-mcp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

## ✨ 核心特性

- 🚀 **41个专业工具** - 覆盖连接、查询、交互、断言、导航、调试等完整测试场景
- 🤖 **智能连接** - 支持 auto/launch/connect 三种模式，自动端口检测，无需手动配置
- 🔍 **自动网络监控** - 连接时自动启动，实时拦截 wx.request/uploadFile/downloadFile
- ✅ **完整断言体系** - 5类断言工具，验证元素存在、可见性、文本、属性、状态
- 📸 **丰富调试能力** - 支持页面截图、Console 监听、网络请求追踪、诊断工具
- 🏗️ **模块化架构** - 基于 chrome-devtools-mcp 架构模式，易于扩展和维护
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

## 🚀 快速开始

### 第一个自动化测试

```typescript
// 1. 智能连接到微信开发者工具（自动检测端口）
connect_devtools_enhanced({
  projectPath: "/path/to/your/miniprogram",
  mode: "auto",
  verbose: true
})

// 2. 查找登录按钮
$({ selector: "button.login-btn" })

// 3. 点击登录按钮
click({ uid: "button.login-btn" })

// 4. 等待登录成功
waitFor({ selector: ".welcome-message", timeout: 5000 })

// 5. 验证登录成功
assert_text({ uid: ".welcome-message", text: "欢迎回来" })

// 6. 获取页面截图
screenshot({ path: "/tmp/login-success.png" })
```

## 🛠️ 功能概览

项目提供 **41个工具**，分为 8 大类别：

| 类别 | 工具数 | 主要功能 |
|------|--------|----------|
| **连接管理** | 3个 | 智能连接、传统连接、获取当前页面 |
| **页面查询** | 3个 | CSS选择器查找、条件等待、页面快照 |
| **交互操作** | 7个 | 点击、输入、获取值、表单控件、选择器、开关、滑块 |
| **断言验证** | 5个 | 存在性、可见性、文本、属性、状态断言 |
| **页面导航** | 6个 | 跳转、返回、Tab切换、重启、重定向、页面信息 |
| **Console监控** | 6个 | 监听控制、两阶段查询（list/get详情）、日志获取、清空 |
| **网络监控** | 5个 | 请求拦截、监听控制、请求获取、清空记录、拦截器诊断 |
| **诊断工具** | 4个 | 连接诊断、连接流程调试、环境检查、元素调试 |

### 工具详细列表

<details>
<summary><b>连接管理（3个工具）</b></summary>

- `connect_devtools` - 传统连接方式（兼容性）
- `connect_devtools_enhanced` - 智能连接，支持三种模式，自动端口检测（推荐）
- `get_current_page` - 获取当前活动页面信息

</details>

<details>
<summary><b>页面查询和快照（3个工具）</b></summary>

- `$` - 通过CSS选择器查找元素，返回详细信息
- `waitFor` - 等待条件满足（时间/元素出现/消失/文本匹配）
- `get_page_snapshot` - 获取完整页面快照和所有元素UID

</details>

<details>
<summary><b>交互操作（7个工具）</b></summary>

- `click` - 点击元素（支持单击/双击）
- `input_text` - 向input/textarea输入文本
- `get_value` - 获取元素的值或文本内容
- `set_form_control` - 设置表单控件的值
- `select_picker` - 选择picker控件选项
- `toggle_switch` - 切换switch开关状态
- `set_slider` - 设置slider滑块值

</details>

<details>
<summary><b>断言验证（5个工具）</b></summary>

- `assert_exists` - 断言元素存在或不存在
- `assert_visible` - 断言元素可见或不可见
- `assert_text` - 断言元素文本内容（精确/包含/正则）
- `assert_attribute` - 断言元素属性值
- `assert_state` - 断言元素状态（选中/启用/聚焦/可见）

</details>

<details>
<summary><b>页面导航（6个工具）</b></summary>

- `navigate_to` - 跳转到指定页面
- `navigate_back` - 返回上一页
- `switch_tab` - 切换到指定Tab页
- `relaunch` - 重启小程序并跳转到指定页面
- `redirect_to` - 关闭当前页并跳转
- `get_page_info` - 获取当前页面详细信息

</details>

<details>
<summary><b>Console监控（6个工具）</b></summary>

- `start_console_monitoring` - 开始监听console和exception
- `stop_console_monitoring` - 停止console监听
- `list_console_messages` - 列表查询console消息（短格式，token优化）
- `get_console_message` - 根据msgid获取消息详情（完整格式）
- `get_console` - 获取收集的console消息（传统方式）
- `clear_console` - 清空console缓存

</details>

<details>
<summary><b>调试工具（1个工具）</b></summary>

- `screenshot` - 页面截图（返回base64或保存文件）

</details>

<details>
<summary><b>网络监控（5个工具）</b></summary>

- `start_network_monitoring` - 开始监听网络请求
- `stop_network_monitoring` - 停止网络监听
- `get_network_requests` - 获取拦截的网络请求（支持过滤）
- `clear_network_requests` - 清空网络请求记录
- `diagnose_interceptor` - 诊断网络拦截器状态

</details>

<details>
<summary><b>诊断工具（3个工具）</b></summary>

- `diagnose_connection` - 诊断连接问题，检查配置和环境
- `check_environment` - 检查自动化环境配置
- `debug_page_elements` - 调试页面元素获取问题

</details>

## 💡 使用示例

### 示例 1：用户登录流程

```typescript
// 连接到开发者工具
connect_devtools_enhanced({
  projectPath: "/path/to/miniprogram",
  mode: "auto"
})

// 输入用户名
$({ selector: "input#username" })
input_text({ uid: "input#username", text: "testuser" })

// 输入密码
$({ selector: "input#password" })
input_text({ uid: "input#password", text: "password123" })

// 点击登录按钮
$({ selector: "button.login" })
click({ uid: "button.login" })

// 等待登录成功
waitFor({ selector: ".welcome", timeout: 5000 })

// 验证欢迎消息
assert_text({ uid: ".welcome", textContains: "欢迎" })

// 检查网络请求
get_network_requests({ urlPattern: "/api/login", successOnly: true })
```

### 示例 2：表单填写和提交

```typescript
// 填写文本输入框
input_text({ uid: "input#name", text: "张三" })
input_text({ uid: "input#email", text: "zhangsan@example.com" })

// 选择下拉框
select_picker({ uid: "picker#city", value: "北京" })

// 切换开关
toggle_switch({ uid: "switch#agree", checked: true })

// 设置滑块
set_slider({ uid: "slider#age", value: 25 })

// 提交表单
click({ uid: "button.submit" })

// 等待提交成功
waitFor({ selector: ".success-toast", timeout: 3000 })

// 验证提交结果
assert_visible({ uid: ".success-toast", visible: true })
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

# 运行单元测试（224个测试：协议 + 工具 + 工具类）
npm test

# 分类运行单元测试
npm run test:protocol      # 协议层测试（19个）
npm run test:tools         # 工具逻辑测试（196个）

# 运行集成测试（需要微信开发者工具，46个测试）
npm run test:integration

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
