import { z } from 'zod';

import {
  sanitizePublicText as diagnosticText,
  sanitizePublicUrl as sanitizeEndpoint,
  sanitizePublicValue,
} from '../protocol/public-sanitizer.js';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(jsonValueSchema);

export const TOOL_ERROR_CODES = [
  'INVALID_ARGUMENT',
  'TOOL_DISABLED',
  'UNKNOWN_TOOL',
  'NOT_CONNECTED',
  'CONNECTION_FAILED',
  'CONNECTION_LOST',
  'NO_ACTIVE_PAGE',
  'STALE_ELEMENT',
  'ELEMENT_NOT_FOUND',
  'AMBIGUOUS_ELEMENT',
  'ELEMENT_NOT_INTERACTABLE',
  'TIMEOUT',
  'ASSERTION_FAILED',
  'DEVTOOLS_OPERATION_FAILED',
  'UNSUPPORTED_OPERATION',
  'INTERNAL_ERROR',
] as const;

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

export const toolErrorCodeSchema = z.enum(TOOL_ERROR_CODES);

export class ToolResultError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly diagnostic?: ToolDiagnostic,
  ) {
    super(message);
    this.name = 'ToolResultError';
  }
}

export const toolNoticeSchema = z.object({
  code: z.string(),
  message: z.string(),
}).strict();

export type ToolNotice = z.infer<typeof toolNoticeSchema>;

export const nextActionSchema = z.object({
  tool: z.string(),
  arguments: jsonObjectSchema.optional(),
  reason: z.string(),
}).strict();

export type NextAction = z.infer<typeof nextActionSchema>;

const observationElementSchema = z.object({
  ref: z.string(),
  tagName: z.string(),
  text: z.string().optional(),
}).strict();

export const toolObservationSchema = z.object({
  pagePath: z.string().nullable(),
  pageRevision: z.number().int().nonnegative().nullable(),
  snapshotId: z.string().optional(),
  generatedAt: z.string(),
  elementCount: z.number().int().nonnegative().optional(),
  changed: z.boolean().optional(),
  diff: z.object({
    added: z.array(observationElementSchema),
    changed: z.array(observationElementSchema),
    removed: z.array(z.string()),
    truncated: z.boolean(),
  }).strict().optional(),
}).strict();

export type ToolObservation = z.infer<typeof toolObservationSchema>;

export const toolMetaSchema = z.object({
  requestId: z.string(),
  tool: z.string(),
  durationMs: z.number().nonnegative(),
}).strict();

export type ToolMeta = z.infer<typeof toolMetaSchema>;

const diagnosticTextSchema = z.string().max(2_000);
const diagnosticPathSegmentSchema = z.union([z.string(), z.number().int()]);
const connectionPhaseSchema = z.enum([
  'resolve',
  'startup',
  'connect',
  'health_check',
  'disconnect',
]);
const diagnosticMetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const validationDiagnosticSchema = z.object({
  kind: z.literal('validation'),
  issues: z.array(z.object({
    path: z.array(diagnosticPathSegmentSchema),
    code: z.string(),
    message: diagnosticTextSchema,
  }).strict()).max(100),
}).strict();

const connectionAttemptDiagnosticSchema = z.object({
  index: z.number().int().nonnegative(),
  method: z.string(),
  startedAt: z.string(),
  durationMs: z.number().nonnegative(),
  outcome: z.enum(['success', 'failed']),
  endpoint: z.string().nullable(),
  error: z.object({
    code: z.string(),
    message: diagnosticTextSchema,
    phase: connectionPhaseSchema.nullable(),
  }).strict().nullable(),
}).strict();

const connectionDiagnosticSchema = z.object({
  kind: z.literal('connection'),
  phase: connectionPhaseSchema.nullable(),
  suggestions: z.array(diagnosticTextSchema).max(20),
  metadata: z.record(diagnosticMetadataValueSchema).nullable(),
  attempts: z.array(connectionAttemptDiagnosticSchema).max(100),
}).strict();

const elementDiagnosticSchema = z.object({
  kind: z.literal('element'),
  target: z.string().nullable(),
  pagePath: z.string().nullable(),
  pageRevision: z.number().int().nonnegative().nullable(),
}).strict();

const assertionDiagnosticSchema = z.object({
  kind: z.literal('assertion'),
  expected: jsonValueSchema,
  actual: jsonValueSchema,
  matcher: z.string().nullable(),
}).strict();

const timeoutDiagnosticSchema = z.object({
  kind: z.literal('timeout'),
  operation: z.string().nullable(),
  timeoutMs: z.number().nonnegative().nullable(),
  elapsedMs: z.number().nonnegative().nullable(),
}).strict();

const operationDiagnosticSchema = z.object({
  kind: z.literal('operation'),
  operation: z.string().nullable(),
  phase: z.string().nullable(),
}).strict();

/** 仅允许公开、可操作的诊断字段进入 MCP wire result。 */
export const toolDiagnosticSchema = z.discriminatedUnion('kind', [
  validationDiagnosticSchema,
  connectionDiagnosticSchema,
  elementDiagnosticSchema,
  assertionDiagnosticSchema,
  timeoutDiagnosticSchema,
  operationDiagnosticSchema,
]);

export type ToolDiagnostic = z.infer<typeof toolDiagnosticSchema>;

const SAFE_CONNECTION_METADATA_KEYS = new Set([
  'attemptIndex',
  'autoPort',
  'browserUrl',
  'cliPath',
  'cleanupError',
  'endpoint',
  'method',
  'outcome',
  'port',
  'projectPath',
  'status',
  'strategy',
  'timeoutMs',
  'wsEndpoint',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? diagnosticText(value) : null;
}

function nullableNonnegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sanitizeConnectionMetadata(value: unknown): Record<string, JsonPrimitive> | null {
  if (!isRecord(value)) return null;

  const result: Record<string, JsonPrimitive> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_CONNECTION_METADATA_KEYS.has(key)) continue;
    if (key === 'endpoint' || key === 'wsEndpoint' || key === 'browserUrl') {
      result[key] = sanitizeEndpoint(item);
      continue;
    }
    if (item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      result[key] = typeof item === 'string' ? diagnosticText(item) : item;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function sanitizeJsonValue(value: unknown): JsonValue {
  return sanitizePublicValue(value);
}

/**
 * 将不可信诊断候选值重建为严格白名单结构。stack、cause、headers、凭据及
 * 未声明字段不会进入返回值；无法识别的候选值返回 null。
 */
export function serializeToolDiagnostic(candidate: unknown): ToolDiagnostic | null {
  if (!isRecord(candidate) || typeof candidate.kind !== 'string') return null;

  let sanitized: ToolDiagnostic;
  switch (candidate.kind) {
    case 'validation': {
      const issues = Array.isArray(candidate.issues) ? candidate.issues : [];
      sanitized = {
        kind: 'validation',
        issues: issues.slice(0, 100).flatMap(issue => {
          if (!isRecord(issue)) return [];
          const rawPath = Array.isArray(issue.path) ? issue.path : [];
          const path = rawPath.filter(
            (segment): segment is string | number =>
              typeof segment === 'string' || (typeof segment === 'number' && Number.isInteger(segment)),
          );
          return [{
            path,
            code: typeof issue.code === 'string' ? issue.code : 'custom',
            message: diagnosticText(issue.message),
          }];
        }),
      };
      break;
    }
    case 'connection': {
      const rawAttempts = Array.isArray(candidate.attempts) ? candidate.attempts : [];
      sanitized = {
        kind: 'connection',
        phase: connectionPhaseSchema.safeParse(candidate.phase).success
          ? candidate.phase as z.infer<typeof connectionPhaseSchema>
          : null,
        suggestions: (Array.isArray(candidate.suggestions) ? candidate.suggestions : [])
          .filter((suggestion): suggestion is string => typeof suggestion === 'string')
          .slice(0, 20)
          .map(suggestion => diagnosticText(suggestion)),
        metadata: sanitizeConnectionMetadata(candidate.metadata),
        attempts: rawAttempts.slice(0, 100).flatMap((attempt, position) => {
          if (!isRecord(attempt)) return [];
          const rawError = isRecord(attempt.error) ? attempt.error : null;
          const phaseResult = connectionPhaseSchema.safeParse(rawError?.phase);
          const outcome = attempt.outcome === 'success' ? 'success' : 'failed';
          return [{
            index: typeof attempt.index === 'number' && Number.isInteger(attempt.index) && attempt.index >= 0
              ? attempt.index
              : position,
            method: typeof attempt.method === 'string' ? diagnosticText(attempt.method) : 'unknown',
            startedAt: typeof attempt.startedAt === 'string' ? diagnosticText(attempt.startedAt) : '',
            durationMs: nullableNonnegativeNumber(attempt.durationMs) ?? 0,
            outcome,
            endpoint: sanitizeEndpoint(attempt.endpoint),
            error: rawError ? {
              code: typeof rawError.code === 'string' ? diagnosticText(rawError.code) : 'UNKNOWN',
              message: diagnosticText(rawError.message),
              phase: phaseResult.success ? phaseResult.data : null,
            } : null,
          }];
        }),
      };
      break;
    }
    case 'element':
      sanitized = {
        kind: 'element',
        target: nullableString(candidate.target),
        pagePath: nullableString(candidate.pagePath),
        pageRevision: typeof candidate.pageRevision === 'number' &&
          Number.isInteger(candidate.pageRevision) && candidate.pageRevision >= 0
          ? candidate.pageRevision
          : null,
      };
      break;
    case 'assertion':
      sanitized = {
        kind: 'assertion',
        expected: sanitizeJsonValue(candidate.expected),
        actual: sanitizeJsonValue(candidate.actual),
        matcher: nullableString(candidate.matcher),
      };
      break;
    case 'timeout':
      sanitized = {
        kind: 'timeout',
        operation: nullableString(candidate.operation),
        timeoutMs: nullableNonnegativeNumber(candidate.timeoutMs),
        elapsedMs: nullableNonnegativeNumber(candidate.elapsedMs),
      };
      break;
    case 'operation':
      sanitized = {
        kind: 'operation',
        operation: nullableString(candidate.operation),
        phase: nullableString(candidate.phase),
      };
      break;
    default:
      return null;
  }

  const parsed = toolDiagnosticSchema.safeParse(sanitized);
  return parsed.success ? parsed.data : null;
}

export const toolErrorDetailsSchema = z.object({
  message: z.string(),
  retryable: z.boolean(),
  diagnostic: toolDiagnosticSchema.nullable(),
}).strict();

/**
 * 成功与失败均使用全字段信封，避免调用方依赖字段缺省语义。
 */
export function createToolResultSchema<TData extends z.ZodTypeAny>(dataSchema: TData) {
  return z.discriminatedUnion('ok', [
    z.object({
      schemaVersion: z.literal('2.0'),
      ok: z.literal(true),
      code: z.literal('OK'),
      data: dataSchema,
      error: z.null(),
      partialData: z.null(),
      observation: toolObservationSchema.nullable(),
      warnings: z.array(toolNoticeSchema),
      nextActions: z.array(nextActionSchema),
      meta: toolMetaSchema,
    }).strict(),
    z.object({
      schemaVersion: z.literal('2.0'),
      ok: z.literal(false),
      code: toolErrorCodeSchema,
      data: z.null(),
      error: toolErrorDetailsSchema,
      partialData: jsonObjectSchema.nullable(),
      observation: toolObservationSchema.nullable(),
      warnings: z.array(toolNoticeSchema),
      nextActions: z.array(nextActionSchema),
      meta: toolMetaSchema,
    }).strict(),
  ]);
}

export const toolFailureSchema = z.object({
  schemaVersion: z.literal('2.0'),
  ok: z.literal(false),
  code: toolErrorCodeSchema,
  data: z.null(),
  error: toolErrorDetailsSchema,
  partialData: jsonObjectSchema.nullable(),
  observation: toolObservationSchema.nullable(),
  warnings: z.array(toolNoticeSchema),
  nextActions: z.array(nextActionSchema),
  meta: toolMetaSchema,
}).strict();

export interface ToolSuccess<TData extends JsonValue = JsonObject> {
  schemaVersion: '2.0';
  ok: true;
  code: 'OK';
  data: TData;
  error: null;
  partialData: null;
  observation: ToolObservation | null;
  warnings: ToolNotice[];
  nextActions: NextAction[];
  meta: ToolMeta;
}

export interface ToolFailure {
  schemaVersion: '2.0';
  ok: false;
  code: ToolErrorCode;
  data: null;
  error: {
    message: string;
    retryable: boolean;
    diagnostic: ToolDiagnostic | null;
  };
  partialData: JsonObject | null;
  observation: ToolObservation | null;
  warnings: ToolNotice[];
  nextActions: NextAction[];
  meta: ToolMeta;
}

export function createRequestId(tool: string): string {
  return `${tool}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeToolErrorCode(error: Error): ToolErrorCode {
  const explicitCode = 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

  if (explicitCode && TOOL_ERROR_CODES.includes(explicitCode as ToolErrorCode)) {
    return explicitCode as ToolErrorCode;
  }

  if (explicitCode === 'INVALID_ELEMENT_TARGET') return 'INVALID_ARGUMENT';
  if (explicitCode === 'DISCONNECTED') return 'CONNECTION_LOST';
  if (explicitCode === 'ENVIRONMENT' || explicitCode === 'PROTOCOL' || explicitCode === 'SESSION_CONFLICT') {
    return 'CONNECTION_FAILED';
  }
  if (explicitCode === 'HEALTH_CHECK_FAILED') return 'CONNECTION_LOST';

  const message = error.message.toLowerCase();
  if (message.includes('未连接') || message.includes('先连接')) return 'NOT_CONNECTED';
  if (message.includes('stale') || message.includes('已失效')) return 'STALE_ELEMENT';
  if (message.includes('当前页面') || message.includes('活动页面')) return 'NO_ACTIVE_PAGE';
  if (message.includes('歧义') || message.includes('多个元素')) return 'AMBIGUOUS_ELEMENT';
  if (message.includes('元素') && message.includes('未找到')) return 'ELEMENT_NOT_FOUND';
  if (message.includes('超时') || message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('断言')) return 'ASSERTION_FAILED';
  if (message.includes('不支持')) return 'UNSUPPORTED_OPERATION';
  if (message.includes('连接')) return 'CONNECTION_FAILED';
  return 'DEVTOOLS_OPERATION_FAILED';
}

export function isRetryableToolError(code: ToolErrorCode): boolean {
  return [
    'CONNECTION_FAILED',
    'CONNECTION_LOST',
    'NOT_CONNECTED',
    'NO_ACTIVE_PAGE',
    'STALE_ELEMENT',
    'TIMEOUT',
    'DEVTOOLS_OPERATION_FAILED',
  ].includes(code);
}

export function toJsonValue<T>(value: T): JsonValue {
  if (value === undefined) return null;

  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return null;
    return JSON.parse(serialized) as JsonValue;
  } catch {
    return String(value);
  }
}
