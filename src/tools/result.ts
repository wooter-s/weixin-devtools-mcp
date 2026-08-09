import { z } from 'zod';

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
  constructor(readonly code: ToolErrorCode, message: string) {
    super(message);
    this.name = 'ToolResultError';
  }
}

export const toolNoticeSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type ToolNotice = z.infer<typeof toolNoticeSchema>;

export const nextActionSchema = z.object({
  tool: z.string(),
  arguments: jsonObjectSchema.optional(),
  reason: z.string(),
});

export type NextAction = z.infer<typeof nextActionSchema>;

const observationElementSchema = z.object({
  ref: z.string(),
  tagName: z.string(),
  text: z.string().optional(),
});

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
  }).optional(),
});

export type ToolObservation = z.infer<typeof toolObservationSchema>;

export const toolMetaSchema = z.object({
  requestId: z.string(),
  tool: z.string(),
  durationMs: z.number().nonnegative(),
});

export type ToolMeta = z.infer<typeof toolMetaSchema>;

const toolErrorDetailsSchema = z.object({
  message: z.string(),
  retryable: z.boolean(),
  details: jsonObjectSchema.optional(),
});

/**
 * MCP SDK 1.30 客户端会在部分调用路径上继续校验 isError 结果中的 structuredContent。
 * 因此公开 schema 保持 object 根节点，并同时描述成功与失败信封；两者的条件关系由
 * buildToolSuccess/buildToolFailure 在运行时严格保证。
 */
export function createToolResultSchema<TData extends z.ZodTypeAny>(dataSchema: TData) {
  return z.object({
    schemaVersion: z.literal('1.0'),
    ok: z.boolean(),
    code: z.union([z.literal('OK'), toolErrorCodeSchema]),
    data: z.union([dataSchema, z.null()]),
    error: toolErrorDetailsSchema.optional(),
    observation: toolObservationSchema.optional(),
    warnings: z.array(toolNoticeSchema),
    nextActions: z.array(nextActionSchema),
    meta: toolMetaSchema,
  });
}

export const toolFailureSchema = z.object({
  schemaVersion: z.literal('1.0'),
  ok: z.literal(false),
  code: toolErrorCodeSchema,
  data: z.null(),
  error: toolErrorDetailsSchema,
  observation: toolObservationSchema.optional(),
  warnings: z.array(toolNoticeSchema),
  nextActions: z.array(nextActionSchema),
  meta: toolMetaSchema,
});

export interface ToolSuccess<TData extends JsonValue = JsonObject> {
  schemaVersion: '1.0';
  ok: true;
  code: 'OK';
  data: TData;
  observation?: ToolObservation;
  warnings: ToolNotice[];
  nextActions: NextAction[];
  meta: ToolMeta;
}

export interface ToolFailure {
  schemaVersion: '1.0';
  ok: false;
  code: ToolErrorCode;
  data: null;
  error: {
    message: string;
    retryable: boolean;
    details?: JsonObject;
  };
  observation?: ToolObservation;
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
