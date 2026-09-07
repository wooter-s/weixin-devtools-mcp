import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const BENCHMARK_SCHEMA_VERSION = '1.0';
export const PHASES = new Set(['baseline', 'optimized']);
export const SAMPLE_STATUSES = new Set(['success', 'failure']);
export const FIXTURE_FINGERPRINT_EXCLUDES = ['.DS_Store', 'project.private.config.json'];

const SENSITIVE_KEY = /(?:authorization|cookie|set-cookie|token|secret|password|passwd|api[-_]?key|headers?|requestbody|responsebody|body|base64|image)/i;
const SENSITIVE_QUERY_KEY = /(?:token|secret|password|passwd|api[-_]?key|authorization|cookie)/i;
const BASE64_VALUE = /^(?:data:[^;]+;base64,)?[a-zA-Z0-9+/]{256,}={0,2}$/;

function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} 必须是有限数值`);
  }
}

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) {
        sorted[key] = canonicalize(value[key]);
      }
    }
    return sorted;
  }

  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function nearestRank(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  assertFiniteNumber(percentile, 'percentile');
  if (percentile < 0 || percentile > 1) {
    throw new RangeError('percentile 必须位于 0 到 1 之间');
  }

  const sorted = values.map((value, index) => {
    assertFiniteNumber(value, `values[${index}]`);
    return value;
  }).sort((left, right) => left - right);
  const rank = percentile === 0 ? 1 : Math.ceil(percentile * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

export function wilsonInterval(successes, total, z = 1.959963984540054) {
  assertFiniteNumber(successes, 'successes');
  assertFiniteNumber(total, 'total');
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < 0 || successes > total) {
    throw new RangeError('successes/total 必须是有效的非负整数计数');
  }
  if (total === 0) {
    return { low: 0, high: 0 };
  }

  const probability = successes / total;
  const zSquared = z * z;
  const denominator = 1 + zSquared / total;
  const center = (probability + zSquared / (2 * total)) / denominator;
  const margin = z * Math.sqrt((probability * (1 - probability) + zSquared / (4 * total)) / total) / denominator;
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

export function summarizeNumbers(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { count: 0, min: null, max: null, mean: null, p50: null, p95: null, sum: 0 };
  }

  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    assertFiniteNumber(value, `values[${index}]`);
    sum += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return {
    count: values.length,
    min,
    max,
    mean: sum / values.length,
    p50: nearestRank(values, 0.5),
    p95: nearestRank(values, 0.95),
    sum,
  };
}

function listFiles(rootPath, relativePath, excludedNames, results) {
  const absolutePath = path.join(rootPath, relativePath);
  const stat = fs.lstatSync(absolutePath);
  const normalized = relativePath.replaceAll(path.sep, '/');

  if (excludedNames.has(path.basename(absolutePath)) || excludedNames.has(normalized)) {
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolutePath).sort()) {
      listFiles(rootPath, path.join(relativePath, entry), excludedNames, results);
    }
    return;
  }
  if (stat.isFile()) {
    results.push({ absolutePath, relativePath: normalized });
  }
}

export function fingerprintPaths(rootPath, relativePaths, options = {}) {
  const excludedNames = new Set(options.exclude ?? ['.DS_Store']);
  const files = [];
  for (const relativePath of [...relativePaths].sort()) {
    const normalized = path.normalize(relativePath);
    const absolutePath = path.resolve(rootPath, normalized);
    const relativeToRoot = path.relative(path.resolve(rootPath), absolutePath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      throw new Error(`指纹路径越出仓库根目录: ${relativePath}`);
    }
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`指纹路径不存在: ${relativePath}`);
    }
    listFiles(path.resolve(rootPath), relativeToRoot, excludedNames, files);
  }

  const hash = crypto.createHash('sha256');
  const manifest = [];
  for (const file of files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    const content = fs.readFileSync(file.absolutePath);
    const contentHash = sha256(content);
    manifest.push({ path: file.relativePath, bytes: content.length, sha256: contentHash });
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }

  return { fingerprint: hash.digest('hex'), files: manifest };
}

function redactUrl(value) {
  try {
    const parsed = new URL(value);
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEY.test(key)) {
        parsed.searchParams.set(key, '<REDACTED>');
      }
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

function redactString(value, options) {
  let redacted = value;
  if (options.repoRoot) {
    redacted = redacted.split(path.resolve(options.repoRoot)).join('<REPO>');
  }
  if (options.homeDir) {
    redacted = redacted.split(path.resolve(options.homeDir)).join('<HOME>');
  }
  if (BASE64_VALUE.test(redacted)) {
    return '<BASE64_REDACTED>';
  }
  redacted = redacted
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer <REDACTED>')
    .replace(/\b(Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi, '$1: <REDACTED>');
  if (/^https?:\/\//i.test(redacted)) {
    return redactUrl(redacted);
  }
  return redacted;
}

export function redactSensitive(value, options = {}) {
  const normalizedOptions = {
    repoRoot: options.repoRoot,
    homeDir: options.homeDir ?? os.homedir(),
  };

  function visit(current, key = '') {
    if (SENSITIVE_KEY.test(key)) {
      return '<REDACTED>';
    }
    if (Array.isArray(current)) {
      return current.map((item) => visit(item));
    }
    if (current && typeof current === 'object') {
      const result = {};
      for (const [childKey, childValue] of Object.entries(current)) {
        result[childKey] = visit(childValue, childKey);
      }
      return result;
    }
    if (typeof current === 'string') {
      return redactString(current, normalizedOptions);
    }
    return current;
  }

  return visit(value);
}

function commandVersion(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || result.stderr.trim() || null;
}

export function readDevtoolsVersion(devtoolsAppPath = '/Applications/wechatwebdevtools.app') {
  const plistPath = path.join(devtoolsAppPath, 'Contents', 'Info.plist');
  if (!fs.existsSync(plistPath)) {
    return null;
  }
  return commandVersion('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plistPath]);
}

export function collectEnvironment(options = {}) {
  const devtoolsAppPath = options.devtoolsAppPath ?? '/Applications/wechatwebdevtools.app';
  const comparison = {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    node: process.versions.node,
    devtoolsVersion: readDevtoolsVersion(devtoolsAppPath),
  };
  return {
    ...comparison,
    npm: commandVersion('npm', ['--version']),
    devtoolsAppPath: fs.existsSync(devtoolsAppPath) ? devtoolsAppPath : null,
    comparisonFingerprint: sha256(stableStringify(comparison)),
  };
}

export function sourceFingerprint(repoRoot) {
  const sourcePaths = ['src', 'package.json'];
  if (fs.existsSync(path.join(repoRoot, 'package-lock.json'))) {
    sourcePaths.push('package-lock.json');
  }
  return fingerprintPaths(repoRoot, sourcePaths);
}

export function findRunningDevtoolsProcesses() {
  const result = spawnSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) {
    throw new Error(`无法检查 DevTools 进程: ${result.stderr.trim()}`);
  }
  const matches = [];
  for (const line of result.stdout.split('\n')) {
    if (!/(?:wechatwebdevtools|WeChatDevTools|微信开发者工具)/i.test(line)) {
      continue;
    }
    const match = line.trim().match(/^(\d+)\s+/);
    if (match) {
      matches.push({ pid: Number(match[1]) });
    }
  }
  return matches;
}

export function parseJsonLines(content) {
  const records = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`JSONL 第 ${index + 1} 行不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return records;
}

export function validateRunRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('run record 必须是对象');
  }
  if (record.schemaVersion !== BENCHMARK_SCHEMA_VERSION || record.recordType !== 'run') {
    throw new Error(`run record schemaVersion/recordType 无效`);
  }
  if (typeof record.runId !== 'string' || !record.runId) {
    throw new Error('runId 不能为空');
  }
  if (!PHASES.has(record.phase)) {
    throw new Error(`phase 必须是 baseline 或 optimized`);
  }
  if (record.valid !== true) {
    throw new Error('只允许聚合通过预检的 valid=true run');
  }
  if (
    typeof record.environment?.comparisonFingerprint !== 'string' ||
    typeof record.workload?.fingerprint !== 'string' ||
    typeof record.fixture?.fingerprint !== 'string' ||
    typeof record.source?.fingerprint !== 'string'
  ) {
    throw new Error('run record 缺少环境、workload、fixture 或 source 指纹');
  }
  if (
    record.harness !== undefined &&
    (typeof record.harness?.fingerprint !== 'string' || !record.harness.fingerprint)
  ) {
    throw new Error('run record harness fingerprint 无效');
  }
  if (
    record.pairSession !== undefined &&
    (typeof record.pairSession?.id !== 'string' ||
      !record.pairSession.id ||
      typeof record.pairSession?.mode !== 'string' ||
      !record.pairSession.mode)
  ) {
    throw new Error('run record pairSession 无效');
  }
}

export function validateSampleRecord(record, runRecord) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('sample record 必须是对象');
  }
  if (record.schemaVersion !== BENCHMARK_SCHEMA_VERSION || record.recordType !== 'sample') {
    throw new Error('sample record schemaVersion/recordType 无效');
  }
  if (record.runId !== runRecord.runId || record.phase !== runRecord.phase) {
    throw new Error('sample 与 run 的 runId/phase 不一致');
  }
  if (typeof record.scenarioId !== 'string' || !record.scenarioId) {
    throw new Error('scenarioId 不能为空');
  }
  if (!['runtime', 'locator', 'protocol'].includes(record.direction)) {
    throw new Error('direction 必须是 runtime、locator 或 protocol');
  }
  if (typeof record.startedAt !== 'string' || Number.isNaN(Date.parse(record.startedAt))) {
    throw new Error('startedAt 必须是 ISO 日期时间字符串');
  }
  if (!Number.isInteger(record.iteration) || record.iteration < 1) {
    throw new Error('iteration 必须是从 1 开始的整数');
  }
  if (typeof record.warmup !== 'boolean' || !SAMPLE_STATUSES.has(record.status)) {
    throw new Error('warmup/status 无效');
  }
  assertFiniteNumber(record.durationMs, 'durationMs');
  if (record.durationMs < 0) {
    throw new Error('durationMs 不能为负数');
  }
  if (record.metrics !== undefined) {
    if (!record.metrics || typeof record.metrics !== 'object' || Array.isArray(record.metrics)) {
      throw new Error('metrics 必须是对象');
    }
    for (const [name, value] of Object.entries(record.metrics)) {
      if (typeof value !== 'boolean' && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error(`metric ${name} 必须是有限数值或布尔值`);
      }
    }
  }
  if (
    record.status === 'failure' &&
    (typeof record.error?.code !== 'string' ||
      !record.error.code ||
      typeof record.error?.message !== 'string')
  ) {
    throw new Error('失败样本必须包含稳定 error.code 和 error.message');
  }
}

function collectMetricValues(samples) {
  const metrics = new Map();
  for (const sample of samples) {
    if (!sample.metrics || typeof sample.metrics !== 'object' || Array.isArray(sample.metrics)) {
      continue;
    }
    for (const [name, rawValue] of Object.entries(sample.metrics)) {
      const value = typeof rawValue === 'boolean' ? Number(rawValue) : rawValue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }
      const values = metrics.get(name) ?? [];
      values.push(value);
      metrics.set(name, values);
    }
  }
  return Object.fromEntries([...metrics.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, values]) => [name, summarizeNumbers(values)]));
}

export function aggregateRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('JSONL 至少需要一条 run record');
  }
  const runRecords = records.filter((record) => record?.recordType === 'run');
  if (runRecords.length !== 1 || records[0]?.recordType !== 'run') {
    throw new Error('JSONL 第一行必须是唯一的 run record');
  }
  const run = runRecords[0];
  validateRunRecord(run);

  const samples = records.slice(1);
  const sampleKeys = new Set();
  for (const sample of samples) {
    validateSampleRecord(sample, run);
    const key = `${sample.scenarioId}\0${sample.warmup}\0${sample.iteration}`;
    if (sampleKeys.has(key)) {
      throw new Error(`重复样本: ${sample.scenarioId} iteration=${sample.iteration} warmup=${sample.warmup}`);
    }
    sampleKeys.add(key);
  }

  const scenarioIds = [...new Set(samples.map((sample) => sample.scenarioId))].sort();
  const scenarios = {};
  let executed = 0;
  let successes = 0;
  let failures = 0;
  let warmups = 0;

  for (const scenarioId of scenarioIds) {
    const scenarioSamples = samples.filter((sample) => sample.scenarioId === scenarioId);
    const formal = scenarioSamples.filter((sample) => !sample.warmup);
    const scenarioSuccesses = formal.filter((sample) => sample.status === 'success').length;
    const scenarioFailures = formal.length - scenarioSuccesses;
    const errorCounts = {};
    for (const sample of formal.filter((item) => item.status === 'failure')) {
      errorCounts[sample.error.code] = (errorCounts[sample.error.code] ?? 0) + 1;
    }
    scenarios[scenarioId] = {
      scenarioId,
      warmups: scenarioSamples.length - formal.length,
      executed: formal.length,
      successes: scenarioSuccesses,
      failures: scenarioFailures,
      successRate: formal.length === 0 ? null : scenarioSuccesses / formal.length,
      successRateWilson95: wilsonInterval(scenarioSuccesses, formal.length),
      latencyMs: summarizeNumbers(formal.map((sample) => sample.durationMs)),
      metrics: collectMetricValues(formal),
      errorCounts: Object.fromEntries(Object.entries(errorCounts).sort(([left], [right]) => left.localeCompare(right))),
    };
    executed += formal.length;
    successes += scenarioSuccesses;
    failures += scenarioFailures;
    warmups += scenarioSamples.length - formal.length;
  }

  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    recordType: 'aggregate',
    run: redactSensitive(run),
    totals: {
      scenarios: scenarioIds.length,
      warmups,
      executed,
      successes,
      failures,
      successRate: executed === 0 ? null : successes / executed,
      successRateWilson95: wilsonInterval(successes, executed),
    },
    scenarios,
  };
}

function relativeImprovement(before, after) {
  if (before === null || after === null || before === 0) {
    return null;
  }
  return (before - after) / before;
}

export function compareAggregates(baseline, optimized) {
  if (baseline?.recordType !== 'aggregate' || optimized?.recordType !== 'aggregate') {
    throw new Error('输入必须是 aggregate JSON');
  }
  if (baseline.schemaVersion !== optimized.schemaVersion || baseline.schemaVersion !== BENCHMARK_SCHEMA_VERSION) {
    throw new Error('baseline/optimized schemaVersion 不一致');
  }
  if (baseline.run?.phase !== 'baseline' || optimized.run?.phase !== 'optimized') {
    throw new Error('对比输入 phase 必须分别为 baseline 和 optimized');
  }

  const mismatches = [];
  const identityFields = [
    ['environment.comparisonFingerprint', baseline.run?.environment?.comparisonFingerprint, optimized.run?.environment?.comparisonFingerprint],
    ['workload.fingerprint', baseline.run?.workload?.fingerprint, optimized.run?.workload?.fingerprint],
    ['fixture.fingerprint', baseline.run?.fixture?.fingerprint, optimized.run?.fixture?.fingerprint],
  ];
  for (const [field, before, after] of identityFields) {
    if (typeof before !== 'string' || typeof after !== 'string' || before !== after) {
      mismatches.push({ field, baseline: before ?? null, optimized: after ?? null });
    }
  }
  const baselineHarnessFingerprint = baseline.run?.harness?.fingerprint;
  const optimizedHarnessFingerprint = optimized.run?.harness?.fingerprint;
  if (
    typeof baselineHarnessFingerprint === 'string' &&
    typeof optimizedHarnessFingerprint === 'string' &&
    baselineHarnessFingerprint !== optimizedHarnessFingerprint
  ) {
    mismatches.push({
      field: 'harness.fingerprint',
      baseline: baselineHarnessFingerprint,
      optimized: optimizedHarnessFingerprint,
    });
  }
  if (mismatches.length > 0) {
    const fields = mismatches.map((item) => item.field).join(', ');
    throw new Error(`不可比较：比较身份指纹不一致 (${fields})`);
  }

  const baselineIds = Object.keys(baseline.scenarios ?? {}).sort();
  const optimizedIds = Object.keys(optimized.scenarios ?? {}).sort();
  if (stableStringify(baselineIds) !== stableStringify(optimizedIds)) {
    throw new Error('不可比较：baseline/optimized 场景集合不一致');
  }

  const scenarios = {};
  for (const scenarioId of baselineIds) {
    const before = baseline.scenarios[scenarioId];
    const after = optimized.scenarios[scenarioId];
    const successRateDelta = before.successRate === null || after.successRate === null ? null : after.successRate - before.successRate;
    scenarios[scenarioId] = {
      scenarioId,
      baseline: before,
      optimized: after,
      delta: {
        successes: after.successes - before.successes,
        failures: after.failures - before.failures,
        successRatePercentagePoints: successRateDelta === null ? null : successRateDelta * 100,
        latencyP50Ms: before.latencyMs.p50 === null || after.latencyMs.p50 === null ? null : after.latencyMs.p50 - before.latencyMs.p50,
        latencyP95Ms: before.latencyMs.p95 === null || after.latencyMs.p95 === null ? null : after.latencyMs.p95 - before.latencyMs.p95,
        latencyP50Improvement: relativeImprovement(before.latencyMs.p50, after.latencyMs.p50),
        latencyP95Improvement: relativeImprovement(before.latencyMs.p95, after.latencyMs.p95),
      },
    };
  }

  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    recordType: 'comparison',
    comparable: true,
    identity: {
      environmentFingerprint: baseline.run.environment.comparisonFingerprint,
      workloadFingerprint: baseline.run.workload.fingerprint,
      fixtureFingerprint: baseline.run.fixture.fingerprint,
      baselineSourceFingerprint: baseline.run.source?.fingerprint ?? null,
      optimizedSourceFingerprint: optimized.run.source?.fingerprint ?? null,
      baselineHarnessFingerprint: baseline.run.harness?.fingerprint ?? null,
      optimizedHarnessFingerprint: optimized.run.harness?.fingerprint ?? null,
      baselinePairSession: baseline.run.pairSession ?? null,
      optimizedPairSession: optimized.run.pairSession ?? null,
    },
    scenarios,
  };
}
