#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

import { aggregateFile } from './aggregate.mjs';
import { createBenchmarkAdapter } from './adapters/protocol-static.mjs';
import { compareFiles, comparisonExitCode } from './compare.mjs';
import {
  aggregateRecords,
  collectEnvironment,
  FIXTURE_FINGERPRINT_EXCLUDES,
  fingerprintPaths,
  parseJsonLines,
  sha256,
  stableStringify,
} from './lib/core.mjs';
import { BenchmarkRecorder } from './lib/recorder.mjs';

const PROTOCOL_STATIC_HARNESS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROTOCOL_STATIC_HARNESS_REQUIRE = createRequire(import.meta.url);
export const PROTOCOL_STATIC_HARNESS_PATHS = [
  'protocol-static-pair.mjs',
  'adapters/protocol-static.mjs',
  'aggregate.mjs',
  'compare.mjs',
  'lib/core.mjs',
  'lib/recorder.mjs',
];
export const PROTOCOL_STATIC_HARNESS_DEPENDENCIES = [
  {
    name: '@modelcontextprotocol/sdk',
    specifiers: [
      '@modelcontextprotocol/sdk/client/index.js',
      '@modelcontextprotocol/sdk/client/stdio.js',
      '@modelcontextprotocol/sdk/validation/ajv',
    ],
  },
  { name: 'ajv', specifiers: ['ajv'] },
  { name: 'ajv-formats', specifiers: ['ajv-formats'] },
  { name: 'cross-spawn', specifiers: ['cross-spawn'] },
  { name: 'zod', specifiers: ['zod/v4'] },
];

export const PROTOCOL_STATIC_PAIR_USAGE = [
  '用法:',
  '  重新运行双阶段: node scripts/benchmarks/protocol-static-pair.mjs --baseline-server <before/build/server.js> --optimized-server <after/build/server.js> --output-dir <new-or-empty-dir> [--repo-root <path>]',
  '  复用已记录基线: node scripts/benchmarks/protocol-static-pair.mjs --recorded-baseline-dir <previous-result-dir> --optimized-server <after/build/server.js> --output-dir <new-or-empty-dir> [--repo-root <path>]',
].join('\n');

export function parseProtocolStaticPairArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      [
        '--baseline-server',
        '--recorded-baseline-dir',
        '--optimized-server',
        '--output-dir',
        '--repo-root',
      ].includes(argument)
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
  if (!args['optimized-server'] || !args['output-dir']) {
    throw new Error(PROTOCOL_STATIC_PAIR_USAGE);
  }
  if (Boolean(args['baseline-server']) === Boolean(args['recorded-baseline-dir'])) {
    throw new Error(
      `--baseline-server 与 --recorded-baseline-dir 必须且只能指定一个\n${PROTOCOL_STATIC_PAIR_USAGE}`
    );
  }
  return args;
}

function validateServer(serverPath, label) {
  const absolutePath = path.resolve(serverPath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`${label} MCP server 不存在或不是文件: ${absolutePath}`);
  }
  return fs.realpathSync(absolutePath);
}

function prepareOutputDirectory(outputDirectory) {
  const absolutePath = path.resolve(outputDirectory);
  if (fs.existsSync(absolutePath)) {
    if (!fs.statSync(absolutePath).isDirectory() || fs.readdirSync(absolutePath).length > 0) {
      throw new Error(`输出目录必须不存在或为空，拒绝覆盖: ${absolutePath}`);
    }
    return absolutePath;
  }
  fs.mkdirSync(absolutePath, { recursive: true });
  return absolutePath;
}

function resolveOutputTarget(outputDirectory) {
  const absolutePath = path.resolve(outputDirectory);
  if (fs.existsSync(absolutePath)) {
    return fs.realpathSync(absolutePath);
  }
  const missingSegments = [];
  let existingAncestor = absolutePath;
  while (!fs.existsSync(existingAncestor)) {
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = path.dirname(existingAncestor);
  }
  return path.join(fs.realpathSync(existingAncestor), ...missingSegments);
}

function validateRecordedDirectory(recordedBaselineDirectory) {
  const absolutePath = path.resolve(recordedBaselineDirectory);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`已记录 baseline 目录不存在或不是目录: ${absolutePath}`);
  }
  return fs.realpathSync(absolutePath);
}

function readRequiredFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`已记录 baseline 缺少 ${label}: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function parseJsonObject(content, label) {
  let value;
  try {
    value = JSON.parse(content.toString('utf8'));
  } catch (error) {
    throw new Error(
      `${label} 不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return value;
}

function assertMatchingFingerprint(label, actual, expected) {
  if (typeof actual !== 'string' || actual !== expected) {
    throw new Error(
      `已记录 baseline ${label} 与当前正式基准不一致（recorded=${actual ?? 'missing'}, current=${expected}）`
    );
  }
}

function expectedIterations(count) {
  return Array.from({ length: count }, (_, index) => index + 1);
}

function assertExactIterations(samples, scenario, warmup) {
  const expectedCount = warmup ? (scenario.warmups ?? 0) : scenario.iterations;
  const actual = samples
    .filter((sample) => sample.warmup === warmup)
    .map((sample) => sample.iteration)
    .sort((left, right) => left - right);
  const expected = expectedIterations(expectedCount);
  if (stableStringify(actual) !== stableStringify(expected)) {
    throw new Error(
      `已记录 baseline 场景 ${scenario.id} 的${warmup ? '预热' : '正式'}样本不完整（期望 iteration 1..${expectedCount}）`
    );
  }
}

function resolveHarnessDependency(definition) {
  const entrypoints = definition.specifiers.map((specifier) => {
    const resolved =
      typeof import.meta.resolve === 'function'
        ? import.meta.resolve(specifier)
        : PROTOCOL_STATIC_HARNESS_REQUIRE.resolve(specifier);
    const absolutePath = resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved;
    return { specifier, absolutePath };
  });
  let packageRoot = path.dirname(entrypoints[0].absolutePath);
  let manifestPath;
  let manifest;
  while (true) {
    const candidate = path.join(packageRoot, 'package.json');
    if (fs.existsSync(candidate)) {
      const value = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (value.name === definition.name) {
        manifestPath = candidate;
        manifest = value;
        break;
      }
    }
    const parent = path.dirname(packageRoot);
    if (parent === packageRoot) {
      throw new Error(`无法解析 benchmark harness 依赖: ${definition.name}`);
    }
    packageRoot = parent;
  }
  const manifestContent = fs.readFileSync(manifestPath);
  return {
    name: definition.name,
    version: manifest.version ?? null,
    packageJsonSha256: sha256(manifestContent),
    entrypoints: entrypoints
      .map(({ specifier, absolutePath }) => ({
        specifier,
        path: path.relative(packageRoot, absolutePath).replaceAll(path.sep, '/'),
        sha256: sha256(fs.readFileSync(absolutePath)),
      }))
      .sort((left, right) => left.specifier.localeCompare(right.specifier)),
  };
}

export function fingerprintProtocolStaticHarness() {
  const scripts = fingerprintPaths(
    PROTOCOL_STATIC_HARNESS_ROOT,
    PROTOCOL_STATIC_HARNESS_PATHS
  );
  const dependencies = PROTOCOL_STATIC_HARNESS_DEPENDENCIES.map((definition) =>
    resolveHarnessDependency(definition)
  ).sort((left, right) => left.name.localeCompare(right.name));
  return {
    version: 'protocol-static-harness-1',
    root: 'scripts/benchmarks',
    files: scripts.files,
    dependencies,
    fingerprint: sha256(
      stableStringify({
        version: 'protocol-static-harness-1',
        scriptsFingerprint: scripts.fingerprint,
        dependencies,
      })
    ),
  };
}

function resolveRecordedHarnessStatus(run, recordedEnvironment, currentHarness) {
  const runFingerprint = run.harness?.fingerprint;
  const hasManifestBaselineFingerprint = Object.hasOwn(
    recordedEnvironment,
    'baselineHarnessFingerprint'
  );
  const manifestFingerprint = hasManifestBaselineFingerprint
    ? recordedEnvironment.baselineHarnessFingerprint
    : recordedEnvironment.harness?.fingerprint;

  if (runFingerprint === undefined && (manifestFingerprint === undefined || manifestFingerprint === null)) {
    return {
      status: 'legacy-missing',
      baselineFingerprint: null,
      deterministicAuthoritative: false,
      latencyAuthoritative: false,
    };
  }
  if (typeof runFingerprint !== 'string' || typeof manifestFingerprint !== 'string') {
    throw new Error('已记录 baseline harness provenance 不完整');
  }
  assertMatchingFingerprint('harness fingerprint', runFingerprint, currentHarness.fingerprint);
  assertMatchingFingerprint(
    'environment.json baseline harness fingerprint',
    manifestFingerprint,
    runFingerprint
  );
  return {
    status: 'matched',
    baselineFingerprint: runFingerprint,
    deterministicAuthoritative: true,
    latencyAuthoritative: false,
  };
}

function createAuthorityProfile(harnessStatus, currentHarness, pairSessionStatus) {
  const deterministicAuthoritative = harnessStatus.deterministicAuthoritative;
  const latencyAuthoritative = harnessStatus.latencyAuthoritative;
  return {
    mode: latencyAuthoritative
      ? 'fully-authoritative'
      : deterministicAuthoritative
        ? 'mixed-authority'
        : 'indicative-only',
    fullyAuthoritative: deterministicAuthoritative && latencyAuthoritative,
    deterministic: {
      authoritative: deterministicAuthoritative,
      label: deterministicAuthoritative ? 'authoritative' : 'indicative/non-authoritative',
      slices: ['payload-bytes', 'schema-shape', 'contract', 'sample-completeness'],
      reason: deterministicAuthoritative
        ? 'baseline 与 optimized 使用相同 benchmark harness 内容指纹'
        : '历史 baseline 未记录 harness 且未保留原始 MCP 响应，无法证明确定性指标的提取语义一致',
    },
    latency: {
      authoritative: latencyAuthoritative,
      label: latencyAuthoritative ? 'authoritative' : 'indicative/non-authoritative',
      reason: latencyAuthoritative
        ? 'baseline 与 optimized 来自同一次 fresh pair session 且 harness 指纹一致'
        : harnessStatus.status === 'legacy-missing'
          ? '历史 baseline 未记录 benchmark harness 指纹'
          : 'recorded baseline 与 optimized 不属于同一次 fresh pair session，系统负载、功耗与温控条件无法对齐',
    },
    harness: {
      baselineStatus: harnessStatus.status,
      baselineFingerprint: harnessStatus.baselineFingerprint,
      currentFingerprint: currentHarness.fingerprint,
    },
    pairSession: pairSessionStatus,
  };
}

export function validateRecordedBaseline(options) {
  const recordedDirectory = validateRecordedDirectory(options.recordedBaselineDirectory);
  const baselineJsonlPath = path.join(recordedDirectory, 'baseline.jsonl');
  const environmentPath = path.join(recordedDirectory, 'environment.json');
  const baselineJsonl = readRequiredFile(baselineJsonlPath, 'baseline.jsonl');
  const recordedEnvironmentContent = readRequiredFile(environmentPath, 'environment.json');
  const recordedEnvironment = parseJsonObject(
    recordedEnvironmentContent,
    '已记录 baseline environment.json'
  );
  const records = parseJsonLines(baselineJsonl.toString('utf8'));
  const aggregate = aggregateRecords(records);
  const run = records[0];

  if (run.phase !== 'baseline') {
    throw new Error(`已记录 baseline run phase 必须为 baseline，实际为 ${run.phase}`);
  }
  if (
    run.parameters?.benchmarkKind !== 'protocol-static' ||
    run.parameters?.workloadVersion !== options.workload.version
  ) {
    throw new Error('已记录 baseline 不是当前 protocol-static 正式 workload 记录');
  }

  assertMatchingFingerprint(
    'workload fingerprint',
    run.workload?.fingerprint,
    options.workloadIdentity.fingerprint
  );
  assertMatchingFingerprint(
    'fixture fingerprint',
    run.fixture?.fingerprint,
    options.fixture.fingerprint
  );
  assertMatchingFingerprint(
    '环境 comparisonFingerprint',
    run.environment?.comparisonFingerprint,
    options.environment.comparisonFingerprint
  );

  const workloadIds = options.workload.scenarios.map((scenario) => scenario.id).sort();
  if (new Set(workloadIds).size !== workloadIds.length) {
    throw new Error('当前 protocol-static workload 存在重复场景 ID');
  }
  const recordedIds = Object.keys(aggregate.scenarios).sort();
  if (stableStringify(recordedIds) !== stableStringify(workloadIds)) {
    throw new Error('已记录 baseline 未完整覆盖当前 protocol-static workload 场景');
  }

  const samples = records.slice(1);
  for (const scenario of options.workload.scenarios) {
    const scenarioSamples = samples.filter((sample) => sample.scenarioId === scenario.id);
    if (scenarioSamples.some((sample) => sample.direction !== scenario.direction)) {
      throw new Error(`已记录 baseline 场景 ${scenario.id} 的 direction 与 workload 不一致`);
    }
    assertExactIterations(scenarioSamples, scenario, true);
    assertExactIterations(scenarioSamples, scenario, false);
  }

  assertMatchingFingerprint(
    'environment.json workload fingerprint',
    recordedEnvironment.workload?.fingerprint,
    options.workloadIdentity.fingerprint
  );
  assertMatchingFingerprint(
    'environment.json fixture fingerprint',
    recordedEnvironment.fixtureFingerprint,
    options.fixture.fingerprint
  );
  assertMatchingFingerprint(
    'environment.json 环境 comparisonFingerprint',
    recordedEnvironment.environment?.comparisonFingerprint,
    options.environment.comparisonFingerprint
  );
  assertMatchingFingerprint(
    'environment.json baseline source fingerprint',
    recordedEnvironment.baselineSourceFingerprint,
    run.source.fingerprint
  );
  if (
    !recordedEnvironment.baselinePackage ||
    typeof recordedEnvironment.baselinePackage !== 'object' ||
    Array.isArray(recordedEnvironment.baselinePackage)
  ) {
    throw new Error('已记录 baseline environment.json 缺少 baselinePackage identity');
  }
  if (run.source.fingerprint === options.optimizedSourceFingerprint) {
    throw new Error('baseline 与 optimized 构建指纹相同，拒绝生成无意义的 before/after 对比');
  }
  const harnessStatus = resolveRecordedHarnessStatus(
    run,
    recordedEnvironment,
    options.currentHarness
  );

  return {
    aggregate,
    baselineJsonl,
    baselineJsonlPath,
    baselineJsonlSha256: sha256(baselineJsonl),
    baselinePackage: recordedEnvironment.baselinePackage,
    environmentJsonSha256: sha256(recordedEnvironmentContent),
    harnessStatus,
    baselinePairSession: run.pairSession ?? null,
    recordedDirectory,
    sourceFingerprint: run.source.fingerprint,
  };
}

function fingerprintServerBuild(serverPath) {
  const buildRoot = path.dirname(serverPath);
  const projectRoot = path.basename(buildRoot) === 'build' ? path.dirname(buildRoot) : buildRoot;
  const identityPaths = [path.relative(projectRoot, buildRoot) || '.'];
  for (const manifestName of ['package.json', 'package-lock.json']) {
    if (fs.existsSync(path.join(projectRoot, manifestName))) {
      identityPaths.push(manifestName);
    }
  }
  const packagePath = path.join(projectRoot, 'package.json');
  const packageJson = fs.existsSync(packagePath)
    ? JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    : {};
  const declaredDependencies = packageJson.dependencies ?? {};
  const resolvedDependencies = {};
  for (const dependency of Object.keys(declaredDependencies).sort()) {
    const dependencyPackage = path.join(projectRoot, 'node_modules', dependency, 'package.json');
    resolvedDependencies[dependency] = fs.existsSync(dependencyPackage)
      ? JSON.parse(fs.readFileSync(dependencyPackage, 'utf8')).version
      : null;
  }
  const packageIdentity = {
    packageVersion: packageJson.version ?? null,
    nodeEngine: packageJson.engines?.node ?? null,
    declaredDependencies,
    resolvedDependencies,
    lockfilePresent: fs.existsSync(path.join(projectRoot, 'package-lock.json')),
  };
  return {
    projectRoot,
    packageIdentity,
    source: {
      ...fingerprintPaths(projectRoot, identityPaths, { exclude: ['.DS_Store'] }),
      entrypoint: path.relative(projectRoot, serverPath).replaceAll(path.sep, '/'),
    },
  };
}

function isSameOrNested(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function describeArtifactDirectory(repoRoot, directory) {
  const canonicalRepoRoot = fs.existsSync(repoRoot) ? fs.realpathSync(repoRoot) : repoRoot;
  const relative = path.relative(canonicalRepoRoot, directory);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return (relative || '.').replaceAll(path.sep, '/');
  }
  return `<EXTERNAL>/${path.basename(directory)}`;
}

async function runPhase(options) {
  const previousServerPath = process.env.BENCHMARK_SERVER_PATH;
  const previousServerCwd = process.env.BENCHMARK_SERVER_CWD;
  process.env.BENCHMARK_SERVER_PATH = options.serverPath;
  process.env.BENCHMARK_SERVER_CWD = options.serverCwd;
  const adapter = await createBenchmarkAdapter({
    repoRoot: options.repoRoot,
    phase: options.phase,
    workload: options.workload,
  });
  let recorder;
  try {
    await adapter.setup();
    const health = await adapter.healthCheck();
    if (!health?.ok) {
      throw new Error(`protocol-static adapter 健康检查失败: ${health?.message ?? 'unknown'}`);
    }
    recorder = new BenchmarkRecorder({
      outputPath: options.outputPath,
      repoRoot: options.repoRoot,
      runId: `protocol-static-${options.phase}-${Date.now()}`,
      phase: options.phase,
      preflight: {
        valid: true,
        environment: options.environment,
        workload: options.workloadIdentity,
        fixture: options.fixture,
        source: options.source,
        harness: options.harness,
        pairSession: options.pairSession,
        safety: {
          devtoolsAccess: false,
          devtoolsProcessesInspected: false,
          devtoolsProcessesTerminated: 0,
          ownedMcpChildrenOnly: true,
        },
      },
      parameters: {
        benchmarkKind: 'protocol-static',
        adapter: adapter.name,
        workloadVersion: options.workload.version,
      },
    });

    for (const scenario of options.workload.scenarios) {
      for (let iteration = 1; iteration <= scenario.warmups; iteration += 1) {
        await recorder.measure(
          {
            scenarioId: scenario.id,
            direction: scenario.direction,
            iteration,
            warmup: true,
          },
          () => adapter.runScenario({ scenario, iteration, warmup: true })
        );
      }
      for (let iteration = 1; iteration <= scenario.iterations; iteration += 1) {
        await recorder.measure(
          {
            scenarioId: scenario.id,
            direction: scenario.direction,
            iteration,
            warmup: false,
          },
          () => adapter.runScenario({ scenario, iteration, warmup: false })
        );
      }
    }
  } finally {
    recorder?.close();
    await adapter.teardown();
    if (previousServerPath === undefined) {
      delete process.env.BENCHMARK_SERVER_PATH;
    } else {
      process.env.BENCHMARK_SERVER_PATH = previousServerPath;
    }
    if (previousServerCwd === undefined) {
      delete process.env.BENCHMARK_SERVER_CWD;
    } else {
      process.env.BENCHMARK_SERVER_CWD = previousServerCwd;
    }
  }
}

export async function runProtocolStaticPair(options) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const recordedMode = Boolean(options.recordedBaselineDirectory);
  const pairSession = {
    id: randomUUID(),
    mode: recordedMode ? 'recorded-baseline-recovery' : 'fresh-pair',
  };
  if (recordedMode === Boolean(options.baselineServer)) {
    throw new Error('baselineServer 与 recordedBaselineDirectory 必须且只能指定一个');
  }
  const baselineServer = recordedMode ? null : validateServer(options.baselineServer, 'baseline');
  const optimizedServer = validateServer(options.optimizedServer, 'optimized');
  const baselineBuildRoot = baselineServer ? path.dirname(baselineServer) : null;
  const optimizedBuildRoot = path.dirname(optimizedServer);
  if (
    baselineBuildRoot &&
    (isSameOrNested(baselineBuildRoot, optimizedBuildRoot) ||
      isSameOrNested(optimizedBuildRoot, baselineBuildRoot))
  ) {
    throw new Error('baseline 与 optimized 必须位于两个互不嵌套的独立构建目录');
  }
  const workloadPath = path.join(repoRoot, 'benchmarks/workload.protocol-static.v1.json');
  const workload = JSON.parse(fs.readFileSync(workloadPath, 'utf8'));
  const workloadIdentity = {
    version: workload.version,
    fingerprint: sha256(stableStringify(workload)),
    path: 'benchmarks/workload.protocol-static.v1.json',
  };
  const environment = collectEnvironment();
  const currentHarness = fingerprintProtocolStaticHarness();
  const fixture = fingerprintPaths(repoRoot, ['tests/fixtures/benchmark-app'], {
    exclude: FIXTURE_FINGERPRINT_EXCLUDES,
  });
  const baselineBuild = baselineServer ? fingerprintServerBuild(baselineServer) : null;
  const optimizedBuild = fingerprintServerBuild(optimizedServer);
  if (baselineBuild?.source.fingerprint === optimizedBuild.source.fingerprint) {
    throw new Error('baseline 与 optimized 构建指纹相同，拒绝生成无意义的 before/after 对比');
  }
  const recordedBaseline = recordedMode
    ? validateRecordedBaseline({
        recordedBaselineDirectory: options.recordedBaselineDirectory,
        workload,
        workloadIdentity,
        environment,
        fixture,
        currentHarness,
        optimizedSourceFingerprint: optimizedBuild.source.fingerprint,
      })
    : null;
  const baselineHarnessStatus = recordedBaseline?.harnessStatus ?? {
    status: 'matched',
    baselineFingerprint: currentHarness.fingerprint,
    deterministicAuthoritative: true,
    latencyAuthoritative: true,
  };
  const pairSessionStatus = recordedBaseline
    ? {
        status: 'recorded-separate-session',
        baseline: recordedBaseline.baselinePairSession,
        optimized: pairSession,
      }
    : {
        status: 'fresh-paired',
        baseline: pairSession,
        optimized: pairSession,
      };
  const authorityProfile = createAuthorityProfile(
    baselineHarnessStatus,
    currentHarness,
    pairSessionStatus
  );
  const authority = authorityProfile.fullyAuthoritative
    ? 'protocol-static/authoritative-for-five-declared-slices'
    : authorityProfile.deterministic.authoritative
      ? 'protocol-static/mixed-authority-deterministic-authoritative-latency-indicative'
      : 'protocol-static/indicative-only-no-harness-provenance';
  const requestedOutputDirectory = resolveOutputTarget(options.outputDirectory);
  if (
    (baselineBuildRoot && isSameOrNested(baselineBuildRoot, requestedOutputDirectory)) ||
    isSameOrNested(optimizedBuildRoot, requestedOutputDirectory)
  ) {
    throw new Error('输出目录不能位于 baseline 或 optimized 构建目录内');
  }
  if (
    recordedBaseline &&
    (isSameOrNested(recordedBaseline.recordedDirectory, requestedOutputDirectory) ||
      isSameOrNested(requestedOutputDirectory, recordedBaseline.recordedDirectory))
  ) {
    throw new Error('新输出目录与已记录 baseline 目录必须互不嵌套');
  }
  const outputDirectory = prepareOutputDirectory(requestedOutputDirectory);

  const baselineJsonl = path.join(outputDirectory, 'baseline.jsonl');
  const optimizedJsonl = path.join(outputDirectory, 'optimized.jsonl');
  const baselineAggregate = path.join(outputDirectory, 'baseline.aggregate.json');
  const optimizedAggregate = path.join(outputDirectory, 'optimized.aggregate.json');
  if (recordedBaseline) {
    fs.copyFileSync(recordedBaseline.baselineJsonlPath, baselineJsonl, fs.constants.COPYFILE_EXCL);
    const copiedBaseline = fs.readFileSync(baselineJsonl);
    if (!copiedBaseline.equals(recordedBaseline.baselineJsonl)) {
      throw new Error('已记录 baseline.jsonl 未能字节级原样复制');
    }
  } else {
    await runPhase({
      repoRoot,
      phase: 'baseline',
      serverPath: baselineServer,
      serverCwd: baselineBuild.projectRoot,
      outputPath: baselineJsonl,
      workload,
      workloadIdentity,
      environment,
      fixture,
      harness: currentHarness,
      pairSession,
      source: baselineBuild.source,
    });
  }
  aggregateFile(baselineJsonl, baselineAggregate);
  await runPhase({
    repoRoot,
    phase: 'optimized',
    serverPath: optimizedServer,
    serverCwd: optimizedBuild.projectRoot,
    outputPath: optimizedJsonl,
    workload,
    workloadIdentity,
    environment,
    fixture,
    harness: currentHarness,
    pairSession,
    source: optimizedBuild.source,
  });

  aggregateFile(optimizedJsonl, optimizedAggregate);
  const comparison = compareFiles({
    baseline: baselineAggregate,
    optimized: optimizedAggregate,
    workload: workloadPath,
    outputJson: path.join(outputDirectory, 'comparison.json'),
    outputMd: path.join(outputDirectory, 'comparison.md'),
    authority,
    authorityProfile,
    coverage: {
      coveredScenarios: workload.scenarios.map((scenario) => scenario.id),
      excludedScenarios: [
        'real-devtools-runtime',
        'real-devtools-locator-input',
        'image-response',
        'full-structured-workflow',
      ],
    },
  });
  fs.writeFileSync(
    path.join(outputDirectory, 'environment.json'),
    `${JSON.stringify(
      {
        environment,
        workload: workloadIdentity,
        fixtureFingerprint: fixture.fingerprint,
        harness: currentHarness,
        baselineHarnessFingerprint: baselineHarnessStatus.baselineFingerprint,
        pairSession,
        baselineSourceFingerprint:
          recordedBaseline?.sourceFingerprint ?? baselineBuild.source.fingerprint,
        optimizedSourceFingerprint: optimizedBuild.source.fingerprint,
        baselinePackage: recordedBaseline?.baselinePackage ?? baselineBuild.packageIdentity,
        optimizedPackage: optimizedBuild.packageIdentity,
        authority,
        authorityProfile,
        baselineAcquisition: recordedBaseline
          ? {
              mode: 'recorded-jsonl-reuse',
              sourceDirectory: describeArtifactDirectory(
                repoRoot,
                recordedBaseline.recordedDirectory
              ),
              baselineJsonlSha256: recordedBaseline.baselineJsonlSha256,
              sourceEnvironmentJsonSha256: recordedBaseline.environmentJsonSha256,
              copiedVerbatim: true,
              aggregateRecomputed: true,
              harnessStatus: recordedBaseline.harnessStatus.status,
            }
          : {
              mode: 'fresh-server-run',
              copiedVerbatim: false,
              aggregateRecomputed: true,
              harnessStatus: 'matched',
            },
        safety: {
          devtoolsAccess: false,
          devtoolsProcessesInspected: false,
          devtoolsProcessesTerminated: 0,
          ownedMcpChildrenOnly: true,
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return comparison;
}

async function main() {
  try {
    const args = parseProtocolStaticPairArgs(process.argv.slice(2));
    if (args.help) {
      console.log(PROTOCOL_STATIC_PAIR_USAGE);
      return;
    }
    const comparison = await runProtocolStaticPair({
      baselineServer: args['baseline-server'],
      recordedBaselineDirectory: args['recorded-baseline-dir'],
      optimizedServer: args['optimized-server'],
      outputDirectory: args['output-dir'],
      repoRoot: args['repo-root'] ?? process.cwd(),
    });
    const verdict =
      comparison.acceptance.passed === null
        ? `PARTIAL（严格权威验收 ${comparison.acceptance.authoritativePassed === null ? 'N/A' : comparison.acceptance.authoritativePassed ? 'PASS' : 'FAIL'}，其余仅 INDICATIVE）`
        : comparison.acceptance.passed
          ? 'PASS'
          : 'FAIL';
    console.log(`协议静态对比完成：${verdict}`);
    process.exitCode = comparisonExitCode(comparison);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
