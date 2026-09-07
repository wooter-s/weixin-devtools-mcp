# Testing Guide

This is a stable entry page for test strategy and execution in this repository.

## 当前接口验证重点

- 协议测试应同时验证成功和失败分支的 `schemaVersion: "2.0"` 必填 envelope，以及 MCP `isError` 与 `ok` 的一致性。失败时还要覆盖 `partialData` 与已提交 `observation` 不丢失。
- 连接测试覆盖四种判别式 target；特别验证 `project` 只尝试 `launch → connect`、两次使用同一真实路径、不进入 discover，并记录完整 attempt history。
- 元素测试覆盖 `ref` 和 1–16 段 locator `path`，包括嵌套自定义组件、非末段歧义/非组件错误、stale ref 以及页面 revision 变化。
- 快照测试覆盖 BFS `scopes` / `edges` 拓扑、默认 depth 4 / scopes 64 / elements 1000 预算与各种 scope 截断原因。
- Profile 测试要证明工具数仍为 10 / 20 / 31，且 Console / Network 监听只随对应 category 启用。

## 质量门禁

```bash
npm run typecheck
npm run typecheck:test
npm test
npm run lint
npm run build

# 连接、监听、页面作用域或导航链路变更时
INTEGRATION_CLEANUP_MODE=reuse npm run test:integration
```

- Repository development and test commands: [README.md](../README.md)
- Manual verification scripts: [tests/manual/](../tests/manual/)
- Integration fixture project: [playground/wx/](../playground/wx/)

## 监听回归与显式端点

```bash
# 已有业务工程的自动化端点；不会把端点成功视为 project 启动成功
INTEGRATION_WS_ENDPOINT=ws://127.0.0.1:9420 \
INTEGRATION_CLEANUP_MODE=reuse \
INTEGRATION_FORCE_DISCONNECT_AFTER_EACH_SUITE=true npm run test:integration

# 单独运行官方 SDK stdio 能力矩阵（先 build）
INTEGRATION_WS_ENDPOINT=ws://127.0.0.1:9420 \
node tests/manual/monitoring/regression.mjs
```

Harness 的 `wsEndpoint: null` 可忽略环境变量，强制单独验证 project 启动。独立工程在 `tests/fixtures/monitoring-app`，包含 tabBar、表单控件和自定义组件；矩阵默认通过 project target 启动它，并在结束时关闭自有工程；显式设置 `INTEGRATION_FIXTURE_WS_ENDPOINT` 时只复用端点，该分支不验证启动。它不修改 `playground/wx`。业务工程磁盘上的 `pages/mcp-fixture/index` 也必须已编入运行中的包，未编译时其相关检查标记环境阻塞。

矩阵脚本验证真实请求成功/连接失败/超时/abort/上传/下载在未监听、监听中、停止后的业务结果，以及 Mpx Promise 成功/失败/取消、5 次重连日志去重和相同文本保留。输出 `tasks/monitoring-regression/capability-cases.json`；可通过 `MONITORING_REPORT_DIR` 更改目录。发现缺陷或环境阻塞时退出码非零，严格集成不会把这些结果算作成功。测试先校验前提条件，再执行依赖断言，缺少夹具不冒充断言失败分支通过。

本轮结果与最小复现见 [监听回归说明](monitoring-regression.md)。

## 检测问题回归

失败基线及最新结果见 [检测问题回归报告](detected-issues-regression.md)。协议服务夹具覆盖 HTTP 426、缺少 SDKVersion 后就绪与永久未就绪；启动测试覆盖 CLI 失败、自有端点复用、外部占用及候选清理。脚本测试检查命名 async、参数和单次执行；引用测试区分跨页失效、同页稳定地址重定位、历史上限与断开清理。

```bash
npx vitest --run tests/utils/automation-readiness.test.ts tests/utils/project-startup.test.ts tests/tools/script.test.ts tests/utils/mini-program-context.test.ts tests/tools/diagnose.test.ts
INTEGRATION_WS_ENDPOINT=ws://127.0.0.1:9420 MONITORING_REPORT_DIR=tasks/detected-issues/final node tests/manual/monitoring/regression.mjs
```

环境阻塞保留失败退出码；不得将缺少元素产生的异常作为负向断言成功。测试应先保存旧实现的目标断言失败，再修生产代码。
