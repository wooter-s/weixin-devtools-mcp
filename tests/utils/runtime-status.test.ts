import { describe, expect, it } from 'vitest';

import {
  cloneMonitoringStatus,
  createMonitoringStatus,
} from '../../src/runtime-status.js';

describe('runtime monitoring status', () => {
  it('应把未启用的类别标记为 disabled，把启用类别标记为 idle', () => {
    expect(createMonitoringStatus({ console: false, network: true })).toEqual({
      console: {
        enabled: false,
        state: 'disabled',
        startedAt: null,
        lastError: null,
      },
      network: {
        enabled: true,
        state: 'idle',
        startedAt: null,
        lastError: null,
      },
    });
  });

  it('应返回可安全修改的状态副本', () => {
    const original = createMonitoringStatus({ console: true, network: true });
    const cloned = cloneMonitoringStatus(original);
    cloned.console.state = 'running';

    expect(original.console.state).toBe('idle');
    expect(cloned.console.state).toBe('running');
  });
});
