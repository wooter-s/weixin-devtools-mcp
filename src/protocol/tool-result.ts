import { ZodError } from 'zod';

import type { ToolDefinition } from '../tools/ToolDefinition.js';
import {
  createRequestId,
  isRetryableToolError,
  normalizeToolErrorCode,
  toolFailureSchema,
  type JsonObject,
  type NextAction,
  type ToolErrorCode,
  type ToolFailure,
  type ToolMeta,
  type ToolNotice,
  type ToolObservation,
  type ToolSuccess,
} from '../tools/result.js';

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
    schemaVersion: '1.0',
    ok: true,
    code: 'OK',
    data,
    ...(observation ? { observation } : {}),
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

export function buildToolFailure(
  invocation: ToolInvocationMeta,
  error: Error,
  options?: {
    code?: ToolErrorCode;
    details?: JsonObject;
    observation?: ToolObservation;
  },
): ToolFailure {
  const code = options?.code ?? (error instanceof ZodError
    ? 'INTERNAL_ERROR'
    : normalizeToolErrorCode(error));

  const result: ToolFailure = {
    schemaVersion: '1.0',
    ok: false,
    code,
    data: null,
    error: {
      message: error.message,
      retryable: isRetryableToolError(code),
      ...(options?.details ? { details: options.details } : {}),
    },
    ...(options?.observation ? { observation: options.observation } : {}),
    warnings: [],
    nextActions: nextActionsForError(code),
    meta: finishMeta(invocation),
  };

  return toolFailureSchema.parse(result);
}
