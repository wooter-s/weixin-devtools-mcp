# weixin-devtools-mcp benchmarks

这里保存版本化工作负载、数据 schema 和真实跑测产物。指标定义见 [METRICS.md](./METRICS.md)，完整真实工作负载见 [workload.v1.json](./workload.v1.json)，无 DevTools 的协议工作负载见 [workload.protocol-static.v1.json](./workload.protocol-static.v1.json)。

## 安全边界

完整真实基准只允许使用 `playground/benchmark-wx` 和绑定到 `127.0.0.1` 的 HTTP 服务。预检发现已有微信开发者工具进程时默认中止，脚本永远不会主动结束这些进程。只有操作者确认现存会话就是本次基准所有时，才可传入 `--allow-existing-devtools`。

`bench:protocol:compare` 是更安全的静态协议对比：它不检查、不连接、不终止 DevTools，只启动和关闭两个显式指定、由 runner 自己拥有的 MCP stdio 子进程。它使用当前安装的官方 MCP Client，并校验公共 success/failure envelope、稳定错误码、31 个对象根 outputSchema。参数错误使用 `strategy` 的非法枚举值，保证在 schema 校验阶段停止。

## 运行流程

先校验基准基础设施：

```bash
npm run bench:test
```

### 无 DevTools 的协议 before/after

baseline 与 optimized 必须来自两个独立、依赖已安装且能单独启动的工程目录，输出目录必须不存在或为空；`build/`、`package.json` 与 lockfile 内容相同会被拒绝：

```bash
npm run bench:protocol:compare -- \
  --baseline-server /absolute/path/to/before/build/server.js \
  --optimized-server /absolute/path/to/after/build/server.js \
  --output-dir /absolute/path/to/new-empty-result-dir
```

该命令执行 `tools/list`、无需连接的成功调用、参数校验错误、未连接业务错误和 stdio 生命周期，生成两份 JSONL、aggregate JSON、`comparison.json`、`comparison.md` 和 `environment.json`。`environment.json` 同时记录两侧声明和实际解析的依赖版本。历史基线没有 lockfile 时只能按声明重建依赖，必须在结果中保留这一限制。该命令只用于五个协议切片，不替代真实连接/定位基准。

若 baseline 原始 JSONL 已由同一 runner 完整记录、但旧构建目录不再存在，可只重跑 optimized：

```bash
npm run bench:protocol:compare -- \
  --recorded-baseline-dir /absolute/path/to/recorded-result-dir \
  --optimized-server /absolute/path/to/after/build/server.js \
  --output-dir /absolute/path/to/new-empty-result-dir
```

恢复模式会逐项校验 workload、fixture、环境、样本和源码身份，原样复制 baseline JSONL 后重新聚合，并记录 benchmark harness 指纹。它不能制造缺失的历史证据：跨时段恢复的延迟一律为 **indicative/non-authoritative**；旧记录若连 harness 指纹和原始 MCP 响应都没有，则所有切片均为 non-authoritative，总结论是 `PARTIAL/INDICATIVE`，CLI 返回非零。只有同一次 fresh pair 运行才能产生完整权威验收。

`protocol_tools_list.coldListMs` 的“冷”仅指服务器已经启动后，客户端为 31 个 schema 新建/重置校验器；真正包含 Node 进程创建、initialize、list、close 的冷启动口径是 `protocol_stdio_lifecycle.lifecycleMs`。

v0.6.0 当前正式恢复结果位于 [`results/v0.6.0/phase2-protocol-final-indicative`](./results/v0.6.0/phase2-protocol-final-indicative/)；它因 legacy baseline 缺 harness provenance 而明确输出 `PARTIAL / NO FULL PASS VERDICT`。此前的 `phase2-protocol-final-before-after` 结果已作废，不得用于验收。

### DOM epoch synthetic/non-authoritative 回归

同页异步重建可用 `MiniProgramContext` 的确定性 mock 场景验证错误动作、revision/ref 一致性和 torn draft 拒绝：

```bash
npm run bench:dom-epoch:synthetic -- \
  --baseline-entry /absolute/path/to/before/build/MiniProgramContext.js \
  --optimized-entry build/MiniProgramContext.js \
  --output /absolute/path/to/new-result.json
```

仅有旧结果而没有旧构建时，可使用严格恢复模式；输出不能覆盖来源文件：

```bash
npm run bench:dom-epoch:synthetic -- \
  --recorded-baseline-result benchmarks/results/v0.6.0/phase2-dom-epoch-before-after.json \
  --optimized-entry build/MiniProgramContext.js \
  --output benchmarks/results/v0.6.0/phase2-dom-epoch-final.json
```

恢复结果只复用历史实际测得的 post-snapshot baseline；当时没有执行的 metadata-read baseline 必须保持 `notMeasured/null`，不能补零或反推。该基准始终是 **synthetic/non-authoritative**，不能证明真实 DevTools 的 detached handle 行为。

### Runtime lifecycle synthetic/non-authoritative 微基准

下面的命令用内存 MiniProgram mock 检查“监听部分注册失败会回滚”和“替换活动会话会先清理”两项资源所有权不变量：

```bash
npm run bench:runtime:synthetic -- \
  --baseline-entry /absolute/path/to/before/build/MiniProgramContext.js \
  --optimized-entry build/MiniProgramContext.js
```

默认结果写入 [`results/v0.6.0/runtime-lifecycle-synthetic-before-after.json`](./results/v0.6.0/runtime-lifecycle-synthetic-before-after.json)。它不访问 DevTools、网络或外部进程，明确属于 **synthetic/non-authoritative**；优化后延迟包含主动断连的 200 ms 收敛等待。

### Snapshot synthetic/non-authoritative 微基准

下面的命令只导入优化前后的 `build/core/snapshot.js`，使用确定性的内存 mock Page/Element 执行 100 个正式样本；它不会启动 MCP 子进程、访问网络或检查、连接、终止 DevTools：

```bash
npm run bench:snapshot:synthetic -- \
  --baseline-entry /absolute/path/to/before/build/core/snapshot.js \
  --optimized-entry build/core/snapshot.js
```

默认结果写入 [`results/v0.6.0/snapshot-synthetic-before-after.json`](./results/v0.6.0/snapshot-synthetic-before-after.json)，包含全部原始 duration、nearest-rank p50/p95、成功率和 Wilson 95% 区间。为避免旧实现每个样本固定等待 1 秒导致约 100 秒串行耗时，默认以 `sampleConcurrency=100` 并发发起正式样本；因此单样本延迟包含同进程调度竞争，只能用于隔离比较 snapshot 实现，明确属于 **synthetic/non-authoritative**，不能代替真实 DevTools 集成数据。可通过 `--sample-concurrency` 覆盖并发度。

该 snapshot 微基准直接测量一次 `getPageSnapshot`。生产 `synchronizePageState` 为避免同一 Element 在 metadata 读取期间变化而提交 torn draft，会连续执行两轮 capture 并仅在身份与 locator metadata 一致时提交，因此这里的延迟不能直接当作 MCP 页面快照端到端延迟。

### 完整真实基准

真正执行场景的版本 adapter 由 `bench:run` 加载，runner 会按 workload 的精确次数调用 `BenchmarkRecorder.measure()`，不会跳过 adapter 不支持的场景。

```bash
# 1. 优化生产代码之前预检并保存环境/源码/fixture 指纹
npm run bench:preflight -- \
  --phase baseline \
  --output benchmarks/results/v0.6.0/local/baseline-preflight.json

# 2. 单独启动只监听 loopback 的确定性 HTTP 服务（可用 --port 0 自动选空闲端口）
npm run bench:serve -- --port 19420

# 可选：对已经由操作者明确拥有的 fixture 自动化端口做真实冒烟；它不属于 baseline 数据
npm run bench:fixture:smoke -- --ws-endpoint ws://127.0.0.1:9420

# 3. 使用与被测版本对应、已经实现的 adapter 生成原始 baseline
npm run bench:run -- \
  --phase baseline \
  --preflight benchmarks/results/v0.6.0/local/baseline-preflight.json \
  --adapter /absolute/path/to/version-adapter.mjs \
  --output benchmarks/results/v0.6.0/local/baseline.jsonl

# 仅静态协议诊断：从指定 build/server.js 启动真实 stdio 子进程；结果是 partial，不能用于最终 compare
BENCHMARK_SERVER_PATH=build/server.js npm run bench:run -- \
  --phase baseline \
  --preflight benchmarks/results/v0.6.0/local/baseline-preflight.json \
  --adapter scripts/benchmarks/adapters/protocol-static.mjs \
  --scenarios protocol_tools_list,protocol_success,protocol_invalid_arguments,protocol_business_error,protocol_stdio_lifecycle \
  --output benchmarks/results/v0.6.0/local/protocol-static.jsonl

# 聚合 baseline
npm run bench:aggregate -- \
  --input benchmarks/results/v0.6.0/local/baseline.jsonl \
  --output benchmarks/results/v0.6.0/local/baseline.aggregate.json

# 4. 优化完成后用相同 workload 和 fixture 生成 optimized.jsonl 并聚合
npm run bench:aggregate -- \
  --input benchmarks/results/v0.6.0/local/optimized.jsonl \
  --output benchmarks/results/v0.6.0/local/optimized.aggregate.json

# 5. 严格比较；不可比返回 1，门槛未通过返回 2
npm run bench:compare -- \
  --baseline benchmarks/results/v0.6.0/local/baseline.aggregate.json \
  --optimized benchmarks/results/v0.6.0/local/optimized.aggregate.json \
  --output-json benchmarks/results/v0.6.0/local/comparison.json \
  --output-md benchmarks/results/v0.6.0/local/comparison.md
```

结果目录不提供示例数字，避免把未执行数据误认为真实基线。一次合法运行的 JSONL 第一行必须是唯一的 `run` record，后续每行是一个 `sample` record，结构见 [run-jsonl.schema.json](./schemas/run-jsonl.schema.json)。

`fixture-smoke.mjs` 会真实连接显式给出的 loopback 自动化端口，验证两页、重复元素、重排/删除、input/textarea、Console、本地请求和 actionLog，但输出明确标记为 `benchmarkEligible: false`，不能冒充 MCP baseline。当前仓库不同生产版本的工具参数和结构化返回契约不同，因此权威数据必须由相应版本的 SUT adapter 接入；adapter 需要导出 `createBenchmarkAdapter()`，并实现 `setup/healthCheck/runScenario/teardown`。未接 adapter 的指标保持“未测”，绝不填零或沿用单元测试数字。

仓库内置的 `protocol-static` adapter 会从 `BENCHMARK_SERVER_PATH`（默认 `build/server.js`）启动自己拥有的 stdio 子进程，可真实测量 tools/list、成功响应、参数错误、未连接业务错误和 stdio 生命周期。它不会连接或终止 DevTools；未覆盖的图片和完整交互工作流仍必须交给真实 DevTools adapter。

## Adapter 合约

最小 adapter 结构如下；`runScenario` 的返回值会原样交给 Recorder，抛错或 `ok:false` 都是正式失败样本。

```js
export async function createBenchmarkAdapter({ repoRoot, phase, workload }) {
  return {
    name: 'legacy-mcp',
    async setup() {},
    async healthCheck() {
      return { ok: true };
    },
    async runScenario({ scenario, iteration, warmup }) {
      return {
        ok: true,
        metrics: { roundTrips: 1, responseBytes: 128 },
        details: { assertion: 'actionLog matched' },
      };
    },
    async teardown() {},
  };
}
```

runner 负责写入 `runId/phase/scenarioId/direction/iteration/warmup/startedAt/durationMs/status`。adapter 只需返回数值或布尔 `metrics`；失败时返回 `{ ok:false, error:{ code, message }, metrics }`，其中 code 必须稳定。`--scenarios` 只用于诊断并会在 run 参数中标记 `partial:true`；对比器要求 baseline/optimized 完整覆盖 workload，因此 partial 结果无法冒充最终结果。

## Recorder 最小用法

```js
import { BenchmarkRecorder } from '../../scripts/benchmarks/lib/recorder.mjs';

const recorder = new BenchmarkRecorder({
  outputPath,
  repoRoot,
  runId,
  phase: 'baseline',
  preflight,
});

await recorder.measure({
  scenarioId: 'locator_duplicate_click',
  direction: 'locator',
  iteration: 1,
  warmup: false,
}, async () => {
  // 执行一次真实 MCP 场景，并通过 fixture actionLog 验证结果。
  return { ok: true, metrics: { roundTrips: 2 } };
});

recorder.close();
```

回调抛错或返回 `{ ok: false, error: { code, message } }` 时，Recorder 会保留失败样本且不会重试。结果文件使用独占创建，防止误覆盖已有基线。
