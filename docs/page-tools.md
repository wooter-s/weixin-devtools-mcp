# Page Tools

This is a stable entry page for page query and wait capabilities. 以下为当前公开接口，结果格式使用 `schemaVersion: "2.0"`，与软件发布版本独立。

## 目标定位

所有 action target 只接受 opaque ref 或 locator path：

```typescript
type ElementTarget =
  | { kind: "ref"; ref: string }
  | { kind: "path"; path: LocatorSegment[] }

type LocatorSegment =
  | { kind: "testId"; value: string }
  | { kind: "id"; value: string }
  | { kind: "dataId"; value: string }
  | { kind: "selector"; value: string; index?: number }
  | { kind: "text"; value: string; exact?: boolean; tagName?: string; index?: number }
```

`path` 长度为 1–16，从 Page 开始逐段查询。每个非末段必须唯一命中可查询的自定义组件，后一段再进入它的作用域。旧的 `{ kind: "selector", value }` / `{ kind: "id", value }` 直接 target 会被 schema 拒绝。

```typescript
click({
  target: {
    kind: "path",
    path: [
      { kind: "testId", value: "profile-card" },
      { kind: "text", value: "保存", exact: true, tagName: "button" }
    ]
  }
})
```

## 作用域快照

`get_page_snapshot` 用 `scopes` 表示 Page / custom-component 作用域，用 `edges` 表示组件边界。`root` 可选；传入时必须唯一解析为可查询的自定义组件。采集顺序为 BFS，默认预算是 depth 4、expanded scopes 64、elements 1000：

```typescript
get_page_snapshot({
  format: "json",
  budget: { maxDepth: 4, maxExpandedScopes: 64, maxElements: 1000 }
})
```

结果包含 `snapshotId`、`pageRevision`、`path`、`rootScopeId`、`complete`、`budget`、`usage`、`scopes`、`edges`、`format`、`tokenEstimate` 和 `filePath`。作用域会用 `complete` / `partial` / `truncated` / `unavailable` 与固定 `reason` 说明采集结果；普通 DOM 父子关系不会被伪造为 scope 边。

页面变化后应重新获取快照。快照中的 `ref` 是 opaque 值，不应解析或长期缓存。

- Canonical API doc: [Page API](./小程序开发工具/小程序自动化/API/Page.md)
- Related APIs: [Element API](./小程序开发工具/小程序自动化/API/Element.md), [MiniProgram API](./小程序开发工具/小程序自动化/API/MiniProgram.md)
- Usage examples: [常用示例](./小程序开发工具/小程序自动化/常用示例.md)
