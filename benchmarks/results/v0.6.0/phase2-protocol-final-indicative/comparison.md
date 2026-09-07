# MCP 基准优化前后对比

- 权威范围：`protocol-static/indicative-only-no-harness-provenance`
- 确定性切片：**INDICATIVE/NON-AUTHORITATIVE**
- 延迟切片：**INDICATIVE/NON-AUTHORITATIVE**（历史 baseline 未记录 benchmark harness 指纹）
- Harness：baseline=legacy-missing，current=fed4a7f3f550fbdaff696e77efe06665a105bfd1061f95251780be512800c086
- 已覆盖：protocol_tools_list、protocol_success、protocol_invalid_arguments、protocol_business_error、protocol_stdio_lifecycle
- 未覆盖：real-devtools-runtime、real-devtools-locator-input、image-response、full-structured-workflow
- 环境指纹：`168119a3c63ca45a21f90c59bcf5d5fed95cf78187fad2275a4ae0603fb27b75`
- 工作负载指纹：`a8e3095f62e3f3adeaeae3d2cfc6e9f2b073604d702d6ac787ab3a993363095c`
- Fixture 指纹：`0504f2ffabdfa2cb7e307dee7e4ea84018bb57001411454e204a639c996ce9a8`
- 严格验收（none）：**N/A**
- 确定性观察：**INDICATIVE PASS**（非权威，不构成严格通过证据）
- 延迟观察：**INDICATIVE PASS**（非权威，不构成严格通过证据）
- 整体结论：**PARTIAL / NO FULL PASS VERDICT**

| 场景 | 基线成功率 | 优化后成功率 | 变化(pp) | 基线 p50(ms) | 优化后 p50(ms) | p50 改善 | 基线 p95(ms) | 优化后 p95(ms) | p95 改善 | 验收 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| protocol_business_error | 100.00% | 100.00% | 0.00 | 0.40 | 0.11 | 73.56% | 0.69 | 0.18 | 74.63% | AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS |
| protocol_invalid_arguments | 100.00% | 100.00% | 0.00 | 0.35 | 0.14 | 60.01% | 0.75 | 0.20 | 74.02% | AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS |
| protocol_stdio_lifecycle | 100.00% | 100.00% | 0.00 | 457.58 | 100.21 | 78.10% | 601.61 | 103.49 | 82.80% | AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS |
| protocol_success | 100.00% | 100.00% | 0.00 | 0.34 | 0.16 | 52.62% | 0.73 | 0.22 | 69.66% | AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS |
| protocol_tools_list | 100.00% | 100.00% | 0.00 | 206.89 | 16.97 | 91.80% | 285.76 | 18.86 | 93.40% | AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS |

## 验收明细

### protocol_business_error — AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS

- INDICATIVE PASS：基线正式样本数（实际 100.0000，要求 100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：优化后正式样本数（实际 100.0000，要求 100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：成功率下限（实际 1.0000，要求 1.0000，非权威且不计入严格验收）
- INDICATIVE PASS：p95 回退预算（实际 0.1758，要求 50.6927，非权威且不计入严格验收）
- INDICATIVE PASS：指标 structuredErrorCount.sum（实际 100.0000，要求 100.0000，非权威且不计入严格验收）

### protocol_invalid_arguments — AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS

- INDICATIVE PASS：基线正式样本数（实际 100.0000，要求 100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：优化后正式样本数（实际 100.0000，要求 100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：成功率下限（实际 1.0000，要求 1.0000，非权威且不计入严格验收）
- INDICATIVE PASS：p95 回退预算（实际 0.1951，要求 50.7509，非权威且不计入严格验收）
- INDICATIVE PASS：指标 structuredErrorCount.sum（实际 100.0000，要求 100.0000，非权威且不计入严格验收）

### protocol_stdio_lifecycle — AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS

- INDICATIVE PASS：基线正式样本数（实际 30.0000，要求 30.0000，非权威且不计入严格验收）
- INDICATIVE PASS：优化后正式样本数（实际 30.0000，要求 30.0000，非权威且不计入严格验收）
- INDICATIVE PASS：成功率下限（实际 1.0000，要求 1.0000，非权威且不计入严格验收）
- INDICATIVE PASS：p95 回退预算（实际 103.4880，要求 661.7680，非权威且不计入严格验收）
- INDICATIVE PASS：指标 lifecycleMs.p95（实际 103.2416，要求 209.6435，非权威且不计入严格验收）

### protocol_success — AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS

- INDICATIVE PASS：基线正式样本数（实际 100.0000，要求 100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：优化后正式样本数（实际 100.0000，要求 100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：成功率下限（实际 1.0000，要求 1.0000，非权威且不计入严格验收）
- INDICATIVE PASS：p95 回退预算（实际 0.2218，要求 50.7313，非权威且不计入严格验收）
- INDICATIVE PASS：指标 structuredContentCount.sum（实际 100.0000，要求 100.0000，非权威且不计入严格验收）

### protocol_tools_list — AUTH N/A / DETERMINISTIC INDICATIVE PASS / LATENCY INDICATIVE PASS

- INDICATIVE PASS：基线正式样本数（实际 100.0000，要求 100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：优化后正式样本数（实际 100.0000，要求 100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：成功率下限（实际 1.0000，要求 1.0000，非权威且不计入严格验收）
- INDICATIVE PASS：p95 回退预算（实际 18.8610，要求 335.7644，非权威且不计入严格验收）
- INDICATIVE PASS：指标 toolsTotal.sum（实际 3100.0000，要求 3100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：指标 toolsWithOutputSchema.sum（实际 3100.0000，要求 3100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：指标 toolsWithContentAddressedSchemaId.sum（实际 3100.0000，要求 3100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：指标 coldSchemaValidatorCount.sum（实际 3100.0000，要求 3100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：指标 hotSchemaValidatorCount.sum（实际 3100.0000，要求 3100.0000，非权威且不计入严格验收）
- INDICATIVE PASS：指标 responseBytes.p95（实际 80173.0000，要求 95000.0000，非权威且不计入严格验收）
- INDICATIVE PASS：指标 coldListMs.p95（实际 16.6693，要求 50.7432，非权威且不计入严格验收）
- INDICATIVE PASS：指标 hotListMs.p95（实际 1.5087，要求 15.0000，非权威且不计入严格验收）

