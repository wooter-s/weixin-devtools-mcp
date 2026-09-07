import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/connection/adapters.js', () => ({
  executeConnectionStrategy: vi.fn(),
}));

vi.mock('../../src/connection/health-probe.js', () => ({
  probeConnectionHealth: vi.fn(),
}));

import { MiniProgramContext } from '../../src/MiniProgramContext.js';
import { networkRuntime } from '../../src/collectors/network-runtime.js';
import { ToolCategory } from '../../src/config/tool-category.js';
import { executeConnectionStrategy } from '../../src/connection/adapters.js';
import { probeConnectionHealth } from '../../src/connection/health-probe.js';
import type { AdapterConnectionResult } from '../../src/connection/types.js';

function createContext(): MiniProgramContext {
  return MiniProgramContext.create({
    toolProfile: {
      profile: 'full',
      activeToolCount: 31,
      disabledToolCount: 0,
      activeCategories: Object.values(ToolCategory),
      inactiveCategories: [],
    },
  });
}

function createPage(path: string) {
  return { path };
}

function createSnapshotElement(
  options: {
    tagName?: string;
    text?: string;
    attributes?: Record<string, string>;
  } = {}
) {
  const attributes = options.attributes ?? {};
  return {
    tagName: options.tagName ?? 'button',
    text: vi.fn(async () => options.text ?? ''),
    attribute: vi.fn(async (name: string) => attributes[name] ?? null),
    size: vi.fn(async () => ({ width: 100, height: 40 })),
    offset: vi.fn(async () => ({ left: 0, top: 0 })),
  };
}

function createMiniProgram(page = createPage('/pages/home/index')) {
  const installNetwork = vi.fn(async (): Promise<undefined> => undefined);
  const restoreNetwork = vi.fn(async (): Promise<undefined> => undefined);
  return {
    installNetwork, restoreNetwork,
    currentPage: vi.fn(async () => page),
    on: vi.fn(),
    off: vi.fn(),
    evaluate: vi.fn(async (fn: ((...args: any[]) => any), command?: { action: string }) => {
      if (fn === networkRuntime && command?.action === 'install') await installNetwork();
      if (fn === networkRuntime && command?.action === 'stop') await restoreNetwork();
      return undefined;
    }),
    mockWxMethod: vi.fn(async () => undefined),
    restoreWxMethod: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
  };
}

function adapterResult(
  miniProgram: ReturnType<typeof createMiniProgram>,
  page = createPage('/pages/home/index')
): AdapterConnectionResult {
  return {
    strategyUsed: 'discover',
    endpoint: 'ws://127.0.0.1:9420',
    miniProgram: miniProgram as never,
    currentPage: page as never,
    pagePath: page.path,
  };
}

describe('MiniProgramContext runtime ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(probeConnectionHealth).mockResolvedValue({
      level: 'healthy',
      checks: [],
      checkedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('F4 distinguishes refs retired by navigation from unknown refs', async () => {
    const element = createSnapshotElement({ attributes: { id: 'stable' } });
    const page = { path: '/pages/home/index', $$: vi.fn(async () => [element]) };
    const next = { path: '/pages/detail/index', $$: vi.fn(async () => [element]) };
    const mini = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(mini, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const commit = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    const ref = commit.snapshot.elements[0]!.ref;
    mini.currentPage.mockResolvedValue(next);
    await context.syncCurrentPage();
    await expect(context.getElementByTarget({ kind: 'ref', ref })).rejects.toMatchObject({ code: 'STALE_ELEMENT' });
    await expect(context.getElementByTarget({ kind: 'ref', ref: 'never-issued' })).rejects.toMatchObject({ code: 'ELEMENT_NOT_FOUND' });
    await context.disconnectDevtools();
  });

  it('retired ref history is bounded and released across connections', async () => {
    const element = createSnapshotElement({ attributes: { id: 'stable' } });
    const page = { path: '/pages/home/index', $$: vi.fn(async () => [element]) };
    const mini = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(mini, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    context.setElementMap(new Map(Array.from({ length: 10_001 }, (_, index) => [
      `issued-${index}`, { selector: 'button', index: 0, pageRevision: context.getPageRevision(), pagePath: page.path },
    ])));
    context.clearElementMap();
    await expect(context.getElementByTarget({ kind: 'ref', ref: 'issued-0' })).rejects.toMatchObject({ code: 'ELEMENT_NOT_FOUND' });
    await expect(context.getElementByTarget({ kind: 'ref', ref: 'issued-10000' })).rejects.toMatchObject({ code: 'STALE_ELEMENT' });
    await context.disconnectDevtools();
    await context.connectDevtools({ target: { kind: 'discover' } });
    await expect(context.getElementByTarget({ kind: 'ref', ref: 'issued-10000' })).rejects.toMatchObject({ code: 'ELEMENT_NOT_FOUND' });
    await context.disconnectDevtools();
  });

  it('默认 core profile 不启动未暴露的 Console/Network 监听', async () => {
    const miniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram));
    const context = MiniProgramContext.create();

    await context.connectDevtools({ target: { kind: 'discover' } });

    expect(miniProgram.on).not.toHaveBeenCalled();
    expect(miniProgram.installNetwork).not.toHaveBeenCalled();
    expect(context.getRuntimeStatus()).toMatchObject({
      toolProfile: { profile: 'core' },
      monitoring: {
        console: { enabled: false, state: 'disabled' },
        network: { enabled: false, state: 'disabled' },
      },
    });
  });

  it('连接后由 Context 原子持有会话、状态、页面 revision 和监听器', async () => {
    const page = createPage('/pages/home/index');
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();

    const result = await context.connectDevtools({ target: { kind: 'discover' } });

    expect(result.status).toBe('connected');
    expect(context.miniProgram).toBe(miniProgram);
    expect(context.currentPage).toBe(page);
    expect(context.connectionStatus).toMatchObject({
      connected: true,
      pagePath: '/pages/home/index',
    });
    expect(context.getPageRevision()).toBe(1);
    expect(miniProgram.on).toHaveBeenCalledTimes(1);
    expect(miniProgram.installNetwork).toHaveBeenCalledTimes(1);

    await context.startAutomaticMonitoring();
    expect(miniProgram.on).toHaveBeenCalledTimes(1);
    expect(miniProgram.installNetwork).toHaveBeenCalledTimes(1);
  });

  it('自动网络监听不返回时按连接总预算降级并释放生命周期队列', async () => {
    vi.useFakeTimers();
    try {
      const miniProgram = createMiniProgram();
      miniProgram.installNetwork.mockImplementationOnce(() => new Promise(() => undefined));
      vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram));
      const context = createContext();

      const connection = context.connectDevtools({
        target: { kind: 'discover' },
        timeoutMs: 25,
        healthCheck: false,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(miniProgram.installNetwork).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(25);
      const result = await connection;

      expect(result).toMatchObject({
        status: 'degraded',
        timing: { totalMs: 25 },
      });
      expect(result.warnings.join('\n')).toContain('网络监听启动在 25ms 内未完成');
      expect(context.getRuntimeStatus().monitoring.network).toMatchObject({
        enabled: true,
        state: 'failed',
        lastError: expect.stringContaining('网络监听启动在 25ms 内未完成'),
      });
      const disconnect = context.disconnectDevtools();
      await vi.advanceTimersByTimeAsync(5000);
      await expect(disconnect).resolves.toMatchObject({ state: 'disconnected' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('自动监听超时后的迟到完成不会改写失败状态或污染后续会话', async () => {
    vi.useFakeTimers();
    try {
      const firstMiniProgram = createMiniProgram();
      const secondMiniProgram = createMiniProgram();
      let releaseEvaluate: (() => void) | undefined;
      firstMiniProgram.installNetwork.mockImplementationOnce(() => new Promise<undefined>(resolve => {
        releaseEvaluate = () => resolve(undefined);
      }));
      vi.mocked(executeConnectionStrategy)
        .mockResolvedValueOnce(adapterResult(firstMiniProgram))
        .mockResolvedValueOnce(adapterResult(secondMiniProgram));
      const context = createContext();

      const firstConnection = context.connectDevtools({
        target: { kind: 'discover' },
        timeoutMs: 10,
        healthCheck: false,
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10);
      await expect(firstConnection).resolves.toMatchObject({ status: 'degraded' });

      releaseEvaluate?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(firstMiniProgram.installNetwork).toHaveBeenCalledOnce();
      expect(context.getRuntimeStatus().monitoring.network.state).toBe('failed');

      const secondConnection = await context.connectDevtools({
        target: { kind: 'discover' },
        timeoutMs: 100,
        healthCheck: false,
      });
      expect(secondConnection.status).toBe('connected');
      expect(secondMiniProgram.installNetwork).toHaveBeenCalledTimes(1);
      expect(context.getRuntimeStatus().monitoring.network.state).toBe('running');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Console 监听部分注册失败时回滚，并允许同会话重试', async () => {
    const miniProgram = createMiniProgram();
    let exceptionFailures = 1;
    miniProgram.on.mockImplementation((event: string) => {
      if (event === 'exception' && exceptionFailures > 0) {
        exceptionFailures -= 1;
        throw new Error('exception listener failed');
      }
    });
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram));
    const context = createContext();

    const connection = await context.connectDevtools({ target: { kind: 'discover' } });

    expect(connection.status).toBe('degraded');
    expect(connection.warnings.join('\n')).toContain('exception listener failed');
    expect(miniProgram.on.mock.calls.map(call => call[0])).not.toContain('console');

    const refreshedWhileFailed = await context.getConnectionStatus({ refreshHealth: true });
    expect(refreshedWhileFailed.state).toBe('degraded');

    const monitoring = await context.startAutomaticMonitoring();
    expect(monitoring).toMatchObject({
      monitoring: {
        console: { state: 'running' },
        network: { state: 'running' },
      },
      warnings: [],
    });
    expect(miniProgram.on).toHaveBeenCalledTimes(2);
    expect(context.connectionStatus.state).toBe('connected');

    await context.disconnectDevtools();
    expect(miniProgram.off).toHaveBeenCalledWith('exception', expect.any(Function));
  });

  it('活动会话不能通过同步兼容 API 绕过异步资源清理', async () => {
    const miniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });

    expect(() => {
      context.miniProgram = null;
    }).toThrow('MiniProgramContext 生命周期管理');
    expect(() => context.disconnect()).toThrow('disconnectDevtools');
    expect(context.miniProgram).toBe(miniProgram);

    await context.disconnectDevtools();
    expect(miniProgram.restoreNetwork).toHaveBeenCalledTimes(1);
  });

  it('替换连接失败后不保留旧会话或假 connected 状态', async () => {
    const oldMiniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy)
      .mockResolvedValueOnce(adapterResult(oldMiniProgram))
      .mockRejectedValueOnce(new Error('replacement failed'));
    const context = createContext();

    await context.connectDevtools({ target: { kind: 'discover' } });
    await expect(context.connectDevtools({ target: { kind: 'discover' } })).rejects.toThrow(
      'replacement failed'
    );

    expect(oldMiniProgram.restoreNetwork).toHaveBeenCalledTimes(1);
    expect(oldMiniProgram.disconnect).toHaveBeenCalledOnce();
    expect(context.miniProgram).toBeNull();
    expect(context.currentPage).toBeNull();
    expect(context.connectionStatus).toMatchObject({
      state: 'disconnected',
      connected: false,
      hasCurrentPage: false,
      pagePath: null,
      lastError: { message: '所有连接尝试均失败: replacement failed' },
    });
  });

  it('新连接参数解析失败时不会先销毁当前健康会话', async () => {
    const activeMiniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(activeMiniProgram));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });

    await expect(context.connectDevtools({
      target: { kind: 'project', projectPath: '/path/that/does/not/exist' },
    })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    expect(activeMiniProgram.disconnect).not.toHaveBeenCalled();
    expect(context.miniProgram).toBe(activeMiniProgram);
    expect(context.connectionStatus.connected).toBe(true);
    expect(executeConnectionStrategy).toHaveBeenCalledOnce();
  });

  it('syncCurrentPage 识别外部跳页并失效旧元素映射', async () => {
    const firstPage = createPage('/pages/home/index');
    const nextPage = createPage('/pages/detail/index');
    const miniProgram = createMiniProgram(firstPage);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, firstPage));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    context.elementMap.set('old-ref', { selector: '.old', index: 0 });
    miniProgram.currentPage.mockResolvedValueOnce(nextPage);

    await context.syncCurrentPage();

    expect(context.currentPage).toBe(nextPage);
    expect(context.connectionStatus.pagePath).toBe('/pages/detail/index');
    expect(context.getPageRevision()).toBe(2);
    expect(context.elementMap.size).toBe(0);
  });

  it('getElementByTarget 使用当前 revision 和快照映射解析 ref', async () => {
    const element = { tagName: 'button' };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [element]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    context.elementMap.set('ref-1', {
      selector: 'button',
      index: 0,
      element: element as never,
      pagePath: '/pages/home/index',
      pageRevision: context.getPageRevision(),
    });

    await expect(context.getElementByTarget({ kind: 'ref', ref: 'ref-1' })).resolves.toBe(element);
  });

  it('同页 mutation 保留旧 ref，并允许强 fingerprint 在新 revision 安全重绑', async () => {
    const rebound = {
      tagName: 'button',
      attribute: vi.fn(async (name: string) => (name === 'id' ? 'save' : undefined)),
      text: vi.fn(async () => '保存'),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [rebound]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    context.elementMap.set('stable-ref', {
      selector: '#save',
      index: 0,
      pagePath: '/pages/home/index',
      pageRevision: context.getPageRevision(),
      fingerprint: { tagName: 'button', id: 'save' },
    });

    context.markPageMutation();

    expect(context.elementMap.has('stable-ref')).toBe(true);
    await expect(context.getElementByTarget({ kind: 'ref', ref: 'stable-ref' })).resolves.toBe(
      rebound
    );
  });

  it('快照 registry 只保留当前与上一 revision 的 ref', async () => {
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => []),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const originalRevision = context.getPageRevision();
    context.elementMap.set('old-ref', {
      selector: '#old',
      index: 0,
      pagePath: '/pages/home/index',
      pageRevision: originalRevision,
    });

    context.markPageMutation();
    await context.getPageSnapshotCached({ forceRefresh: true });
    expect(context.elementMap.has('old-ref')).toBe(true);

    context.markPageMutation();
    await context.getPageSnapshotCached({ forceRefresh: true });
    expect(context.elementMap.has('old-ref')).toBe(false);
  });

  it('连续 mutation 即使未生成快照也会及时淘汰过旧 ref', async () => {
    const page = createPage('/pages/home/index');
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    context.elementMap.set('old-ref', {
      selector: '#old',
      index: 0,
      pagePath: page.path,
      pageRevision: context.getPageRevision(),
    });

    context.markPageMutation();
    expect(context.elementMap.has('old-ref')).toBe(true);
    context.markPageMutation();
    expect(context.elementMap.has('old-ref')).toBe(false);
  });

  it('同 revision 连续强刷快照只保留最近一代 ref', async () => {
    const element = {
      tagName: 'button',
      text: vi.fn(async () => '保存'),
      attribute: vi.fn(async () => null),
      size: vi.fn(async () => ({ width: 100, height: 40 })),
      offset: vi.fn(async () => ({ left: 0, top: 0 })),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [element]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });

    await context.getPageSnapshotCached({ forceRefresh: true });
    await context.getPageSnapshotCached({ forceRefresh: true });
    await context.getPageSnapshotCached({ forceRefresh: true });

    expect(context.elementMap.size).toBe(1);
    expect([...context.elementMap.values()][0]?.generationKind).toBe('snapshot');
  });

  it('稳定 revision 保留全部 query generation，推进后只留最新一代', async () => {
    const page = createPage('/pages/home/index');
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const revision = context.getPageRevision();

    for (const generation of ['a', 'b', 'c']) {
      context.registerElementMap(
        new Map([
          [
            `ref-${generation}`,
            {
              selector: '#save',
              index: 0,
              generationKind: 'query',
              snapshotId: `query-${generation}`,
              pageRevision: revision,
              pagePath: page.path,
            },
          ],
        ])
      );
    }

    expect([...context.elementMap.keys()]).toEqual(['ref-a', 'ref-b', 'ref-c']);
    context.markPageMutation();
    expect([...context.elementMap.keys()]).toEqual(['ref-c']);
  });

  it('三个并发 page-state transaction 串行提交，同 epoch query ref 均可解析', async () => {
    const element = createSnapshotElement({
      text: '保存',
      attributes: { 'data-testid': 'save' },
    });
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [element]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    let activeTransactions = 0;
    let maximumActiveTransactions = 0;

    const runQueryTransaction = (generation: string) =>
      context.withPageStateOperation(async (pageState) => {
        activeTransactions += 1;
        maximumActiveTransactions = Math.max(maximumActiveTransactions, activeTransactions);
        try {
          const baseline = await pageState.synchronizePageState({
            mode: 'guard',
            forceRefresh: true,
          });
          const ref = `query-ref-${generation}`;
          pageState.registerElementMap(
            new Map([
              [
                ref,
                {
                  selector: 'button[data-testid="save"]',
                  index: 0,
                  generationKind: 'query',
                  snapshotId: `query-generation-${generation}`,
                  pageRevision: baseline.pageRevision,
                  pagePath: baseline.pagePath,
                  element: element as never,
                  fingerprint: { tagName: 'button', testId: 'save', text: '保存' },
                },
              ],
            ]),
            {
              expectedRevision: baseline.pageRevision,
              expectedPath: baseline.pagePath,
            }
          );
          await Promise.resolve();
          await pageState.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
          return ref;
        } finally {
          activeTransactions -= 1;
        }
      });

    const refs = await Promise.all([
      runQueryTransaction('a'),
      runQueryTransaction('b'),
      runQueryTransaction('c'),
    ]);

    expect(maximumActiveTransactions).toBe(1);
    expect(refs.every((ref) => context.elementMap.has(ref))).toBe(true);
    await expect(context.getElementByTarget({ kind: 'ref', ref: refs[0]! })).resolves.toBe(element);
    await expect(context.getElementByTarget({ kind: 'ref', ref: refs[1]! })).resolves.toBe(element);
    await expect(context.getElementByTarget({ kind: 'ref', ref: refs[2]! })).resolves.toBe(element);
    const currentGenerationIds = [...context.elementMap.values()]
      .filter((info) => info.pageRevision === context.getPageRevision())
      .reduce(
        (ids, info) => {
          ids[info.generationKind ?? 'query'].add(info.snapshotId!);
          return ids;
        },
        { snapshot: new Set<string>(), query: new Set<string>() }
      );
    expect(currentGenerationIds.snapshot.size).toBe(1);
    expect(currentGenerationIds.query.size).toBe(3);
  });

  it('同页异步重建相同特征节点时原子推进 revision，并拒绝旧弱 ref', async () => {
    const original = createSnapshotElement({ text: '重复项', attributes: { class: 'item' } });
    const replacement = createSnapshotElement({ text: '重复项', attributes: { class: 'item' } });
    const activeElements = { value: [original] };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => activeElements.value),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initial = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    const weakRef = initial.snapshot.elements[0]?.ref;
    const initialRevision = initial.pageRevision;
    activeElements.value = [replacement];

    await expect(context.getElementByTarget({ kind: 'ref', ref: weakRef! })).rejects.toMatchObject({
      code: 'STALE_ELEMENT',
    });

    expect(context.getPageRevision()).toBe(initialRevision + 1);
    expect(context.elementMap.has(weakRef!)).toBe(true);
    const currentEntries = [...context.elementMap.values()].filter(
      (info) => info.pageRevision === initialRevision + 1
    );
    expect(currentEntries).toHaveLength(1);
    expect(currentEntries[0]?.element).toBe(replacement);
  });

  it('observation 快照晚于 query generation 时仍保留正在解析的旧 ref 语义', async () => {
    const original = createSnapshotElement({ text: '重复项', attributes: { class: 'item' } });
    const replacement = createSnapshotElement({ text: '重复项', attributes: { class: 'item' } });
    const activeElements = { value: [original] };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => activeElements.value),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initial = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    const queryRef = 'query-ref';
    context.registerElementMap(
      new Map([
        [
          queryRef,
          {
            selector: 'button[class~="item"]',
            index: 0,
            generationKind: 'query' as const,
            snapshotId: 'query-generation',
            pageRevision: initial.pageRevision,
            pagePath: page.path,
            element: original as never,
            fingerprint: { tagName: 'button', className: 'item', text: '重复项' },
          },
        ],
      ]),
      {
        expectedRevision: initial.pageRevision,
        expectedPath: page.path,
      }
    );
    // 模拟 find_elements 查询之后又发布了 observation snapshot。
    await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    activeElements.value = [replacement];

    await expect(context.getElementByTarget({ kind: 'ref', ref: queryRef })).rejects.toMatchObject({
      code: 'STALE_ELEMENT',
    });
    expect(context.elementMap.has(queryRef)).toBe(true);
  });

  it('guard 在 DOM 未变化时不推进 revision 或轮换 ref generation', async () => {
    const element = createSnapshotElement({ text: '稳定节点', attributes: { id: 'stable' } });
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [element]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initial = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    const initialRefs = [...context.elementMap.keys()];

    const guarded = await context.synchronizePageState({ mode: 'guard' });
    const guardedAgain = await context.synchronizePageState({ mode: 'guard' });

    expect(guarded.domChanged).toBe(false);
    expect(guardedAgain.pageRevision).toBe(initial.pageRevision);
    expect(guardedAgain.snapshot.snapshotId).toBe(initial.snapshot.snapshotId);
    expect([...context.elementMap.keys()]).toEqual(initialRefs);
  });

  it('guard 发现嵌套作用域 ref 缺失时重新发布完整 registry', async () => {
    const leaf = createSnapshotElement({ text: '组件内节点', attributes: { id: 'inner' } });
    const component = {
      ...createSnapshotElement({ tagName: 'mcp-card', attributes: { id: 'card' } }),
      $: vi.fn(async () => leaf),
      $$: vi.fn(async () => [leaf]),
      data: vi.fn(async () => ({})),
      setData: vi.fn(async () => undefined),
      callMethod: vi.fn(async () => undefined),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [component]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initial = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    const nestedRef = initial.snapshot.scopes?.[1]?.elements[0]?.ref;
    expect(nestedRef).toBeDefined();
    context.elementMap.delete(nestedRef!);

    const guarded = await context.synchronizePageState({ mode: 'guard' });
    const guardedRefs = guarded.snapshot.scopes?.flatMap((scope) =>
      scope.elements.map((element) => element.ref)
    ) ?? [];

    expect(guarded.snapshot.snapshotId).not.toBe(initial.snapshot.snapshotId);
    expect(guardedRefs.length).toBe(2);
    expect(guardedRefs.every((ref) => context.elementMap.has(ref))).toBe(true);
  });

  it('非 canonical 快照将 refs 作为 query generation 保留并可立即解析', async () => {
    const element = createSnapshotElement({
      text: '稳定节点',
      attributes: { id: 'stable' },
    });
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [element]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const canonical = await context.synchronizePageState({
      mode: 'snapshot',
      forceRefresh: true,
    });
    const canonicalRef = canonical.snapshot.elements[0]?.ref;

    const custom = await context.capturePageSnapshot({ includeAttributes: true });
    const customRef = custom.snapshot.elements[0]?.ref;

    expect(custom.previousSnapshot).toBeNull();
    expect(context.elementMap.get(customRef!)?.generationKind).toBe('query');
    expect(context.elementMap.has(canonicalRef!)).toBe(true);
    await expect(
      context.getElementByTarget({ kind: 'ref', ref: customRef! })
    ).resolves.toBe(element);
    expect(context.elementMap.has(customRef!)).toBe(true);
  });

  it('root 快照稳定路径只执行 scoped 与末尾 canonical guard 各一次双扫描', async () => {
    const leaf = createSnapshotElement({
      text: '组件内节点',
      attributes: { id: 'inner' },
    });
    const component = {
      ...createSnapshotElement({ tagName: 'mcp-card', attributes: { id: 'card' } }),
      $: vi.fn(async () => leaf),
      $$: vi.fn(async () => [leaf]),
      data: vi.fn(async () => ({})),
      setData: vi.fn(async () => undefined),
      callMethod: vi.fn(async () => undefined),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [component]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const canonical = await context.synchronizePageState({
      mode: 'snapshot',
      forceRefresh: true,
    });
    const rootRef = canonical.snapshot.elements[0]?.ref;
    page.$$.mockClear();
    component.$$.mockClear();

    const scoped = await context.capturePageSnapshot({
      root: { kind: 'ref', ref: rootRef! },
    });

    expect(page.$$).toHaveBeenCalledTimes(2);
    expect(component.$$).toHaveBeenCalledTimes(4);
    expect(scoped.snapshot.scopes?.[0]).toMatchObject({
      kind: 'custom-component',
      rootRef,
      elements: [{ tagName: 'button' }],
    });
    expect(context.elementMap.has(rootRef!)).toBe(true);
    expect(scoped.previousSnapshot).toBeNull();
  });

  it('首次 scoped 快照先建立 canonical baseline，总共执行三次双扫描', async () => {
    const leaf = createSnapshotElement({
      text: '组件内节点',
      attributes: { id: 'inner' },
    });
    const component = {
      ...createSnapshotElement({ tagName: 'mcp-card', attributes: { id: 'card' } }),
      $: vi.fn(async () => leaf),
      $$: vi.fn(async () => [leaf]),
      data: vi.fn(async () => ({})),
      setData: vi.fn(async () => undefined),
      callMethod: vi.fn(async () => undefined),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async (selector: string) =>
        selector === '*' || selector === '[id="card"]' ? [component] : []),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });

    const scoped = await context.capturePageSnapshot({
      root: { kind: 'path', path: [{ kind: 'id', value: 'card' }] },
    });

    expect(scoped.snapshot.scopes?.[0]?.elements[0]?.text).toBe('组件内节点');
    expect(page.$$.mock.calls.filter(([selector]) => selector === '*')).toHaveLength(4);
    expect(component.$$).toHaveBeenCalledTimes(6);
  });

  it('known mutation 后 baseline revision 落后时先重建基线并保持六次扫描', async () => {
    const leaf = createSnapshotElement({
      text: '组件内节点',
      attributes: { id: 'inner' },
    });
    const component = {
      ...createSnapshotElement({ tagName: 'mcp-card', attributes: { id: 'card' } }),
      $: vi.fn(async () => leaf),
      $$: vi.fn(async () => [leaf]),
      data: vi.fn(async () => ({})),
      setData: vi.fn(async () => undefined),
      callMethod: vi.fn(async () => undefined),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async (selector: string) =>
        selector === '*' || selector === '[id="card"]' ? [component] : []),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const canonical = await context.synchronizePageState({
      mode: 'snapshot',
      forceRefresh: true,
    });
    const rootRef = canonical.snapshot.elements[0]?.ref;
    context.markPageMutation();
    page.$$.mockClear();
    component.$$.mockClear();

    const scoped = await context.capturePageSnapshot({
      root: { kind: 'ref', ref: rootRef! },
    });

    expect(scoped.pageRevision).toBe(canonical.pageRevision + 1);
    expect(page.$$.mock.calls.filter(([selector]) => selector === '*')).toHaveLength(4);
    expect(component.$$).toHaveBeenCalledTimes(6);
  });

  it('scoped 首轮前 DOM 稳定变化时由末尾 guard 推进 epoch 后重试', async () => {
    const previousLeaf = createSnapshotElement({
      text: '变化前',
      attributes: { id: 'inner' },
    });
    const currentLeaf = createSnapshotElement({
      text: '变化后',
      attributes: { id: 'inner' },
    });
    let activeLeaf = previousLeaf;
    let armMutation = false;
    let rootIdReads = 0;
    const component = {
      ...createSnapshotElement({ tagName: 'mcp-card', attributes: { id: 'card' } }),
      attribute: vi.fn(async (name: string) => {
        if (name !== 'id') return null;
        if (armMutation) {
          rootIdReads += 1;
          if (rootIdReads === 1) activeLeaf = currentLeaf;
        }
        return 'card';
      }),
      $: vi.fn(async () => activeLeaf),
      $$: vi.fn(async () => [activeLeaf]),
      data: vi.fn(async () => ({})),
      setData: vi.fn(async () => undefined),
      callMethod: vi.fn(async () => undefined),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async (selector: string) =>
        selector === '*' || selector === '[id="card"]' ? [component] : []),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initial = await context.synchronizePageState({
      mode: 'snapshot',
      forceRefresh: true,
    });
    const rootRef = initial.snapshot.elements[0]?.ref;
    page.$$.mockClear();
    component.$$.mockClear();
    armMutation = true;

    const scoped = await context.capturePageSnapshot({
      root: { kind: 'ref', ref: rootRef! },
    });

    expect(scoped.pageRevision).toBe(initial.pageRevision + 1);
    expect(scoped.snapshot).toMatchObject({
      pageRevision: initial.pageRevision + 1,
      scopes: [{ elements: [{ text: '变化后' }] }],
    });
    expect(context.getPageRevision()).toBe(initial.pageRevision + 1);
    expect(scoped.previousSnapshot).toBeNull();
    expect(page.$$.mock.calls.filter(([selector]) => selector === '*')).toHaveLength(4);
    expect(component.$$).toHaveBeenCalledTimes(8);
  });

  it('无 baseline 时 scoped 扫描后 DOM 变化不会被末尾 guard 吸收到旧 epoch', async () => {
    const previousLeaf = createSnapshotElement({
      text: '变化前',
      attributes: { id: 'inner' },
    });
    const currentLeaf = createSnapshotElement({
      text: '变化后',
      attributes: { id: 'inner' },
    });
    let activeLeaf = previousLeaf;
    let previousTextReads = 0;
    previousLeaf.text.mockImplementation(async () => {
      previousTextReads += 1;
      if (previousTextReads === 4) activeLeaf = currentLeaf;
      return '变化前';
    });
    const component = {
      ...createSnapshotElement({ tagName: 'mcp-card', attributes: { id: 'card' } }),
      $: vi.fn(async () => activeLeaf),
      $$: vi.fn(async () => [activeLeaf]),
      data: vi.fn(async () => ({})),
      setData: vi.fn(async () => undefined),
      callMethod: vi.fn(async () => undefined),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async (selector: string) =>
        selector === '*' || selector === '[id="card"]' ? [component] : []),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initialRevision = context.getPageRevision();

    const scoped = await context.capturePageSnapshot({
      root: { kind: 'path', path: [{ kind: 'id', value: 'card' }] },
    });

    expect(scoped.pageRevision).toBe(initialRevision + 1);
    expect(scoped.snapshot).toMatchObject({
      pageRevision: initialRevision + 1,
      scopes: [{ elements: [{ text: '变化后' }] }],
    });
    expect(context.getPageRevision()).toBe(initialRevision + 1);
    expect(previousTextReads).toBe(4);
    expect(page.$$.mock.calls.filter(([selector]) => selector === '*')).toHaveLength(6);
    expect(component.$$).toHaveBeenCalledTimes(10);
  });

  it('metadata 等待期间节点重建时丢弃 torn draft，并只对重试节点读取 metadata', async () => {
    const replacement = createSnapshotElement({ text: '重建后' });
    const activeElements = { value: [] as ReturnType<typeof createSnapshotElement>[] };
    let rebuilt = false;
    const original = createSnapshotElement({ text: '重建前' });
    original.text.mockImplementation(async () => {
      await Promise.resolve();
      if (!rebuilt) {
        rebuilt = true;
        activeElements.value = [replacement];
      }
      return '重建前';
    });
    activeElements.value = [original];
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => activeElements.value),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });

    const committed = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    const committedInfo = committed.snapshot.elements[0]
      ? committed.elementMap.get(committed.snapshot.elements[0].ref)
      : undefined;

    expect(committed.snapshot.elements[0]?.text).toBe('重建后');
    expect(committedInfo?.element).toBe(replacement);
    expect(original.text).toHaveBeenCalledOnce();
    expect(replacement.text).toHaveBeenCalledTimes(3);
    // 每次尝试执行两轮完整 capture，只有两轮身份和 locator metadata 一致才提交。
    expect(page.$$).toHaveBeenCalledTimes(4);
  });

  it('同一运行时节点在扫描中改变 locator metadata 时丢弃 torn draft', async () => {
    let textValue = '变更前';
    let textReadCount = 0;
    const element = createSnapshotElement();
    element.text.mockImplementation(async () => {
      textReadCount += 1;
      const observed = textValue;
      if (textReadCount === 1) textValue = '变更后';
      return observed;
    });
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [element]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });

    const committed = await context.synchronizePageState({
      mode: 'snapshot',
      forceRefresh: true,
    });
    const committedElement = committed.snapshot.elements[0];
    const committedInfo = committedElement
      ? committed.elementMap.get(committedElement.ref)
      : undefined;

    expect(committedElement?.text).toBe('变更后');
    expect(committedInfo?.fingerprint?.text).toBe('变更后');
    expect(committed.pageRevision).toBe(context.getPageRevision());
    expect(element.text).toHaveBeenCalledTimes(4);
    expect(page.$$).toHaveBeenCalledTimes(4);
  });

  it('元素动作持有页面状态队列，阻止并发 guard 插入 resolve 与动作之间', async () => {
    let releaseTap!: () => void;
    const tapGate = new Promise<void>((resolve) => {
      releaseTap = resolve;
    });
    let signalActionStarted!: () => void;
    const actionStarted = new Promise<void>((resolve) => {
      signalActionStarted = resolve;
    });
    const element = {
      ...createSnapshotElement({ text: '可点击' }),
      tap: vi.fn(async () => tapGate),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [element]),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initial = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    const ref = initial.snapshot.elements[0]?.ref;

    const action = context.withElementByTargetOperation(
      { kind: 'ref', ref: ref! },
      async (resolvedElement) => {
        signalActionStarted();
        await resolvedElement.tap();
        context.markPageMutation();
      }
    );
    await actionStarted;
    const callsBeforeConcurrentGuard = page.$$.mock.calls.length;
    let guardFinished = false;
    const concurrentGuard = context.synchronizePageState({ mode: 'guard' }).then((commit) => {
      guardFinished = true;
      return commit;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(guardFinished).toBe(false);
    expect(page.$$).toHaveBeenCalledTimes(callsBeforeConcurrentGuard);

    releaseTap();
    await action;
    const guarded = await concurrentGuard;
    expect(guarded.pageRevision).toBe(initial.pageRevision + 1);
    expect(element.tap).toHaveBeenCalledOnce();
  });

  it('并发断连等待元素动作和 observation 完整提交后再切换生命周期', async () => {
    let releaseTap!: () => void;
    const tapGate = new Promise<void>((resolve) => {
      releaseTap = resolve;
    });
    let signalActionStarted!: () => void;
    const actionStarted = new Promise<void>((resolve) => {
      signalActionStarted = resolve;
    });
    const events: string[] = [];
    const element = {
      ...createSnapshotElement({ text: '可点击' }),
      tap: vi.fn(async () => {
        signalActionStarted();
        await tapGate;
      }),
    };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => [element]),
    };
    const miniProgram = createMiniProgram(page);
    miniProgram.disconnect.mockImplementation(async () => {
      events.push('disconnected');
    });
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initial = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    const ref = initial.snapshot.elements[0]?.ref;

    const action = context.withPageStateOperation(async (pageState) => {
      await pageState.withElementByTargetOperation(
        { kind: 'ref', ref: ref! },
        async (resolvedElement) => {
          await resolvedElement.tap();
          context.markPageMutation();
        }
      );
      await pageState.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
      events.push('action-committed');
    });
    await actionStarted;
    const disconnect = context.disconnectDevtools();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(miniProgram.disconnect).not.toHaveBeenCalled();
    expect(context.miniProgram).toBe(miniProgram);

    releaseTap();
    await Promise.all([action, disconnect]);

    expect(events).toEqual(['action-committed', 'disconnected']);
    expect(context.miniProgram).toBeNull();
  });

  it('known mutation 后的新 DOM 作为当前 revision baseline，不重复推进', async () => {
    const original = createSnapshotElement({ text: '之前' });
    const replacement = createSnapshotElement({ text: '之后' });
    const activeElements = { value: [original] };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => activeElements.value),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initial = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    activeElements.value = [replacement];

    context.markPageMutation();
    const expectedRevision = initial.pageRevision + 1;
    const committed = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });

    expect(committed.pageRevision).toBe(expectedRevision);
    expect(committed.snapshot.pageRevision).toBe(expectedRevision);
    expect(committed.domChanged).toBe(false);
    expect(context.getPageRevision()).toBe(expectedRevision);
  });

  it('并发 guard 对同一次外部重建只推进一次 revision', async () => {
    const original = createSnapshotElement({ text: '节点' });
    const replacement = createSnapshotElement({ text: '节点' });
    const activeElements = { value: [original] };
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => activeElements.value),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const initial = await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true });
    activeElements.value = [replacement];

    const commits = await Promise.all([
      context.synchronizePageState({ mode: 'guard' }),
      context.synchronizePageState({ mode: 'guard' }),
    ]);

    expect(context.getPageRevision()).toBe(initial.pageRevision + 1);
    expect(commits.filter((commit) => commit.domChanged)).toHaveLength(1);
    expect(new Set(commits.map((commit) => commit.pageRevision))).toEqual(
      new Set([initial.pageRevision + 1])
    );
  });

  it('扫描期间 revision 持续变化时最多重试三次且不发布 draft', async () => {
    const element = createSnapshotElement({ text: '抖动节点' });
    const context = createContext();
    const page = {
      path: '/pages/home/index',
      $$: vi.fn(async () => {
        context.markPageMutation();
        return [element];
      }),
    };
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    await context.connectDevtools({ target: { kind: 'discover' } });

    await expect(
      context.synchronizePageState({ mode: 'snapshot', forceRefresh: true })
    ).rejects.toThrow('3 次扫描期间持续变化');

    expect(page.$$).toHaveBeenCalledTimes(3);
    expect(context.getSnapshotCacheStatus().isCached).toBe(false);
    expect(context.elementMap.size).toBe(0);
  });

  it('registerElementMap 使用 revision/path CAS 拒绝迟到的查询结果', async () => {
    const page = createPage('/pages/home/index');
    const miniProgram = createMiniProgram(page);
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram, page));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });
    const staleRevision = context.getPageRevision();
    context.markPageMutation();
    const staleMap = new Map([
      [
        'late-ref',
        {
          selector: '.item',
          index: 0,
          generationKind: 'query' as const,
          snapshotId: 'late-query',
          pageRevision: staleRevision,
          pagePath: page.path,
        },
      ],
    ]);

    expect(() =>
      context.registerElementMap(staleMap, {
        expectedRevision: staleRevision,
        expectedPath: page.path,
      })
    ).toThrow(expect.objectContaining({ code: 'STALE_ELEMENT' }));
    expect(context.elementMap.has('late-ref')).toBe(false);
  });

  it('停止网络监听恢复失败时公开 failed 状态和 lastError', async () => {
    const miniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' }, healthCheck: false });
    miniProgram.restoreNetwork.mockRejectedValue(new Error('restore failed'));

    await expect(context.stopNetworkMonitoring()).rejects.toThrow('restore failed');

    expect(context.getRuntimeStatus().monitoring.network).toMatchObject({
      enabled: true,
      state: 'failed',
      lastError: expect.stringContaining('restore failed'),
    });
    expect(context.connectionStatus.state).toBe('degraded');
  });

  it('网络监听 stop 与连接替换共享 lifecycle 队列', async () => {
    const firstMiniProgram = createMiniProgram();
    const secondMiniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy)
      .mockResolvedValueOnce(adapterResult(firstMiniProgram))
      .mockResolvedValueOnce(adapterResult(secondMiniProgram));
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' }, healthCheck: false });

    let releaseRestore: (() => void) | undefined;
    const restorePending = new Promise<undefined>(resolve => {
      releaseRestore = () => resolve(undefined);
    });
    firstMiniProgram.restoreNetwork.mockImplementation(() => restorePending);

    const stop = context.stopNetworkMonitoring();
    const replacement = context.connectDevtools({
      target: { kind: 'discover' },
      healthCheck: false,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(executeConnectionStrategy).toHaveBeenCalledOnce();

    releaseRestore?.();
    await stop;
    await replacement;
    expect(executeConnectionStrategy).toHaveBeenCalledTimes(2);
  });

  it('重连 teardown 与 attempts 共用极短总预算，耗尽后不启动 adapter', async () => {
    vi.useFakeTimers();
    try {
      const firstMiniProgram = createMiniProgram();
      vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(firstMiniProgram));
      const context = createContext();
      await context.connectDevtools({ target: { kind: 'discover' }, healthCheck: false });
      firstMiniProgram.restoreNetwork.mockImplementation(() => new Promise(() => undefined));

      const startedAt = Date.now();
      const reconnect = context.reconnectDevtools({
        target: { kind: 'discover' },
        timeoutMs: 10,
        healthCheck: false,
      });
      const rejection = expect(reconnect).rejects.toMatchObject({
        code: 'CONNECTION_FAILED',
        metadata: {
          attemptCount: 0,
          lastErrorCode: 'CONNECTION_TIMEOUT',
        },
      });

      await vi.advanceTimersByTimeAsync(10);
      await rejection;

      expect(Date.now() - startedAt).toBeLessThanOrEqual(10);
      expect(executeConnectionStrategy).toHaveBeenCalledOnce();
      expect(context.miniProgram).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('连接 timing 覆盖 teardown，且历史重连保留用户原始 timeout', async () => {
    vi.useFakeTimers();
    try {
      const firstMiniProgram = createMiniProgram();
      const secondMiniProgram = createMiniProgram();
      const thirdMiniProgram = createMiniProgram();
      vi.mocked(executeConnectionStrategy)
        .mockResolvedValueOnce(adapterResult(firstMiniProgram))
        .mockResolvedValueOnce(adapterResult(secondMiniProgram))
        .mockResolvedValueOnce(adapterResult(thirdMiniProgram));
      const context = createContext();
      await context.connectDevtools({ target: { kind: 'discover' }, healthCheck: false });
      firstMiniProgram.restoreNetwork
        .mockImplementationOnce(() => new Promise<undefined>(
          resolve => setTimeout(() => resolve(undefined), 25)
        ))
        .mockResolvedValue(undefined);

      const replacement = context.connectDevtools({
        target: { kind: 'discover' },
        timeoutMs: 100,
        healthCheck: false,
      });
      await vi.advanceTimersByTimeAsync(25);
      const result = await replacement;

      expect(result.timing.totalMs).toBe(25);
      expect(vi.mocked(executeConnectionStrategy).mock.calls[1]?.[1]).toBe(75);

      await context.disconnectDevtools();
      await context.reconnectDevtools();
      expect(vi.mocked(executeConnectionStrategy).mock.calls[2]?.[1]).toBe(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it('健康探针超时后返回 degraded 并释放生命周期队列', async () => {
    vi.useFakeTimers();
    try {
      const miniProgram = createMiniProgram();
      vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram));
      const context = createContext();
      await context.connectDevtools({ target: { kind: 'discover' }, healthCheck: false });
      vi.mocked(probeConnectionHealth).mockImplementationOnce(() => new Promise(() => undefined));

      const statusPromise = context.getConnectionStatus({ refreshHealth: true });
      await vi.advanceTimersByTimeAsync(5_000);
      const status = await statusPromise;

      expect(status).toMatchObject({
        state: 'degraded',
        connected: true,
        lastError: { code: 'CONNECTION_TIMEOUT', phase: 'health_check' },
      });
      await expect(context.disconnectDevtools()).resolves.toMatchObject({
        state: 'disconnected',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('teardown 恢复远端方法超时时释放队列并保留 failed 诊断', async () => {
    vi.useFakeTimers();
    try {
      const miniProgram = createMiniProgram();
      vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram));
      const context = createContext();
      await context.connectDevtools({ target: { kind: 'discover' }, healthCheck: false });
      miniProgram.restoreNetwork.mockImplementation(() => new Promise(() => undefined));

      const disconnect = context.disconnectDevtools();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(disconnect).resolves.toMatchObject({ state: 'disconnected' });

      expect(miniProgram.disconnect).toHaveBeenCalledOnce();
      expect(context.miniProgram).toBeNull();
      expect(context.getRuntimeStatus().monitoring.network).toMatchObject({
        state: 'failed',
        lastError: expect.stringContaining('恢复网络拦截器在 5000ms 内未完成'),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('健康检查变为 unhealthy 时恢复监听并断开真实会话', async () => {
    const miniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy).mockResolvedValue(adapterResult(miniProgram));
    vi.mocked(probeConnectionHealth)
      .mockResolvedValueOnce({
        level: 'healthy',
        checks: [],
        checkedAt: '2026-01-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        level: 'unhealthy',
        checks: [],
        checkedAt: '2026-01-01T00:00:01.000Z',
      });
    const context = createContext();
    await context.connectDevtools({ target: { kind: 'discover' } });

    const status = await context.getConnectionStatus({ refreshHealth: true });

    expect(status.state).toBe('disconnected');
    expect(status.lastError?.code).toBe('HEALTH_CHECK_FAILED');
    expect(miniProgram.restoreNetwork).toHaveBeenCalledTimes(1);
    expect(miniProgram.disconnect).toHaveBeenCalledOnce();
    expect(context.miniProgram).toBeNull();
  });

  it('显式断开后仍可用最近一次成功参数无参重连', async () => {
    const firstMiniProgram = createMiniProgram();
    const secondMiniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy)
      .mockResolvedValueOnce(adapterResult(firstMiniProgram))
      .mockResolvedValueOnce(adapterResult(secondMiniProgram));
    const context = createContext();

    await context.connectDevtools({ target: { kind: 'discover' } });
    await context.disconnectDevtools();
    const result = await context.reconnectDevtools();

    expect(result.status).toBe('connected');
    expect(context.miniProgram).toBe(secondMiniProgram);
    expect(executeConnectionStrategy).toHaveBeenCalledTimes(2);
  });

  it('无参重连可复用同一 canonical project 和固定端口的可信 endpoint', async () => {
    const firstMiniProgram = createMiniProgram();
    const secondMiniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy)
      .mockResolvedValueOnce({
        ...adapterResult(firstMiniProgram),
        strategyUsed: 'launch',
        endpoint: 'ws://127.0.0.1:19420',
      })
      .mockRejectedValueOnce(new Error('Port 19420 is in use'))
      .mockResolvedValueOnce({
        ...adapterResult(secondMiniProgram),
        strategyUsed: 'connect',
        endpoint: 'ws://127.0.0.1:19420',
      });
    const context = createContext();

    await context.connectDevtools({
      target: {
        kind: 'project',
        projectPath: process.cwd(),
        autoPort: 19420,
      },
      healthCheck: false,
    });
    const result = await context.reconnectDevtools();

    expect(result.strategyUsed).toBe('connect');
    expect(vi.mocked(executeConnectionStrategy).mock.calls[2]).toEqual([
      {
        method: 'connect',
        target: {
          kind: 'project',
          projectPath: process.cwd(),
          cliPath: undefined,
          autoPort: 19420,
          autoAudits: undefined,
        },
      },
      expect.any(Number),
      expect.objectContaining({ trustedProjectEndpoint: 'ws://127.0.0.1:19420' }),
    ]);
  });

  it('显式断开后清除 project endpoint 信任，不盲连可能已被复用的端口', async () => {
    const firstMiniProgram = createMiniProgram();
    const secondMiniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy)
      .mockResolvedValueOnce({
        ...adapterResult(firstMiniProgram),
        strategyUsed: 'launch',
        endpoint: 'ws://127.0.0.1:19420',
      })
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockResolvedValueOnce({
        ...adapterResult(secondMiniProgram),
        strategyUsed: 'connect',
        endpoint: 'ws://127.0.0.1:19420',
      });
    const context = createContext();

    await context.connectDevtools({
      target: {
        kind: 'project',
        projectPath: process.cwd(),
        autoPort: 19420,
      },
      healthCheck: false,
    });
    await context.disconnectDevtools();
    await context.reconnectDevtools();

    expect(vi.mocked(executeConnectionStrategy).mock.calls[2]?.[2]?.trustedProjectEndpoint).toBeUndefined();
  });

  it('显式重连请求会完整替换最近成功请求', async () => {
    const firstMiniProgram = createMiniProgram();
    const secondMiniProgram = createMiniProgram();
    vi.mocked(executeConnectionStrategy)
      .mockResolvedValueOnce(adapterResult(firstMiniProgram))
      .mockResolvedValueOnce(adapterResult(secondMiniProgram));
    const context = createContext();

    await context.connectDevtools({
      target: { kind: 'discover' },
      timeoutMs: 45_000,
      healthCheck: true,
    });
    await context.reconnectDevtools({
      target: { kind: 'wsEndpoint', endpoint: 'ws://127.0.0.1:9510' },
      timeoutMs: 12_345,
      healthCheck: false,
    });

    expect(executeConnectionStrategy).toHaveBeenLastCalledWith(
      {
        method: 'wsEndpoint',
        target: { kind: 'wsEndpoint', endpoint: 'ws://127.0.0.1:9510/' },
      },
      expect.any(Number),
    );
  });

  it('没有最近成功请求时无参重连返回参数错误', async () => {
    const context = createContext();

    await expect(context.reconnectDevtools()).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      message: '没有可用于重连的历史连接参数',
    });
  });
});
