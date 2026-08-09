import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const CORE_URL = pathToFileURL(path.resolve(process.cwd(), 'scripts/benchmarks/lib/core.mjs')).href;
const RECORDER_URL = pathToFileURL(
  path.resolve(process.cwd(), 'scripts/benchmarks/lib/recorder.mjs')
).href;
const LOCAL_SERVER_URL = pathToFileURL(
  path.resolve(process.cwd(), 'scripts/benchmarks/local-server.mjs')
).href;
const COMPARE_URL = pathToFileURL(
  path.resolve(process.cwd(), 'scripts/benchmarks/compare.mjs')
).href;
const STATIC_ADAPTER_URL = pathToFileURL(
  path.resolve(process.cwd(), 'scripts/benchmarks/adapters/protocol-static.mjs')
).href;
const RUNNER_URL = pathToFileURL(path.resolve(process.cwd(), 'scripts/benchmarks/run.mjs')).href;
const PROTOCOL_PAIR_URL = pathToFileURL(
  path.resolve(process.cwd(), 'scripts/benchmarks/protocol-static-pair.mjs')
).href;
const DOM_EPOCH_SYNTHETIC_URL = pathToFileURL(
  path.resolve(process.cwd(), 'scripts/benchmarks/phase2-dom-epoch-synthetic.mjs')
).href;

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-mcp-benchmark-'));
  tempRoots.push(root);
  return root;
}

interface DomRecordedBaselineFixture {
  environment: {
    platform: string;
    arch: string;
    node: string;
    [key: string]: unknown;
  };
  baseline: {
    sourceFingerprint: string;
    wrongActionCount: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function createPortableDomRecordedBaseline(): {
  path: string;
  recorded: DomRecordedBaselineFixture;
} {
  const sourcePath = path.resolve(
    process.cwd(),
    'benchmarks/results/v0.6.0/phase2-dom-epoch-before-after.json'
  );
  const recorded = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as DomRecordedBaselineFixture;
  recorded.environment.platform = process.platform;
  recorded.environment.arch = process.arch;
  recorded.environment.node = process.versions.node;

  const fixturePath = path.join(createTempRoot(), 'recorded-dom-baseline.json');
  fs.writeFileSync(fixturePath, `${JSON.stringify(recorded)}\n`, 'utf8');
  return { path: fixturePath, recorded };
}

function createRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    recordType: 'run',
    runId: 'run-1',
    phase: 'baseline',
    valid: true,
    environment: { comparisonFingerprint: 'e'.repeat(64) },
    workload: { fingerprint: 'w'.repeat(64) },
    fixture: { fingerprint: 'f'.repeat(64) },
    source: { fingerprint: 's'.repeat(64) },
    ...overrides,
  };
}

function createSample(
  iteration: number,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    recordType: 'sample',
    runId: 'run-1',
    phase: 'baseline',
    scenarioId: 'scenario-a',
    direction: 'runtime',
    iteration,
    warmup: false,
    startedAt: '2026-08-07T00:00:00.000Z',
    durationMs: iteration,
    status: 'success',
    metrics: { attempts: 1, exact: true },
    ...overrides,
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe('benchmark statistics', () => {
  it('使用 nearest-rank 计算 p50/p95，并给出 Wilson 95% 区间', async () => {
    const { nearestRank, wilsonInterval } = await import(CORE_URL);
    const values = Array.from({ length: 20 }, (_, index) => index + 1);

    expect(nearestRank(values, 0.5)).toBe(10);
    expect(nearestRank(values, 0.95)).toBe(19);
    expect(wilsonInterval(19, 20).low).toBeCloseTo(0.7639, 3);
    expect(wilsonInterval(19, 20).high).toBeCloseTo(0.9911, 3);
  });

  it('聚合时排除预热、保留失败并统计数值与布尔指标', async () => {
    const { aggregateRecords } = await import(CORE_URL);
    const records = [createRun(), createSample(1, { warmup: true, durationMs: 999 })];
    for (let iteration = 1; iteration <= 20; iteration += 1) {
      records.push(
        createSample(
          iteration,
          iteration === 20
            ? {
                status: 'failure',
                error: { code: 'EXPECTED_FAILURE', message: 'expected' },
                metrics: { attempts: 2, exact: false },
              }
            : {}
        )
      );
    }

    const aggregate = aggregateRecords(records);
    expect(aggregate.totals).toMatchObject({
      warmups: 1,
      executed: 20,
      successes: 19,
      failures: 1,
    });
    expect(aggregate.scenarios['scenario-a'].latencyMs).toMatchObject({
      p50: 10,
      p95: 19,
      max: 20,
    });
    expect(aggregate.scenarios['scenario-a'].successRate).toBe(0.95);
    expect(aggregate.scenarios['scenario-a'].metrics.exact.sum).toBe(19);
    expect(aggregate.scenarios['scenario-a'].errorCounts).toEqual({ EXPECTED_FAILURE: 1 });
  });

  it('拒绝重复样本，避免静默放大成功率', async () => {
    const { aggregateRecords } = await import(CORE_URL);
    expect(() => aggregateRecords([createRun(), createSample(1), createSample(1)])).toThrow(
      '重复样本'
    );
  });
});

describe('benchmark identity and privacy', () => {
  it('DOM epoch 合成基准要求唯一 baseline 来源，并按动作时 active generation 判错', async () => {
    const { isWrongSyntheticAction, parsePhase2DomEpochArgs } = await import(
      DOM_EPOCH_SYNTHETIC_URL
    );

    expect(() => parsePhase2DomEpochArgs([])).toThrow('必须且只能提供');
    expect(() =>
      parsePhase2DomEpochArgs([
        '--baseline-entry',
        '/tmp/frozen-baseline/build/MiniProgramContext.js',
        '--recorded-baseline-result',
        '/tmp/recorded.json',
      ])
    ).toThrow('必须且只能提供');
    expect(
      parsePhase2DomEpochArgs([
        '--baseline-entry',
        '/tmp/frozen-baseline/build/MiniProgramContext.js',
        '--samples',
        '3',
      ])
    ).toMatchObject({
      baselineEntry: '/tmp/frozen-baseline/build/MiniProgramContext.js',
      samples: 3,
    });
    expect(
      parsePhase2DomEpochArgs(['--recorded-baseline-result', '/tmp/recorded.json'])
    ).toMatchObject({
      baselineEntry: null,
      recordedBaselineResult: '/tmp/recorded.json',
    });

    expect(
      isWrongSyntheticAction({
        elementStillActiveAtTap: true,
        elementGeneration: 'old',
        activeGenerationAtTap: 'new',
      })
    ).toBe(true);
    expect(
      isWrongSyntheticAction({
        elementStillActiveAtTap: true,
        elementGeneration: 'new',
        activeGenerationAtTap: 'new',
      })
    ).toBe(false);
    expect(
      isWrongSyntheticAction({
        elementStillActiveAtTap: false,
        elementGeneration: 'new',
        activeGenerationAtTap: 'new',
      })
    ).toBe(true);
  });

  it('DOM epoch recorded baseline 严格校验环境和 legacy post-snapshot 指标', async () => {
    const {
      createRecordedBaselinePhase,
      runPhase2DomEpochSynthetic,
      validateRecordedBaselineResult,
    } = await import(DOM_EPOCH_SYNTHETIC_URL);
    const { path: recordedPath, recorded } = createPortableDomRecordedBaseline();

    const validated = validateRecordedBaselineResult(recorded, { expectedSamples: 100 });
    expect(validated).toMatchObject({
      samples: 100,
      layout: 'legacy-phase-top-level',
      baselineSourceFingerprint: recorded.baseline.sourceFingerprint,
    });
    expect(createRecordedBaselinePhase(validated)).toMatchObject({
      partial: true,
      scenarios: {
        postSnapshotSamePageRebuild: { samples: 100, wrongActionCount: 200 },
        metadataReadRebuild: {
          status: 'notMeasured',
          measured: false,
          samples: null,
          tornDraftPublishedCount: null,
        },
      },
    });

    const wrongEnvironment = structuredClone(recorded);
    wrongEnvironment.environment.node = '0.0.0';
    expect(() =>
      validateRecordedBaselineResult(wrongEnvironment, { expectedSamples: 100 })
    ).toThrow('environment.node 不匹配');

    const wrongMetric = structuredClone(recorded);
    wrongMetric.baseline.wrongActionCount -= 1;
    expect(() => validateRecordedBaselineResult(wrongMetric, { expectedSamples: 100 })).toThrow(
      'actionCounts 不自洽'
    );

    await expect(
      runPhase2DomEpochSynthetic({
        recordedBaselineResult: recordedPath,
        baselineEntry: null,
        optimizedEntry: 'build/MiniProgramContext.js',
        output: recordedPath,
        samples: 100,
        warmups: 0,
        repoRoot: process.cwd(),
      })
    ).rejects.toThrow('output 不能与 --recorded-baseline-result');
  });

  it('DOM epoch recovery 会执行声明的每场景正式样本数', async () => {
    const { runPhase2DomEpochSynthetic } = await import(DOM_EPOCH_SYNTHETIC_URL);
    const { path: recordedPath } = createPortableDomRecordedBaseline();
    const output = path.join(createTempRoot(), 'dom-epoch-result.json');

    const { result } = await runPhase2DomEpochSynthetic({
      recordedBaselineResult: recordedPath,
      baselineEntry: null,
      optimizedEntry: 'build/MiniProgramContext.js',
      output,
      samples: 100,
      warmups: 0,
      repoRoot: process.cwd(),
    });

    expect(result.optimized.samplesPerScenario).toBe(100);
    expect(result.optimized.totalCases).toBe(200);
    expect(result.optimized.scenarios.postSnapshotSamePageRebuild.samples).toBe(100);
    expect(result.optimized.scenarios.metadataReadRebuild.samples).toBe(100);
  });

  it('允许被测源码变化，但拒绝环境、workload 或 fixture 漂移', async () => {
    const { aggregateRecords, compareAggregates } = await import(CORE_URL);
    const baseline = aggregateRecords([createRun(), createSample(1, { durationMs: 100 })]);
    const optimized = aggregateRecords([
      createRun({ phase: 'optimized', source: { fingerprint: 'o'.repeat(64) } }),
      createSample(1, { phase: 'optimized', durationMs: 60 }),
    ]);

    const comparison = compareAggregates(baseline, optimized);
    expect(comparison.identity.baselineSourceFingerprint).not.toBe(
      comparison.identity.optimizedSourceFingerprint
    );
    expect(comparison.scenarios['scenario-a'].delta.latencyP50Improvement).toBe(0.4);

    const mismatched = structuredClone(optimized);
    mismatched.run.environment.comparisonFingerprint = 'x'.repeat(64);
    expect(() => compareAggregates(baseline, mismatched)).toThrow('不可比较');

    const harnessBaseline = structuredClone(baseline);
    const harnessOptimized = structuredClone(optimized);
    harnessBaseline.run.harness = { fingerprint: 'h'.repeat(64) };
    harnessOptimized.run.harness = { fingerprint: 'x'.repeat(64) };
    expect(() => compareAggregates(harnessBaseline, harnessOptimized)).toThrow(
      'harness.fingerprint'
    );
  });

  it('递归脱敏凭据、正文、base64、查询参数和本机路径', async () => {
    const { redactSensitive } = await import(CORE_URL);
    const repoRoot = path.join(os.homedir(), 'workspace', 'repo');
    const redacted = redactSensitive(
      {
        authorization: 'Bearer value',
        nested: { requestBody: 'private', file: path.join(repoRoot, 'src/index.ts') },
        imageData: 'A'.repeat(300),
        url: 'http://127.0.0.1/path?token=plain&seq=1',
        errorMessage: 'Authorization: Bearer should-not-leak',
      },
      { repoRoot }
    );

    expect(redacted.authorization).toBe('<REDACTED>');
    expect(redacted.nested.requestBody).toBe('<REDACTED>');
    expect(redacted.nested.file).toBe('<REPO>/src/index.ts');
    expect(redacted.imageData).toBe('<REDACTED>');
    expect(redacted.url).toContain('token=%3CREDACTED%3E');
    expect(redacted.errorMessage).toBe('Authorization: <REDACTED>');
    expect(JSON.stringify(redacted)).not.toContain('plain');
    expect(JSON.stringify(redacted)).not.toContain('should-not-leak');
  });

  it('完整覆盖 workload 后生成可机读和 Markdown 对比结果', async () => {
    const { aggregateRecords, sha256, stableStringify } = await import(CORE_URL);
    const { compareFiles, comparisonExitCode } = await import(COMPARE_URL);
    const root = createTempRoot();
    const workload = {
      version: 'test',
      scenarios: [
        {
          id: 'scenario-a',
          iterations: 1,
          acceptance: {
            successRateMin: 1,
            p95Regression: { maxRelative: 0.1, minBudgetMs: 50 },
          },
        },
      ],
    };
    const workloadFingerprint = sha256(stableStringify(workload));
    const baseline = aggregateRecords([
      createRun({ workload: { fingerprint: workloadFingerprint } }),
      createSample(1, { durationMs: 100 }),
    ]);
    const optimized = aggregateRecords([
      createRun({
        phase: 'optimized',
        workload: { fingerprint: workloadFingerprint },
        source: { fingerprint: 'o'.repeat(64) },
      }),
      createSample(1, { phase: 'optimized', durationMs: 60 }),
    ]);
    const baselinePath = path.join(root, 'baseline.json');
    const optimizedPath = path.join(root, 'optimized.json');
    const workloadPath = path.join(root, 'workload.json');
    const outputJson = path.join(root, 'comparison.json');
    const outputMd = path.join(root, 'comparison.md');
    fs.writeFileSync(baselinePath, JSON.stringify(baseline));
    fs.writeFileSync(optimizedPath, JSON.stringify(optimized));
    fs.writeFileSync(workloadPath, JSON.stringify(workload));

    const comparison = compareFiles({
      baseline: baselinePath,
      optimized: optimizedPath,
      workload: workloadPath,
      outputJson,
      outputMd,
    });
    expect(comparison.acceptance.passed).toBe(true);
    expect(comparisonExitCode(comparison)).toBe(0);
    expect(JSON.parse(fs.readFileSync(outputJson, 'utf8')).comparable).toBe(true);
    expect(fs.readFileSync(outputMd, 'utf8')).toContain('总体验收：**PASS**');
  });
});

describe('protocol-static recorded baseline recovery', () => {
  it('要求 fresh baseline 与 recorded baseline 二选一，并在帮助中展示两种路径', async () => {
    const { parseProtocolStaticPairArgs, PROTOCOL_STATIC_PAIR_USAGE } = await import(
      PROTOCOL_PAIR_URL
    );

    expect(PROTOCOL_STATIC_PAIR_USAGE).toContain('--recorded-baseline-dir');
    expect(
      parseProtocolStaticPairArgs([
        '--baseline-server',
        '/before/server.js',
        '--optimized-server',
        '/after/server.js',
        '--output-dir',
        '/result',
      ])
    ).toMatchObject({ 'baseline-server': '/before/server.js' });
    expect(
      parseProtocolStaticPairArgs([
        '--recorded-baseline-dir',
        '/recorded',
        '--optimized-server',
        '/after/server.js',
        '--output-dir',
        '/result',
      ])
    ).toMatchObject({ 'recorded-baseline-dir': '/recorded' });
    expect(() =>
      parseProtocolStaticPairArgs([
        '--baseline-server',
        '/before/server.js',
        '--recorded-baseline-dir',
        '/recorded',
        '--optimized-server',
        '/after/server.js',
        '--output-dir',
        '/result',
      ])
    ).toThrow('必须且只能指定一个');
    expect(() =>
      parseProtocolStaticPairArgs([
        '--optimized-server',
        '/after/server.js',
        '--output-dir',
        '/result',
      ])
    ).toThrow('必须且只能指定一个');
  });

  it('严格校验记录基线的阶段、指纹、场景样本与 harness', async () => {
    const {
      fingerprintProtocolStaticHarness,
      PROTOCOL_STATIC_HARNESS_DEPENDENCIES,
      PROTOCOL_STATIC_HARNESS_PATHS,
      validateRecordedBaseline,
    } = await import(PROTOCOL_PAIR_URL);
    const root = createTempRoot();
    const workload = {
      version: 'protocol-static-test-1',
      scenarios: [
        { id: 'scenario-a', direction: 'protocol', warmups: 1, iterations: 2 },
        { id: 'scenario-b', direction: 'protocol', warmups: 0, iterations: 1 },
      ],
    };
    const workloadIdentity = { version: workload.version, fingerprint: 'w'.repeat(64) };
    const environment = { comparisonFingerprint: 'e'.repeat(64) };
    const fixture = { fingerprint: 'f'.repeat(64) };
    const optimizedSourceFingerprint = 'o'.repeat(64);
    const currentHarness = fingerprintProtocolStaticHarness();
    expect(currentHarness.files.map((file: { path: string }) => file.path)).toEqual(
      [...PROTOCOL_STATIC_HARNESS_PATHS].sort()
    );
    expect(
      currentHarness.dependencies.map((dependency: { name: string }) => dependency.name)
    ).toEqual(
      PROTOCOL_STATIC_HARNESS_DEPENDENCIES.map(
        (dependency: { name: string }) => dependency.name
      ).sort()
    );
    for (const dependency of currentHarness.dependencies) {
      expect(dependency.version).toMatch(/^\d+\./);
      expect(dependency.packageJsonSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(dependency.entrypoints.length).toBeGreaterThan(0);
      expect(
        dependency.entrypoints.every((entrypoint: { sha256: string }) =>
          /^[a-f0-9]{64}$/.test(entrypoint.sha256)
        )
      ).toBe(true);
    }
    const baselinePackage = { packageVersion: '0.6.0', resolvedDependencies: { sdk: '1.30.0' } };

    function writeCase(
      name: string,
      overrides: {
        phase?: 'baseline' | 'optimized';
        workloadFingerprint?: string;
        fixtureFingerprint?: string;
        environmentFingerprint?: string;
        manifestEnvironmentFingerprint?: string;
        sourceFingerprint?: string;
        includeScenarioB?: boolean;
        scenarioAFormalIterations?: number[];
        harnessFingerprint?: string;
      } = {}
    ): string {
      const directory = path.join(root, name);
      fs.mkdirSync(directory);
      const phase = overrides.phase ?? 'baseline';
      const sourceFingerprint = overrides.sourceFingerprint ?? 'b'.repeat(64);
      const records: Record<string, unknown>[] = [
        createRun({
          phase,
          environment: {
            comparisonFingerprint:
              overrides.environmentFingerprint ?? environment.comparisonFingerprint,
          },
          workload: {
            version: workload.version,
            fingerprint: overrides.workloadFingerprint ?? workloadIdentity.fingerprint,
          },
          fixture: { fingerprint: overrides.fixtureFingerprint ?? fixture.fingerprint },
          source: { fingerprint: sourceFingerprint },
          ...(overrides.harnessFingerprint
            ? { harness: { fingerprint: overrides.harnessFingerprint } }
            : {}),
          parameters: {
            benchmarkKind: 'protocol-static',
            workloadVersion: workload.version,
          },
        }),
        createSample(1, {
          phase,
          scenarioId: 'scenario-a',
          direction: 'protocol',
          warmup: true,
        }),
        ...(overrides.scenarioAFormalIterations ?? [1, 2]).map((iteration) =>
          createSample(iteration, {
            phase,
            scenarioId: 'scenario-a',
            direction: 'protocol',
          })
        ),
        ...(overrides.includeScenarioB === false
          ? []
          : [
              createSample(1, {
                phase,
                scenarioId: 'scenario-b',
                direction: 'protocol',
              }),
            ]),
      ];
      fs.writeFileSync(
        path.join(directory, 'baseline.jsonl'),
        `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(directory, 'environment.json'),
        JSON.stringify({
          environment: {
            comparisonFingerprint:
              overrides.manifestEnvironmentFingerprint ?? environment.comparisonFingerprint,
          },
          workload: { fingerprint: workloadIdentity.fingerprint },
          fixtureFingerprint: fixture.fingerprint,
          baselineSourceFingerprint: sourceFingerprint,
          baselinePackage,
          ...(overrides.harnessFingerprint
            ? { baselineHarnessFingerprint: overrides.harnessFingerprint }
            : {}),
        }),
        'utf8'
      );
      return directory;
    }

    const validationOptions = {
      workload,
      workloadIdentity,
      environment,
      fixture,
      currentHarness,
      optimizedSourceFingerprint,
    };
    const valid = validateRecordedBaseline({
      ...validationOptions,
      recordedBaselineDirectory: writeCase('valid'),
    });
    expect(valid.sourceFingerprint).toBe('b'.repeat(64));
    expect(valid.baselinePackage).toEqual(baselinePackage);
    expect(valid.aggregate.totals).toMatchObject({ scenarios: 2, warmups: 1, executed: 3 });
    expect(valid.harnessStatus).toMatchObject({
      status: 'legacy-missing',
      baselineFingerprint: null,
      deterministicAuthoritative: false,
      latencyAuthoritative: false,
    });

    const matchingHarness = validateRecordedBaseline({
      ...validationOptions,
      recordedBaselineDirectory: writeCase('matching-harness', {
        harnessFingerprint: currentHarness.fingerprint,
      }),
    });
    expect(matchingHarness.harnessStatus).toMatchObject({
      status: 'matched',
      baselineFingerprint: currentHarness.fingerprint,
      deterministicAuthoritative: true,
      latencyAuthoritative: false,
    });
    expect(() =>
      validateRecordedBaseline({
        ...validationOptions,
        recordedBaselineDirectory: writeCase('mismatched-harness', {
          harnessFingerprint: 'h'.repeat(64),
        }),
      })
    ).toThrow('harness fingerprint');

    expect(() =>
      validateRecordedBaseline({
        ...validationOptions,
        recordedBaselineDirectory: writeCase('wrong-phase', { phase: 'optimized' }),
      })
    ).toThrow('phase 必须为 baseline');
    expect(() =>
      validateRecordedBaseline({
        ...validationOptions,
        recordedBaselineDirectory: writeCase('wrong-workload', {
          workloadFingerprint: 'x'.repeat(64),
        }),
      })
    ).toThrow('workload fingerprint');
    expect(() =>
      validateRecordedBaseline({
        ...validationOptions,
        recordedBaselineDirectory: writeCase('wrong-fixture', {
          fixtureFingerprint: 'x'.repeat(64),
        }),
      })
    ).toThrow('fixture fingerprint');
    expect(() =>
      validateRecordedBaseline({
        ...validationOptions,
        recordedBaselineDirectory: writeCase('wrong-environment', {
          environmentFingerprint: 'x'.repeat(64),
        }),
      })
    ).toThrow('comparisonFingerprint');
    expect(() =>
      validateRecordedBaseline({
        ...validationOptions,
        recordedBaselineDirectory: writeCase('missing-scenario', {
          includeScenarioB: false,
        }),
      })
    ).toThrow('未完整覆盖');
    expect(() =>
      validateRecordedBaseline({
        ...validationOptions,
        recordedBaselineDirectory: writeCase('missing-formal-sample', {
          scenarioAFormalIterations: [1],
        }),
      })
    ).toThrow('正式样本不完整');
    expect(() =>
      validateRecordedBaseline({
        ...validationOptions,
        recordedBaselineDirectory: writeCase('manifest-environment-drift', {
          manifestEnvironmentFingerprint: 'x'.repeat(64),
        }),
      })
    ).toThrow('environment.json 环境 comparisonFingerprint');
    expect(() =>
      validateRecordedBaseline({
        ...validationOptions,
        recordedBaselineDirectory: writeCase('same-source', {
          sourceFingerprint: optimizedSourceFingerprint,
        }),
      })
    ).toThrow('构建指纹相同');
  });

  it('匹配 harness 的 recorded session 仅保留确定性权威，fresh pair session 才允许完整 PASS', async () => {
    const { aggregateRecords, sha256, stableStringify } = await import(CORE_URL);
    const { compareFiles, comparisonExitCode } = await import(COMPARE_URL);
    const root = createTempRoot();
    const workload = {
      version: 'protocol-static-session-authority-test-1',
      scenarios: [
        {
          id: 'scenario-a',
          iterations: 1,
          acceptance: {
            successRateMin: 1,
            p95Regression: { maxRelative: 0.1, minBudgetMs: 50 },
            metrics: [{ name: 'responseBytes', statistic: 'p95', operator: 'lte', value: 100 }],
          },
        },
      ],
    };
    const workloadFingerprint = sha256(stableStringify(workload));
    const harness = { fingerprint: 'h'.repeat(64) };
    const makeAggregate = (
      phase: 'baseline' | 'optimized',
      pairSession: { id: string; mode: string },
      durationMs: number
    ) =>
      aggregateRecords([
        createRun({
          phase,
          workload: { fingerprint: workloadFingerprint },
          source: { fingerprint: phase === 'baseline' ? 'b'.repeat(64) : 'o'.repeat(64) },
          harness,
          pairSession,
          parameters: { benchmarkKind: 'protocol-static' },
        }),
        createSample(1, {
          phase,
          durationMs,
          metrics: { responseBytes: 50 },
        }),
      ]);
    const workloadPath = path.join(root, 'workload.json');
    const baselinePath = path.join(root, 'baseline.json');
    const optimizedPath = path.join(root, 'optimized.json');
    fs.writeFileSync(workloadPath, JSON.stringify(workload));
    fs.writeFileSync(
      baselinePath,
      JSON.stringify(makeAggregate('baseline', { id: 'old', mode: 'fresh-pair' }, 100))
    );
    fs.writeFileSync(
      optimizedPath,
      JSON.stringify(
        makeAggregate('optimized', { id: 'new', mode: 'recorded-baseline-recovery' }, 60)
      )
    );

    const recordedComparison = compareFiles({
      baseline: baselinePath,
      optimized: optimizedPath,
      workload: workloadPath,
      outputJson: path.join(root, 'recorded-comparison.json'),
      outputMd: path.join(root, 'recorded-comparison.md'),
    });
    expect(recordedComparison.authorityProfile).toMatchObject({
      mode: 'mixed-authority',
      deterministic: { authoritative: true },
      latency: { authoritative: false },
      pairSession: { status: 'not-fresh-paired' },
    });
    expect(recordedComparison.acceptance).toMatchObject({
      passed: null,
      authoritativePassed: true,
      authoritativeScope: 'deterministic-gates-only',
      indicativeLatencyPassed: true,
    });
    expect(comparisonExitCode(recordedComparison)).toBe(2);
    const cliResult = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/benchmarks/compare.mjs'),
        '--baseline',
        baselinePath,
        '--optimized',
        optimizedPath,
        '--workload',
        workloadPath,
        '--output-json',
        path.join(root, 'cli-comparison.json'),
        '--output-md',
        path.join(root, 'cli-comparison.md'),
      ],
      { encoding: 'utf8' }
    );
    expect(cliResult.status).toBe(2);
    expect(cliResult.stdout).toContain('PARTIAL');

    fs.writeFileSync(
      optimizedPath,
      JSON.stringify(makeAggregate('optimized', { id: 'old', mode: 'fresh-pair' }, 60))
    );
    const freshComparison = compareFiles({
      baseline: baselinePath,
      optimized: optimizedPath,
      workload: workloadPath,
      outputJson: path.join(root, 'fresh-comparison.json'),
      outputMd: path.join(root, 'fresh-comparison.md'),
    });
    expect(freshComparison.authorityProfile).toMatchObject({
      mode: 'fully-authoritative',
      fullyAuthoritative: true,
      pairSession: { status: 'fresh-paired' },
    });
    expect(freshComparison.acceptance.passed).toBe(true);
    expect(comparisonExitCode(freshComparison)).toBe(0);
  });

  it('原样复制 baseline JSONL、重新聚合并保留原 package provenance', async () => {
    const { collectEnvironment, fingerprintPaths, sha256, stableStringify } = await import(
      CORE_URL
    );
    const { compareFiles, comparisonExitCode } = await import(COMPARE_URL);
    const { fingerprintProtocolStaticHarness, runProtocolStaticPair } = await import(
      PROTOCOL_PAIR_URL
    );
    const root = createTempRoot();
    const recordedDirectory = path.join(root, 'recorded');
    const optimizedProject = path.join(root, 'optimized-project');
    const optimizedBuild = path.join(optimizedProject, 'build');
    const outputDirectory = path.join(root, 'new-result');
    fs.mkdirSync(path.join(root, 'benchmarks'), { recursive: true });
    fs.mkdirSync(path.join(root, 'playground/benchmark-wx'), { recursive: true });
    fs.mkdirSync(recordedDirectory);
    fs.mkdirSync(optimizedBuild, { recursive: true });

    const workload = {
      version: 'protocol-static-recovery-test-1',
      scenarios: [
        {
          id: 'protocol_success',
          direction: 'protocol',
          warmups: 0,
          iterations: 1,
          acceptance: {
            successRateMin: 1,
            p95Regression: { maxRelative: 0.1, minBudgetMs: 50 },
            metrics: [
              { name: 'responseBytes', statistic: 'p95', operator: 'lte', value: 10000 },
              {
                name: 'structuredContentCount',
                statistic: 'sum',
                operator: 'eq',
                value: 1,
              },
            ],
          },
        },
      ],
    };
    fs.writeFileSync(
      path.join(root, 'benchmarks/workload.protocol-static.v1.json'),
      JSON.stringify(workload),
      'utf8'
    );
    fs.writeFileSync(path.join(root, 'playground/benchmark-wx/fixture.txt'), 'fixture', 'utf8');
    fs.writeFileSync(
      path.join(optimizedProject, 'package.json'),
      JSON.stringify({ name: 'optimized-test-server', version: '2.0.0', dependencies: {} }),
      'utf8'
    );
    const optimizedServer = path.join(optimizedBuild, 'server.mjs');
    fs.writeFileSync(
      optimizedServer,
      [
        "import readline from 'node:readline';",
        'const input = readline.createInterface({ input: process.stdin });',
        "input.on('line', (line) => {",
        '  const request = JSON.parse(line);',
        '  if (request.id == null) return;',
        '  let result;',
        "  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } };",
        "  else if (request.method === 'tools/list') result = { tools: [{ name: 'get_connection_status', inputSchema: { type: 'object' } }] };",
        "  else result = { content: [], structuredContent: { schemaVersion: '1.0', ok: true, code: 'OK', data: { connected: false }, warnings: [], nextActions: [], meta: { requestId: 'req', tool: 'get_connection_status', durationMs: 0 } } };",
        "  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');",
        '});',
      ].join('\n'),
      'utf8'
    );

    const environment = collectEnvironment();
    const workloadIdentity = {
      version: workload.version,
      fingerprint: sha256(stableStringify(workload)),
    };
    const fixture = fingerprintPaths(root, ['playground/benchmark-wx']);
    const baselineSourceFingerprint = 'b'.repeat(64);
    const baselinePackage = {
      packageVersion: '0.6.0',
      resolvedDependencies: { '@modelcontextprotocol/sdk': '1.30.0' },
    };
    const records = [
      createRun({
        environment,
        workload: workloadIdentity,
        fixture,
        source: { fingerprint: baselineSourceFingerprint },
        parameters: {
          benchmarkKind: 'protocol-static',
          workloadVersion: workload.version,
        },
      }),
      createSample(1, {
        scenarioId: 'protocol_success',
        direction: 'protocol',
        durationMs: 100,
        metrics: { structuredContentCount: 1 },
      }),
    ];
    const originalBaseline = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
    fs.writeFileSync(path.join(recordedDirectory, 'baseline.jsonl'), originalBaseline, 'utf8');
    fs.writeFileSync(
      path.join(recordedDirectory, 'environment.json'),
      JSON.stringify({
        environment,
        workload: workloadIdentity,
        fixtureFingerprint: fixture.fingerprint,
        baselineSourceFingerprint,
        baselinePackage,
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(recordedDirectory, 'baseline.aggregate.json'),
      JSON.stringify({ untrusted: true }),
      'utf8'
    );

    const currentHarness = fingerprintProtocolStaticHarness();
    const comparison = await runProtocolStaticPair({
      recordedBaselineDirectory: recordedDirectory,
      optimizedServer,
      outputDirectory,
      repoRoot: root,
    });

    expect(fs.readFileSync(path.join(outputDirectory, 'baseline.jsonl'), 'utf8')).toBe(
      originalBaseline
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(outputDirectory, 'baseline.aggregate.json'), 'utf8'))
    ).toMatchObject({ recordType: 'aggregate', totals: { scenarios: 1, executed: 1 } });
    const outputEnvironment = JSON.parse(
      fs.readFileSync(path.join(outputDirectory, 'environment.json'), 'utf8')
    );
    expect(outputEnvironment.baselinePackage).toEqual(baselinePackage);
    expect(outputEnvironment.harness.fingerprint).toBe(currentHarness.fingerprint);
    expect(outputEnvironment.baselineHarnessFingerprint).toBeNull();
    expect(outputEnvironment.authority).toBe(
      'protocol-static/indicative-only-no-harness-provenance'
    );
    expect(outputEnvironment.authorityProfile).toEqual(comparison.authorityProfile);
    expect(outputEnvironment.baselineAcquisition).toMatchObject({
      mode: 'recorded-jsonl-reuse',
      sourceDirectory: 'recorded',
      copiedVerbatim: true,
      aggregateRecomputed: true,
      harnessStatus: 'legacy-missing',
    });
    expect(outputEnvironment.baselineAcquisition.baselineJsonlSha256).toBe(
      sha256(Buffer.from(originalBaseline))
    );
    expect(comparison.authorityProfile).toMatchObject({
      mode: 'indicative-only',
      fullyAuthoritative: false,
      deterministic: { authoritative: false, label: 'indicative/non-authoritative' },
      latency: { authoritative: false, label: 'indicative/non-authoritative' },
      harness: { baselineStatus: 'legacy-missing', baselineFingerprint: null },
      pairSession: { status: 'recorded-separate-session' },
    });
    expect(comparison.identity).toMatchObject({
      baselineHarnessFingerprint: null,
      optimizedHarnessFingerprint: currentHarness.fingerprint,
    });
    expect(comparison.acceptance).toMatchObject({
      passed: null,
      verdict: 'PARTIAL_NO_FULL_PASS_VERDICT',
      fullyAuthoritative: false,
      authoritativePassed: null,
      authoritativeScope: 'none',
      indicativePassed: true,
      indicativeDeterministicPassed: true,
      indicativeLatencyPassed: true,
    });
    expect(comparisonExitCode(comparison)).toBe(2);
    const latencyGate = comparison.acceptance.scenarios[0].gates.find(
      (gate: { evidenceScope: string }) => gate.evidenceScope === 'latency'
    );
    expect(latencyGate).toMatchObject({
      authority: 'indicative/non-authoritative',
      countsTowardStrictAcceptance: false,
      passed: true,
    });
    const deterministicPayloadGate = comparison.acceptance.scenarios[0].gates.find(
      (gate: { name: string }) => gate.name === '指标 responseBytes.p95'
    );
    expect(deterministicPayloadGate).toMatchObject({
      evidenceScope: 'deterministic',
      authority: 'indicative/non-authoritative',
      countsTowardStrictAcceptance: false,
      passed: true,
    });
    const optimizedAggregate = JSON.parse(
      fs.readFileSync(path.join(outputDirectory, 'optimized.aggregate.json'), 'utf8')
    );
    expect(optimizedAggregate.run.harness.fingerprint).toBe(currentHarness.fingerprint);
    const comparisonMarkdown = fs.readFileSync(path.join(outputDirectory, 'comparison.md'), 'utf8');
    expect(comparisonMarkdown).toContain('PARTIAL / NO FULL PASS VERDICT');
    expect(comparisonMarkdown).toContain('INDICATIVE PASS');
    expect(comparisonMarkdown).toContain('严格验收（none）：**N/A**');
    expect(comparisonMarkdown).toContain('不构成严格通过证据');
    expect(comparisonMarkdown).not.toContain('总体验收：**PASS**');
    const inferredComparison = compareFiles({
      baseline: path.join(outputDirectory, 'baseline.aggregate.json'),
      optimized: path.join(outputDirectory, 'optimized.aggregate.json'),
      workload: path.join(root, 'benchmarks/workload.protocol-static.v1.json'),
      outputJson: path.join(root, 'inferred-comparison.json'),
      outputMd: path.join(root, 'inferred-comparison.md'),
    });
    expect(inferredComparison.acceptance.passed).toBeNull();
    expect(comparisonExitCode(inferredComparison)).toBe(2);
    expect(inferredComparison.authorityProfile).toMatchObject({
      mode: 'indicative-only',
      deterministic: { authoritative: false },
      latency: { authoritative: false },
      harness: { baselineStatus: 'legacy-missing' },
    });
    expect(fs.readFileSync(path.join(root, 'inferred-comparison.md'), 'utf8')).toContain(
      'PARTIAL / NO FULL PASS VERDICT'
    );
    await expect(
      runProtocolStaticPair({
        recordedBaselineDirectory: recordedDirectory,
        optimizedServer,
        outputDirectory,
        repoRoot: root,
      })
    ).rejects.toThrow('拒绝覆盖');
    expect(fs.readFileSync(path.join(outputDirectory, 'baseline.jsonl'), 'utf8')).toBe(
      originalBaseline
    );
  });
});

describe('benchmark recorder and local server', () => {
  it('Recorder 独占创建 JSONL，记录失败且不覆盖已有结果', async () => {
    const { BenchmarkRecorder } = await import(RECORDER_URL);
    const { parseJsonLines } = await import(CORE_URL);
    const root = createTempRoot();
    const outputPath = path.join(root, 'run.jsonl');
    const options = {
      outputPath,
      repoRoot: root,
      runId: 'baseline-1',
      phase: 'baseline',
      preflight: {
        valid: true,
        environment: { comparisonFingerprint: 'e'.repeat(64) },
        workload: { fingerprint: 'w'.repeat(64) },
        fixture: { fingerprint: 'f'.repeat(64) },
        source: { fingerprint: 's'.repeat(64) },
      },
    };
    const recorder = new BenchmarkRecorder(options);
    await recorder.measure(
      { scenarioId: 'scenario-a', direction: 'runtime', iteration: 1, warmup: false },
      async () => {
        const error = new Error(`failed at ${root}`) as Error & { code: string };
        error.code = 'CONTROLLED_FAILURE';
        throw error;
      }
    );
    await recorder.measure(
      { scenarioId: 'scenario-a', direction: 'runtime', iteration: 2, warmup: false },
      async () => undefined
    );
    recorder.close();

    const records = parseJsonLines(fs.readFileSync(outputPath, 'utf8'));
    expect(records).toHaveLength(3);
    expect(records[1]).toMatchObject({ status: 'failure', error: { code: 'CONTROLLED_FAILURE' } });
    expect(records[1].error.message).toContain('<REPO>');
    expect(records[2]).toMatchObject({
      status: 'failure',
      error: { code: 'ADAPTER_RESULT_INVALID' },
    });
    expect(() => new BenchmarkRecorder(options)).toThrow();
  });

  it('本地服务仅监听 loopback，并只保留 token hash', async () => {
    const { startBenchmarkServer } = await import(LOCAL_SERVER_URL);
    const handle = await startBenchmarkServer({ port: 0 });
    try {
      const responseBody = await new Promise<string>((resolve, reject) => {
        http
          .get(`${handle.url}?token=secret-value&seq=7`, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              body += chunk;
            });
            response.on('end', () => resolve(body));
          })
          .on('error', reject);
      });
      expect(JSON.parse(responseBody)).toEqual({ ok: true, path: '/benchmark' });
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:/);
      expect(handle.requests[0]).toMatchObject({ path: '/benchmark', seq: '7' });
      expect(JSON.stringify(handle.requests)).not.toContain('secret-value');
      expect(handle.requests[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await handle.close();
    }
  });

  it('protocol-static adapter 通过真实 stdio JSON-RPC 校验结构化契约', async () => {
    const root = createTempRoot();
    const serverPath = path.join(root, 'fake-server.mjs');
    fs.writeFileSync(
      serverPath,
      [
        "import readline from 'node:readline';",
        'const input = readline.createInterface({ input: process.stdin });',
        "const names = ['get_connection_status', 'connect_devtools', 'get_current_page', ...Array.from({ length: 28 }, (_, index) => `tool_${index}`)];",
        "const schemaId = 'urn:weixin-devtools-mcp:schema:output:sha256:' + 'a'.repeat(64);",
        "const tools = names.map((name) => ({ name, inputSchema: { type: 'object' }, outputSchema: { type: 'object', $id: schemaId } }));",
        "input.on('line', (line) => {",
        '  const request = JSON.parse(line);',
        '  if (request.id == null) return;',
        '  let result;',
        "  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } };",
        "  else if (request.method === 'tools/list') result = { tools };",
        "  else if (request.params?.name === 'get_connection_status') result = { content: [], structuredContent: { schemaVersion: '1.0', ok: true, code: 'OK', data: {}, warnings: [], nextActions: [], meta: { requestId: 'req', tool: 'get_connection_status', durationMs: 0 } } };",
        "  else { const tool = request.params?.name; const code = tool === 'connect_devtools' ? 'INVALID_ARGUMENT' : 'NOT_CONNECTED'; result = { isError: true, content: [], structuredContent: { schemaVersion: '1.0', ok: false, code, data: null, error: { message: 'expected', retryable: false }, warnings: [], nextActions: [], meta: { requestId: 'req', tool, durationMs: 0 } } }; }",
        "  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');",
        '});',
      ].join('\n'),
      'utf8'
    );
    const previousServerPath = process.env.BENCHMARK_SERVER_PATH;
    process.env.BENCHMARK_SERVER_PATH = serverPath;
    const { createBenchmarkAdapter } = await import(STATIC_ADAPTER_URL);
    const adapter = await createBenchmarkAdapter({
      repoRoot: root,
      phase: 'optimized',
      workload: {},
    });
    try {
      await adapter.setup();
      await expect(adapter.healthCheck()).resolves.toMatchObject({ ok: true });
      await expect(
        adapter.runScenario({ scenario: { id: 'protocol_tools_list' } })
      ).resolves.toMatchObject({
        ok: true,
        metrics: {
          toolsWithContentAddressedSchemaId: 31,
          coldSchemaValidatorCount: 31,
          hotSchemaValidatorCount: 31,
          coldListMs: expect.any(Number),
          hotListMs: expect.any(Number),
          coldSchemaCompileMs: expect.any(Number),
          hotSchemaCompileMs: expect.any(Number),
        },
      });
      for (const scenarioId of [
        'protocol_success',
        'protocol_invalid_arguments',
        'protocol_business_error',
      ]) {
        await expect(adapter.runScenario({ scenario: { id: scenarioId } })).resolves.toMatchObject({
          ok: true,
        });
      }
    } finally {
      await adapter.teardown();
      if (previousServerPath === undefined) {
        delete process.env.BENCHMARK_SERVER_PATH;
      } else {
        process.env.BENCHMARK_SERVER_PATH = previousServerPath;
      }
    }
  });

  it('通用 runner 严格执行所选场景次数并把部分运行显式标记为 partial', async () => {
    const {
      collectEnvironment,
      fingerprintPaths,
      FIXTURE_FINGERPRINT_EXCLUDES,
      parseJsonLines,
      sha256,
      sourceFingerprint,
      stableStringify,
    } = await import(CORE_URL);
    const { runWorkload } = await import(RUNNER_URL);
    const tempRoot = createTempRoot();
    const adapterPath = path.join(tempRoot, 'adapter.mjs');
    const outputPath = path.join(tempRoot, 'partial.jsonl');
    const preflightPath = path.join(tempRoot, 'preflight.json');
    const repoRoot = process.cwd();
    const workload = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'benchmarks/workload.v1.json'), 'utf8')
    );
    fs.writeFileSync(
      adapterPath,
      [
        'export async function createBenchmarkAdapter() {',
        '  return {',
        "    name: 'test-adapter',",
        '    async setup() {},',
        '    async healthCheck() { return { ok: true }; },',
        '    async runScenario() { return { ok: true, metrics: { roundTrips: 1 } }; },',
        '    async teardown() {},',
        '  };',
        '}',
      ].join('\n'),
      'utf8'
    );
    const preflight = {
      valid: true,
      phase: 'baseline',
      environment: collectEnvironment(),
      workload: { version: workload.version, fingerprint: sha256(stableStringify(workload)) },
      fixture: fingerprintPaths(repoRoot, ['playground/benchmark-wx'], {
        exclude: FIXTURE_FINGERPRINT_EXCLUDES,
      }),
      source: sourceFingerprint(repoRoot),
    };
    fs.writeFileSync(preflightPath, JSON.stringify(preflight), 'utf8');

    await runWorkload({
      repoRoot,
      phase: 'baseline',
      preflightPath,
      adapterPath,
      outputPath,
      runId: 'partial-run',
      scenarioIds: ['protocol_stdio_lifecycle'],
    });
    const records = parseJsonLines(fs.readFileSync(outputPath, 'utf8'));
    expect(records).toHaveLength(34);
    expect(records[0].parameters).toMatchObject({ partial: true });
    expect(records.filter((record: { warmup?: boolean }) => record.warmup === true)).toHaveLength(
      3
    );
    expect(records.filter((record: { warmup?: boolean }) => record.warmup === false)).toHaveLength(
      30
    );
  });
});

describe('versioned workload and fixture', () => {
  it('固定场景 ID 唯一，元素交互正式样本分布合计 100', () => {
    const workload = JSON.parse(
      fs.readFileSync(path.resolve('benchmarks/workload.v1.json'), 'utf8')
    );
    const ids = workload.scenarios.map((scenario: { id: string }) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);

    const interactionIds = new Set([
      'locator_duplicate_click',
      'locator_stale_same_page',
      'locator_stale_cross_page',
      'locator_input_modes',
      'locator_direct',
    ]);
    const interactions = workload.scenarios
      .filter((scenario: { id: string }) => interactionIds.has(scenario.id))
      .reduce((total: number, scenario: { iterations: number }) => total + scenario.iterations, 0);
    expect(interactions).toBe(100);
  });

  it('fixture 包含两页以及所有确定性探针', () => {
    const app = JSON.parse(
      fs.readFileSync(path.resolve('playground/benchmark-wx/app.json'), 'utf8')
    );
    const primaryWxml = fs.readFileSync(
      path.resolve('playground/benchmark-wx/pages/index/index.wxml'),
      'utf8'
    );
    const primaryJs = fs.readFileSync(
      path.resolve('playground/benchmark-wx/pages/index/index.js'),
      'utf8'
    );

    expect(app.pages).toEqual(['pages/index/index', 'pages/secondary/index']);
    for (const probe of [
      'duplicate-item',
      'benchmark-input',
      'benchmark-textarea',
      'emit-console',
      'send-request',
      'action-log',
    ]) {
      expect(primaryWxml).toContain(probe);
    }
    expect(primaryJs).toContain('length: 20');
    expect(primaryJs).toContain("item.id !== 'item-07'");
  });
});
