import { describe, expect, it } from 'vitest';

import {
  sanitizePublicObject,
  sanitizePublicText,
  sanitizePublicUrl,
} from '../../src/protocol/public-sanitizer.js';

describe('公开协议数据脱敏', () => {
  it('删除 URL userinfo、query 和 hash', () => {
    expect(sanitizePublicUrl(
      'ws://user:pass@127.0.0.1:9420/devtools/page/1?token=secret#fragment',
    )).toBe('ws://127.0.0.1:9420/devtools/page/1');
    expect(sanitizePublicObject({
      pagePath: '/pages/home/index?token=secret#fragment',
      url: '/relative/request?password=secret#fragment',
    })).toEqual({
      pagePath: '/pages/home/index',
      url: '/relative/request',
    });
  });

  it('清理正文中的 URL、Bearer 和常见凭据赋值', () => {
    const sanitized = sanitizePublicText(
      '连接 ws://user:pass@127.0.0.1:9420/path?token=url-secret；' +
      'Authorization: Bearer bearer-secret, password="password-secret"',
      null,
    );

    expect(sanitized).toContain('ws://127.0.0.1:9420/path');
    expect(sanitized).toContain('Authorization=[REDACTED]');
    expect(sanitized).toContain('password=[REDACTED]');
    expect(sanitized).not.toMatch(/user|pass@|url-secret|bearer-secret|password-secret/u);
  });

  it('递归清理 endpoint、attempts、warnings 和 lastError', () => {
    const sanitized = sanitizePublicObject({
      endpoint: 'wss://user:pass@example.test/devtools?token=endpoint-secret#fragment',
      attempts: [{
        endpoint: 'ws://user:pass@127.0.0.1:9420/path?secret=query-secret',
        error: { message: 'Authorization: Bearer attempt-secret' },
      }],
      warnings: ['retry token=warning-secret'],
      lastError: {
        message: 'password=message-secret',
        metadata: {
          browserUrl: 'http://user:pass@127.0.0.1:9222?token=browser-secret',
          authorization: 'Bearer metadata-secret',
        },
      },
    });
    const serialized = JSON.stringify(sanitized);

    expect(sanitized.endpoint).toBe('wss://example.test/devtools');
    expect(serialized).not.toMatch(
      /endpoint-secret|query-secret|attempt-secret|warning-secret|message-secret|browser-secret|metadata-secret|user:pass/u,
    );
    expect(serialized).toContain('[REDACTED]');
  });
});
