# Best Practices

This is a stable entry page for practical testing recommendations. 以下建议按当前接口及 `schemaVersion: "2.0"` 结果格式执行；结果格式版本与软件发布版本独立。

## 当前接口实践要点

- 调用后先判断 `ok` 和 `code`，不要解析人类可读文本来判断成败。成功数据只在 `data`，失败详情在 `error`；两种分支仍都有必填的 `partialData`、`observation`、`warnings`、`nextActions` 和 `meta`。
- 连接指定项目时使用 `{ target: { kind: "project", projectPath } }`。它固定执行 `launch → connect`，不会发现并误连其他项目；只有确实要附加已知实例时才使用 `wsEndpoint`、`browserUrl` 或 `discover` target。
- 优先从新鲜快照中使用 opaque `ref`。需要稳定重新定位时使用 `{ kind: "path", path: [...] }`，每个非末段都应唯一命中自定义组件；优先 `testId` / `id` / `dataId`，尽量避免依赖位置 `index`。
- 页面变化后刷新快照，不要解析或长期缓存 opaque `ref`。检查快照的 `complete`、各 scope 的 `status` / `reason` 和 `usage`，不要把预算截断当成“页面上没有元素”。
- 默认快照预算为 depth 4、scopes 64、elements 1000。先限定更稳定的 `root` 或改进 locator，只在确有需要时扩大预算。
- 只在需要采集时启用 `console` / `network` category；用连接状态中的 `disabled` / `idle` / `running` / `stopped` / `failed` 判断监听是未启用还是已失败。

- Canonical guide: [常用示例](./小程序开发工具/小程序自动化/常用示例.md)
- Getting started: [快速开始](./小程序开发工具/小程序自动化/快速开始.md)
- Example scenarios: [Examples](./examples/)
