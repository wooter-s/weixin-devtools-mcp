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

const DEFAULT_BASELINE_ENTRY = '/tmp/weixin-mcp-true-baseline.OghYtV/build/MiniProgramContext.js';
const DEFAULT_OPTIMIZED_ENTRY = 'build/MiniProgramContext.js';
const DEFAULT_OUTPUT = 'benchmarks/results/v0.6.0/runtime-lifecycle-synthetic-before-after.json';
const DEFAULT_SAMPLES = 100;
const DEFAULT_WARMUPS = 3;
const DEFAULT_CONCURRENCY = 100;

function positiveInteger(value, name, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${name} 必须是${allowZero ? '非负' : '正'}整数`);
  }
  return parsed;
}

function parseArgs(argv) {
  const result = {
    baselineEntry: DEFAULT_BASELINE_ENTRY,
    optimizedEntry: DEFAULT_OPTIMIZED_ENTRY,
    output: DEFAULT_OUTPUT,
    samples: DEFAULT_SAMPLES,
    warmups: DEFAULT_WARMUPS,
    concurrency: DEFAULT_CONCURRENCY,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`${name} 缺少值`);
    if (name === '--baseline-entry') result.baselineEntry = value;
    else if (name === '--optimized-entry') result.optimizedEntry = value;
    else if (name === '--output') result.output = value;
    else if (name === '--samples') result.samples = positiveInteger(value, name);
    else if (name === '--warmups') result.warmups = positiveInteger(value, name, true);
    else if (name === '--concurrency') result.concurrency = positiveInteger(value, name);
    else throw new Error(`未知参数: ${name}`);
  }
  return result;
}

function resolveEntry(entry, label) {
  const resolved = fs.realpathSync(path.resolve(entry));
  if (!fs.statSync(resolved).isFile()) throw new Error(`${label} entry 不是文件: ${resolved}`);
  return resolved;
}

function buildFingerprint(entry) {
  const root = path.dirname(entry);
  const manifest = [];
  const visit = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const stat = fs.statSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile() && name.endsWith('.js')) {
        manifest.push({
          path: path.relative(root, absolute).replaceAll(path.sep, '/'),
          sha256: sha256(fs.readFileSync(absolute)),
        });
      }
    }
  };
  visit(root);
  return sha256(stableStringify(manifest));
}

function createMiniProgram({ failExceptionListener = false } = {}) {
  const listeners = new Map([
    ['console', new Set()],
    ['exception', new Set()],
  ]);
  let disconnectCalls = 0;
  return {
    currentPage: async () => ({ path: '/pages/synthetic/index' }),
    on(event, handler) {
      if (event === 'exception' && failExceptionListener) {
        throw new Error('synthetic exception listener failure');
      }
      listeners.get(event)?.add(handler);
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler);
    },
    evaluate: async () => undefined,
    mockWxMethod: async () => undefined,
    restoreWxMethod: async () => undefined,
    disconnect: async () => {
      disconnectCalls += 1;
    },
    listenerCount: (event) => listeners.get(event)?.size ?? 0,
    disconnectCalls: () => disconnectCalls,
  };
}

async function runLifecycleCase(ContextClass) {
  const listenerMiniProgram = createMiniProgram({ failExceptionListener: true });
  const listenerContext = await ContextClass.from(listenerMiniProgram);
  let registrationFailed = false;
  try {
    listenerContext.bindConsoleAndExceptionListeners({
      consoleHandler: () => undefined,
      exceptionHandler: () => undefined,
    });
  } catch {
    registrationFailed = true;
  }
  const listenerRollback = registrationFailed &&
    listenerMiniProgram.listenerCount('console') === 0 &&
    listenerMiniProgram.listenerCount('exception') === 0;

  const previousMiniProgram = createMiniProgram();
  const replacementMiniProgram = createMiniProgram();
  const replacementContext = await ContextClass.from(previousMiniProgram);
  await replacementContext.setMiniProgram(replacementMiniProgram);
  const replacementCleanup = previousMiniProgram.disconnectCalls() === 1 &&
    replacementContext.miniProgram === replacementMiniProgram;

  return {
    success: listenerRollback && replacementCleanup,
    listenerRollback,
    replacementCleanup,
  };
}

async function runSamples(total, concurrency, operation) {
  const samples = new Array(total);
  let next = 0;
  const workers = Array.from({ length: Math.min(total, concurrency) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= total) return;
      const started = performance.now();
      try {
        samples[index] = {
          ...(await operation()),
          durationMs: performance.now() - started,
        };
      } catch (error) {
        samples[index] = {
          success: false,
          listenerRollback: false,
          replacementCleanup: false,
          durationMs: performance.now() - started,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  });
  await Promise.all(workers);
  return samples;
}

function summarize(samples, wallClockMs, entry, sourceFingerprint) {
  const durations = samples.map((sample) => sample.durationMs);
  const successes = samples.filter((sample) => sample.success).length;
  const listenerRollbackSuccesses = samples.filter((sample) => sample.listenerRollback).length;
  const replacementCleanupSuccesses = samples.filter((sample) => sample.replacementCleanup).length;
  const durationSummary = summarizeNumbers(durations);
  return {
    entry,
    sourceFingerprint,
    samples: samples.length,
    successes,
    failures: samples.length - successes,
    successRate: successes / samples.length,
    successRateWilson95: wilsonInterval(successes, samples.length),
    invariants: {
      partialListenerRegistrationRollback: {
        successes: listenerRollbackSuccesses,
        successRate: listenerRollbackSuccesses / samples.length,
      },
      activeSessionReplacementCleanup: {
        successes: replacementCleanupSuccesses,
        successRate: replacementCleanupSuccesses / samples.length,
      },
    },
    latencyMs: {
      min: durationSummary.min,
      max: durationSummary.max,
      mean: durationSummary.mean,
      p50: nearestRank(durations, 0.5),
      p95: nearestRank(durations, 0.95),
    },
    wallClockMs,
    errors: samples.flatMap((sample) => sample.error ? [sample.error] : []),
  };
}

async function measure(ContextClass, options) {
  await runSamples(options.warmups, options.concurrency, () => runLifecycleCase(ContextClass));
  const started = performance.now();
  const samples = await runSamples(options.samples, options.concurrency, () => runLifecycleCase(ContextClass));
  return summarize(
    samples,
    performance.now() - started,
    options.entry,
    options.sourceFingerprint,
  );
}

export async function runRuntimeLifecycleSynthetic(options) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const baselineEntry = resolveEntry(options.baselineEntry, 'baseline');
  const optimizedEntry = resolveEntry(options.optimizedEntry, 'optimized');
  const baselineFingerprint = buildFingerprint(baselineEntry);
  const optimizedFingerprint = buildFingerprint(optimizedEntry);
  if (baselineFingerprint === optimizedFingerprint) {
    throw new Error('baseline 与 optimized build 指纹相同');
  }

  const baselineModule = await import(pathToFileURL(baselineEntry).href);
  const optimizedModule = await import(pathToFileURL(optimizedEntry).href);
  if (!baselineModule.MiniProgramContext || !optimizedModule.MiniProgramContext) {
    throw new Error('baseline 或 optimized entry 未导出 MiniProgramContext');
  }

  const workload = {
    samples: options.samples,
    warmups: options.warmups,
    concurrency: Math.min(options.samples, options.concurrency),
    invariants: ['partial-listener-registration-rollback', 'active-session-replacement-cleanup'],
  };
  const baseline = await measure(baselineModule.MiniProgramContext, {
    ...workload,
    entry: baselineEntry,
    sourceFingerprint: baselineFingerprint,
  });
  const optimized = await measure(optimizedModule.MiniProgramContext, {
    ...workload,
    entry: optimizedEntry,
    sourceFingerprint: optimizedFingerprint,
  });

  const result = redactSensitive({
    schemaVersion: '1.0',
    recordType: 'runtime-lifecycle-before-after',
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
    },
    baseline,
    optimized,
    delta: {
      successRatePercentagePoints: (optimized.successRate - baseline.successRate) * 100,
      listenerRollbackPercentagePoints:
        (optimized.invariants.partialListenerRegistrationRollback.successRate -
          baseline.invariants.partialListenerRegistrationRollback.successRate) * 100,
      replacementCleanupPercentagePoints:
        (optimized.invariants.activeSessionReplacementCleanup.successRate -
          baseline.invariants.activeSessionReplacementCleanup.successRate) * 100,
      p95LatencyMs: optimized.latencyMs.p95 - baseline.latencyMs.p95,
    },
  }, { repoRoot });

  const output = path.resolve(repoRoot, options.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return { output, result };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  runRuntimeLifecycleSynthetic({ ...args, repoRoot: process.cwd() })
    .then(({ output, result }) => {
      console.log(`runtime lifecycle synthetic result: ${output}`);
      console.log(`success rate: ${result.baseline.successRate} -> ${result.optimized.successRate}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
