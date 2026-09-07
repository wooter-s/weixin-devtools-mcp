#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { compareAggregates, sha256, stableStringify } from './lib/core.mjs';

const USAGE = '用法: node scripts/benchmarks/compare.mjs --baseline <aggregate.json> --optimized <aggregate.json> --output-json <comparison.json> --output-md <comparison.md> [--workload <workload.json>]';

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (['--baseline', '--optimized', '--output-json', '--output-md', '--workload'].includes(argument)) {
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
  if (!args.baseline || !args.optimized || !args['output-json'] || !args['output-md']) {
    throw new Error(USAGE);
  }
  return args;
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }
  return value.toFixed(digits);
}

function compareValue(actual, operator, expected) {
  if (actual === null || actual === undefined || !Number.isFinite(actual)) {
    return false;
  }
  switch (operator) {
    case 'eq': return actual === expected;
    case 'gte': return actual >= expected;
    case 'lte': return actual <= expected;
    default: throw new Error(`未知验收运算符: ${operator}`);
  }
}

function isLatencyMetric(name) {
  return (
    /(?:Ms|Latency|Duration|Time)$/.test(name) ||
    /(?:_ms|_latency|_duration|_time)$/i.test(name)
  );
}

function fullyAuthoritativeProfile(harness) {
  return {
    mode: 'fully-authoritative',
    fullyAuthoritative: true,
    deterministic: { authoritative: true, label: 'authoritative' },
    latency: { authoritative: true, label: 'authoritative' },
    ...(harness ? { harness } : {}),
  };
}

function isFreshPairSession(pairSession) {
  return Boolean(
    pairSession?.status === 'fresh-paired' &&
      pairSession.baseline?.mode === 'fresh-pair' &&
      pairSession.optimized?.mode === 'fresh-pair' &&
      typeof pairSession.baseline?.id === 'string' &&
      pairSession.baseline.id === pairSession.optimized?.id
  );
}

function normalizeAuthorityProfile(profile, baseline, optimized) {
  if (profile) return profile;
  const protocolStatic =
    baseline.run?.parameters?.benchmarkKind === 'protocol-static' ||
    optimized.run?.parameters?.benchmarkKind === 'protocol-static';
  if (!protocolStatic) return fullyAuthoritativeProfile();

  const baselineFingerprint = baseline.run?.harness?.fingerprint ?? null;
  const optimizedFingerprint = optimized.run?.harness?.fingerprint ?? null;
  const pairSession = {
    status:
      baseline.run?.pairSession?.mode === 'fresh-pair' &&
      optimized.run?.pairSession?.mode === 'fresh-pair' &&
      baseline.run.pairSession.id === optimized.run.pairSession.id
        ? 'fresh-paired'
        : 'not-fresh-paired',
    baseline: baseline.run?.pairSession ?? null,
    optimized: optimized.run?.pairSession ?? null,
  };
  if (baselineFingerprint !== null && optimizedFingerprint !== null) {
    const harness = {
      baselineStatus: 'matched',
      baselineFingerprint,
      currentFingerprint: optimizedFingerprint,
    };
    if (isFreshPairSession(pairSession)) {
      return {
        ...fullyAuthoritativeProfile(harness),
        pairSession,
      };
    }
    return {
      mode: 'mixed-authority',
      fullyAuthoritative: false,
      deterministic: { authoritative: true, label: 'authoritative' },
      latency: {
        authoritative: false,
        label: 'indicative/non-authoritative',
        reason: 'baseline/optimized 不属于同一次 fresh pair session',
      },
      harness,
      pairSession,
    };
  }
  if (baselineFingerprint !== null) {
    throw new Error('不可比较：protocol-static optimized run 缺少 harness 指纹');
  }
  return {
    mode: 'indicative-only',
    fullyAuthoritative: false,
    deterministic: {
      authoritative: false,
      label: 'indicative/non-authoritative',
      reason: '历史 protocol-static baseline 缺少 harness 指纹与原始 MCP 响应',
    },
    latency: {
      authoritative: false,
      label: 'indicative/non-authoritative',
      reason: '历史 protocol-static baseline 未记录 benchmark harness 指纹',
    },
    harness: {
      baselineStatus: 'legacy-missing',
      baselineFingerprint: null,
      currentFingerprint: optimizedFingerprint,
    },
    pairSession,
  };
}

function validateHarnessAuthority(comparison, authorityProfile) {
  if (!authorityProfile.harness) return;
  const baseline = comparison.identity.baselineHarnessFingerprint;
  const optimized = comparison.identity.optimizedHarnessFingerprint;
  const current = authorityProfile.harness.currentFingerprint;
  if (
    (current !== null && typeof current !== 'string') ||
    (current === null ? optimized !== null : optimized !== current)
  ) {
    throw new Error('不可比较：optimized run 的 harness 指纹与 authority profile 不一致');
  }
  if (authorityProfile.latency.authoritative) {
    if (
      baseline !== current ||
      authorityProfile.harness.baselineStatus !== 'matched' ||
      !isFreshPairSession(authorityProfile.pairSession)
    ) {
      throw new Error('不可比较：权威延迟对比要求 baseline/optimized harness 指纹一致');
    }
    return;
  }
  if (authorityProfile.deterministic.authoritative) {
    if (authorityProfile.harness.baselineStatus !== 'matched' || baseline !== current) {
      throw new Error('不可比较：确定性权威对比要求 baseline/optimized harness 指纹一致');
    }
    return;
  }
  if (authorityProfile.harness.baselineStatus !== 'legacy-missing' || baseline !== null) {
    throw new Error('不可比较：非权威降级仅适用于缺失 harness 指纹的历史 baseline');
  }
}

function evaluateAcceptance(comparison, workload, authorityProfile) {
  const workloadScenarios = new Map((workload.scenarios ?? []).map((scenario) => [scenario.id, scenario]));
  const workloadIds = [...workloadScenarios.keys()].sort();
  const comparisonIds = Object.keys(comparison.scenarios).sort();
  if (stableStringify(workloadIds) !== stableStringify(comparisonIds)) {
    throw new Error('不可比较：结果没有完整覆盖 workload 的场景集合');
  }
  const results = [];

  for (const [scenarioId, scenarioComparison] of Object.entries(comparison.scenarios)) {
    const definition = workloadScenarios.get(scenarioId);
    if (!definition) {
      throw new Error(`workload 缺少场景定义: ${scenarioId}`);
    }
    const acceptance = definition.acceptance ?? {};
    const gates = [];
    const after = scenarioComparison.optimized;
    const delta = scenarioComparison.delta;
    const addGate = (scope, gate) => {
      const authoritative =
        scope === 'latency'
          ? authorityProfile.latency.authoritative
          : authorityProfile.deterministic.authoritative;
      gates.push({
        ...gate,
        evidenceScope: scope,
        authority: authoritative ? 'authoritative' : 'indicative/non-authoritative',
        countsTowardStrictAcceptance: authoritative,
      });
    };

    if (typeof definition.iterations === 'number') {
      addGate('deterministic', {
        name: '基线正式样本数',
        passed: scenarioComparison.baseline.executed === definition.iterations,
        actual: scenarioComparison.baseline.executed,
        expected: definition.iterations,
      });
      addGate('deterministic', {
        name: '优化后正式样本数',
        passed: after.executed === definition.iterations,
        actual: after.executed,
        expected: definition.iterations,
      });
    }
    if (typeof acceptance.successRateMin === 'number') {
      addGate('deterministic', {
        name: '成功率下限',
        passed: (after.successRate ?? -1) >= acceptance.successRateMin,
        actual: after.successRate,
        expected: acceptance.successRateMin,
      });
    }
    if (typeof acceptance.p95MaxMs === 'number') {
      addGate('latency', {
        name: 'p95 绝对上限',
        passed: (after.latencyMs.p95 ?? Number.POSITIVE_INFINITY) <= acceptance.p95MaxMs,
        actual: after.latencyMs.p95,
        expected: acceptance.p95MaxMs,
      });
    }
    if (acceptance.p95Regression) {
      const beforeP95 = scenarioComparison.baseline.latencyMs.p95;
      const afterP95 = after.latencyMs.p95;
      const budget = beforeP95 === null
        ? null
        : Math.max(beforeP95 * acceptance.p95Regression.maxRelative, acceptance.p95Regression.minBudgetMs);
      addGate('latency', {
        name: 'p95 回退预算',
        passed: beforeP95 !== null && afterP95 !== null && budget !== null && afterP95 <= beforeP95 + budget,
        actual: afterP95,
        expected: beforeP95 === null || budget === null ? null : beforeP95 + budget,
      });
    }
    if (typeof acceptance.p50ImprovementMin === 'number') {
      addGate('latency', {
        name: 'p50 改善率',
        passed: (delta.latencyP50Improvement ?? Number.NEGATIVE_INFINITY) >= acceptance.p50ImprovementMin,
        actual: delta.latencyP50Improvement,
        expected: acceptance.p50ImprovementMin,
      });
    }
    if (typeof acceptance.p95ImprovementMin === 'number') {
      addGate('latency', {
        name: 'p95 改善率',
        passed: (delta.latencyP95Improvement ?? Number.NEGATIVE_INFINITY) >= acceptance.p95ImprovementMin,
        actual: delta.latencyP95Improvement,
        expected: acceptance.p95ImprovementMin,
      });
    }
    for (const metricRule of acceptance.metrics ?? []) {
      const actual = after.metrics?.[metricRule.name]?.[metricRule.statistic];
      addGate(isLatencyMetric(metricRule.name) ? 'latency' : 'deterministic', {
        name: `指标 ${metricRule.name}.${metricRule.statistic}`,
        passed: compareValue(actual, metricRule.operator, metricRule.value),
        actual: actual ?? null,
        expected: metricRule.value,
      });
    }
    for (const metricComparison of acceptance.metricComparisons ?? []) {
      const beforeValue = scenarioComparison.baseline.metrics?.[metricComparison.name]?.[metricComparison.statistic];
      const afterValue = after.metrics?.[metricComparison.name]?.[metricComparison.statistic];
      let relativeIncrease = null;
      if (typeof beforeValue === 'number' && typeof afterValue === 'number') {
        if (beforeValue === 0) {
          relativeIncrease = afterValue === 0 ? 0 : Number.POSITIVE_INFINITY;
        } else {
          relativeIncrease = (afterValue - beforeValue) / beforeValue;
        }
      }
      addGate(isLatencyMetric(metricComparison.name) ? 'latency' : 'deterministic', {
        name: `指标回退 ${metricComparison.name}.${metricComparison.statistic}`,
        passed: relativeIncrease !== null && relativeIncrease <= metricComparison.maxRelativeIncrease,
        actual: relativeIncrease,
        expected: metricComparison.maxRelativeIncrease,
      });
    }

    const authoritativeGates = gates.filter((gate) => gate.countsTowardStrictAcceptance);
    const indicativeDeterministicGates = gates.filter(
      (gate) => !gate.countsTowardStrictAcceptance && gate.evidenceScope === 'deterministic'
    );
    const indicativeLatencyGates = gates.filter(
      (gate) => !gate.countsTowardStrictAcceptance && gate.evidenceScope === 'latency'
    );
    const authoritativePassed =
      authoritativeGates.length === 0 ? null : authoritativeGates.every((gate) => gate.passed);
    const indicativeDeterministicPassed =
      indicativeDeterministicGates.length === 0
        ? null
        : indicativeDeterministicGates.every((gate) => gate.passed);
    const indicativeLatencyPassed =
      indicativeLatencyGates.length === 0
        ? null
        : indicativeLatencyGates.every((gate) => gate.passed);
    results.push({
      scenarioId,
      passed:
        authoritativePassed === false
          ? false
          : authorityProfile.fullyAuthoritative && authoritativePassed === true
            ? true
            : null,
      authoritativePassed,
      indicativeDeterministicPassed,
      indicativeLatencyPassed,
      gates,
    });
  }
  const authoritativeResults = results
    .map((result) => result.authoritativePassed)
    .filter((value) => value !== null);
  const authoritativePassed =
    authoritativeResults.length === 0 ? null : authoritativeResults.every(Boolean);
  const indicativeDeterministicResults = results
    .map((result) => result.indicativeDeterministicPassed)
    .filter((value) => value !== null);
  const indicativeDeterministicPassed =
    indicativeDeterministicResults.length === 0
      ? null
      : indicativeDeterministicResults.every(Boolean);
  const indicativeLatencyResults = results
    .map((result) => result.indicativeLatencyPassed)
    .filter((value) => value !== null);
  const indicativeLatencyPassed =
    indicativeLatencyResults.length === 0 ? null : indicativeLatencyResults.every(Boolean);
  const indicativeResults = [indicativeDeterministicPassed, indicativeLatencyPassed].filter(
    (value) => value !== null
  );
  const indicativePassed =
    indicativeResults.length === 0 ? null : indicativeResults.every(Boolean);
  const fullyAuthoritative = authorityProfile.fullyAuthoritative;
  const passed =
    authoritativePassed === false
      ? false
      : fullyAuthoritative && authoritativePassed === true
        ? true
        : null;
  return {
    passed,
    verdict: passed === true ? 'PASS' : passed === false ? 'FAIL' : 'PARTIAL_NO_FULL_PASS_VERDICT',
    fullyAuthoritative,
    authoritativePassed,
    authoritativeScope: fullyAuthoritative
      ? 'all-declared-gates'
      : authorityProfile.deterministic.authoritative
        ? 'deterministic-gates-only'
        : 'none',
    indicativePassed,
    indicativeDeterministicPassed,
    indicativeLatencyPassed,
    scenarios: results,
  };
}

function renderScenarioAcceptance(scenario) {
  if (scenario.passed === true) return 'PASS';
  if (scenario.passed === false) return 'FAIL';
  const authoritative =
    scenario.authoritativePassed === null
      ? 'N/A'
      : scenario.authoritativePassed
        ? 'PASS'
        : 'FAIL';
  const parts = [`AUTH ${authoritative}`];
  if (scenario.indicativeDeterministicPassed !== null) {
    parts.push(
      `DETERMINISTIC INDICATIVE ${scenario.indicativeDeterministicPassed ? 'PASS' : 'FAIL'}`
    );
  }
  if (scenario.indicativeLatencyPassed !== null) {
    parts.push(`LATENCY INDICATIVE ${scenario.indicativeLatencyPassed ? 'PASS' : 'FAIL'}`);
  }
  return parts.join(' / ');
}

function renderMarkdown(comparison) {
  const mixedAuthority = comparison.authorityProfile?.latency?.authoritative === false;
  const lines = [
    '# MCP 基准优化前后对比',
    '',
    ...(comparison.authority ? [`- 权威范围：\`${comparison.authority}\``] : []),
    ...(comparison.authorityProfile
      ? [
          `- 确定性切片：**${comparison.authorityProfile.deterministic.label.toUpperCase()}**`,
          `- 延迟切片：**${comparison.authorityProfile.latency.label.toUpperCase()}**${comparison.authorityProfile.latency.reason ? `（${comparison.authorityProfile.latency.reason}）` : ''}`,
          ...(comparison.authorityProfile.harness
            ? [
                `- Harness：baseline=${comparison.authorityProfile.harness.baselineFingerprint ?? comparison.authorityProfile.harness.baselineStatus ?? 'N/A'}，current=${comparison.authorityProfile.harness.currentFingerprint ?? 'N/A'}`,
              ]
            : []),
        ]
      : []),
    ...(comparison.coverage
      ? [
          `- 已覆盖：${comparison.coverage.coveredScenarios.join('、')}`,
          `- 未覆盖：${comparison.coverage.excludedScenarios.join('、')}`,
        ]
      : []),
    `- 环境指纹：\`${comparison.identity.environmentFingerprint}\``,
    `- 工作负载指纹：\`${comparison.identity.workloadFingerprint}\``,
    `- Fixture 指纹：\`${comparison.identity.fixtureFingerprint}\``,
    ...(mixedAuthority
      ? [
          `- 严格验收（${comparison.acceptance.authoritativeScope}）：**${comparison.acceptance.authoritativePassed === null ? 'N/A' : comparison.acceptance.authoritativePassed ? 'PASS' : 'FAIL'}**`,
          ...(comparison.authorityProfile.deterministic.authoritative
            ? []
            : [
                `- 确定性观察：**INDICATIVE ${comparison.acceptance.indicativeDeterministicPassed === null ? 'N/A' : comparison.acceptance.indicativeDeterministicPassed ? 'PASS' : 'FAIL'}**（非权威，不构成严格通过证据）`,
              ]),
          `- 延迟观察：**INDICATIVE ${comparison.acceptance.indicativeLatencyPassed === null ? 'N/A' : comparison.acceptance.indicativeLatencyPassed ? 'PASS' : 'FAIL'}**（非权威，不构成严格通过证据）`,
          `- 整体结论：**${comparison.acceptance.authoritativePassed === false ? 'FAIL' : 'PARTIAL / NO FULL PASS VERDICT'}**`,
        ]
      : [`- 总体验收：**${comparison.acceptance.passed ? 'PASS' : 'FAIL'}**`]),
    '',
    '| 场景 | 基线成功率 | 优化后成功率 | 变化(pp) | 基线 p50(ms) | 优化后 p50(ms) | p50 改善 | 基线 p95(ms) | 优化后 p95(ms) | p95 改善 | 验收 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|',
  ];

  const acceptanceByScenario = new Map(comparison.acceptance.scenarios.map((item) => [item.scenarioId, item]));
  for (const scenario of Object.values(comparison.scenarios)) {
    const gate = acceptanceByScenario.get(scenario.scenarioId);
    lines.push([
      `| ${scenario.scenarioId}`,
      `${formatNumber(scenario.baseline.successRate === null ? null : scenario.baseline.successRate * 100)}%`,
      `${formatNumber(scenario.optimized.successRate === null ? null : scenario.optimized.successRate * 100)}%`,
      formatNumber(scenario.delta.successRatePercentagePoints),
      formatNumber(scenario.baseline.latencyMs.p50),
      formatNumber(scenario.optimized.latencyMs.p50),
      `${formatNumber(scenario.delta.latencyP50Improvement === null ? null : scenario.delta.latencyP50Improvement * 100)}%`,
      formatNumber(scenario.baseline.latencyMs.p95),
      formatNumber(scenario.optimized.latencyMs.p95),
      `${formatNumber(scenario.delta.latencyP95Improvement === null ? null : scenario.delta.latencyP95Improvement * 100)}%`,
      `${gate ? renderScenarioAcceptance(gate) : 'N/A'} |`,
    ].join(' | '));
  }

  lines.push('', '## 验收明细', '');
  for (const scenario of comparison.acceptance.scenarios) {
    lines.push(`### ${scenario.scenarioId} — ${renderScenarioAcceptance(scenario)}`, '');
    for (const gate of scenario.gates) {
      const gateLabel = gate.countsTowardStrictAcceptance
        ? gate.passed
          ? 'PASS'
          : 'FAIL'
        : gate.passed
          ? 'INDICATIVE PASS'
          : 'INDICATIVE FAIL';
      const evidenceNote = gate.countsTowardStrictAcceptance
        ? ''
        : '，非权威且不计入严格验收';
      lines.push(`- ${gateLabel}：${gate.name}（实际 ${formatNumber(gate.actual, 4)}，要求 ${formatNumber(gate.expected, 4)}${evidenceNote}）`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function compareFiles(options) {
  const baseline = JSON.parse(fs.readFileSync(options.baseline, 'utf8'));
  const optimized = JSON.parse(fs.readFileSync(options.optimized, 'utf8'));
  const workload = JSON.parse(fs.readFileSync(options.workload, 'utf8'));
  const workloadFingerprint = sha256(stableStringify(workload));
  if (workloadFingerprint !== baseline.run.workload.fingerprint || workloadFingerprint !== optimized.run.workload.fingerprint) {
    throw new Error('不可比较：workload 文件内容与结果中的指纹不一致');
  }

  const comparison = compareAggregates(baseline, optimized);
  comparison.authorityProfile = normalizeAuthorityProfile(
    options.authorityProfile,
    baseline,
    optimized
  );
  validateHarnessAuthority(comparison, comparison.authorityProfile);
  comparison.acceptance = evaluateAcceptance(
    comparison,
    workload,
    comparison.authorityProfile
  );
  if (options.authority) comparison.authority = options.authority;
  if (options.coverage) comparison.coverage = options.coverage;
  fs.mkdirSync(path.dirname(path.resolve(options.outputJson)), { recursive: true });
  fs.mkdirSync(path.dirname(path.resolve(options.outputMd)), { recursive: true });
  fs.writeFileSync(options.outputJson, `${stableStringify(comparison)}\n`, 'utf8');
  fs.writeFileSync(options.outputMd, renderMarkdown(comparison), 'utf8');
  return comparison;
}

export function comparisonExitCode(comparison) {
  return comparison?.acceptance?.passed === true ? 0 : 2;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(USAGE);
      return;
    }
    const comparison = compareFiles({
      baseline: path.resolve(args.baseline),
      optimized: path.resolve(args.optimized),
      outputJson: path.resolve(args['output-json']),
      outputMd: path.resolve(args['output-md']),
      workload: path.resolve(args.workload ?? 'benchmarks/workload.v1.json'),
    });
    const verdict =
      comparison.acceptance.passed === null
        ? `PARTIAL（严格权威验收 ${comparison.acceptance.authoritativePassed === null ? 'N/A' : comparison.acceptance.authoritativePassed ? 'PASS' : 'FAIL'}，其余仅 INDICATIVE）`
        : comparison.acceptance.passed
          ? 'PASS'
          : 'FAIL';
    console.log(`对比完成：${verdict}`);
    process.exitCode = comparisonExitCode(comparison);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
