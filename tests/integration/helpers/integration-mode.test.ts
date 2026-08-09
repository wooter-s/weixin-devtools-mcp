import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  handleIntegrationUnavailable,
  isIntegrationStrictMode,
  shouldRunIntegrationTests,
} from './integration-mode.js';

describe('integration mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('strict 模式即使未显式设置 RUN_INTEGRATION_TESTS 也会启用集成测试', () => {
    vi.stubEnv('RUN_INTEGRATION_TESTS', 'false');
    vi.stubEnv('INTEGRATION_STRICT', 'true');

    expect(isIntegrationStrictMode()).toBe(true);
    expect(shouldRunIntegrationTests()).toBe(true);
  });

  it('strict 模式把环境或连接不可用转换为失败', () => {
    vi.stubEnv('INTEGRATION_STRICT', 'true');

    expect(() => handleIntegrationUnavailable('环境检查失败', new Error('CLI 不存在')))
      .toThrow('[integration] 环境检查失败: CLI 不存在');
  });

  it('optional 模式记录跳过原因但不抛错', () => {
    vi.stubEnv('INTEGRATION_STRICT', 'false');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => handleIntegrationUnavailable('初始连接失败', 'timeout')).not.toThrow();
    expect(warning).toHaveBeenCalledWith(
      '[integration] 初始连接失败: timeout；optional 模式跳过相关用例',
    );
  });
});
