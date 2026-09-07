# MCP 基准优化前后对比

- 权威范围：`protocol-static/authoritative-for-five-declared-slices`
- 已覆盖：protocol_tools_list、protocol_success、protocol_invalid_arguments、protocol_business_error、protocol_stdio_lifecycle
- 未覆盖：real-devtools-runtime、real-devtools-locator-input、image-response、full-structured-workflow
- 环境指纹：`168119a3c63ca45a21f90c59bcf5d5fed95cf78187fad2275a4ae0603fb27b75`
- 工作负载指纹：`109ac9a28ea7e46a904d3e1cd338ca42a196dae0f623f2dc6fc0d4c21df5484d`
- Fixture 指纹：`0504f2ffabdfa2cb7e307dee7e4ea84018bb57001411454e204a639c996ce9a8`
- 总体验收：**FAIL**

| 场景 | 基线成功率 | 优化后成功率 | 变化(pp) | 基线 p50(ms) | 优化后 p50(ms) | p50 改善 | 基线 p95(ms) | 优化后 p95(ms) | p95 改善 | 验收 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| protocol_business_error | 0.00% | 100.00% | 100.00 | 0.07 | 0.12 | -83.72% | 0.09 | 0.16 | -71.29% | PASS |
| protocol_invalid_arguments | 0.00% | 100.00% | 100.00 | 0.08 | 0.12 | -60.97% | 0.11 | 0.19 | -76.53% | PASS |
| protocol_stdio_lifecycle | 100.00% | 100.00% | 0.00 | 149.82 | 315.70 | -110.72% | 159.64 | 338.74 | -112.19% | FAIL |
| protocol_success | 0.00% | 100.00% | 100.00 | 0.06 | 0.13 | -134.28% | 0.08 | 0.18 | -115.68% | PASS |
| protocol_tools_list | 0.00% | 100.00% | 100.00 | 0.50 | 84.51 | -16638.01% | 0.74 | 92.10 | -12292.83% | FAIL |

## 验收明细

### protocol_business_error — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 0.1626，要求 50.0949）
- PASS：指标 structuredErrorCount.sum（实际 100.0000，要求 100.0000）

### protocol_invalid_arguments — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 0.1865，要求 50.1056）
- PASS：指标 structuredErrorCount.sum（实际 100.0000，要求 100.0000）

### protocol_stdio_lifecycle — FAIL

- PASS：基线正式样本数（实际 20.0000，要求 20.0000）
- PASS：优化后正式样本数（实际 20.0000，要求 20.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- FAIL：p95 回退预算（实际 338.7418，要求 209.6435）

### protocol_success — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 0.1811，要求 50.0840）
- PASS：指标 structuredContentCount.sum（实际 100.0000，要求 100.0000）

### protocol_tools_list — FAIL

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- FAIL：p95 回退预算（实际 92.1046，要求 50.7432）
- PASS：指标 toolsTotal.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 toolsWithOutputSchema.sum（实际 3100.0000，要求 3100.0000）

