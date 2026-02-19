import type {
  ConnectionErrorSummary,
  ConnectionPhase,
  MetadataValue,
} from './types.js';

export type ConnectionErrorCode =
  | 'INVALID_ARGUMENT'
  | 'ENVIRONMENT'
  | 'SESSION_CONFLICT'
  | 'PROTOCOL'
  | 'HEALTH_CHECK_FAILED'
  | 'CONNECTION_FAILED'
  | 'DISCONNECTED';

export interface ConnectionErrorOptions {
  code: ConnectionErrorCode;
  phase: ConnectionPhase;
  suggestions?: string[];
  metadata?: Record<string, MetadataValue>;
  cause?: Error;
}

export class ConnectionError extends Error {
  readonly code: ConnectionErrorCode;
  readonly phase: ConnectionPhase;
  readonly suggestions: string[];
  readonly metadata?: Record<string, MetadataValue>;

  constructor(message: string, options: ConnectionErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ConnectionError';
    this.code = options.code;
    this.phase = options.phase;
    this.suggestions = options.suggestions ?? [];
    this.metadata = options.metadata;
  }

  toSummary(): ConnectionErrorSummary {
    return {
      code: this.code,
      phase: this.phase,
      message: this.message,
      suggestions: this.suggestions,
      metadata: this.metadata,
      timestamp: new Date().toISOString(),
    };
  }
}

export class ValidationConnectionError extends ConnectionError {
  constructor(
    message: string,
    suggestions?: string[],
    metadata?: Record<string, MetadataValue>,
  ) {
    super(message, {
      code: 'INVALID_ARGUMENT',
      phase: 'resolve',
      suggestions,
      metadata,
    });
    this.name = 'ValidationConnectionError';
  }
}

export class EnvironmentConnectionError extends ConnectionError {
  constructor(
    message: string,
    phase: Extract<ConnectionPhase, 'startup' | 'connect' | 'resolve'>,
    suggestions?: string[],
    metadata?: Record<string, MetadataValue>,
    cause?: Error,
  ) {
    super(message, {
      code: 'ENVIRONMENT',
      phase,
      suggestions,
      metadata,
      cause,
    });
    this.name = 'EnvironmentConnectionError';
  }
}

export class ProtocolConnectionError extends ConnectionError {
  constructor(
    message: string,
    suggestions?: string[],
    metadata?: Record<string, MetadataValue>,
    cause?: Error,
  ) {
    super(message, {
      code: 'PROTOCOL',
      phase: 'connect',
      suggestions,
      metadata,
      cause,
    });
    this.name = 'ProtocolConnectionError';
  }
}

export class SessionConflictConnectionError extends ConnectionError {
  constructor(message: string, metadata?: Record<string, MetadataValue>, cause?: Error) {
    super(message, {
      code: 'SESSION_CONFLICT',
      phase: 'startup',
      suggestions: [
        '关闭当前微信开发者工具窗口后重试',
        '切换到 wsEndpoint 或 discover 策略复用现有会话',
      ],
      metadata,
      cause,
    });
    this.name = 'SessionConflictConnectionError';
  }
}

export class HealthCheckConnectionError extends ConnectionError {
  constructor(message: string, metadata?: Record<string, MetadataValue>, cause?: Error) {
    super(message, {
      code: 'HEALTH_CHECK_FAILED',
      phase: 'health_check',
      suggestions: [
        '检查开发者工具是否仍在运行',
        '使用 reconnect_devtools 重新建立连接',
      ],
      metadata,
      cause,
    });
    this.name = 'HealthCheckConnectionError';
  }
}

export function normalizeConnectionError(error: Error | ConnectionError): ConnectionError {
  if (error instanceof ConnectionError) {
    return error;
  }

  return new ConnectionError(error.message, {
    code: 'CONNECTION_FAILED',
    phase: 'connect',
    suggestions: ['请检查连接参数并重试'],
    cause: error,
  });
}
