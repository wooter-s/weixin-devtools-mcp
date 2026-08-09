import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/test-utils.js', () => ({
  allocatePorts: vi.fn(async () => [9420]),
  checkIntegrationTestEnvironment: vi.fn(),
  cleanupConflictingWeChatInstances: vi.fn(async () => true),
  findAvailablePort: vi.fn(async () => 9420),
  safeCleanup: vi.fn(async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch {
      // 与真实 optional cleanup 语义一致。
    }
  }),
  sleep: vi.fn(async () => undefined),
}));

import { checkIntegrationTestEnvironment } from '../../utils/test-utils.js';

import { IntegrationHarness } from './integration-harness.js';

describe('IntegrationHarness strict preflight', () => {
  beforeEach(() => {
    vi.mocked(checkIntegrationTestEnvironment).mockResolvedValue({
      isReady: false,
      issues: ['CLI 不存在'],
      warnings: [],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('strict 模式的环境预检失败会直接令 suite 失败', async () => {
    vi.stubEnv('RUN_INTEGRATION_TESTS', 'false');
    vi.stubEnv('INTEGRATION_STRICT', 'true');
    const harness = new IntegrationHarness({
      projectPath: '/tmp/project',
      cliPath: '/tmp/cli',
    });

    await expect(harness.prepare())
      .rejects.toThrow('[integration] 环境检查失败: 环境检查失败: CLI 不存在');
  });

  it('optional 模式保留 ready=false 状态供 suite 显式跳过', async () => {
    vi.stubEnv('RUN_INTEGRATION_TESTS', 'true');
    vi.stubEnv('INTEGRATION_STRICT', 'false');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const harness = new IntegrationHarness({
      projectPath: '/tmp/project',
      cliPath: '/tmp/cli',
    });

    await expect(harness.prepare()).resolves.toMatchObject({
      enabled: true,
      ready: false,
      reason: '环境检查失败: CLI 不存在',
    });
  });
});
