# MCP 基准优化前后对比

- 权威范围：`protocol-static/authoritative-for-five-declared-slices`
- 已覆盖：protocol_tools_list、protocol_success、protocol_invalid_arguments、protocol_business_error、protocol_stdio_lifecycle
- 未覆盖：real-devtools-runtime、real-devtools-locator-input、image-response、full-structured-workflow
- 环境指纹：`168119a3c63ca45a21f90c59bcf5d5fed95cf78187fad2275a4ae0603fb27b75`
- 工作负载指纹：`a8e3095f62e3f3adeaeae3d2cfc6e9f2b073604d702d6ac787ab3a993363095c`
- Fixture 指纹：`0504f2ffabdfa2cb7e307dee7e4ea84018bb57001411454e204a639c996ce9a8`
- 总体验收：**FAIL**

| 场景 | 基线成功率 | 优化后成功率 | 变化(pp) | 基线 p50(ms) | 优化后 p50(ms) | p50 改善 | 基线 p95(ms) | 优化后 p95(ms) | p95 改善 | 验收 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| protocol_business_error | 100.00% | 100.00% | 0.00 | 0.40 | 0.43 | -5.47% | 0.69 | 0.89 | -27.99% | PASS |
| protocol_invalid_arguments | 100.00% | 100.00% | 0.00 | 0.35 | 0.47 | -33.96% | 0.75 | 0.96 | -28.03% | PASS |
| protocol_stdio_lifecycle | 100.00% | 100.00% | 0.00 | 457.58 | 185.84 | 59.39% | 601.61 | 249.83 | 58.47% | FAIL |
| protocol_success | 100.00% | 100.00% | 0.00 | 0.34 | 0.46 | -34.83% | 0.73 | 0.80 | -9.91% | PASS |
| protocol_tools_list | 100.00% | 100.00% | 0.00 | 206.89 | 23.39 | 88.69% | 285.76 | 28.56 | 90.00% | PASS |

## 验收明细

### protocol_business_error — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 0.8865，要求 50.6927）
- PASS：指标 structuredErrorCount.sum（实际 100.0000，要求 100.0000）

### protocol_invalid_arguments — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 0.9614，要求 50.7509）
- PASS：指标 structuredErrorCount.sum（实际 100.0000，要求 100.0000）

### protocol_stdio_lifecycle — FAIL

- PASS：基线正式样本数（实际 30.0000，要求 30.0000）
- PASS：优化后正式样本数（实际 30.0000，要求 30.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 249.8312，要求 661.7680）
- FAIL：指标 lifecycleMs.p95（实际 249.5582，要求 209.6435）

### protocol_success — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 0.8037，要求 50.7313）
- PASS：指标 structuredContentCount.sum（实际 100.0000，要求 100.0000）

### protocol_tools_list — PASS

- PASS：基线正式样本数（实际 100.0000，要求 100.0000）
- PASS：优化后正式样本数（实际 100.0000，要求 100.0000）
- PASS：成功率下限（实际 1.0000，要求 1.0000）
- PASS：p95 回退预算（实际 28.5627，要求 335.7644）
- PASS：指标 toolsTotal.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 toolsWithOutputSchema.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 toolsWithContentAddressedSchemaId.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 coldSchemaValidatorCount.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 hotSchemaValidatorCount.sum（实际 3100.0000，要求 3100.0000）
- PASS：指标 responseBytes.p95（实际 81785.0000，要求 95000.0000）
- PASS：指标 coldListMs.p95（实际 25.9374，要求 50.7432）
- PASS：指标 hotListMs.p95（实际 3.8030，要求 15.0000）

