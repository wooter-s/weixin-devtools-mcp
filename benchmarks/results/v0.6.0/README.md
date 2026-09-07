# v0.6.0 本轮三个优化证据切片前后对比

本目录汇总本轮选择的三个优化证据切片：DOM epoch 对应指标规范的“快照、定位与输入”方向，`tools/list` 和 MCP stdio 进程生命周期属于“MCP 结构化契约与真实门禁”方向。结论按证据等级陈述：DOM 数据来自确定性 mock，属于 **synthetic/non-authoritative**；协议数据复用了缺少当前 benchmark harness 指纹的历史 baseline，因此 before/after 只能是 **indicative/non-authoritative**，严格验收为 **N/A**，整体结论为 **PARTIAL**。

## 最终结果

| 方向 | 指标 | 优化前 | 优化后 | 数值目标/观察 |
|---|---|---:|---:|---|
| DOM 同页异步重建 | post-snapshot 错误动作 | 200 次（200 次 ref 尝试、200 次实际 tap） | 0 次（200 次 ref 尝试、100 次实际 tap） | 观察达到 0 |
| DOM 同页异步重建 | 安全样本 / revision-ref 一致率 | 0% / 0% | 100% / 100% | 观察达到 100% |
| DOM 同页异步重建 | 场景 p50 / p95 | 0.0655 / 0.3590 ms | 0.1585 / 0.2880 ms | 合成延迟；p50 增加 0.0931 ms，p95 降低 19.80% |
| 完整 `tools/list` | 响应体 p95 | 126,879 B | 80,173 B | 降低 36.81%，观察低于 95,000 B |
| 完整 `tools/list` | client-validator-cold p95 | 137.5788 ms | 16.6693 ms | 降低 87.88%，观察低于 50.7432 ms |
| 完整 `tools/list` | server-hot p95 | 141.0556 ms | 1.5087 ms | 降低 98.93%，观察低于 15 ms |
| 完整 `tools/list` | 成功率 / 工具契约 | 100% / 31 个 output schema | 100% / 31 个 output schema + 31 个内容寻址 schema ID | 当前实现 31/31 通过 SDK/Ajv 契约测试 |
| MCP stdio 生命周期 | 成功率 | 100%（30/30） | 100%（30/30） | 成功率保持 |
| MCP stdio 生命周期 | `lifecycleMs` p95 | 601.2568 ms | 103.2416 ms | 降低 82.83%，观察低于 209.6435 ms |

这里的 `client-validator-cold` 指服务器已启动后，客户端为 31 个 schema 新建校验器；`server-hot` 指同一客户端复用校验器后的第二次 `tools/list`。真正包含 Node 进程创建、initialize、list 和 close 的冷启动由 `protocol_stdio_lifecycle.lifecycleMs` 表示。

## DOM 正确性结果

- 历史 post-snapshot 场景 100 个样本暴露 200 次错误动作；优化后 100 个样本中错误动作 0 次，弱 ref 安全拒绝、稳定 `data-testid` 重绑定、revision 推进和 revision/ref 一致性均为 100%。
- 新增 metadata-read torn-draft 场景执行 100 个优化后样本：重建触发率、重试观察率、torn draft 丢弃率、发布 ref 一致率和稳定 ref 正确点击率均为 100%，发布 torn draft 为 0。历史版本没有测量这个场景，其 baseline 保持 `notMeasured/null`，不做伪造对比。
- 生产实现通过 page-state transaction 把 target 解析、I/O、revision、快照和 ref registry 放在同一串行边界内；提交快照前执行两轮 identity + locator metadata 一致性检查。

正式结果见 [`phase2-dom-epoch-final.json`](./phase2-dom-epoch-final.json)。该结果不连接真实 DevTools，不能证明真实 detached handle 和节点 identity churn 的表现。

## 协议与进程结果

构建期静态 descriptor、内容寻址 schema ID、轻量协议入口以及工具实现/automator 懒加载共同降低了 `tools/list` 体积、客户端 schema 编译成本和进程冷启动耗时。五个协议切片的当前观察成功率均为 100%，但历史 baseline 没有当前 harness provenance，所以这些 before/after 数字不构成发布门禁的权威 PASS。

- 最终指示性报告：[`phase2-protocol-final-indicative/comparison.md`](./phase2-protocol-final-indicative/comparison.md)
- 机器可读结果：[`phase2-protocol-final-indicative/comparison.json`](./phase2-protocol-final-indicative/comparison.json)
- 环境、依赖与 harness 指纹：[`phase2-protocol-final-indicative/environment.json`](./phase2-protocol-final-indicative/environment.json)
- 优化后真实环境安全预检：[`phase2-real-devtools-preflight-final.json`](./phase2-real-devtools-preflight-final.json)，`valid=true`、DevTools 36.6.0、`processesTerminated=0`

旧目录 [`phase2-protocol-final-before-after`](./phase2-protocol-final-before-after/) 在 provenance 加固前错误标记为全权威 PASS，现已明确作废，不得用于验收。要获得严格 PASS，必须用可恢复的 baseline 构建和当前 optimized 构建在同一 fresh-pair session 中重跑。

## 证据边界与剩余风险

- 真实 DevTools 的连接、导航、监听、定位、输入和 DOM churn 成功率尚未执行正式 before/after；预检通过不等于真实场景通过。
- 稳定 revision 内会保留本轮所有 query generation，避免并发查询 ref 互相失效；若页面长期不变且持续大量查询，Element 强引用和合并成本会增长，需在后续真实长会话中量化。
- Element wrapper identity 与锁定的 `miniprogram-automator@0.12.1` 实现一致，但真实 DevTools element ID 复用行为和双 capture 的端到端 p95 仍待验证。
- 静态 manifest 当前在运行时校验工具名称与数量；开发 watch 场景中同名 schema/description 漂移仍需内容指纹校验或自动重生成。

早期的 runtime lifecycle、snapshot 和初始协议数据仍保留在本目录用于追溯；如与本页最终三个方向结果冲突，以本页链接的 final 产物和 `src/` 当前实现为准。
