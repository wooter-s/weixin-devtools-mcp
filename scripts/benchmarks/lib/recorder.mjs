import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  BENCHMARK_SCHEMA_VERSION,
  PHASES,
  redactSensitive,
  stableStringify,
} from './core.mjs';

function normalizeError(error) {
  if (error && typeof error === 'object') {
    return {
      code: typeof error.code === 'string' && error.code ? error.code : 'UNEXPECTED_ERROR',
      message: error instanceof Error ? error.message : String(error.message ?? error),
    };
  }
  return { code: 'UNEXPECTED_ERROR', message: String(error) };
}

export class BenchmarkRecorder {
  constructor(options) {
    if (!options || typeof options !== 'object') {
      throw new TypeError('BenchmarkRecorder options 必填');
    }
    if (!PHASES.has(options.phase)) {
      throw new Error('phase 必须是 baseline 或 optimized');
    }
    if (typeof options.runId !== 'string' || !options.runId) {
      throw new Error('runId 不能为空');
    }
    if (!options.preflight?.valid) {
      throw new Error('预检未通过，拒绝创建基准运行记录');
    }

    this.outputPath = path.resolve(options.outputPath);
    this.repoRoot = path.resolve(options.repoRoot ?? process.cwd());
    this.runId = options.runId;
    this.phase = options.phase;
    this.closed = false;
    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });
    const descriptor = fs.openSync(this.outputPath, 'wx');
    fs.closeSync(descriptor);

    const runRecord = redactSensitive({
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      recordType: 'run',
      runId: options.runId,
      phase: options.phase,
      createdAt: new Date().toISOString(),
      valid: true,
      environment: options.preflight.environment,
      workload: options.preflight.workload,
      fixture: options.preflight.fixture,
      source: options.preflight.source,
      harness: options.preflight.harness,
      pairSession: options.preflight.pairSession,
      safety: options.preflight.safety,
      parameters: options.parameters ?? {},
    }, { repoRoot: this.repoRoot });
    this.append(runRecord);
  }

  append(record) {
    if (this.closed) {
      throw new Error('BenchmarkRecorder 已关闭');
    }
    fs.appendFileSync(this.outputPath, `${stableStringify(record)}\n`, 'utf8');
  }

  async measure(options, operation) {
    if (typeof operation !== 'function') {
      throw new TypeError('operation 必须是函数');
    }
    if (
      typeof options?.scenarioId !== 'string' ||
      !options.scenarioId ||
      !['runtime', 'locator', 'protocol'].includes(options.direction) ||
      !Number.isInteger(options.iteration) ||
      options.iteration < 1 ||
      typeof options.warmup !== 'boolean'
    ) {
      throw new Error('measure options 的 scenarioId/direction/iteration/warmup 无效');
    }
    const startedAt = new Date().toISOString();
    const start = performance.now();
    let status = 'success';
    let metrics = {};
    let details;
    let normalizedError;

    try {
      const result = await operation();
      if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
        status = 'failure';
        normalizedError = {
          code: 'ADAPTER_RESULT_INVALID',
          message: 'adapter 必须返回包含布尔 ok 的对象',
        };
      } else {
        metrics = result.metrics ?? {};
        details = result.details;
        if (result.ok === false) {
          status = 'failure';
          normalizedError = normalizeError(result.error ?? { code: 'ASSERTION_FAILED', message: '场景断言失败' });
        }
      }
    } catch (error) {
      status = 'failure';
      normalizedError = normalizeError(error);
    }

    const record = redactSensitive({
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      recordType: 'sample',
      runId: this.runId,
      phase: this.phase,
      scenarioId: options.scenarioId,
      direction: options.direction,
      iteration: options.iteration,
      warmup: options.warmup,
      startedAt,
      durationMs: performance.now() - start,
      status,
      metrics,
      details,
      ...(normalizedError ? { error: normalizedError } : {}),
    }, { repoRoot: this.repoRoot });
    this.append(record);
    return record;
  }

  close() {
    this.closed = true;
  }
}
