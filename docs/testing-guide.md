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
- Integration fixture project: [tests/fixtures/monitoring-app/](../tests/fixtures/monitoring-app/)

## 公开监听回归

```bash
npm run build
# 使用临时公开夹具；AppID 只注入临时副本
INTEGRATION_APPID=<your-local-appid> npm run test:integration
INTEGRATION_APPID=<your-local-appid> npm run test:integration:public
```

默认夹具包含 tabBar、分包、表单控件和自定义组件。严格集成先运行公开 stdio 预检，预检失败时不会将后续未运行的 suites 算为通过。公开矩阵覆盖真实请求成功/连接失败/超时/abort/上传/下载在未监听、监听中、停止后的业务结果，以及 5 次重连日志去重。输出位于忽略的 `artifacts/`，发布证据通过 `npm run release:validate` 汇总。

显式设置 `INTEGRATION_WS_ENDPOINT` 仅用于诊断已有端点，不能代替发布所需的 project 启动。Mpx 通过 `INTEGRATION_MPX_WS_ENDPOINT` 和 `npm run test:integration:mpx` 单独验收。环境要求、报告格式和清理说明见 [公开验收指南](validation.md)。

历史业务工程回归仍保留于 `tests/manual/monitoring/regression.mjs`，需要维护者自备工程；它不是公开 CI 或发布的默认入口。历史结果见 [监听回归说明](monitoring-regression.md)。

## 检测问题回归

失败基线及最新结果见 [检测问题回归报告](detected-issues-regression.md)。协议服务夹具覆盖 HTTP 426、缺少 SDKVersion 后就绪与永久未就绪；启动测试覆盖 CLI 失败、自有端点复用、外部占用及候选清理。脚本测试检查命名 async、参数和单次执行；引用测试区分跨页失效、同页稳定地址重定位、历史上限与断开清理。

```bash
npx vitest --run tests/utils/automation-readiness.test.ts tests/utils/project-startup.test.ts tests/tools/script.test.ts tests/utils/mini-program-context.test.ts tests/tools/diagnose.test.ts
INTEGRATION_WS_ENDPOINT=ws://127.0.0.1:9420 MONITORING_REPORT_DIR=tasks/detected-issues/final node tests/manual/monitoring/regression.mjs
```

环境阻塞保留失败退出码；不得将缺少元素产生的异常作为负向断言成功。测试应先保存旧实现的目标断言失败，再修生产代码。
