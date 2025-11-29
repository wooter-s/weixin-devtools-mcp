/**
 * 微信小程序运行时环境类型声明
 * 这些类型用于在 evaluate() 和 mockWxMethod() 中运行的代码
 */

/**
 * 网络请求日志条目
 */
export interface NetworkLogEntry {
  id: string;
  type: 'request' | 'uploadFile' | 'downloadFile' | 'response';
  url: string;
  method?: string;
  headers?: Record<string, any>;
  header?: Record<string, any>;
  data?: any;
  params?: any;
  statusCode?: number;
  response?: any;
  error?: string;
  duration?: number;
  timestamp: string;
  success?: boolean;
  source?: string;
  phase?: 'request' | 'response';
}

/**
 * Mpx 请求配置
 */
export interface MpxRequestConfig {
  url: string;
  method?: string;
  header?: Record<string, any>;
  headers?: Record<string, any>;
  data?: any;
  params?: any;
  __mcp_requestId?: string;
  __mcp_startTime?: number;
}

/**
 * Mpx 响应对象
 */
export interface MpxResponse {
  status: number;
  statusCode?: number;
  data: any;
  header?: Record<string, any>;
  headers?: Record<string, any>;
  requestConfig?: MpxRequestConfig;
}

/**
 * Mpx 错误对象
 */
export interface MpxError {
  status?: number;
  statusCode?: number;
  message?: string;
  errMsg?: string;
  requestConfig?: MpxRequestConfig;
}

/**
 * 微信小程序全局对象扩展
 * 包含 MCP 添加的自定义属性
 */
export interface WxExtended {
  // 原生微信 API
  request: (options: any) => any;
  uploadFile: (options: any) => any;
  downloadFile: (options: any) => any;

  // MCP 自定义属性
  __networkLogs?: NetworkLogEntry[];
  __networkInterceptorsInstalled?: boolean;
  __pendingQueue?: any[];
  __requestConfigMap?: Record<string, any>;
  __consoleLogs?: any[];
  __consoleMonitoringInstalled?: boolean;
}

/**
 * Mpx 框架 $xfetch 拦截器
 */
export interface MpxInterceptors {
  request: {
    use: (handler: (config: MpxRequestConfig) => MpxRequestConfig | Promise<MpxRequestConfig>) => void;
    handlers?: any[];
  };
  response: {
    use: (
      onSuccess: (response: MpxResponse) => MpxResponse | Promise<MpxResponse>,
      onError: (error: MpxError) => void
    ) => void;
    handlers?: any[];
  };
}

/**
 * Mpx 框架 $xfetch 对象
 */
export interface MpxFetch {
  interceptors: MpxInterceptors;
}

/**
 * 小程序 App 实例扩展（支持 Mpx 框架）
 */
export interface MiniProgramApp {
  $xfetch?: MpxFetch;
  [key: string]: any;
}

/**
 * 微信小程序运行时全局声明
 * 这些在 evaluate() 和 mockWxMethod() 的上下文中可用
 */
declare global {
  // 注意：这里不能直接 declare const wx，因为会和 Node.js 环境冲突
  // 使用类型断言的方式在需要的地方访问
}

/**
 * 类型守卫：检查是否在微信小程序环境中
 */
export function isWxAvailable(): boolean {
  return typeof (globalThis as any).wx !== 'undefined';
}

/**
 * 获取微信对象（带类型）
 */
export function getWx(): WxExtended | undefined {
  return typeof (globalThis as any).wx !== 'undefined'
    ? (globalThis as any).wx as WxExtended
    : undefined;
}

/**
 * 获取 App 实例（带类型）
 */
export function getMiniProgramApp(): MiniProgramApp | undefined {
  return typeof (globalThis as any).getApp !== 'undefined'
    ? (globalThis as any).getApp() as MiniProgramApp
    : undefined;
}
