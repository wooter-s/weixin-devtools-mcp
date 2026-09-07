# MCP 基准优化前后对比

> **已作废（SUPERSEDED）**：此文件生成于 benchmark provenance 加固之前，错误地把缺少当前 harness 指纹的 legacy baseline 标记为全权威 PASS。请使用 [`../phase2-protocol-final-indicative/comparison.md`](../phase2-protocol-final-indicative/comparison.md)；本文件仅保留用于历史追溯，不得作为验收证据。

- 权威范围：`superseded/non-authoritative`（历史生成值无效）
- 已覆盖：protocol_tools_list、protocol_success、protocol_invalid_arguments、protocol_business_error、protocol_stdio_lifecycle
- 未覆盖：real-devtools-runtime、real-devtools-locator-input、image-response、full-structured-workflow
- 环境指纹：`168119a3c63ca45a21f90c59bcf5d5fed95cf78187fad2275a4ae0603fb27b75`
- 工作负载指纹：`a8e3095f62e3f3adeaeae3d2cfc6e9f2b073604d702d6ac787ab3a993363095c`
- Fixture 指纹：`0504f2ffabdfa2cb7e307dee7e4ea84018bb57001411454e204a639c996ce9a8`
- 历史生成值：~~PASS~~；当前验收：**N/A / SUPERSEDED**

| 场景 | 基线成功率 | 优化后成功率 | 变化(pp) | 基线 p50(ms) | 优化后 p50(ms) | p50 改善 | 基线 p95(ms) | 优化后 p95(ms) | p95 改善 | 验收 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| protocol_business_error | 100.00% | 100.00% | 0.00 | 0.40 | 0.13 | 68.13% | 0.69 | 0.17 | 75.35% | PASS |
| protocol_invalid_arguments | 100.00% | 100.00% | 0.00 | 0.35 | 0.15 | 57.98% | 0.75 | 0.19 | 75.36% | PASS |
| protocol_stdio_lifecycle | 100.00% | 100.00% | 0.00 | 457.58 | 109.69 | 76.03% | 601.61 | 138.95 | 76.90% | PASS |
| protocol_success | 100.00% | 100.00% | 0.00 | 0.34 | 0.18 | 48.45% | 0.73 | 0.26 | 63.94% | PASS |
| protocol_tools_list | 100.00% | 100.00% | 0.00 | 206.89 | 17.48 | 91.55% | 285.76 | 21.26 | 92.56% | PASS |

## 验收明细

### protocol_business_error — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 0.1707，要求 50.6927）
- PASS：指标 structuredErrorCount.sum（实际 100.0000，要求 100.0000）

### protocol_invalid_arguments — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 0.1850，要求 50.7509）
- PASS：指标 structuredErrorCount.sum（实际 100.0000，要求 100.0000）

### protocol_stdio_lifecycle — PASS

- PASS：基线正式样本数（实际 30.0000，要求 30.0000）
- PASS：优化后正式样本数（实际 30.0000，要求 30.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 138.9498，要求 661.7680）
- PASS：指标 lifecycleMs.p95（实际 138.6782，要求 209.6435）

### protocol_success — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 0.2637，要求 50.7313）
- PASS：指标 structuredContentCount.sum（实际 100.0000，要求 100.0000）

### protocol_tools_list — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 21.2566，要求 335.7644）
- PASS：指标 toolsTotal.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 toolsWithOutputSchema.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 toolsWithContentAddressedSchemaId.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 coldSchemaValidatorCount.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 hotSchemaValidatorCount.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 responseBytes.p95（实际 80173.0000，要求 95000.0000）
- PASS：指标 coldListMs.p95（实际 18.6378，要求 50.7432）
- PASS：指标 hotListMs.p95（实际 1.8545，要求 15.0000）
