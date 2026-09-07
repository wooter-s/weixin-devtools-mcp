#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  collectEnvironment,
  FIXTURE_FINGERPRINT_EXCLUDES,
  fingerprintPaths,
  sha256,
  sourceFingerprint,
  stableStringify,
} from './lib/core.mjs';
import { BenchmarkRecorder } from './lib/recorder.mjs';

const USAGE = '用法: node scripts/benchmarks/run.mjs --phase baseline|optimized --preflight <preflight.json> --adapter <adapter.mjs> --output <run.jsonl> [--run-id <id>] [--repo-root <path>] [--scenarios <id,id>]';

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      ['--phase', '--preflight', '--adapter', '--output', '--run-id', '--repo-root', '--scenarios'].includes(
        argument
      )
    ) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} 缺少值`);
      }
      args[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`未知参数: ${argument}`);
  }
  if (!['baseline', 'optimized'].includes(args.phase) || !args.preflight || !args.adapter || !args.output) {
    throw new Error(USAGE);
  }
  return args;
}

function assertPreflightCurrent(repoRoot, phase, preflight, workload) {
  if (!preflight.valid || preflight.phase !== phase) {
    throw new Error('preflight 无效或 phase 不匹配');
  }
  const currentWorkloadFingerprint = sha256(stableStringify(workload));
  const currentFixture = fingerprintPaths(repoRoot, ['playground/benchmark-wx'], {
    exclude: FIXTURE_FINGERPRINT_EXCLUDES,
  });
  if (preflight.workload?.fingerprint !== currentWorkloadFingerprint) {
    throw new Error('preflight 后 workload 已变化，请重新预检');
  }
  if (preflight.fixture?.fingerprint !== currentFixture.fingerprint) {
    throw new Error('preflight 后 fixture 已变化，请重新预检');
  }
  const currentSource = sourceFingerprint(repoRoot);
  if (preflight.source?.fingerprint !== currentSource.fingerprint) {
    throw new Error('preflight 后被测源码或依赖已变化，请重新预检');
  }
  const currentEnvironment = collectEnvironment({
    devtoolsAppPath: preflight.environment?.devtoolsAppPath ?? undefined,
  });
  if (preflight.environment?.comparisonFingerprint !== currentEnvironment.comparisonFingerprint) {
    throw new Error('preflight 后环境已变化，请重新预检');
  }
}

export async function runWorkload(options) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const preflight = JSON.parse(fs.readFileSync(options.preflightPath, 'utf8'));
  const workload = JSON.parse(fs.readFileSync(path.join(repoRoot, 'benchmarks/workload.v1.json'), 'utf8'));
  assertPreflightCurrent(repoRoot, options.phase, preflight, workload);

  const adapterModule = await import(pathToFileURL(path.resolve(options.adapterPath)).href);
  if (typeof adapterModule.createBenchmarkAdapter !== 'function') {
    throw new Error('adapter 必须导出 createBenchmarkAdapter(options)');
  }
  const adapter = await adapterModule.createBenchmarkAdapter({ repoRoot, phase: options.phase, workload });
  for (const method of ['setup', 'healthCheck', 'runScenario', 'teardown']) {
    if (typeof adapter?.[method] !== 'function') {
      throw new Error(`adapter 缺少 ${method}()`);
    }
  }

  let recorder;
  try {
    await adapter.setup();
    const health = await adapter.healthCheck();
    if (!health || health.ok !== true) {
      throw new Error(`adapter 健康检查失败: ${health?.message ?? 'unknown'}`);
    }
    const selectedIds = options.scenarioIds ? new Set(options.scenarioIds) : null;
    const selectedScenarios = selectedIds
      ? workload.scenarios.filter((scenario) => selectedIds.has(scenario.id))
      : workload.scenarios;
    if (selectedIds && selectedScenarios.length !== selectedIds.size) {
      const knownIds = new Set(workload.scenarios.map((scenario) => scenario.id));
      const unknown = [...selectedIds].filter((id) => !knownIds.has(id));
      throw new Error(`未知场景: ${unknown.join(', ')}`);
    }
    recorder = new BenchmarkRecorder({
      outputPath: options.outputPath,
      repoRoot,
      runId: options.runId,
      phase: options.phase,
      preflight,
      parameters: {
        adapter: adapter.name ?? path.basename(options.adapterPath),
        workloadVersion: workload.version,
        partial: selectedScenarios.length !== workload.scenarios.length,
        selectedScenarios: selectedScenarios.map((scenario) => scenario.id),
      },
    });

    for (const scenario of selectedScenarios) {
      for (let iteration = 1; iteration <= scenario.warmups; iteration += 1) {
        await recorder.measure({
          scenarioId: scenario.id,
          direction: scenario.direction,
          iteration,
          warmup: true,
        }, () => adapter.runScenario({ scenario, iteration, warmup: true }));
      }
      for (let iteration = 1; iteration <= scenario.iterations; iteration += 1) {
        await recorder.measure({
          scenarioId: scenario.id,
          direction: scenario.direction,
          iteration,
          warmup: false,
        }, () => adapter.runScenario({ scenario, iteration, warmup: false }));
      }
    }
  } finally {
    recorder?.close();
    await adapter.teardown();
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(USAGE);
      return;
    }
    await runWorkload({
      repoRoot: args['repo-root'] ?? process.cwd(),
      phase: args.phase,
      preflightPath: path.resolve(args.preflight),
      adapterPath: path.resolve(args.adapter),
      outputPath: path.resolve(args.output),
      runId: args['run-id'] ?? `${args.phase}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`,
      scenarioIds: args.scenarios ? args.scenarios.split(',').filter(Boolean) : null,
    });
    console.log(`基准工作负载已完成: ${args.output}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
