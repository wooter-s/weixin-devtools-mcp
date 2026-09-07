# MCP 三方向基准指标规范

本规范用于在同一真实微信开发者工具环境中，形成可复现的优化前基线和优化后结果。所有结论必须来自原始 JSONL 样本；没有执行的场景不能记为成功，也不能用单元测试结果替代真实成功率。

## 通用统计口径

- 连接场景预热 3 次、正式 20 次；元素交互预热 5 次、正式样本共 100 次；协议微基准预热 10 次、正式 100 次，stdio 生命周期正式 30 次。
- 预热样本写入 JSONL，但聚合时排除。正式样本从场景开始后无论成功或失败都必须保留，不允许自动重试或剔除异常值。
- 每个样本使用 `performance.now()` 测量 wall-clock duration。p50/p95 使用 nearest-rank：先升序排列，取第 `ceil(p*n)` 个值。
- 成功率为 `successes / executed`，同时报告 Wilson 95% 置信区间。`failure` 必须附稳定错误码。
- 数值自定义指标报告 count/min/max/mean/p50/p95/sum；布尔值以 0/1 聚合。
- 预检失败会使整次运行无效；无效运行不能产生 aggregate。baseline 和 optimized 的环境、workload、fixture 指纹不同则拒绝对比。

## 方向一：连接、页面状态与监听生命周期

每个 `runtime_lifecycle_cycle` 样本依次覆盖冷连接、外部跳页、同路径 relaunch、正常重连、注入失败、恢复、Console/Network 各三个唯一 token 和断连。

核心指标：

- 生命周期成功率及 Wilson 95% 区间，正式 20 次要求至少 19 次成功。
- 连接周期 duration p50/p95/max；优化后 p95 允许的回退不超过 `max(基线 10%, 50ms)`。
- `staleStateCount`、`wrongPageCount`、`duplicateConsoleCount`、`duplicateNetworkCount` 必须为 0。
- `consoleCapturedCount`、`networkCapturedCount` 总数都必须至少为 60，且每个 token 只能出现一次。
- 页面收敛耗时、捕获耗时、heap 和 listener 数可作为诊断指标写入 metrics，但不能代替上述正确性门槛。

## 方向二：快照、定位与输入

正式交互分布固定为：重复元素点击 30、同页陈旧引用 20、跨页陈旧引用 10、输入三模式 30、直接定位 10。每个样本只有在 actionLog 和页面值都与预期完全一致时才标记 success。

核心指标：

- 五类交互均要求成功率 100%，wrong target 和假成功必须为 0。
- 同页重排/删除后只接受唯一安全重绑或显式 `STALE_ELEMENT`；跨页旧引用必须拒绝，不能命中第二页同 selector 元素。
- input 和 textarea 的 replace/append/clear 后回读值必须逐字节相等。
- `snapshot_fresh` 独立执行 100 次，fresh snapshot p50 和 p95 相对同环境基线都至少下降 30%。
- snapshot bytes、元素数、ref 冲突、可操作元素覆盖率及一次任务 MCP round-trip 数作为辅助指标保留。

## 方向三：MCP 结构化契约与真实门禁

通过真实 stdio Client 测量 tools/list、成功、参数错误、业务错误、图片响应、只读 structuredContent 工作流以及子进程生命周期。

核心指标：

- 每类契约场景成功率 100%，不得跳过；31 个工具必须全部有可用 outputSchema 和成功 structuredContent。
- 参数/业务错误必须同时具备 `isError`、稳定 code 和符合公共 failure schema 的 structuredContent。
- 结构化工作流不解析文本 content，成功率 100%；优化后 round-trip 不能增加，总响应字节不能超过基线 110%。
- MCP 封装自身耗时、响应字节和任务总 duration 报告 p50/p95；duration p95 回退不超过 `max(基线 10%, 50ms)`。

## 可比性与隐私

环境比较指纹只包含 OS、架构、CPU、内存、Node 和 DevTools 版本；SDK 与生产源码属于被测对象，因此只记录 source fingerprint，不要求优化前后一致。工作负载和 fixture 必须完全一致。DevTools 自动生成的 `project.private.config.json` 不参与 fixture 指纹，其余 fixture 文件全部参与。

落盘前递归清除 Authorization、Cookie、headers、body、token、secret、password、API key、图片/base64，并把仓库和用户目录替换为 `<REPO>`、`<HOME>`。本地 HTTP 服务只保存 path、seq 和 token 的 SHA-256，不保存 headers 或 body。
