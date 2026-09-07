import fs from 'node:fs';

import { describe, it, expect } from 'vitest';

import { ValidationConnectionError } from '../../src/connection/errors.js';
import { resolveConnectionPlan } from '../../src/connection/resolver.js';

describe('connection resolver', () => {
  it('project target 应规范化真实路径并固定为 launch、connect 两次尝试', () => {
    const plan = resolveConnectionPlan({
      target: {
        kind: 'project',
        projectPath: '.',
      },
    });

    expect(plan.request.target).toEqual({
      kind: 'project',
      projectPath: fs.realpathSync(process.cwd()),
      cliPath: undefined,
      autoPort: undefined,
      autoAudits: undefined,
    });
    expect(plan.attempts.map(attempt => attempt.method)).toEqual(['launch', 'connect']);
    expect(plan.attempts.some(attempt => attempt.method === 'discover')).toBe(false);
  });

  it('wsEndpoint、browserUrl 和 discover target 均只生成一个具体尝试', () => {
    const wsPlan = resolveConnectionPlan({
      target: { kind: 'wsEndpoint', endpoint: 'ws://127.0.0.1:9420' },
    });
    const browserPlan = resolveConnectionPlan({
      target: { kind: 'browserUrl', url: 'http://127.0.0.1:9222' },
    });
    const discoverPlan = resolveConnectionPlan({ target: { kind: 'discover' } });

    expect(wsPlan.attempts.map(attempt => attempt.method)).toEqual(['wsEndpoint']);
    expect(browserPlan.attempts.map(attempt => attempt.method)).toEqual(['browserUrl']);
    expect(discoverPlan.attempts.map(attempt => attempt.method)).toEqual(['discover']);
  });

  it('project target 缺少有效项目目录时应 fail-fast', () => {
    expect(() => resolveConnectionPlan({
      target: {
        kind: 'project',
        projectPath: '/path/that/does/not/exist',
      },
    })).toThrow(ValidationConnectionError);
  });

  it('端点 target 应校验协议', () => {
    expect(() => resolveConnectionPlan({
      target: { kind: 'wsEndpoint', endpoint: 'http://127.0.0.1:9420' },
    })).toThrow('仅支持 ws:、wss: 协议');

    expect(() => resolveConnectionPlan({
      target: { kind: 'browserUrl', url: 'ws://127.0.0.1:9222' },
    })).toThrow('仅支持 http:、https: 协议');
  });

  it('应拒绝 V1 字段和 target 内互斥字段', () => {
    expect(() => resolveConnectionPlan({
      target: { kind: 'discover' },
      strategy: 'discover',
    } as never)).toThrow('连接请求 包含不支持的字段: strategy');

    expect(() => resolveConnectionPlan({
      target: {
        kind: 'wsEndpoint',
        endpoint: 'ws://127.0.0.1:9420',
        projectPath: '.',
      },
    } as never)).toThrow('wsEndpoint target 包含不支持的字段: projectPath');
  });
});
