#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import {
  redactSensitive,
  sha256,
  stableStringify,
  summarizeNumbers,
  wilsonInterval,
} from './lib/core.mjs';

const DEFAULT_OPTIMIZED_ENTRY = 'build/MiniProgramContext.js';
const DEFAULT_OUTPUT =
  'benchmarks/results/v0.6.0/phase2-dom-epoch-before-after.json';
const DEFAULT_SAMPLES = 100;
const DEFAULT_WARMUPS = 5;
const PAGE_PATH = '/pages/synthetic/dom-epoch';

const USAGE = [
  '用法: node scripts/benchmarks/phase2-dom-epoch-synthetic.mjs',
  '  (--baseline-entry <path> | --recorded-baseline-result <json>)',
  '  [--optimized-entry <path>] [--output <path>]',
  `  [--samples ${DEFAULT_SAMPLES}] [--warmups ${DEFAULT_WARMUPS}]`,
].join('\n');

function parseInteger(value, name, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${name} 必须是${allowZero ? '非负' : '正'}整数`);
  }
  return parsed;
}

export function parsePhase2DomEpochArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  const options = {
    baselineEntry: null,
    recordedBaselineResult: null,
    optimizedEntry: DEFAULT_OPTIMIZED_ENTRY,
    output: DEFAULT_OUTPUT,
    samples: DEFAULT_SAMPLES,
    warmups: DEFAULT_WARMUPS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`${name} 缺少值`);
    if (name === '--baseline-entry') options.baselineEntry = value;
    else if (name === '--recorded-baseline-result') options.recordedBaselineResult = value;
    else if (name === '--optimized-entry') options.optimizedEntry = value;
    else if (name === '--output') options.output = value;
    else if (name === '--samples') options.samples = parseInteger(value, name);
    else if (name === '--warmups') options.warmups = parseInteger(value, name, true);
    else throw new Error(`未知参数: ${name}`);
    index += 1;
  }
  if (Boolean(options.baselineEntry) === Boolean(options.recordedBaselineResult)) {
    throw new Error(
      '必须且只能提供 --baseline-entry 或 --recorded-baseline-result 之一',
    );
  }
  return options;
}

function resolveEntry(entry, label) {
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new Error(`${label} entry 未提供`);
  }
  const resolved = fs.realpathSync(path.resolve(entry));
  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`${label} entry 不是文件: ${resolved}`);
  }
  return resolved;
}

function resolveOutputPath(output, repoRoot) {
  const absolute = path.resolve(repoRoot, output);
  if (fs.existsSync(absolute)) return fs.realpathSync(absolute);

  const parent = path.dirname(absolute);
  const resolvedParent = fs.existsSync(parent) ? fs.realpathSync(parent) : parent;
  return path.join(resolvedParent, path.basename(absolute));
}

function buildFingerprint(entry) {
  const buildRoot = path.dirname(entry);
  const manifest = [];
  const visit = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const stat = fs.statSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile() && name.endsWith('.js')) {
        manifest.push({
          path: path.relative(buildRoot, absolute).replaceAll(path.sep, '/'),
          sha256: sha256(fs.readFileSync(absolute)),
        });
      }
    }
  };
  visit(buildRoot);
  return sha256(stableStringify(manifest));
}

function assertRecorded(condition, message) {
  if (!condition) {
    throw new Error(`recorded baseline result 无效: ${message}`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function almostEqual(left, right) {
  return Math.abs(left - right) <= 1e-12;
}

function validateRateMetric(metric, successes, samples, label) {
  assertRecorded(isRecord(metric), `${label} 缺失`);
  assertRecorded(metric.successes === successes, `${label}.successes 不一致`);
  assertRecorded(metric.failures === samples - successes, `${label}.failures 不一致`);
  assertRecorded(
    typeof metric.rate === 'number' && almostEqual(metric.rate, successes / samples),
    `${label}.rate 不一致`,
  );
  const expectedWilson = wilsonInterval(successes, samples);
  assertRecorded(
    isRecord(metric.wilson95) &&
      almostEqual(metric.wilson95.low, expectedWilson.low) &&
      almostEqual(metric.wilson95.high, expectedWilson.high),
    `${label}.wilson95 不一致`,
  );
}

function validateLatencyMetric(metric, label) {
  assertRecorded(isRecord(metric), `${label} 缺失`);
  for (const property of ['min', 'max', 'mean', 'p50', 'p95']) {
    assertRecorded(
      isFiniteNonNegative(metric[property]),
      `${label}.${property} 必须是非负有限数`,
    );
  }
  assertRecorded(metric.min <= metric.p50, `${label} min/p50 顺序错误`);
  assertRecorded(metric.p50 <= metric.p95, `${label} p50/p95 顺序错误`);
  assertRecorded(metric.p95 <= metric.max, `${label} p95/max 顺序错误`);
  assertRecorded(
    metric.mean >= metric.min && metric.mean <= metric.max,
    `${label}.mean 超出 min/max`,
  );
}

function validatePostSnapshotMetrics(block, expectedSamples, label) {
  assertRecorded(isRecord(block), `${label} 缺失`);
  assertRecorded(block.samples === expectedSamples, `${label}.samples 与 workload 不一致`);

  const countProperties = [
    'safeOutcomes',
    'wrongActionSampleCount',
    'weakRefRejectionCount',
    'stableRefCorrectClickCount',
    'revisionAdvanceCount',
    'revisionConsistencyCount',
  ];
  for (const property of countProperties) {
    assertRecorded(
      isNonNegativeInteger(block[property]) && block[property] <= expectedSamples,
      `${label}.${property} 超出样本范围`,
    );
  }
  assertRecorded(isNonNegativeInteger(block.wrongActionCount), `${label}.wrongActionCount 无效`);

  const ratePairs = [
    ['safeOutcomes', 'safeOutcomeRate'],
    ['wrongActionSampleCount', 'wrongActionSampleRate'],
    ['weakRefRejectionCount', 'weakRefRejectionRate'],
    ['stableRefCorrectClickCount', 'stableRefCorrectClickRate'],
    ['revisionAdvanceCount', 'revisionAdvanceRate'],
    ['revisionConsistencyCount', 'revisionConsistencyRate'],
  ];
  for (const [countProperty, rateProperty] of ratePairs) {
    assertRecorded(
      typeof block[rateProperty] === 'number' &&
        almostEqual(block[rateProperty], block[countProperty] / expectedSamples),
      `${label}.${rateProperty} 与计数不一致`,
    );
  }
  const expectedSafeWilson = wilsonInterval(block.safeOutcomes, expectedSamples);
  assertRecorded(
    isRecord(block.safeOutcomeWilson95) &&
      almostEqual(block.safeOutcomeWilson95.low, expectedSafeWilson.low) &&
      almostEqual(block.safeOutcomeWilson95.high, expectedSafeWilson.high),
    `${label}.safeOutcomeWilson95 不一致`,
  );

  assertRecorded(isRecord(block.actionCounts), `${label}.actionCounts 缺失`);
  assertRecorded(
    isNonNegativeInteger(block.actionCounts.total) &&
      isNonNegativeInteger(block.actionCounts.active) &&
      isNonNegativeInteger(block.actionCounts.wrong) &&
      block.actionCounts.active + block.actionCounts.wrong === block.actionCounts.total &&
      block.actionCounts.wrong === block.wrongActionCount,
    `${label}.actionCounts 不自洽`,
  );

  assertRecorded(isRecord(block.revisionDeltaHistogram), `${label}.revisionDeltaHistogram 缺失`);
  const histogramTotal = Object.values(block.revisionDeltaHistogram).reduce((sum, count) => {
    assertRecorded(isNonNegativeInteger(count), `${label}.revisionDeltaHistogram 存在非整数`);
    return sum + count;
  }, 0);
  assertRecorded(histogramTotal === expectedSamples, `${label}.revisionDeltaHistogram 总数错误`);
  assertRecorded(
    (block.revisionDeltaHistogram['1'] ?? 0) === block.revisionAdvanceCount,
    `${label}.revisionAdvanceCount 与 histogram 不一致`,
  );

  assertRecorded(isRecord(block.invariants), `${label}.invariants 缺失`);
  validateRateMetric(
    block.invariants.weakRefSafelyRejected,
    block.weakRefRejectionCount,
    expectedSamples,
    `${label}.invariants.weakRefSafelyRejected`,
  );
  validateRateMetric(
    block.invariants.stableDataTestIdCorrectlyReboundAndClicked,
    block.stableRefCorrectClickCount,
    expectedSamples,
    `${label}.invariants.stableDataTestIdCorrectlyReboundAndClicked`,
  );
  validateRateMetric(
    block.invariants.atomicEpochRevisionConsistency,
    block.revisionConsistencyCount,
    expectedSamples,
    `${label}.invariants.atomicEpochRevisionConsistency`,
  );

  assertRecorded(isRecord(block.latencyMs), `${label}.latencyMs 缺失`);
  for (const property of [
    'setup',
    'scenario',
    'weakRefAttempt',
    'stableRefAttempt',
    block.latencyMs.finalCommit ? 'finalCommit' : 'capture',
  ]) {
    validateLatencyMetric(block.latencyMs[property], `${label}.latencyMs.${property}`);
  }
  assertRecorded(
    isNonNegativeInteger(block.unexpectedErrorCount) &&
      Array.isArray(block.unexpectedErrors) &&
      block.unexpectedErrors.length <= block.unexpectedErrorCount,
    `${label}.unexpectedErrors 不一致`,
  );
}

function extractRecordedPostSnapshot(phase, label) {
  assertRecorded(isRecord(phase), `${label} phase 缺失`);
  if (isRecord(phase.scenarios)) {
    assertRecorded(
      isRecord(phase.scenarios.postSnapshotSamePageRebuild),
      `${label}.scenarios.postSnapshotSamePageRebuild 缺失`,
    );
    return {
      layout: 'scenarios.postSnapshotSamePageRebuild',
      block: phase.scenarios.postSnapshotSamePageRebuild,
      sourceFingerprint: phase.sourceFingerprint,
      entry: phase.entry ?? null,
    };
  }
  return {
    layout: 'legacy-phase-top-level',
    block: phase,
    sourceFingerprint: phase.sourceFingerprint,
    entry: phase.entry ?? null,
  };
}

export function validateRecordedBaselineResult(
  recorded,
  { expectedSamples, platform = process.platform, arch = process.arch, node = process.versions.node },
) {
  assertRecorded(isRecord(recorded), '根节点必须是对象');
  assertRecorded(recorded.schemaVersion === '1.0', 'schemaVersion 不匹配');
  assertRecorded(recorded.recordType === 'phase2-dom-epoch-before-after', 'recordType 不匹配');
  assertRecorded(recorded.authority === 'synthetic/non-authoritative', 'authority 不匹配');
  assertRecorded(recorded.synthetic === true, 'synthetic 必须为 true');
  assertRecorded(recorded.authoritative === false, 'authoritative 必须为 false');
  assertRecorded(isRecord(recorded.environment), 'environment 缺失');
  assertRecorded(recorded.environment.platform === platform, 'environment.platform 不匹配');
  assertRecorded(recorded.environment.arch === arch, 'environment.arch 不匹配');
  assertRecorded(recorded.environment.node === node, 'environment.node 不匹配');
  assertRecorded(recorded.acceptance?.passed === true, '原结果 acceptance 未通过');
  assertRecorded(isRecord(recorded.workload), 'workload 缺失');

  const recordedSamples = recorded.workload.samples ?? recorded.workload.samplesPerScenario;
  assertRecorded(
    Number.isSafeInteger(recordedSamples) && recordedSamples > 0,
    'workload 样本数无效',
  );
  assertRecorded(recordedSamples === expectedSamples, '原样本数与 --samples 不一致');
  assertRecorded(recorded.workload.sampleConcurrency === 1, 'sampleConcurrency 必须为 1');
  assertRecorded(recorded.workload.pagePath === PAGE_PATH, 'pagePath 不匹配');
  assertRecorded(recorded.workload.nodesPerGeneration === 2, 'nodesPerGeneration 不匹配');
  assertRecorded(
    recorded.workload.rebuild === 'same-page/same-visible-metadata/new-element-identities',
    'rebuild 不匹配',
  );
  assertRecorded(recorded.workload.action === 'tap', 'action 不匹配');
  assertRecorded(
    recorded.workload.weakLocator === 'button[class~="repeated-item"] + text',
    'weakLocator 不匹配',
  );
  assertRecorded(
    recorded.workload.stableLocator === 'button[data-testid="stable-target"]',
    'stableLocator 不匹配',
  );
  assertRecorded(
    Array.isArray(recorded.workload.phaseOrder) &&
      recorded.workload.phaseOrder.length === 2 &&
      recorded.workload.phaseOrder[1] === 'optimized',
    'phaseOrder 不匹配',
  );
  assertRecorded(
    recorded.workload.consoleOutputSuppressed === true,
    'consoleOutputSuppressed 必须为 true',
  );
  assertRecorded(/^[a-f0-9]{64}$/.test(recorded.workload.fingerprint), 'workload fingerprint 无效');
  const workloadIdentity = { ...recorded.workload };
  delete workloadIdentity.phaseOrder;
  delete workloadIdentity.consoleOutputSuppressed;
  delete workloadIdentity.fingerprint;
  assertRecorded(
    sha256(stableStringify(workloadIdentity)) === recorded.workload.fingerprint,
    'workload fingerprint 校验失败',
  );

  const baseline = extractRecordedPostSnapshot(recorded.baseline, 'baseline');
  const optimized = extractRecordedPostSnapshot(recorded.optimized, 'optimized');
  for (const phase of [baseline, optimized]) {
    assertRecorded(
      typeof phase.sourceFingerprint === 'string' &&
        /^[a-f0-9]{64}$/.test(phase.sourceFingerprint),
      `${phase === baseline ? 'baseline' : 'optimized'} sourceFingerprint 无效`,
    );
  }
  assertRecorded(
    baseline.sourceFingerprint !== optimized.sourceFingerprint,
    '原结果 baseline/optimized sourceFingerprint 相同',
  );
  validatePostSnapshotMetrics(baseline.block, recordedSamples, 'baseline.postSnapshot');
  validatePostSnapshotMetrics(optimized.block, recordedSamples, 'optimized.postSnapshot');

  return {
    samples: recordedSamples,
    layout: baseline.layout,
    postSnapshot: baseline.block,
    baselineSourceFingerprint: baseline.sourceFingerprint,
    baselineEntry: baseline.entry,
    recordedOptimizedSourceFingerprint: optimized.sourceFingerprint,
  };
}

function loadRecordedBaselineResult(entry, expectedSamples) {
  const resolved = resolveEntry(entry, 'recorded baseline result');
  const raw = fs.readFileSync(resolved);
  let recorded;
  try {
    recorded = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    throw new Error(
      `recorded baseline result JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    path: resolved,
    sha256: sha256(raw),
    recorded,
    validated: validateRecordedBaselineResult(recorded, { expectedSamples }),
  };
}

function createSyntheticPage() {
  const tapEvents = [];
  const queryEvents = [];
  const metadataReadEvents = [];
  const state = {
    activeElements: [],
    activeGeneration: 'old',
    metadataRebuildArmed: false,
    metadataRebuildTriggered: false,
  };

  function replaceDom() {
    state.activeElements = [replacement.weak, replacement.stable];
    state.activeGeneration = 'new';
  }

  function observeMetadataRead(element) {
    metadataReadEvents.push({
      elementId: element.syntheticId,
      elementGeneration: element.syntheticGeneration,
      activeGenerationBeforeRead: state.activeGeneration,
    });
    if (
      state.metadataRebuildArmed &&
      !state.metadataRebuildTriggered &&
      state.activeElements.includes(element)
    ) {
      state.metadataRebuildTriggered = true;
      replaceDom();
    }
  }

  function createElement(id, kind, generation) {
    const attributes = kind === 'weak'
      ? { class: 'repeated-item' }
      : { 'data-testid': 'stable-target' };
    const element = {
      syntheticId: id,
      syntheticGeneration: generation,
      tagName: 'button',
      text: async () => {
        observeMetadataRead(element);
        return kind === 'weak' ? '重复项' : '稳定项';
      },
      attribute: async (name) => attributes[name] ?? null,
      size: async () => ({ width: 120, height: 40 }),
      offset: async () => ({ left: 8, top: kind === 'weak' ? 8 : 56 }),
      tap: async () => {
        const event = {
          id,
          kind,
          elementGeneration: generation,
          activeGenerationAtTap: state.activeGeneration,
          elementStillActiveAtTap: state.activeElements.includes(element),
        };
        tapEvents.push({
          ...event,
          belongsToActiveGenerationAtTap: !isWrongSyntheticAction(event),
        });
      },
    };
    return element;
  }

  const original = {
    weak: createElement('weak-old', 'weak', 'old'),
    stable: createElement('stable-old', 'stable', 'old'),
  };
  const replacement = {
    weak: createElement('weak-new', 'weak', 'new'),
    stable: createElement('stable-new', 'stable', 'new'),
  };
  state.activeElements = [original.weak, original.stable];

  const page = {
    path: PAGE_PATH,
    $$: async (selector) => {
      queryEvents.push({
        selector,
        activeGeneration: state.activeGeneration,
        activeElementIds: state.activeElements.map((element) => element.syntheticId),
      });
      if (selector === '*') return [...state.activeElements];
      if (selector.includes('data-testid="stable-target"')) {
        return state.activeElements.filter((element) => element === replacement.stable || element === original.stable);
      }
      if (selector.includes('class~="repeated-item"')) {
        return state.activeElements.filter((element) => element === replacement.weak || element === original.weak);
      }
      return [];
    },
  };
  const miniProgram = {
    currentPage: async () => page,
    on: () => undefined,
    off: () => undefined,
    evaluate: async () => undefined,
    mockWxMethod: async () => undefined,
    restoreWxMethod: async () => undefined,
    disconnect: async () => undefined,
  };

  return {
    miniProgram,
    original,
    replacement,
    tapEvents,
    queryEvents,
    metadataReadEvents,
    replaceDom,
    armMetadataRebuild() {
      state.metadataRebuildArmed = true;
    },
    metadataRebuildTriggered() {
      return state.metadataRebuildTriggered;
    },
    metadataReads() {
      return [...metadataReadEvents];
    },
    wildcardQueryEvents() {
      return queryEvents.filter((event) => event.selector === '*');
    },
    activeElements() {
      return [...state.activeElements];
    },
  };
}

/**
 * 错误动作只按动作发生瞬间判断：handle 必须仍在活动节点集合中，且它所属
 * generation 必须与当时的 active generation 一致。
 */
export function isWrongSyntheticAction(event) {
  return event.elementStillActiveAtTap !== true ||
    event.elementGeneration !== event.activeGenerationAtTap;
}

function requireInitialRefs(snapshot) {
  const weak = snapshot.elements.find((element) =>
    element.attributes?.class === 'repeated-item'
  );
  const stable = snapshot.elements.find((element) =>
    element.attributes?.['data-testid'] === 'stable-target'
  );
  if (!weak?.ref || !stable?.ref) {
    throw new Error('初始快照未生成弱 ref 或 stable data-testid ref');
  }
  return { weakRef: weak.ref, stableRef: stable.ref };
}

async function attemptRef(context, ref) {
  const started = performance.now();
  try {
    const element = await context.getElementByTarget({ kind: 'ref', ref });
    await element.tap();
    return {
      durationMs: performance.now() - started,
      element,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      durationMs: performance.now() - started,
      element: null,
      errorCode: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPostSnapshotRebuildCase(ContextClass) {
  const fixture = createSyntheticPage();
  const setupStarted = performance.now();
  const context = await ContextClass.from(fixture.miniProgram);
  const setupMs = performance.now() - setupStarted;
  const scenarioStarted = performance.now();

  const initial = await context.getPageSnapshotCached({ forceRefresh: true });
  const { weakRef, stableRef } = requireInitialRefs(initial.snapshot);
  const initialRevision = context.getPageRevision();
  fixture.replaceDom();

  const weak = await attemptRef(context, weakRef);
  const stable = await attemptRef(context, stableRef);

  const commitStarted = performance.now();
  const finalCapture = await context.getPageSnapshotCached({ forceRefresh: true });
  const finalCommitMs = performance.now() - commitStarted;
  const scenarioMs = performance.now() - scenarioStarted;
  const finalRevision = context.getPageRevision();
  const revisionDelta = finalRevision - initialRevision;
  const wrongActionCount = fixture.tapEvents.filter(isWrongSyntheticAction).length;
  const activeActionCount = fixture.tapEvents.length - wrongActionCount;
  const stableRefCorrectlyClicked =
    stable.element === fixture.replacement.stable &&
    fixture.tapEvents.some((event) =>
      event.id === 'stable-new' &&
      event.kind === 'stable' &&
      !isWrongSyntheticAction(event)
    );
  const weakRefSafelyRejected = weak.errorCode === 'STALE_ELEMENT';

  const activeElements = new Set(fixture.activeElements());
  const publishedRefsConsistent = finalCapture.snapshot.elements.every((snapshotElement) => {
    const info = finalCapture.elementMap.get(snapshotElement.ref);
    return info?.pageRevision === finalRevision &&
      info.pagePath === PAGE_PATH &&
      activeElements.has(info.element);
  });
  const revisionConsistent =
    revisionDelta === 1 &&
    finalCapture.snapshot.pageRevision === finalRevision &&
    publishedRefsConsistent;
  const safeOutcome =
    weakRefSafelyRejected &&
    stableRefCorrectlyClicked &&
    wrongActionCount === 0 &&
    revisionConsistent;

  const unexpectedErrors = [];
  if (weak.errorCode !== null && weak.errorCode !== 'STALE_ELEMENT') {
    unexpectedErrors.push(`weak:${weak.errorCode}:${weak.errorMessage}`);
  }
  if (stable.errorCode !== null) {
    unexpectedErrors.push(`stable:${stable.errorCode}:${stable.errorMessage}`);
  }

  return {
    scenarioId: 'post_snapshot_same_page_rebuild',
    safeOutcome,
    weakRefSafelyRejected,
    stableRefCorrectlyClicked,
    revisionConsistent,
    publishedRefsConsistent,
    initialRevision,
    finalRevision,
    revisionDelta,
    wrongActionCount,
    activeActionCount,
    totalActionCount: fixture.tapEvents.length,
    setupMs,
    scenarioMs,
    weakRefAttemptMs: weak.durationMs,
    stableRefAttemptMs: stable.durationMs,
    captureMs: finalCommitMs,
    finalCommitMs,
    unexpectedErrors,
  };
}

async function runPostSnapshotRebuildSamples(ContextClass, count) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    try {
      samples.push(await runPostSnapshotRebuildCase(ContextClass));
    } catch (error) {
      samples.push({
        scenarioId: 'post_snapshot_same_page_rebuild',
        safeOutcome: false,
        weakRefSafelyRejected: false,
        stableRefCorrectlyClicked: false,
        revisionConsistent: false,
        publishedRefsConsistent: false,
        initialRevision: null,
        finalRevision: null,
        revisionDelta: null,
        wrongActionCount: 0,
        activeActionCount: 0,
        totalActionCount: 0,
        setupMs: 0,
        scenarioMs: 0,
        weakRefAttemptMs: 0,
        stableRefAttemptMs: 0,
        captureMs: 0,
        finalCommitMs: 0,
        unexpectedErrors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }
  return samples;
}

async function runMetadataReadRebuildCase(ContextClass) {
  const fixture = createSyntheticPage();
  const setupStarted = performance.now();
  const context = await ContextClass.from(fixture.miniProgram);
  const setupMs = performance.now() - setupStarted;
  const initialRevision = context.getPageRevision();
  const wildcardQueryStart = fixture.wildcardQueryEvents().length;

  fixture.armMetadataRebuild();
  const scenarioStarted = performance.now();
  const captureStarted = performance.now();
  const capture = await context.getPageSnapshotCached({ forceRefresh: true });
  const captureMs = performance.now() - captureStarted;
  const captureWildcardQueries = fixture.wildcardQueryEvents().slice(wildcardQueryStart);
  const finalRevision = context.getPageRevision();
  const revisionDelta = finalRevision - initialRevision;
  const { stableRef } = requireInitialRefs(capture.snapshot);
  const captureMetadataReads = fixture.metadataReads();
  const captureMetadataReadGenerations = captureMetadataReads.map(
    (event) => event.elementGeneration,
  );

  const activeElements = new Set(fixture.activeElements());
  const publishedRefsConsistent = capture.snapshot.elements.every((snapshotElement) => {
    const info = capture.elementMap.get(snapshotElement.ref);
    return info?.pageRevision === finalRevision &&
      info.pagePath === PAGE_PATH &&
      activeElements.has(info.element);
  });
  const stableInfo = capture.elementMap.get(stableRef);
  const publishedStableRefTargetsReplacement =
    stableInfo?.element === fixture.replacement.stable;
  const retryObserved =
    captureWildcardQueries.length >= 3 &&
    captureWildcardQueries[0]?.activeGeneration === 'old' &&
    captureWildcardQueries.slice(1).some((event) => event.activeGeneration === 'new') &&
    captureMetadataReadGenerations.includes('old') &&
    captureMetadataReadGenerations.includes('new');
  const metadataRebuildTriggered = fixture.metadataRebuildTriggered();
  const tornDraftPublished = metadataRebuildTriggered && !publishedRefsConsistent;
  const tornDraftDiscardedAndRetried =
    metadataRebuildTriggered &&
    retryObserved &&
    publishedRefsConsistent &&
    publishedStableRefTargetsReplacement;
  const revisionConsistent =
    revisionDelta === 0 &&
    capture.snapshot.pageRevision === finalRevision &&
    publishedRefsConsistent;

  const action = await attemptRef(context, stableRef);
  const scenarioMs = performance.now() - scenarioStarted;
  const wrongActionCount = fixture.tapEvents.filter(isWrongSyntheticAction).length;
  const activeActionCount = fixture.tapEvents.length - wrongActionCount;
  const stableRefCorrectlyClicked =
    action.element === fixture.replacement.stable &&
    fixture.tapEvents.some((event) =>
      event.id === 'stable-new' &&
      event.kind === 'stable' &&
      !isWrongSyntheticAction(event)
    );
  const safeOutcome =
    tornDraftDiscardedAndRetried &&
    stableRefCorrectlyClicked &&
    wrongActionCount === 0 &&
    revisionConsistent;

  const unexpectedErrors = [];
  if (action.errorCode !== null) {
    unexpectedErrors.push(`stable:${action.errorCode}:${action.errorMessage}`);
  }

  return {
    scenarioId: 'metadata_read_rebuild',
    safeOutcome,
    metadataRebuildTriggered,
    captureMetadataReadCount: captureMetadataReads.length,
    captureMetadataReadGenerations,
    captureWildcardQueryCount: captureWildcardQueries.length,
    captureWildcardQueryGenerations: captureWildcardQueries.map(
      (event) => event.activeGeneration,
    ),
    retryObserved,
    tornDraftPublished,
    tornDraftDiscardedAndRetried,
    stableRefCorrectlyClicked,
    revisionConsistent,
    publishedRefsConsistent,
    publishedStableRefTargetsReplacement,
    initialRevision,
    finalRevision,
    revisionDelta,
    wrongActionCount,
    activeActionCount,
    totalActionCount: fixture.tapEvents.length,
    setupMs,
    scenarioMs,
    actionAttemptMs: action.durationMs,
    captureMs,
    unexpectedErrors,
  };
}

async function runMetadataReadRebuildSamples(ContextClass, count) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    try {
      samples.push(await runMetadataReadRebuildCase(ContextClass));
    } catch (error) {
      samples.push({
        scenarioId: 'metadata_read_rebuild',
        safeOutcome: false,
        metadataRebuildTriggered: false,
        captureMetadataReadCount: 0,
        captureMetadataReadGenerations: [],
        captureWildcardQueryCount: 0,
        captureWildcardQueryGenerations: [],
        retryObserved: false,
        tornDraftPublished: false,
        tornDraftDiscardedAndRetried: false,
        stableRefCorrectlyClicked: false,
        revisionConsistent: false,
        publishedRefsConsistent: false,
        publishedStableRefTargetsReplacement: false,
        initialRevision: null,
        finalRevision: null,
        revisionDelta: null,
        wrongActionCount: 0,
        activeActionCount: 0,
        totalActionCount: 0,
        setupMs: 0,
        scenarioMs: 0,
        actionAttemptMs: 0,
        captureMs: 0,
        unexpectedErrors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }
  return samples;
}

function rateMetric(samples, property) {
  const successes = samples.filter((sample) => sample[property]).length;
  return {
    successes,
    failures: samples.length - successes,
    rate: successes / samples.length,
    wilson95: wilsonInterval(successes, samples.length),
  };
}

function latencyMetric(samples, property) {
  const summary = summarizeNumbers(samples.map((sample) => sample[property]));
  return {
    min: summary.min,
    max: summary.max,
    mean: summary.mean,
    p50: summary.p50,
    p95: summary.p95,
  };
}

function summarizeCommonScenario(samples) {
  const revisionDeltaHistogram = {};
  for (const sample of samples) {
    const key = String(sample.revisionDelta);
    revisionDeltaHistogram[key] = (revisionDeltaHistogram[key] ?? 0) + 1;
  }
  const safe = rateMetric(samples, 'safeOutcome');
  const revision = rateMetric(samples, 'revisionConsistent');
  const wrongActionCount = samples.reduce((sum, sample) => sum + sample.wrongActionCount, 0);
  const wrongActionSampleCount = samples.filter((sample) => sample.wrongActionCount > 0).length;
  const unexpectedErrors = samples.flatMap((sample) => sample.unexpectedErrors);

  return {
    samples: samples.length,
    safeOutcomes: safe.successes,
    safeOutcomeRate: safe.rate,
    safeOutcomeWilson95: safe.wilson95,
    wrongActionCount,
    wrongActionSampleCount,
    wrongActionSampleRate: wrongActionSampleCount / samples.length,
    revisionConsistencyCount: revision.successes,
    revisionConsistencyRate: revision.rate,
    revisionDeltaHistogram,
    actionCounts: {
      total: samples.reduce((sum, sample) => sum + sample.totalActionCount, 0),
      active: samples.reduce((sum, sample) => sum + sample.activeActionCount, 0),
      wrong: wrongActionCount,
    },
    latencyMs: {
      setup: latencyMetric(samples, 'setupMs'),
      scenario: latencyMetric(samples, 'scenarioMs'),
      capture: latencyMetric(samples, 'captureMs'),
    },
    unexpectedErrorCount: unexpectedErrors.length,
    unexpectedErrors: [...new Set(unexpectedErrors)],
  };
}

function summarizePostSnapshotRebuild(samples) {
  const summary = summarizeCommonScenario(samples);
  const weak = rateMetric(samples, 'weakRefSafelyRejected');
  const stable = rateMetric(samples, 'stableRefCorrectlyClicked');
  const revision = rateMetric(samples, 'revisionConsistent');
  const exactAdvanceCount = samples.filter((sample) => sample.revisionDelta === 1).length;
  return {
    ...summary,
    weakRefRejectionCount: weak.successes,
    weakRefRejectionRate: weak.rate,
    stableRefCorrectClickCount: stable.successes,
    stableRefCorrectClickRate: stable.rate,
    revisionAdvanceCount: exactAdvanceCount,
    revisionAdvanceRate: exactAdvanceCount / samples.length,
    invariants: {
      weakRefSafelyRejected: weak,
      stableDataTestIdCorrectlyReboundAndClicked: stable,
      atomicEpochRevisionConsistency: revision,
    },
    latencyMs: {
      ...summary.latencyMs,
      weakRefAttempt: latencyMetric(samples, 'weakRefAttemptMs'),
      stableRefAttempt: latencyMetric(samples, 'stableRefAttemptMs'),
      finalCommit: latencyMetric(samples, 'finalCommitMs'),
    },
  };
}

function summarizeMetadataReadRebuild(samples) {
  const summary = summarizeCommonScenario(samples);
  const triggered = rateMetric(samples, 'metadataRebuildTriggered');
  const retried = rateMetric(samples, 'retryObserved');
  const discarded = rateMetric(samples, 'tornDraftDiscardedAndRetried');
  const published = rateMetric(samples, 'publishedRefsConsistent');
  const stable = rateMetric(samples, 'stableRefCorrectlyClicked');
  const revision = rateMetric(samples, 'revisionConsistent');
  const tornDraftPublishedCount = samples.filter(
    (sample) => sample.tornDraftPublished,
  ).length;
  const stableRevisionCount = samples.filter((sample) => sample.revisionDelta === 0).length;
  return {
    ...summary,
    metadataRebuildTriggeredCount: triggered.successes,
    metadataRebuildTriggeredRate: triggered.rate,
    retryObservedCount: retried.successes,
    retryObservedRate: retried.rate,
    tornDraftPublishedCount,
    tornDraftPublishedRate: tornDraftPublishedCount / samples.length,
    tornDraftDiscardedAndRetriedCount: discarded.successes,
    tornDraftDiscardedAndRetriedRate: discarded.rate,
    publishedRefsConsistentCount: published.successes,
    publishedRefsConsistentRate: published.rate,
    stableRefCorrectClickCount: stable.successes,
    stableRefCorrectClickRate: stable.rate,
    stableRevisionCount,
    stableRevisionRate: stableRevisionCount / samples.length,
    captureWildcardQueryCount: latencyMetric(samples, 'captureWildcardQueryCount'),
    captureMetadataReadCount: latencyMetric(samples, 'captureMetadataReadCount'),
    captureMetadataReadGenerationPatterns: Object.fromEntries(
      [...new Set(samples.map((sample) => sample.captureMetadataReadGenerations.join('>')))]
        .map((pattern) => [
          pattern,
          samples.filter(
            (sample) => sample.captureMetadataReadGenerations.join('>') === pattern,
          ).length,
        ]),
    ),
    captureWildcardQueryGenerationPatterns: Object.fromEntries(
      [...new Set(samples.map((sample) => sample.captureWildcardQueryGenerations.join('>')))]
        .map((pattern) => [
          pattern,
          samples.filter(
            (sample) => sample.captureWildcardQueryGenerations.join('>') === pattern,
          ).length,
        ]),
    ),
    invariants: {
      metadataRebuildTriggered: triggered,
      tornDraftRetryObserved: retried,
      tornDraftDiscardedBeforePublish: discarded,
      publishedRefsBelongToActiveGeneration: published,
      stableDataTestIdCorrectlyClicked: stable,
      atomicEpochRevisionConsistency: revision,
    },
    latencyMs: {
      ...summary.latencyMs,
      actionAttempt: latencyMetric(samples, 'actionAttemptMs'),
    },
  };
}

function summarizePhase(sampleSets, entry, sourceFingerprint, wallClockMs) {
  const postSnapshot = summarizePostSnapshotRebuild(sampleSets.postSnapshot);
  const metadataRead = summarizeMetadataReadRebuild(sampleSets.metadataRead);
  const allSamples = [...sampleSets.postSnapshot, ...sampleSets.metadataRead];
  const aggregate = summarizeCommonScenario(allSamples);
  return {
    entry,
    sourceFingerprint,
    samplesPerScenario: sampleSets.postSnapshot.length,
    totalCases: allSamples.length,
    ...aggregate,
    // 兼容旧结果读取方：以下 locator 指标来自原有 same-page rebuild 场景。
    weakRefRejectionCount: postSnapshot.weakRefRejectionCount,
    weakRefRejectionRate: postSnapshot.weakRefRejectionRate,
    stableRefCorrectClickCount: postSnapshot.stableRefCorrectClickCount,
    stableRefCorrectClickRate: postSnapshot.stableRefCorrectClickRate,
    revisionAdvanceCount: postSnapshot.revisionAdvanceCount,
    revisionAdvanceRate: postSnapshot.revisionAdvanceRate,
    scenarios: {
      postSnapshotSamePageRebuild: postSnapshot,
      metadataReadRebuild: metadataRead,
    },
    wallClockMs,
  };
}

function createNotMeasuredMetadataBaseline() {
  return {
    status: 'notMeasured',
    measured: false,
    reason:
      'recorded baseline predates metadataReadRebuild; no baseline build is available, so no measurement was inferred or synthesized',
    samples: null,
    safeOutcomes: null,
    safeOutcomeRate: null,
    wrongActionCount: null,
    wrongActionSampleCount: null,
    wrongActionSampleRate: null,
    revisionConsistencyCount: null,
    revisionConsistencyRate: null,
    tornDraftPublishedCount: null,
    tornDraftPublishedRate: null,
    tornDraftDiscardedAndRetriedCount: null,
    tornDraftDiscardedAndRetriedRate: null,
    publishedRefsConsistentCount: null,
    publishedRefsConsistentRate: null,
    stableRefCorrectClickCount: null,
    stableRefCorrectClickRate: null,
    actionCounts: null,
    invariants: null,
    latencyMs: null,
    unexpectedErrorCount: null,
    unexpectedErrors: null,
  };
}

export function createRecordedBaselinePhase(validated) {
  const postSnapshot = JSON.parse(JSON.stringify(validated.postSnapshot));
  return {
    entry: validated.baselineEntry,
    sourceFingerprint: validated.baselineSourceFingerprint,
    partial: true,
    measurementStatus: 'recorded-post-snapshot-only',
    samples: null,
    samplesPerScenario: {
      postSnapshotSamePageRebuild: validated.samples,
      metadataReadRebuild: null,
    },
    measuredCases: validated.samples,
    totalCases: null,
    safeOutcomes: null,
    safeOutcomeRate: null,
    safeOutcomeWilson95: null,
    wrongActionCount: null,
    wrongActionSampleCount: null,
    wrongActionSampleRate: null,
    revisionConsistencyCount: null,
    revisionConsistencyRate: null,
    revisionDeltaHistogram: null,
    actionCounts: null,
    latencyMs: null,
    unexpectedErrorCount: null,
    unexpectedErrors: null,
    scenarios: {
      postSnapshotSamePageRebuild: postSnapshot,
      metadataReadRebuild: createNotMeasuredMetadataBaseline(),
    },
    wallClockMs: null,
  };
}

async function measure(ContextClass, options) {
  await runPostSnapshotRebuildSamples(ContextClass, options.warmups);
  await runMetadataReadRebuildSamples(ContextClass, options.warmups);
  const started = performance.now();
  const postSnapshot = await runPostSnapshotRebuildSamples(
    ContextClass,
    options.samplesPerScenario,
  );
  const metadataRead = await runMetadataReadRebuildSamples(
    ContextClass,
    options.samplesPerScenario,
  );
  return summarizePhase(
    { postSnapshot, metadataRead },
    options.entry,
    options.sourceFingerprint,
    performance.now() - started,
  );
}

export async function runPhase2DomEpochSynthetic(options) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  if (Boolean(options.baselineEntry) === Boolean(options.recordedBaselineResult)) {
    throw new Error(
      '必须且只能提供 baselineEntry 或 recordedBaselineResult 之一',
    );
  }
  const outputPath = resolveOutputPath(options.output ?? DEFAULT_OUTPUT, repoRoot);
  const recordedAcquisition = options.recordedBaselineResult
    ? loadRecordedBaselineResult(options.recordedBaselineResult, options.samples)
    : null;
  if (recordedAcquisition && recordedAcquisition.path === outputPath) {
    throw new Error('output 不能与 --recorded-baseline-result 指向同一文件');
  }

  const baselineEntry = options.baselineEntry
    ? resolveEntry(options.baselineEntry, 'baseline')
    : null;
  const optimizedEntry = resolveEntry(options.optimizedEntry, 'optimized');
  const optimizedFingerprint = buildFingerprint(optimizedEntry);
  const baselineFingerprint = baselineEntry
    ? buildFingerprint(baselineEntry)
    : recordedAcquisition.validated.baselineSourceFingerprint;
  if (baselineFingerprint === optimizedFingerprint) {
    throw new Error('baseline 与 optimized build 指纹相同');
  }

  const baselineModule = baselineEntry
    ? await import(pathToFileURL(baselineEntry).href)
    : null;
  const optimizedModule = await import(pathToFileURL(optimizedEntry).href);
  if (
    (baselineModule && !baselineModule.MiniProgramContext) ||
    !optimizedModule.MiniProgramContext
  ) {
    throw new Error('baseline 或 optimized entry 未导出 MiniProgramContext');
  }

  const workload = {
    samplesPerScenario: options.samples,
    warmups: options.warmups,
    sampleConcurrency: 1,
    pagePath: PAGE_PATH,
    nodesPerGeneration: 2,
    rebuild: 'same-page/same-visible-metadata/new-element-identities',
    scenarios: {
      postSnapshotSamePageRebuild:
        'capture refs, rebuild DOM, then attempt weak and stable ref actions',
      metadataReadRebuild:
        'rebuild on the first metadata read after old topology collection; inspect the published draft before acting',
    },
    weakLocator: 'button[class~="repeated-item"] + text',
    stableLocator: 'button[data-testid="stable-target"]',
    action: 'tap',
  };

  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => undefined;
  console.warn = () => undefined;
  let baseline;
  let optimized;
  try {
    baseline = baselineModule
      ? await measure(baselineModule.MiniProgramContext, {
        ...workload,
        entry: baselineEntry,
        sourceFingerprint: baselineFingerprint,
      })
      : createRecordedBaselinePhase(recordedAcquisition.validated);
    optimized = await measure(optimizedModule.MiniProgramContext, {
      ...workload,
      entry: optimizedEntry,
      sourceFingerprint: optimizedFingerprint,
    });
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }

  const baselinePostSnapshot = baseline.scenarios.postSnapshotSamePageRebuild;
  const optimizedPostSnapshot = optimized.scenarios.postSnapshotSamePageRebuild;
  const baselineMetadataRead = baseline.scenarios.metadataReadRebuild;
  const optimizedMetadataRead = optimized.scenarios.metadataReadRebuild;
  const metadataReadAcceptance = {
    ...(recordedAcquisition
      ? {}
      : {
        baselineExposesTornDraftRisk:
          baselineMetadataRead.tornDraftPublishedCount > 0 &&
          baselineMetadataRead.safeOutcomeRate < 1,
      }),
    optimizedMetadataRebuildTriggeredRateIs100Percent:
      optimizedMetadataRead.metadataRebuildTriggeredRate === 1,
    optimizedRetryObservedRateIs100Percent:
      optimizedMetadataRead.retryObservedRate === 1,
    optimizedTornDraftDiscardedAndRetriedRateIs100Percent:
      optimizedMetadataRead.tornDraftDiscardedAndRetriedRate === 1,
    optimizedTornDraftPublishedCountIsZero:
      optimizedMetadataRead.tornDraftPublishedCount === 0,
    optimizedPublishedRefsConsistentRateIs100Percent:
      optimizedMetadataRead.publishedRefsConsistentRate === 1,
    optimizedWrongActionCountIsZero:
      optimizedMetadataRead.wrongActionCount === 0,
    optimizedStableRefCorrectClickRateIs100Percent:
      optimizedMetadataRead.stableRefCorrectClickRate === 1,
    optimizedRevisionConsistencyRateIs100Percent:
      optimizedMetadataRead.revisionConsistencyRate === 1,
  };
  const acceptanceCriteria = {
    postSnapshotSamePageRebuild: {
      baselineExposesWrongActionRisk:
        baselinePostSnapshot.wrongActionCount > 0 &&
        baselinePostSnapshot.safeOutcomeRate < 1,
      optimizedWrongActionCountIsZero:
        optimizedPostSnapshot.wrongActionCount === 0,
      optimizedSafeOutcomeRateIs100Percent:
        optimizedPostSnapshot.safeOutcomeRate === 1,
      optimizedWeakRefRejectionRateIs100Percent:
        optimizedPostSnapshot.weakRefRejectionRate === 1,
      optimizedStableRefCorrectClickRateIs100Percent:
        optimizedPostSnapshot.stableRefCorrectClickRate === 1,
      optimizedRevisionAdvanceRateIs100Percent:
        optimizedPostSnapshot.revisionAdvanceRate === 1,
      optimizedRevisionConsistencyRateIs100Percent:
        optimizedPostSnapshot.revisionConsistencyRate === 1,
    },
    metadataReadRebuild: metadataReadAcceptance,
  };
  const passed = Object.values(acceptanceCriteria)
    .flatMap((scenario) => Object.values(scenario))
    .every(Boolean);
  const result = redactSensitive({
    schemaVersion: '1.0',
    recordType: 'phase2-dom-epoch-before-after',
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
    baselineAcquisition: recordedAcquisition
      ? {
        mode: 'recorded-result-reuse',
        sourceResult: recordedAcquisition.path,
        sourceResultSha256: recordedAcquisition.sha256,
        sourceRecordType: recordedAcquisition.recorded.recordType,
        sourceGeneratedAt: recordedAcquisition.recorded.generatedAt ?? null,
        sourceLayout: recordedAcquisition.validated.layout,
        reusedScenario: 'postSnapshotSamePageRebuild',
        reusedBaselineSourceFingerprint:
          recordedAcquisition.validated.baselineSourceFingerprint,
        recordedOptimizedSourceFingerprint:
          recordedAcquisition.validated.recordedOptimizedSourceFingerprint,
        notMeasuredScenarios: ['metadataReadRebuild'],
      }
      : {
        mode: 'live-build-pair',
        baselineEntry,
        baselineSourceFingerprint: baselineFingerprint,
      },
    workload: {
      ...workload,
      phaseOrder: recordedAcquisition
        ? ['recorded-baseline-reuse', 'optimized']
        : ['baseline', 'optimized'],
      consoleOutputSuppressed: true,
      fingerprint: sha256(stableStringify(workload)),
    },
    statistics: {
      durationUnit: 'milliseconds',
      percentileMethod: 'nearest-rank',
      successInterval: 'Wilson 95%',
    },
    metricDefinitions: {
      wrongAction:
        'at tap() time, the Element handle is absent from the active node set or its element generation differs from the active generation',
      tornDraftPublished:
        'after a metadata-triggered rebuild, at least one ref in the returned snapshot maps to an Element outside the active generation',
      tornDraftDiscardedAndRetried:
        'the metadata rebuild fired, later topology and metadata reads observed the new generation after at least one additional capture attempt, and all published refs map to active-generation nodes',
      safeOutcome:
        'scenario-specific target outcome succeeds, no wrong action occurs, and revision/ref state is consistent',
      revisionConsistency:
        'post-snapshot rebuild advances revision exactly once; a rebuild discarded during the first capture keeps the initial revision; in both cases snapshot/ref mappings share the final revision and point to active replacement nodes',
    },
    requestedEntries: {
      baseline: options.baselineEntry,
      recordedBaselineResult: options.recordedBaselineResult,
      optimized: options.optimizedEntry,
    },
    baseline,
    optimized,
    comparison: {
      aggregateStatus: recordedAcquisition
        ? 'notComparable-metadata-baseline-notMeasured'
        : 'comparable',
      wrongActionsAvoided: recordedAcquisition
        ? null
        : baseline.wrongActionCount - optimized.wrongActionCount,
      wrongActionSampleRateDeltaPercentagePoints:
        recordedAcquisition
          ? null
          : (optimized.wrongActionSampleRate - baseline.wrongActionSampleRate) * 100,
      safeOutcomeRateDeltaPercentagePoints:
        recordedAcquisition
          ? null
          : (optimized.safeOutcomeRate - baseline.safeOutcomeRate) * 100,
      weakRefRejectionRateDeltaPercentagePoints:
        recordedAcquisition
          ? null
          : (optimized.weakRefRejectionRate - baseline.weakRefRejectionRate) * 100,
      stableRefCorrectClickRateDeltaPercentagePoints:
        recordedAcquisition
          ? null
          : (optimized.stableRefCorrectClickRate - baseline.stableRefCorrectClickRate) * 100,
      revisionConsistencyRateDeltaPercentagePoints:
        recordedAcquisition
          ? null
          : (optimized.revisionConsistencyRate - baseline.revisionConsistencyRate) * 100,
      scenarios: {
        postSnapshotSamePageRebuild: {
          wrongActionsAvoided:
            baselinePostSnapshot.wrongActionCount - optimizedPostSnapshot.wrongActionCount,
          safeOutcomeRateDeltaPercentagePoints:
            (optimizedPostSnapshot.safeOutcomeRate - baselinePostSnapshot.safeOutcomeRate) * 100,
          revisionConsistencyRateDeltaPercentagePoints:
            (optimizedPostSnapshot.revisionConsistencyRate -
              baselinePostSnapshot.revisionConsistencyRate) * 100,
        },
        metadataReadRebuild: {
          comparisonStatus: recordedAcquisition
            ? 'notComparable-baseline-notMeasured'
            : 'comparable',
          tornDraftsAvoided:
            recordedAcquisition
              ? null
              : baselineMetadataRead.tornDraftPublishedCount -
                optimizedMetadataRead.tornDraftPublishedCount,
          tornDraftDiscardAndRetryRateDeltaPercentagePoints:
            recordedAcquisition
              ? null
              : (optimizedMetadataRead.tornDraftDiscardedAndRetriedRate -
                baselineMetadataRead.tornDraftDiscardedAndRetriedRate) * 100,
          safeOutcomeRateDeltaPercentagePoints:
            recordedAcquisition
              ? null
              : (optimizedMetadataRead.safeOutcomeRate -
                baselineMetadataRead.safeOutcomeRate) * 100,
        },
      },
      scenarioP50DeltaMs:
        recordedAcquisition
          ? null
          : optimized.latencyMs.scenario.p50 - baseline.latencyMs.scenario.p50,
      scenarioP95DeltaMs:
        recordedAcquisition
          ? null
          : optimized.latencyMs.scenario.p95 - baseline.latencyMs.scenario.p95,
    },
    acceptance: {
      passed,
      scope: {
        postSnapshotSamePageRebuild: 'recorded-or-live-before/after',
        metadataReadRebuild: recordedAcquisition
          ? 'optimized-only; baseline notMeasured'
          : 'live-before/after',
      },
      criteria: acceptanceCriteria,
    },
    limitations: [
      'synthetic/non-authoritative：不连接真实微信开发者工具，也不经过 MCP transport。',
      'mock Element 的 tap() 可记录已脱离活动 DOM 的旧 handle，用于确定性暴露错误动作风险；真实 DevTools 对 detached handle 可能报错或表现不同。',
      `${options.samples} 个正式样本/场景顺序执行以降低调度噪声；延迟主要用于同机同进程相对比较，不能代表真实 RPC 延迟。`,
      '本脚本不覆盖 find_elements 首次 baseline 的完整工具调用链，也不模拟 MCP 并发动作队列；这些行为由工具/协议测试及真实环境验证。',
      recordedAcquisition
        ? 'post-snapshot baseline 复用经严格校验的历史合成结果；本次仅执行 optimized，metadata baseline 明确为 notMeasured。'
        : 'baseline 与 optimized 顺序执行，未随机交错，也未强制垃圾回收。',
    ],
  }, { repoRoot });

  const output = outputPath;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, output);
  return { output, result };
}

async function main() {
  const args = parsePhase2DomEpochArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const { output, result } = await runPhase2DomEpochSynthetic({
    ...args,
    repoRoot: process.cwd(),
  });
  const formatLatency = (value) => Number.isFinite(value) ? value.toFixed(3) : 'notMeasured';
  console.log([
    'phase2 DOM epoch synthetic/non-authoritative benchmark 完成',
    `baseline acquisition=${result.baselineAcquisition.mode}`,
    `post-snapshot wrong actions=${result.baseline.scenarios.postSnapshotSamePageRebuild.wrongActionCount} -> ${result.optimized.scenarios.postSnapshotSamePageRebuild.wrongActionCount}`,
    `metadata torn drafts published=${result.baseline.scenarios.metadataReadRebuild.tornDraftPublishedCount} -> ${result.optimized.scenarios.metadataReadRebuild.tornDraftPublishedCount}`,
    `metadata discard+retry rate=${result.baseline.scenarios.metadataReadRebuild.tornDraftDiscardedAndRetriedRate} -> ${result.optimized.scenarios.metadataReadRebuild.tornDraftDiscardedAndRetriedRate}`,
    `aggregate safe outcome=${result.baseline.safeOutcomeRate} -> ${result.optimized.safeOutcomeRate}`,
    `post-snapshot scenario p50/p95=${formatLatency(result.baseline.scenarios.postSnapshotSamePageRebuild.latencyMs.scenario.p50)}/${formatLatency(result.baseline.scenarios.postSnapshotSamePageRebuild.latencyMs.scenario.p95)}ms -> ${formatLatency(result.optimized.scenarios.postSnapshotSamePageRebuild.latencyMs.scenario.p50)}/${formatLatency(result.optimized.scenarios.postSnapshotSamePageRebuild.latencyMs.scenario.p95)}ms`,
    `acceptance=${result.acceptance.passed ? 'PASS' : 'FAIL'}`,
    `output=${output}`,
  ].join('\n'));
  if (!result.acceptance.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
