# 变更日志

## v0.7.0 (待发布)

软件版本为 `0.7.0`，工具结果格式版本为 `schemaVersion: "2.0"`；两者独立管理。

### 接口变更

- 连接参数改为 `project` / `wsEndpoint` / `browserUrl` / `discover` 判别式 target；project 固定按 launch → connect 尝试，有参重连完整替换旧请求。
- 元素 target 统一为 opaque ref 或作用域 locator path；页面快照使用 scopes/edges 描述页面和自定义组件边界。
- 工具结果统一为 `schemaVersion: "2.0"` 成功/失败信封，保留 partialData 和 observation。不兼容旧参数和 `schemaVersion: "1.0"` 结果格式。
- 工具数量及默认 profile 不变：minimal/core/full 分别为 10/20/31，资源仍为 2 个。

### 修复

- 网络采集透传原生任务、回调及 Mpx Promise/取消行为；日志采集避免重连重复，相同文本的连续输出分别保留。
- 启动和发现改用自动化协议与运行时就绪判断，完善自有连接清理。
- 修复命名 async 脚本执行、跨页过期 ref 错误码和默认诊断选择器。

### 验证与限制

- 补充运行时、协议及真实 MCP stdio 回归；测试类型检查覆盖 integration 目录。
- 独立工程在当前 DevTools 中仍存在运行时未就绪的环境阻塞，控件、tabBar 等场景尚未完成真实验收。详见 [回归报告](docs/detected-issues-regression.md)。版本号更新不代表已发布或集成测试全部通过。

---

## v0.6.0 (2026-08-07)

### ⚠️ 破坏性升级
- 运行时要求升级为 Node.js `>=22.0.0`，MCP SDK 固定为 `@modelcontextprotocol/sdk@1.30.0`。
- 移除旧的 `$` / `query_selector` 公共调用方式，统一使用 `find_elements`，并通过 `locator` 传入 `selector`、`testId`、`id`、`text` 或 opaque `ref`。
- `click`、`input_text`、`get_value`、`set_form_control` 和断言工具不再接收 `uid`，统一改为 `target`；可使用快照返回的 opaque `ref`，或稳定的 `testId`、`id`、`selector` target。
- `waitFor` 更名为 `wait_for`，元素等待条件由 `selector` 改为 `target`；纯延时仍使用 `delay`。
- `input_text` 现在必须声明 `mode`：`replace`、`append` 或 `clear`；`clear` 不需要 `text`，其余模式必须提供 `text`。
- `navigate_back` 的 `delta` 当前只接受 `1`；已安装的 automator 公共 API 不支持多级参数，旧行为会静默只返回一页。

### 🚀 三个优化方向
- **连接、页面状态与监听生命周期**：统一连接状态收敛和页面同步，明确 Console/Network 监听器所有权，降低重连后的陈旧页面、重复监听和拦截器泄漏风险。
- **快照、定位与输入**：移除快照固定等待并并发读取元数据；引入带 `pageRevision` 和指纹校验的 opaque `ref`、统一 locator/target，以及带回读校验的输入三模式。
- **MCP 结构化契约与真实门禁**：为工具补齐 `outputSchema` 和 `structuredContent`，统一稳定错误结构；真实集成测试默认 strict，环境或连接失败不再静默跳过。

### 🔄 0.6 调用示例
```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "testId",
      "value": "login-btn"
    }
  }
}
```

```json
{
  "name": "input_text",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": "input[placeholder='请输入用户名']"
    },
    "mode": "replace",
    "text": "alice"
  }
}
```

### ✅ 验证与基准
- 发布质量门禁覆盖类型检查、协议/工具单元测试、Lint 和构建；`npm run test:integration` 默认设置 `INTEGRATION_STRICT=true`，仅需显式选择 `test:integration:optional` 才允许环境不可用时跳过。
- 新增版本化 workload、JSONL 原始样本、nearest-rank p50/p95、Wilson 95% 成功率区间和严格 before/after 对比器；可先运行 `npm run bench:test` 验证基准基础设施。
- 真实连接、定位和监听指标必须在相同环境、workload 与 fixture 下分别执行 baseline/optimized 后生成；仓库不使用单元测试结果或手工数字冒充真实性能与成功率。

---

## v0.5.0

### ✨ 新特性
- 统一运行时 `serverInfo.name` 与 `serverInfo.version` 的来源，全部改为从 `package.json` 读取。
- 为 README badge、CHANGELOG、`package-lock.json` 和发布 tag 增加一致性闸门，避免版本漂移回归。

### ✅ 工程质量
- 扩展链接校验脚本，新增仓库展示版本与 lockfile 元数据校验。
- 补充协议层与脚本层自动化测试，确保对外暴露元数据与 `package.json` 保持一致。

---

## v0.3.2 (2025-09-30)

### ✨ 新特性
- **自动端口检测**: `connect_devtools_enhanced` 现在可以自动检测微信开发者工具运行的端口
  - 无需手动指定 `autoPort` 参数
  - 支持检测常用端口：9420, 9440, 9430, 9450, 9460
  - macOS/Linux 使用 `lsof` 命令作为备用检测方案
  - 详细的检测过程日志（verbose 模式）

### 🐛 Bug 修复
- 改进端口冲突错误处理，提供更友好的错误信息
- 修复 CLI 输出日志显示问题

### 📚 文档更新
- 更新 `CLAUDE.md` 展示自动端口检测用法
- 添加端口检测相关说明

### 🎯 使用示例

**新用法（推荐）**：
```typescript
// 无需指定端口，自动检测
connect_devtools_enhanced({
  projectPath: "/path/to/project",
  verbose: true
})
```

**旧用法（仍然支持）**：
```typescript
// 手动指定端口
connect_devtools_enhanced({
  projectPath: "/path/to/project",
  autoPort: 9440
})
```

---

## v0.3.1 (2025-09-30)

### 🐛 Bug 修复
- 修复 `waitFor` 工具 schema 不符合 MCP 协议规范的问题
  - 将 `z.union()` 改为标准的 `z.object()` 格式
  - 使用 `delay` 和 `selector` 可选参数代替联合类型
  - 通过 `refine()` 验证至少提供一个参数

### 📚 文档更新
- 更新 `docs/page-tools.md` 中 `waitFor` 工具的参数说明
- 更新 `CLAUDE.md` 中的使用示例
- 添加参数格式变更说明

### ✅ 验证
- 所有 32 个工具通过 MCP schema 验证
- 单元测试全部通过 (130/130)
- TypeScript 类型检查通过

### 🔄 迁移指南

**旧格式（不再支持）：**
```json
// 时间等待
{ "name": "waitFor", "arguments": 2000 }

// 选择器等待
{ "name": "waitFor", "arguments": ".button" }
```

**新格式（推荐）：**
```json
// 时间等待
{ "name": "waitFor", "arguments": { "delay": 2000 } }

// 选择器等待
{ "name": "waitFor", "arguments": { "selector": ".button" } }

// 复杂条件（保持兼容）
{
  "name": "waitFor",
  "arguments": {
    "selector": ".button",
    "text": "提交",
    "timeout": 5000
  }
}
```

---

## v0.3.0 (Previous)

### ✨ 新特性
- 新增 `connect_devtools_enhanced` 智能连接工具
- 支持三种连接模式: auto/launch/connect
- 两阶段连接，故障隔离和错误恢复
- 支持多账号切换 (--auto-account)
- 内置健康检查和连接监控
- 智能回退机制和重试逻辑

### 🔙 向后兼容
- 完全兼容原有 `connect_devtools` 工具
- 无需修改现有代码即可使用新功能

---

## v0.2.0

### ✨ 新特性
- 新增 `$` CSS选择器查询工具
- 新增 `waitFor` 条件等待工具
- 完全模块化架构重构
- 完整的文档体系
- 全面的测试覆盖

### 🐛 Bug 修复
- Console监听功能改进

---

## v0.1.0

### 🎯 初始版本
- 基础MCP服务器实现
- 微信开发者工具连接
- 页面快照和截图功能
- 基础点击操作
