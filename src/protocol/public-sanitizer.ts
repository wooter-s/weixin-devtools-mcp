export type PublicJsonPrimitive = string | number | boolean | null;
export type PublicJsonValue = PublicJsonPrimitive | PublicJsonObject | PublicJsonValue[];
export type PublicJsonObject = { [key: string]: PublicJsonValue };

const DEFAULT_TEXT_LIMIT = 2_000;
const MAX_SANITIZE_DEPTH = 64;
const REDACTED = '[REDACTED]';

const EMBEDDED_URL_PATTERN = /\b(?:https?|wss?):\/\/[^\s<>"',;，。；！？、（）【】]+/giu;
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/giu;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /(["']?)(authorization|cookie|password|secret|client[_-]?secret|api[_-]?secret|token|access[_-]?token|refresh[_-]?token|auth[_-]?token|id[_-]?token)\1\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^,;\r\n]+)/giu;

const PUBLIC_URL_KEYS = new Set([
  'browserurl',
  'endpoint',
  'href',
  'pagepath',
  'uri',
  'url',
  'wsendpoint',
]);

function stripTrailingPunctuation(value: string): { url: string; suffix: string } {
  const matched = value.match(/[),.!]+$/u)?.[0] ?? '';
  return matched
    ? { url: value.slice(0, -matched.length), suffix: matched }
    : { url: value, suffix: '' };
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_]/gu, '').toLowerCase();
  return normalized === 'authorization' ||
    normalized.endsWith('authorization') ||
    normalized === 'cookie' ||
    normalized === 'setcookie' ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized === 'token' ||
    normalized.endsWith('token');
}

function isPublicUrlKey(key: string): boolean {
  return PUBLIC_URL_KEYS.has(key.replace(/[-_]/gu, '').toLowerCase());
}

function isBoundedTextKey(key: string): boolean {
  const normalized = key.replace(/[-_]/gu, '').toLowerCase();
  return normalized === 'message' || normalized === 'warning' || normalized === 'warnings';
}

function redactCredentials(value: string): string {
  return value
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(
      SENSITIVE_ASSIGNMENT_PATTERN,
      (_match, quote: string, key: string) => `${quote}${key}${quote}=${REDACTED}`,
    );
}

/** 删除公开 URL 中的 userinfo、query 和 hash；无法解析时仍按文本边界清理。 */
export function sanitizePublicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  try {
    const endpoint = new URL(value);
    endpoint.username = '';
    endpoint.password = '';
    endpoint.search = '';
    endpoint.hash = '';
    return endpoint.toString();
  } catch {
    const withoutQueryOrHash = value.split(/[?#]/u, 1)[0];
    const withoutUserInfo = withoutQueryOrHash.replace(
      /^([a-z][a-z\d+.-]*:\/\/)(?:[^/@\s]+@)/iu,
      '$1',
    );
    return redactCredentials(withoutUserInfo);
  }
}

/** 清理公开文本中的凭据和绝对 URL；null 表示只脱敏、不截断正文。 */
export function sanitizePublicText(
  value: unknown,
  maxLength: number | null = DEFAULT_TEXT_LIMIT,
): string {
  const text = typeof value === 'string' ? value : String(value ?? '');
  const withSanitizedUrls = text.replace(EMBEDDED_URL_PATTERN, matched => {
    const { url, suffix } = stripTrailingPunctuation(matched);
    return `${sanitizePublicUrl(url) ?? ''}${suffix}`;
  });
  const sanitized = redactCredentials(withSanitizedUrls);
  return maxLength === null ? sanitized : sanitized.slice(0, Math.max(0, maxLength));
}

function sanitizeValue(
  value: unknown,
  key: string | null,
  seen: WeakSet<object>,
  depth: number,
): PublicJsonValue | undefined {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (value === null) return null;
  if (key && isSensitiveKey(key)) return REDACTED;
  if (typeof value === 'string') {
    return key && isPublicUrlKey(key)
      ? sanitizePublicUrl(value)
      : sanitizePublicText(value, key && isBoundedTextKey(key) ? DEFAULT_TEXT_LIMIT : null);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (depth >= MAX_SANITIZE_DEPTH) return '[TRUNCATED]';

  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    const result = value.map(item => sanitizeValue(item, key, seen, depth + 1) ?? null);
    seen.delete(value);
    return result;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    const result: PublicJsonObject = {};
    for (const [property, item] of Object.entries(value)) {
      const sanitized = sanitizeValue(item, property, seen, depth + 1);
      if (sanitized !== undefined) result[property] = sanitized;
    }
    seen.delete(value);
    return result;
  }

  return sanitizePublicText(value, null);
}

/** 将任意运行时值复制为不包含已知凭据的 JSON-safe 公开值。 */
export function sanitizePublicValue(value: unknown): PublicJsonValue {
  return sanitizeValue(value, null, new WeakSet<object>(), 0) ?? null;
}

export function sanitizePublicObject(value: object): PublicJsonObject {
  const sanitized = sanitizePublicValue(value);
  return sanitized !== null && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? sanitized
    : {};
}
