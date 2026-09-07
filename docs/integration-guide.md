# Integration Guide

This is a stable entry page for integration setup and onboarding. 当前接口使用 `schemaVersion: "2.0"` 结果格式，与软件发布版本独立；不提供旧参数和结果格式的兼容模式。

## 连接

```typescript
connect_devtools({
  target: { kind: "project", projectPath: "/absolute/path/to/miniprogram" },
  timeoutMs: 45000,
  healthCheck: true
})
```

`target` 必须是以下四种判别联合之一：

- `{ kind: "project", projectPath, cliPath?, autoPort?, autoAudits? }`
- `{ kind: "wsEndpoint", endpoint }`
- `{ kind: "browserUrl", url }`
- `{ kind: "discover" }`

`project` 固定按 `launch → connect` 尝试同一个规范化项目真实路径，不会回退到未指定项目的端口发现。其他三种 target 各执行一个逻辑尝试。`timeoutMs` 是所有尝试共享的总预算，默认 45 秒，结果会返回完整 attempt history。

## Profile 与监听

工具数量保持为 `minimal` 10 个、`core` 20 个、`full` 31 个。`console` / `network` 监听只在对应 category 已启用时由连接生命周期启动；未启用时状态为 `disabled`，不是启动失败。

## 结果处理

所有工具都返回 `schemaVersion: "2.0"` envelope。其必填字段为 `ok`、`code`、`data`、`error`、`partialData`、`observation`、`warnings`、`nextActions` 和 `meta`；失败时 MCP `isError` 为 `true`，且文本内容以 `[CODE] message` 开头。

- Canonical documentation: [快速开始](./小程序开发工具/小程序自动化/快速开始.md)
- API reference index: [小程序自动化 API](./小程序开发工具/小程序自动化/API/)
- Additional examples: [Examples](./examples/)

## 读取监听数据

连接 full profile 或启用对应 category 后，直接调用 `list_console_messages` / `list_network_requests`，再使用返回的 `msgid` / `reqid` 查询详情。不要自行订阅 SDK console 事件或调用 `mockWxMethod` 安装第二套采集。

console 队列与网络队列均最多缓存 1000 条远端记录；长时间不读取可能淘汰较早记录。Console 列表、详情和诊断会在读取前同步，导航分段前同步剩余日志。导航历史最多保留 3 段；连接替换会重置本地会话。网络停止后仍可读取已采集的记录；重连可恢复监听。

Mpx 支持当前 `getApp().$xfetch.requestAdapter`；运行时安装之后才创建的其他 XFetch 实例或 queue adapter 不在这一覆盖范围内。应用后续替换方法时，停止不会覆盖应用的新方法。
