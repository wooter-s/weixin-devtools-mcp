/**
 * 微信开发者工具 MCP 统一错误类系统
 *
 * 提供结构化的错误处理，包含错误代码、分类和上下文信息
 */

/**
 * 错误类别
 */
export enum ErrorCategory {
  /** 连接相关错误 */
  CONNECTION = 'CONNECTION',
  /** 状态/初始化错误 */
  STATE = 'STATE',
  /** 操作执行失败 */
  OPERATION = 'OPERATION',
  /** 参数验证错误 */
  VALIDATION = 'VALIDATION',
  /** 资源不可用 */
  RESOURCE = 'RESOURCE',
  /** 超时错误 */
  TIMEOUT = 'TIMEOUT',
  /** 网络相关错误 */
  NETWORK = 'NETWORK',
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  /** 致命错误，无法继续 */
  FATAL = 'FATAL',
  /** 错误，操作失败 */
  ERROR = 'ERROR',
  /** 警告，可能影响功能 */
  WARNING = 'WARNING',
}

/**
 * 错误代码定义
 */
export enum ErrorCode {
  // 连接错误 (1xxx)
  /** 未连接到微信开发者工具 */
  NOT_CONNECTED = 'E1001',
  /** 连接超时 */
  CONNECTION_TIMEOUT = 'E1002',
  /** 连接失败 */
  CONNECTION_FAILED = 'E1003',
  /** 连接已断开 */
  CONNECTION_LOST = 'E1004',

  // 状态错误 (2xxx)
  /** 当前页面未初始化 */
  PAGE_NOT_INITIALIZED = 'E2001',
  /** 存储未初始化 */
  STORAGE_NOT_INITIALIZED = 'E2002',
  /** 监听未启动 */
  MONITORING_NOT_STARTED = 'E2003',
  /** 状态无效 */
  INVALID_STATE = 'E2004',

  // 操作错误 (3xxx)
  /** 元素未找到 */
  ELEMENT_NOT_FOUND = 'E3001',
  /** 元素不可见 */
  ELEMENT_NOT_VISIBLE = 'E3002',
  /** 操作超时 */
  OPERATION_TIMEOUT = 'E3003',
  /** 操作失败 */
  OPERATION_FAILED = 'E3004',
  /** 脚本执行失败 */
  SCRIPT_EXECUTION_FAILED = 'E3005',

  // 验证错误 (4xxx)
  /** 参数无效 */
  INVALID_PARAMETER = 'E4001',
  /** 参数缺失 */
  MISSING_PARAMETER = 'E4002',
  /** 参数类型错误 */
  PARAMETER_TYPE_ERROR = 'E4003',

  // 资源错误 (5xxx)
  /** wx对象不可用 */
  WX_UNAVAILABLE = 'E5001',
  /** getApp不可用 */
  GETAPP_UNAVAILABLE = 'E5002',
  /** 文件不存在 */
  FILE_NOT_FOUND = 'E5003',
  /** 资源不可用 */
  RESOURCE_UNAVAILABLE = 'E5004',

  // 网络错误 (6xxx)
  /** 网络监听启动失败 */
  NETWORK_MONITORING_FAILED = 'E6001',
  /** 网络请求失败 */
  NETWORK_REQUEST_FAILED = 'E6002',
  /** 拦截器安装失败 */
  INTERCEPTOR_FAILED = 'E6003',
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  /** 操作名称 */
  operation?: string;
  /** 工具名称 */
  tool?: string;
  /** 元素UID */
  elementUid?: string;
  /** 页面路径 */
  pagePath?: string;
  /** 选择器 */
  selector?: string;
  /** 超时时长（毫秒） */
  timeout?: number;
  /** 额外的调试信息 */
  details?: Record<string, unknown>;
  /** 原始错误 */
  cause?: Error;
}

/**
 * 微信开发者工具 MCP 统一错误类
 */
export class DevToolsError extends Error {
  /** 错误代码 */
  public readonly code: ErrorCode;

  /** 错误类别 */
  public readonly category: ErrorCategory;

  /** 错误严重程度 */
  public readonly severity: ErrorSeverity;

  /** 错误上下文 */
  public readonly context?: ErrorContext;

  /** 时间戳 */
  public readonly timestamp: Date;

  /** 是否可重试 */
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      context?: ErrorContext;
      retryable?: boolean;
    }
  ) {
    super(message);

    this.name = 'DevToolsError';
    this.code = code;
    this.category = options?.category ?? DevToolsError.inferCategory(code);
    this.severity = options?.severity ?? ErrorSeverity.ERROR;
    this.context = options?.context;
    this.timestamp = new Date();
    this.retryable = options?.retryable ?? DevToolsError.inferRetryable(code);

    // 保持正确的错误堆栈
    Error.captureStackTrace?.(this, DevToolsError);
  }

  /**
   * 从错误代码推断类别
   */
  private static inferCategory(code: ErrorCode): ErrorCategory {
    const codeNum = parseInt(code.substring(1, 2));
    switch (codeNum) {
      case 1: return ErrorCategory.CONNECTION;
      case 2: return ErrorCategory.STATE;
      case 3: return ErrorCategory.OPERATION;
      case 4: return ErrorCategory.VALIDATION;
      case 5: return ErrorCategory.RESOURCE;
      case 6: return ErrorCategory.NETWORK;
      default: return ErrorCategory.OPERATION;
    }
  }

  /**
   * 从错误代码推断是否可重试
   */
  private static inferRetryable(code: ErrorCode): boolean {
    // 连接超时、操作超时、网络错误通常可重试
    const retryableCodes = [
      ErrorCode.CONNECTION_TIMEOUT,
      ErrorCode.OPERATION_TIMEOUT,
      ErrorCode.NETWORK_REQUEST_FAILED,
      ErrorCode.ELEMENT_NOT_VISIBLE, // 元素可能稍后变为可见
    ];
    return retryableCodes.includes(code);
  }

  /**
   * 转换为结构化的JSON对象
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      retryable: this.retryable,
      stack: this.stack,
    };
  }

  /**
   * 转换为用户友好的消息
   */
  toUserMessage(): string {
    let msg = this.message;

    if (this.context?.operation) {
      msg = `${this.context.operation}: ${msg}`;
    }

    if (this.context?.tool) {
      msg = `[${this.context.tool}] ${msg}`;
    }

    return msg;
  }
}

/**
 * 错误工厂函数 - 创建连接错误
 */
export function createConnectionError(
  message: string,
  context?: ErrorContext
): DevToolsError {
  return new DevToolsError(message, ErrorCode.NOT_CONNECTED, {
    category: ErrorCategory.CONNECTION,
    context,
  });
}

/**
 * 错误工厂函数 - 创建状态错误
 */
export function createStateError(
  message: string,
  code: ErrorCode,
  context?: ErrorContext
): DevToolsError {
  return new DevToolsError(message, code, {
    category: ErrorCategory.STATE,
    context,
  });
}

/**
 * 错误工厂函数 - 创建操作错误
 */
export function createOperationError(
  message: string,
  code: ErrorCode,
  context?: ErrorContext
): DevToolsError {
  return new DevToolsError(message, code, {
    category: ErrorCategory.OPERATION,
    context,
  });
}

/**
 * 错误工厂函数 - 创建验证错误
 */
export function createValidationError(
  message: string,
  parameterName: string,
  context?: ErrorContext
): DevToolsError {
  return new DevToolsError(message, ErrorCode.INVALID_PARAMETER, {
    category: ErrorCategory.VALIDATION,
    context: {
      ...context,
      details: { ...context?.details, parameterName },
    },
  });
}

/**
 * 错误工厂函数 - 创建资源错误
 */
export function createResourceError(
  message: string,
  code: ErrorCode,
  context?: ErrorContext
): DevToolsError {
  return new DevToolsError(message, code, {
    category: ErrorCategory.RESOURCE,
    context,
  });
}

/**
 * 包装原始错误为 DevToolsError
 */
export function wrapError(
  error: unknown,
  message: string,
  code: ErrorCode,
  context?: ErrorContext
): DevToolsError {
  const cause = error instanceof Error ? error : new Error(String(error));
  return new DevToolsError(message, code, {
    context: { ...context, cause },
  });
}

/**
 * 判断是否为 DevToolsError
 */
export function isDevToolsError(error: unknown): error is DevToolsError {
  return error instanceof DevToolsError;
}

/**
 * 从错误中提取消息（兼容性辅助函数）
 */
export function getErrorMessage(error: unknown): string {
  if (isDevToolsError(error)) {
    return error.toUserMessage();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
