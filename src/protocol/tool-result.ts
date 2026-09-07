import { ZodError } from 'zod';

import type { ToolDefinition } from '../tools/ToolDefinition.js';
import {
  createRequestId,
  isRetryableToolError,
  normalizeToolErrorCode,
  serializeToolDiagnostic,
  toolFailureSchema,
  type JsonObject,
  type NextAction,
  type ToolDiagnostic,
  type ToolErrorCode,
  type ToolFailure,
  type ToolMeta,
  type ToolNotice,
  type ToolObservation,
  type ToolSuccess,
} from '../tools/result.js';

import { sanitizePublicValue } from './public-sanitizer.js';

export interface ToolInvocationMeta {
  requestId: string;
  tool: string;
  startedAt: number;
}

export function startToolInvocation(tool: string): ToolInvocationMeta {
  return {
    requestId: createRequestId(tool),
    tool,
    startedAt: performance.now(),
  };
}

function finishMeta(invocation: ToolInvocationMeta): ToolMeta {
  return {
    requestId: invocation.requestId,
    tool: invocation.tool,
    durationMs: Math.max(0, performance.now() - invocation.startedAt),
  };
}

export function buildToolSuccess(
  tool: ToolDefinition,
  invocation: ToolInvocationMeta,
  data: JsonObject,
  observation?: ToolObservation,
  warnings: ToolNotice[] = [],
  nextActions: NextAction[] = [],
): ToolSuccess<JsonObject> {
  const result: ToolSuccess<JsonObject> = {
    schemaVersion: '2.0',
    ok: true,
    code: 'OK',
    data,
    error: null,
    partialData: null,
    observation: observation ?? null,
    warnings,
    nextActions,
    meta: finishMeta(invocation),
  };

  return tool.outputSchema.parse(result) as ToolSuccess<JsonObject>;
}

function nextActionsForError(code: ToolErrorCode): NextAction[] {
  switch (code) {
    case 'NOT_CONNECTED':
    case 'CONNECTION_LOST':
    case 'CONNECTION_FAILED':
      return [{ tool: 'connect_devtools', reason: '建立或恢复微信开发者工具连接' }];
    case 'NO_ACTIVE_PAGE':
      return [{ tool: 'get_current_page', reason: '刷新当前活动页面' }];
    case 'STALE_ELEMENT':
    case 'ELEMENT_NOT_FOUND':
    case 'AMBIGUOUS_ELEMENT':
      return [{ tool: 'get_page_snapshot', reason: '刷新页面引用后重新定位元素' }];
    default:
      return [];
  }
}

function readProperty(value: object, key: PropertyKey): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function readRecordProperty(value: object, key: PropertyKey): Record<string, unknown> | null {
  const property = readProperty(value, key);
  return property !== null && typeof property === 'object' && !Array.isArray(property)
    ? property as Record<string, unknown>
    : null;
}

function createDefaultDiagnostic(error: Error, code: ToolErrorCode): ToolDiagnostic | null {
  const explicitDiagnostic = serializeToolDiagnostic(readProperty(error, 'diagnostic'));
  if (explicitDiagnostic) return explicitDiagnostic;

  if (error instanceof ZodError) {
    return serializeToolDiagnostic({
      kind: 'validation',
      issues: error.issues.map(issue => ({
        path: issue.path,
        code: issue.code,
        message: issue.message,
      })),
    });
  }

  const context = readRecordProperty(error, 'context');
  if (code === 'CONNECTION_FAILED' || code === 'CONNECTION_LOST' || code === 'NOT_CONNECTED') {
    return serializeToolDiagnostic({
      kind: 'connection',
      phase: readProperty(error, 'phase'),
      suggestions: readProperty(error, 'suggestions'),
      metadata: readProperty(error, 'metadata'),
      attempts: readProperty(error, 'attempts'),
    });
  }

  if (
    code === 'STALE_ELEMENT' ||
    code === 'ELEMENT_NOT_FOUND' ||
    code === 'AMBIGUOUS_ELEMENT' ||
    code === 'ELEMENT_NOT_INTERACTABLE'
  ) {
    return serializeToolDiagnostic({
      kind: 'element',
      target: context?.selector ?? context?.elementUid,
      pagePath: context?.pagePath,
      pageRevision: context?.pageRevision,
    });
  }

  if (code === 'ASSERTION_FAILED') {
    return serializeToolDiagnostic({
      kind: 'assertion',
      expected: readProperty(error, 'expected'),
      actual: readProperty(error, 'actual'),
      matcher: readProperty(error, 'matcher'),
    });
  }

  if (code === 'TIMEOUT') {
    return serializeToolDiagnostic({
      kind: 'timeout',
      operation: context?.operation,
      timeoutMs: context?.timeout ?? readProperty(error, 'timeoutMs'),
      elapsedMs: readProperty(error, 'elapsedMs'),
    });
  }

  const operation = context?.operation;
  const phase = readProperty(error, 'phase');
  if (typeof operation === 'string' || typeof phase === 'string') {
    return serializeToolDiagnostic({ kind: 'operation', operation, phase });
  }

  return null;
}

export function buildToolFailure(
  invocation: ToolInvocationMeta,
  error: Error,
  options?: {
    code?: ToolErrorCode;
    diagnostic?: unknown;
    partialData?: JsonObject;
    observation?: ToolObservation;
    warnings?: ToolNotice[];
    nextActions?: NextAction[];
  },
): ToolFailure {
  const code = options?.code ?? (error instanceof ZodError
    ? 'INTERNAL_ERROR'
    : normalizeToolErrorCode(error));

  const result: ToolFailure = {
    schemaVersion: '2.0',
    ok: false,
    code,
    data: null,
    error: {
      message: error.message,
      retryable: isRetryableToolError(code),
      diagnostic: options?.diagnostic === undefined
        ? createDefaultDiagnostic(error, code)
        : serializeToolDiagnostic(options.diagnostic),
    },
    partialData: options?.partialData ?? null,
    observation: options?.observation ?? null,
    warnings: options?.warnings ?? [],
    nextActions: options?.nextActions ?? nextActionsForError(code),
    meta: finishMeta(invocation),
  };

  return toolFailureSchema.parse(sanitizePublicValue(result));
}
