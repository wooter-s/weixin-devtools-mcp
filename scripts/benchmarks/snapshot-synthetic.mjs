#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import {
  nearestRank,
  redactSensitive,
  sha256,
  stableStringify,
  summarizeNumbers,
  wilsonInterval,
} from './lib/core.mjs';

const DEFAULT_BASELINE_ENTRY = '/tmp/weixin-mcp-true-baseline.OghYtV/build/core/snapshot.js';
const DEFAULT_OPTIMIZED_ENTRY = 'build/core/snapshot.js';
const DEFAULT_OUTPUT = 'benchmarks/results/v0.6.0/snapshot-synthetic-before-after.json';
const DEFAULT_SAMPLES = 100;
const DEFAULT_WARMUPS = 3;
const DEFAULT_SAMPLE_CONCURRENCY = 100;
const DEFAULT_ELEMENTS = 20;

const USAGE = [
  '用法: node scripts/benchmarks/snapshot-synthetic.mjs',
  `  [--baseline-entry <path>] [--optimized-entry <path>] [--output <path>]`,
  `  [--samples ${DEFAULT_SAMPLES}] [--warmups ${DEFAULT_WARMUPS}]`,
  `  [--sample-concurrency ${DEFAULT_SAMPLE_CONCURRENCY}] [--elements ${DEFAULT_ELEMENTS}]`,
].join('\n');

function parsePositiveInteger(value, argumentName, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${argumentName} 必须是${allowZero ? '非负' : '正'}整数`);
  }
  return parsed;
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  const args = {
    baselineEntry: DEFAULT_BASELINE_ENTRY,
    optimizedEntry: DEFAULT_OPTIMIZED_ENTRY,
    output: DEFAULT_OUTPUT,
    samples: DEFAULT_SAMPLES,
    warmups: DEFAULT_WARMUPS,
    sampleConcurrency: DEFAULT_SAMPLE_CONCURRENCY,
    elements: DEFAULT_ELEMENTS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${argument} 缺少值`);
    }
    switch (argument) {
      case '--baseline-entry':
        args.baselineEntry = value;
        break;
      case '--optimized-entry':
        args.optimizedEntry = value;
        break;
      case '--output':
        args.output = value;
        break;
      case '--samples':
        args.samples = parsePositiveInteger(value, argument);
        break;
      case '--warmups':
        args.warmups = parsePositiveInteger(value, argument, true);
        break;
      case '--sample-concurrency':
        args.sampleConcurrency = parsePositiveInteger(value, argument);
        break;
      case '--elements':
        args.elements = parsePositiveInteger(value, argument);
        break;
      default:
        throw new Error(`未知参数: ${argument}`);
    }
    index += 1;
  }
  return args;
}

function validateEntry(entryPath, label) {
  const absolutePath = fs.realpathSync(path.resolve(entryPath));
  if (!fs.statSync(absolutePath).isFile()) {
    throw new Error(`${label} entry 不是文件: ${absolutePath}`);
  }
  return absolutePath;
}

function immediate(value) {
  return Promise.resolve(value);
}

function createMockElement(index) {
  const padded = String(index).padStart(2, '0');
  const attributes = {
    class: 'synthetic-row shared-row',
    id: '',
    'data-testid': `synthetic-${padded}`,
    'data-id': `row-${padded}`,
  };
  return {
    tagName: 'button',
    text: () => immediate(`合成元素 ${padded}`),
    attribute: (name) => immediate(attributes[name] ?? ''),
    size: () => immediate({ width: 300, height: 44 }),
    offset: () => immediate({ left: 12, top: 20 + index * 48 }),
    boundingClientRect: () =>
      immediate({ left: 12, top: 20 + index * 48, width: 300, height: 44 }),
  };
}

function createMockPage(elementCount) {
  const elements = Array.from({ length: elementCount }, (_, index) => createMockElement(index));
  return {
    path: 'pages/synthetic/index',
    $$: (selector) => immediate(selector === '*' ? elements : []),
  };
}

function validateBaselineResult(result, expectedElements) {
  const firstElement = result?.snapshot?.elements?.[0];
  const firstMapping = firstElement?.uid ? result?.elementMap?.get(firstElement.uid) : null;
  return Boolean(
    result?.snapshot?.path === 'pages/synthetic/index' &&
      result.snapshot.elements?.length === expectedElements &&
      result.elementMap instanceof Map &&
      result.elementMap.size === expectedElements &&
      result.snapshot.elements.every((element) => typeof element.uid === 'string' && element.uid) &&
      typeof firstMapping?.selector === 'string' &&
      Number.isSafeInteger(firstMapping.index)
  );
}

function validateOptimizedResult(result, expectedElements) {
  const firstElement = result?.snapshot?.elements?.[0];
  const firstMapping = firstElement?.ref ? result?.elementMap?.get(firstElement.ref) : null;
  return Boolean(
    result?.snapshot?.snapshotId === 'synthetic-snapshot' &&
      result.snapshot.pageRevision === 7 &&
      result.snapshot.path === 'pages/synthetic/index' &&
      result.snapshot.elements?.length === expectedElements &&
      result.elementMap instanceof Map &&
      result.elementMap.size === expectedElements &&
      result.snapshot.elements.every((element) => typeof element.ref === 'string' && element.ref) &&
      typeof firstMapping?.selector === 'string' &&
      Number.isSafeInteger(firstMapping.index) &&
      firstMapping.snapshotId === 'synthetic-snapshot' &&
      firstMapping.pageRevision === 7 &&
      firstMapping.pagePath === 'pages/synthetic/index' &&
      typeof firstMapping.element === 'object' &&
      typeof firstMapping.fingerprint === 'object'
  );
}

async function runConcurrentSamples(total, concurrency, operation) {
  const results = new Array(total);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(total, concurrency) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) {
        return;
      }
      const started = performance.now();
      try {
        const valid = await operation(index);
        results[index] = {
          durationMs: performance.now() - started,
          success: valid === true,
          ...(valid === true ? {} : { errorCode: 'RETURN_SHAPE_MISMATCH' }),
        };
      } catch (error) {
        results[index] = {
          durationMs: performance.now() - started,
          success: false,
          errorCode: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR',
          errorMessage: error instanceof Error ? error.message : String(error),
        };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function summarizePhase(results, wallClockMs, entryPath, sourceFingerprint, returnShape) {
  const durationsMs = results.map((result) => result.durationMs);
  const successes = results.filter((result) => result.success).length;
  const failures = results.length - successes;
  const errorCounts = {};
  for (const result of results) {
    if (!result.success) {
      errorCounts[result.errorCode] = (errorCounts[result.errorCode] ?? 0) + 1;
    }
  }
  const durationSummary = summarizeNumbers(durationsMs);
  return {
    entry: entryPath,
    sourceFingerprint,
    returnShape,
    samples: results.length,
    successes,
    failures,
    successRate: results.length === 0 ? null : successes / results.length,
    successRateWilson95: wilsonInterval(successes, results.length),
    durationsMs,
    latencyMs: {
      min: durationSummary.min,
      max: durationSummary.max,
      mean: durationSummary.mean,
      p50: nearestRank(durationsMs, 0.5),
      p95: nearestRank(durationsMs, 0.95),
    },
    wallClockMs,
    errorCounts,
  };
}

async function measurePhase(options) {
  const page = createMockPage(options.elementCount);
  await runConcurrentSamples(options.warmups, Math.min(options.warmups, options.sampleConcurrency), () =>
    options.invoke(page)
  );
  const wallStarted = performance.now();
  const results = await runConcurrentSamples(
    options.samples,
    options.sampleConcurrency,
    () => options.invoke(page)
  );
  return summarizePhase(
    results,
    performance.now() - wallStarted,
    options.entryPath,
    options.sourceFingerprint,
    options.returnShape
  );
}

function relativeImprovement(before, after) {
  return before === 0 ? null : (before - after) / before;
}

export async function runSnapshotSyntheticBenchmark(options) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const requestedBaselineEntry = options.baselineEntry;
  const requestedOptimizedEntry = options.optimizedEntry;
  const baselineEntry = validateEntry(options.baselineEntry, 'baseline');
  const optimizedEntry = validateEntry(options.optimizedEntry, 'optimized');
  const baselineSourceFingerprint = sha256(fs.readFileSync(baselineEntry));
  const optimizedSourceFingerprint = sha256(fs.readFileSync(optimizedEntry));
  if (baselineSourceFingerprint === optimizedSourceFingerprint) {
    throw new Error('baseline 与 optimized snapshot entry 内容相同');
  }

  const baselineModule = await import(pathToFileURL(baselineEntry).href);
  const optimizedModule = await import(pathToFileURL(optimizedEntry).href);
  if (
    typeof baselineModule.getPageSnapshot !== 'function' ||
    typeof optimizedModule.getPageSnapshot !== 'function'
  ) {
    throw new Error('baseline 或 optimized entry 未导出 getPageSnapshot');
  }

  const workload = {
    samples: options.samples,
    warmups: options.warmups,
    sampleConcurrency: Math.min(options.samples, options.sampleConcurrency),
    elementCount: options.elements,
    mockMethodLatencyMs: 0,
    optimizedMetadataConcurrency: 8,
    pagePath: 'pages/synthetic/index',
  };
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  let baseline;
  let optimized;
  try {
    baseline = await measurePhase({
      ...workload,
      entryPath: baselineEntry,
      sourceFingerprint: baselineSourceFingerprint,
      returnShape: {
        arguments: ['page'],
        snapshotFields: ['path', 'elements[].uid'],
        elementMapFields: ['selector', 'index'],
      },
      invoke: async (page) =>
        validateBaselineResult(await baselineModule.getPageSnapshot(page), options.elements),
    });
    optimized = await measurePhase({
      ...workload,
      entryPath: optimizedEntry,
      sourceFingerprint: optimizedSourceFingerprint,
      returnShape: {
        arguments: ['page', '{snapshotId,pageRevision,concurrency}'],
        snapshotFields: ['snapshotId', 'pageRevision', 'path', 'elements[].ref'],
        elementMapFields: [
          'selector',
          'index',
          'snapshotId',
          'pageRevision',
          'pagePath',
          'element',
          'fingerprint',
        ],
      },
      invoke: async (page) =>
        validateOptimizedResult(
          await optimizedModule.getPageSnapshot(page, {
            snapshotId: 'synthetic-snapshot',
            pageRevision: 7,
            concurrency: 8,
          }),
          options.elements
        ),
    });
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }

  const result = redactSensitive(
    {
      schemaVersion: '1.0',
      recordType: 'snapshot-before-after',
      authority: 'synthetic/non-authoritative',
      synthetic: true,
      authoritative: false,
      generatedAt: new Date().toISOString(),
      environment: {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        node: process.versions.node,
      },
      safety: {
        devtoolsAccess: false,
        devtoolsProcessesInspected: false,
        devtoolsProcessesTerminated: 0,
        subprocessesSpawned: 0,
        networkAccess: false,
      },
      workload: {
        ...workload,
        fingerprint: sha256(stableStringify(workload)),
        phaseOrder: ['baseline', 'optimized'],
        consoleOutputSuppressed: true,
      },
      statistics: {
        durationUnit: 'milliseconds',
        percentileMethod: 'nearest-rank',
        percentiles: [0.5, 0.95],
        successInterval: 'Wilson 95%',
      },
      requestedEntries: {
        baseline: requestedBaselineEntry,
        optimized: requestedOptimizedEntry,
      },
      baseline,
      optimized,
      comparison: {
        successRateDeltaPercentagePoints:
          (optimized.successRate - baseline.successRate) * 100,
        p50DeltaMs: optimized.latencyMs.p50 - baseline.latencyMs.p50,
        p95DeltaMs: optimized.latencyMs.p95 - baseline.latencyMs.p95,
        p50Improvement: relativeImprovement(baseline.latencyMs.p50, optimized.latencyMs.p50),
        p95Improvement: relativeImprovement(baseline.latencyMs.p95, optimized.latencyMs.p95),
        p50Speedup:
          optimized.latencyMs.p50 === 0
            ? null
            : baseline.latencyMs.p50 / optimized.latencyMs.p50,
        p95Speedup:
          optimized.latencyMs.p95 === 0
            ? null
            : baseline.latencyMs.p95 / optimized.latencyMs.p95,
      },
      limitations: [
        'synthetic/non-authoritative：不使用真实微信开发者工具、MCP transport 或真实小程序页面。',
        '100 个正式样本按报告中的 sampleConcurrency 并发发起；单样本延迟包含同进程调度竞争，不能与顺序集成延迟等同。',
        'mock Page/Element 方法立即 resolve，主要放大 baseline 固定 1000ms 等待差异，不能代表真实 RPC 元数据读取成本。',
        'baseline 与 optimized 顺序执行，未随机交错，也未强制垃圾回收。',
        '为避免日志 I/O 污染计时，测量期间抑制 console.error/console.warn。',
      ],
    },
    { repoRoot }
  );

  const outputPath = path.resolve(options.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  return { result, outputPath };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(USAGE);
      return;
    }
    const { result, outputPath } = await runSnapshotSyntheticBenchmark({
      repoRoot: process.cwd(),
      ...args,
    });
    console.log(
      [
        'snapshot synthetic/non-authoritative benchmark 完成',
        `baseline p50/p95=${result.baseline.latencyMs.p50.toFixed(3)}/${result.baseline.latencyMs.p95.toFixed(3)}ms`,
        `optimized p50/p95=${result.optimized.latencyMs.p50.toFixed(3)}/${result.optimized.latencyMs.p95.toFixed(3)}ms`,
        `success=${result.baseline.successes}/${result.baseline.samples} -> ${result.optimized.successes}/${result.optimized.samples}`,
        `output=${outputPath}`,
      ].join('\n')
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
