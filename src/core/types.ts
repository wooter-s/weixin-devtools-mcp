/**
 * 共享类型定义
 * 从 src/tools.ts 提取的所有接口和类型
 */

/**
 * 连接选项接口
 */
export interface ConnectOptions {
  projectPath: string;
  cliPath?: string;
  port?: number;
  autoAudits?: boolean;
}

/**
 * 增强的连接选项接口
 */
export interface EnhancedConnectOptions extends ConnectOptions {
  mode?: 'auto' | 'launch' | 'connect';
  autoPort?: number;
  autoAccount?: string;
  timeout?: number;
  fallbackMode?: boolean;
  healthCheck?: boolean;
  verbose?: boolean;
}

/**
 * 连接结果接口
 */
export interface ConnectResult {
  miniProgram: any;
  currentPage: any;
  pagePath: string;
}

/**
 * 启动结果接口
 */
export interface StartupResult {
  processInfo: {
    pid: number;
    port: number;
  };
  startTime: number;
}

/**
 * 详细连接结果接口
 */
export interface DetailedConnectResult extends ConnectResult {
  connectionMode: 'launch' | 'connect';
  startupTime: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  processInfo?: {
    pid: number;
    port: number;
  };
}

/**
 * 元素快照接口
 */
export interface ElementSnapshot {
  uid: string;
  tagName: string;
  text?: string;
  attributes?: Record<string, string>;
  position?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/**
 * 页面快照接口
 */
export interface PageSnapshot {
  path: string;
  elements: ElementSnapshot[];
}

/**
 * 元素映射信息接口
 * 用于精确定位页面元素
 */
export interface ElementMapInfo {
  selector: string;
  index: number;
}

/**
 * 点击元素选项接口
 */
export interface ClickOptions {
  uid: string;
  dblClick?: boolean;
}

/**
 * 截图选项接口
 */
export interface ScreenshotOptions {
  path?: string;
}

/**
 * 查询结果接口
 */
export interface QueryResult {
  uid: string;
  tagName: string;
  text?: string;
  attributes?: Record<string, string>;
  position?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/**
 * 查询元素选项接口
 */
export interface QueryOptions {
  selector: string;
}

/**
 * 等待条件接口
 */
export interface WaitForOptions {
  selector?: string;
  timeout?: number;
  text?: string;
  visible?: boolean;
  disappear?: boolean;
}

/**
 * 文本输入选项接口
 */
export interface InputTextOptions {
  uid: string;
  text: string;
  clear?: boolean;
  append?: boolean;
}

/**
 * 表单控件选项接口
 */
export interface FormControlOptions {
  uid: string;
  value: any;
  trigger?: string;
}

/**
 * 获取值选项接口
 */
export interface GetValueOptions {
  uid: string;
  attribute?: string;
}

/**
 * 断言结果接口
 */
export interface AssertResult {
  passed: boolean;
  message: string;
  actual: any;
  expected: any;
  timestamp: number;
}

/**
 * 元素存在性断言选项接口
 */
export interface ExistenceAssertOptions {
  selector?: string;
  uid?: string;
  timeout?: number;
  shouldExist: boolean;
}

/**
 * 元素状态断言选项接口
 */
export interface StateAssertOptions {
  uid: string;
  visible?: boolean;
  enabled?: boolean;
  checked?: boolean;
  focused?: boolean;
}

/**
 * 内容断言选项接口
 */
export interface ContentAssertOptions {
  uid: string;
  text?: string;
  textContains?: string;
  textMatches?: string;
  attribute?: { key: string; value: string };
}

/**
 * 页面导航选项接口
 */
export interface NavigateOptions {
  url: string;
  params?: Record<string, any>;
  waitForLoad?: boolean;
  timeout?: number;
}

/**
 * 返回导航选项接口
 */
export interface NavigateBackOptions {
  delta?: number;
  waitForLoad?: boolean;
  timeout?: number;
}

/**
 * Tab切换选项接口
 */
export interface SwitchTabOptions {
  url: string;
  index?: number;
  waitForLoad?: boolean;
  timeout?: number;
}

/**
 * 页面状态接口
 */
export interface PageStateOptions {
  expectPath?: string;
  expectTitle?: string;
}

/**
 * 页面信息接口
 */
export interface PageInfo {
  path: string;
  title?: string;
  query?: Record<string, any>;
}

/**
 * automator.launch 选项接口
 */
export interface AutomatorLaunchOptions {
  projectPath: string;
  cliPath?: string;
  port?: number;
  projectConfig?: {
    setting?: {
      autoAudits?: boolean;
    };
  };
}
