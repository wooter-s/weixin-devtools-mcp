# Modular Architecture

This is a stable entry page for architecture navigation. 实现以 `src/` 为事实源，当前接口不保留旧参数和结果格式的兼容模式，结果格式版本与软件发布版本独立。

## 当前接口边界

- 协议层从构建期 descriptor manifest 暴露原有 10 / 20 / 31 个 profile 工具，每个 descriptor 统一声明 `schemaVersion: "2.0"` 成功/失败 envelope。
- 连接层只接收 `project` / `wsEndpoint` / `browserUrl` / `discover` 判别式 target。`project` 解析一次规范化真实路径，再固定生成 `launch → connect` attempt plan。
- 元素层用 `ref` 或由 `LocatorSegment` 组成的 `path` 解析目标；非末段是自定义组件边界，保证后续查询发生在正确作用域。
- 页面状态层将 Page 和自定义组件快照规范化为 `scopes` / `edges` 图，通过广度优先预算控制 depth、expanded scopes 和 elements。
- Runtime 根据最终 tool profile 注入监听策略；Console 和 Network 各自维护 `disabled` / `idle` / `running` / `stopped` / `failed` 状态。
- 失败结果不丢弃 handler 已产生的结构化上下文或已提交 observation；诊断元数据必须经过白名单化，不暴露 stack、cause、headers 等敏感内部信息。

- Public interface and development entry: [README.md](../README.md)
- Tool definitions and exports: [src/tools/](../src/tools/)
- Representative implementation references: [src/tools/ToolDefinition.ts](../src/tools/ToolDefinition.ts), [src/tools/index.ts](../src/tools/index.ts)

## 监听实现

`NetworkCollector` 通过 `networkRuntime` 的 install/read/stop 操作管理运行时包装。包装保存属性描述符，支持 configurable 但不可赋值的 wx 方法；直接返回原方法的任务对象，不改变回调的参数、上下文或异常传播。当前应用的 `$xfetch.requestAdapter` 与 wx 层通过 WeakMap 中的内部请求标识关联，不向 HTTP 请求添加采集字段。停止只恢复仍由自身持有的方法。

`ConsoleCollector` 通过 `consoleRuntime` 安装独立 console 包装，原 console 方法照常执行。运行时最多保留 1000 条事件，宿主按单调序号读取，重复文本不去重；异常仍由独立 exception 事件监听。Collector 的远端队列串行执行读写，Context 在 page-state/lifecycle 队列中同步列表、详情、诊断、导航分段和停止。迟到的旧会话结果不能写入新会话。

远端函数必须保持自包含，类型导入仅用于编译检查。真实回归与环境限制见 [监听回归说明](monitoring-regression.md)。

## 启动兼容与引用失效

`ProjectStartup` 在一次连接请求内管理 CLI、端口及项目归属；launch 失败后的 connect 可复用本次已启动端点。成功后移交会话，失败则释放自有资源。共用协议探针通过 `Tool.getInfo` 和 `App.getCurrentPage` 等待运行时就绪；缺少 SDKVersion 时不进入 SDK 的版本比较。探测 socket、CLI 和候选连接均有期限，外部占用不会被当作本次项目。

Context 替换或清空注册表时登记被移除的 token，失效集合最多 10,000 条且断开清空；不保存旧 Element。ref 解析与作用域快照根解析共享失效判断，仍由页面状态事务管理。脚本工具以普通函数包装完整用户函数，参数与 Promise 在远端传递，宿主不执行用户代码。默认元素诊断使用具体组件及支持的选择器组合。
