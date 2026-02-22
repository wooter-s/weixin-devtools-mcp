import { describe, it, expect } from 'vitest';

import { ValidationConnectionError } from '../../src/connection/errors.js';
import { resolveConnectionPlan } from '../../src/connection/resolver.js';

describe('connection resolver', () => {
  it('应在提供 wsEndpoint 时自动选择 wsEndpoint 策略', () => {
    const plan = resolveConnectionPlan({
      wsEndpoint: 'ws://127.0.0.1:9420',
    });

    expect(plan.request.strategy).toBe('wsEndpoint');
    expect(plan.attempts[0]).toBe('wsEndpoint');
  });

  it('launch 策略缺少 projectPath 时应抛错', () => {
    expect(() => resolveConnectionPlan({
      strategy: 'launch',
    })).toThrow(ValidationConnectionError);
  });

  it('应按顺序去重回退策略', () => {
    const plan = resolveConnectionPlan({
      strategy: 'connect',
      projectPath: '/tmp/project',
      fallback: ['connect', 'launch', 'discover', 'launch'],
    });

    expect(plan.attempts).toEqual(['connect', 'launch', 'discover']);
  });

  it('传入 wsHeaders 时应 fail-fast 报错', () => {
    expect(() => resolveConnectionPlan({
      strategy: 'wsEndpoint',
      wsEndpoint: 'ws://127.0.0.1:9420',
      wsHeaders: {
        authorization: 'Bearer token',
      },
    })).toThrow(ValidationConnectionError);

    expect(() => resolveConnectionPlan({
      strategy: 'wsEndpoint',
      wsEndpoint: 'ws://127.0.0.1:9420',
      wsHeaders: {
        authorization: 'Bearer token',
      },
    })).toThrow('当前连接链路不支持 wsHeaders 参数');
  });
});
