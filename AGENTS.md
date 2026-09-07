# weixin-devtools-mcp AGENTS 指南

## 1. 文档定位与事实源
- 本文档用于指导在本仓库中进行增量开发、调试、测试和发布。
- 架构与行为以 `src/` 下的实现为唯一事实源，尤其是：
  - `src/server.ts`
  - `src/protocol/lean-server.ts`
  - `src/protocol/tool-descriptor-manifest.ts`
  - `src/tools/index.ts`
  - `src/MiniProgramContext.ts`
  - `src/tools.ts`
- `docs/`、`claudedocs/`、`README.md` 可作为参考，但当与代码冲突时，必须以代码为准并同步修正文档。

## 2. 项目架构总览

### 2.1 分层结构
- 协议入口层：`src/server.ts`
  - 基于官方 SDK `Protocol` 创建轻量 `LeanServer`
  - 注册 `ListTools`、`CallTool`、`ListResources`、`ReadResource` handlers
  - `ListTools` 从构建期静态 manifest 返回 descriptor；工具实现与结果运行时仅在首次有效 `CallTool` 时加载
- 工具编排层：`src/tools/*.ts` + `src/tools/index.ts`
  - 每个工具模块按功能域拆分
  - 统一通过 `defineTool` 定义名称、schema、handler
- 运行时状态层：`src/MiniProgramContext.ts`
  - 管理 `miniProgram`、`currentPage`、`elementMap`
  - 管理 console/network collector 生命周期
  - 通过 page-state 队列原子管理 DOM epoch、revision、快照、ref registry 和状态摘要
  - 查询、ref 注册、元素 I/O、导航与最终 observation 共用页面状态事务
- 核心能力层：`src/tools.ts`
  - 封装连接、导航、断言、交互等可复用能力
  - 供工具层调用（包括连接增强逻辑、重试与健康检查）
- 数据收集层：`src/collectors/*`
  - `ConsoleCollector` 和 `NetworkCollector` 负责会话化数据采集与查询
  - `console-runtime.ts` / `network-runtime.ts` 是通过 evaluate 序列化的自包含运行时函数，不得引用宿主模块变量
  - 网络采集禁止使用 SDK `mockWxMethod`；日志采集禁止订阅 SDK console 事件触发 `App.enableLog`
  - 安装与恢复必须核对 owner token 和包装函数身份；日志读取、导航分段和异步停止前必须同步远端队列

### 2.2 目录职责
- `src/`：生产代码（TypeScript）
- `tests/protocol/`：MCP 协议层测试
- `tests/tools/`：工具行为测试
- `tests/utils/`：测试工具与辅助方法
- `tests/integration/`：真实微信开发者工具环境集成测试
- `scripts/`：构建辅助脚本（如可执行权限设置）
- `build/`：编译产物，禁止手改
- `playground/`：本地实验样例

## 3. 运行时核心流程

### 3.1 启动流程
1. 通过 `build/server.js` 启动 MCP 服务（stdio transport）。
2. 初始化全局 `MiniProgramContext`。
3. 读取 `build/protocol/tool-descriptors.generated.json`，按 profile 筛选静态 descriptor。
4. 保持工具实现、automator 和结果运行时未加载，直到首次有效 `CallTool`。

### 3.2 工具调用流程
1. 客户端发起 `CallTool`。
2. `src/server.ts` 先用静态 descriptor 判定工具是否存在、是否被 profile 禁用。
3. 首次有效调用懒加载 `allTools` 和结果运行时，并校验实现与 manifest 一致。
4. 使用 zod schema 校验输入参数，执行 handler 并写入 `SimpleToolResponse`。
5. 成功与失败均返回 `schemaVersion: "2.0"` 全字段结构化信封；handler 已产生的文本、图片、partial data 和已提交 observation 在失败时继续保留，异常统一标记 `isError: true`。

### 3.3 资源读取流程
- `weixin://connection/status`：返回连接状态、最终工具 profile 和 console/network 监听状态机。
- `weixin://page/snapshot`：始终出现在资源列表中；读取时要求已连接且有当前页面，并返回完整 `scopes`/`edges` 作用域图。

### 3.4 连接与监控流程
- 连接入口工具：`connect_devtools`，请求使用 `project` / `wsEndpoint` / `browserUrl` / `discover` 判别式 target；`project` 固定按 `launch → connect` 尝试。
- 状态工具：`get_connection_status`。
- 生命周期工具：`reconnect_devtools`、`disconnect_devtools`；无参重连完整复用上次请求，有参重连执行完整替换而非字段合并。
- Console/Network 监听策略只从最终启用的工具 category 派生；未启用类别保持 `disabled`，启用后由连接生命周期统一启动并公开 `idle/running/stopped/failed` 状态。
- 每次连接返回完整 attempts 历史；`project` 不执行 discover 等隐式回退。
- 项目启动由请求级 `ProjectStartup` 管理 CLI 与端口所有权，SDK 只在协议、SDKVersion 和页面就绪后连接。探测不得以 HTTP 200 或 TCP 占用替代自动化协议判断。
- Context 仅保留最多 10,000 个已失效 ref token，不保留其 Element；同连接内返回 STALE_ELEMENT，断开时清空。仍有效的同页稳定地址保持重定位能力。

## 4. 当前工具暴露策略（以 `src/tools/tools.ts` 与 `src/config/tool-profile.ts` 为准）
- 总工具实现数：31（full profile）
- 默认暴露：core profile（20）
- 可选类别：`console` / `network` / `debug`
- 最小集合：minimal profile（10）

### 4.1 core 默认工具（20）
- `connect_devtools`
- `reconnect_devtools`
- `disconnect_devtools`
- `get_connection_status`
- `get_current_page`
- `get_page_snapshot`
- `find_elements`
- `wait_for`
- `click`
- `input_text`
- `get_value`
- `set_form_control`
- `assert_text`
- `assert_attribute`
- `assert_state`
- `navigate_to`
- `navigate_back`
- `switch_tab`
- `relaunch`
- `evaluate_script`

### 4.2 可选类别工具
- `console`：`list_console_messages`、`get_console_message`
- `network`：`list_network_requests`、`get_network_request`、`stop_network_monitoring`、`clear_network_requests`
- `debug`：`screenshot`、`diagnose_connection`、`check_environment`、`debug_page_elements`、`debug_connection_flow`

### 4.3 配置方式
- `--tools-profile=core|full|minimal`
- `--enable-categories=console,network,debug`
- `--disable-categories=console,network,debug,core`
- 环境变量：
  - `WEIXIN_MCP_TOOLS_PROFILE`
  - `WEIXIN_MCP_ENABLE_CATEGORIES`
  - `WEIXIN_MCP_DISABLE_CATEGORIES`

## 5. 开发流程（必须执行）

### 5.1 新增或改造工具的标准路径
1. 在 `src/tools/` 新增或修改对应模块。
2. 使用 `defineTool` + zod schema 定义参数和行为。
3. 在 `src/tools/tools.ts` 注册并分组导出（`src/tools/index.ts` 仅做入口转发）。
4. 执行 `npm run build` 重新生成 descriptor manifest；禁止手改 `build/` 下生成物。
5. 如涉及共享状态，更新 `MiniProgramContext` 或 collector，而不是在工具内散落状态。
6. 为改动补齐测试：
  - 工具行为：`tests/tools/`
  - 协议/schema：`tests/protocol/`
  - 真实链路（必要时）：`tests/integration/`
7. 同步更新 `AGENTS.md`/`README.md`/`docs/` 中受影响章节。

### 5.2 质量门禁顺序
1. 类型检查：`npm run typecheck`
2. 单元测试：`npm test`
3. 代码检查：`npm run lint` 或按文件执行 `npx eslint <changed-files>`
4. 构建验证：`npm run build`（发布前必须）
5. 集成测试（涉及连接、监控、导航链路时）：`npm run test:integration`
  - 本地默认建议：`INTEGRATION_CLEANUP_MODE=reuse npm run test:integration`
  - 需要强隔离时：`INTEGRATION_CLEANUP_MODE=force npm run test:integration`
  - 如需禁用跨 suite 会话复用：`INTEGRATION_REUSE_SESSION=false npm run test:integration`
  - 如需每个 suite 结束后强制断连：`INTEGRATION_FORCE_DISCONNECT_AFTER_EACH_SUITE=true npm run test:integration`

### 5.3 文档变更校验
- 仅文档改动时至少执行：
  - 路径与命令有效性人工核对（对齐 `package.json` 与代码目录）
  - UTF-8 编码检查
- 如果同时包含代码改动，必须执行 5.2 全流程。

## 6. 测试策略
- 协议层：验证工具注册、schema 暴露、资源接口和错误语义。
- 工具层：验证参数分支、异常路径、状态更新副作用。
- 集成层：验证真实 DevTools 连接、页面行为与监听链路。
- 集成测试连接策略（默认）：
  - `INTEGRATION_CLEANUP_MODE=reuse`（默认，避免频繁重启开发者工具）
  - `INTEGRATION_CLEANUP_MODE=smart`（优雅关闭后重连）
  - `INTEGRATION_CLEANUP_MODE=force`（全量清理，适用于 CI/强隔离）
  - `INTEGRATION_REUSE_SESSION=true`（默认，跨 suite 复用连接）
  - `INTEGRATION_FORCE_DISCONNECT_AFTER_EACH_SUITE=false`（默认，减少断连抖动；调试时可设为 true）
- 变更触发建议：
  - 仅 schema/工具名调整：至少跑 `tests/protocol/` + `tests/tools/`
  - 连接/监控/导航改动：必须补跑 `tests/integration/`

## 7. 类型与代码约束
- `tsconfig.json` 启用 `strict: true`。
- 新增业务代码禁止引入 `any`/`unknown` 逃逸；优先使用明确 `interface/type`。
- 现存豁免以 `eslint.config.mjs` 为准，改动相关文件时应尽量收敛豁免范围。
- 避免深层嵌套；优先早返回和显式错误路径。

## 8. 提交与发布规范
- Commit 使用 Conventional Commit（示例：`feat: 增强连接回退策略`）。
- PR 描述必须包含：
  - 背景与目标
  - 关键改动点
  - 验证命令与结果
  - 风险与回滚方式（如涉及连接/监控链路）
- 发布前最低要求：
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - 需要时 `npm run test:integration`

## 9. 常见陷阱与禁止事项
- 禁止手改 `build/` 产物。
- 禁止在未更新 `src/tools/tools.ts` 的情况下新增工具实现。
- 禁止依赖历史文档中的过时工具口径；工具清单必须以代码导出为准。
- 禁止解析或长期缓存页面快照返回的 opaque `ref`；页面变化后应刷新快照。公开元素 target 只能是 `{ kind: 'ref' }` 或 `{ kind: 'path' }`，稳定的 `testId`、`id`、`dataId` 应作为 path segment 使用。
- 禁止把 target 解析与后续元素读取/动作拆出 page-state 事务；需要 observation 的写操作必须在同一事务内提交 revision 和快照。
- 禁止使用全量自动格式化影响无关文件（如 `eslint --fix .`）。

## 10. 常用命令速查
```bash
# 安装与构建
npm install
npm run build

# 开发与调试
npm run watch
npm run inspector

# 质量检查
npm run typecheck
npm test
npm run lint
npm run test:integration
npm run test:all
```
