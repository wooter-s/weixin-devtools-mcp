/**
 * 共享类型定义
 * 从 src/tools.ts 提取的所有接口和类型
 */

import type { Element } from 'miniprogram-automator';

import type {
  ElementAddress,
  ElementFingerprint,
  LocatorStability,
  TextInputCommand,
} from '../elements/index.js';

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
  /** 当前快照内唯一且不可解析的元素引用。 */
  ref: string;
  tagName: string;
  text?: string;
  attributes?: Record<string, string>;
  locatorStability?: LocatorStability;
  /** 当前元素是否是可继续查询其组件内部节点的 CustomElement 边界。 */
  componentBoundary?: boolean;
  position?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export type SnapshotScopeKind = 'page' | 'custom-component';

export type SnapshotScopeStatus =
  | 'complete'
  | 'partial'
  | 'truncated'
  | 'unavailable';

export type SnapshotScopeReason =
  | 'MAX_DEPTH'
  | 'MAX_SCOPES'
  | 'MAX_ELEMENTS'
  | 'QUERY_UNSUPPORTED'
  | 'QUERY_FAILED'
  | 'ELEMENT_READ_FAILED';

export interface SnapshotBudget {
  maxDepth: number;
  maxExpandedScopes: number;
  maxElements: number;
}

export interface SnapshotUsage {
  expandedScopes: number;
  elements: number;
}

/** Page 或 CustomElement 对应的标准化可查询作用域。 */
export interface SnapshotScope {
  scopeId: string;
  kind: SnapshotScopeKind;
  rootRef?: string;
  depth: number;
  status: SnapshotScopeStatus;
  reason?: SnapshotScopeReason;
  elements: ElementSnapshot[];
}

/** 自定义组件边界与其内部作用域之间的有向边。 */
export interface SnapshotScopeEdge {
  fromScopeId: string;
  boundaryRef: string;
  toScopeId: string;
}

/**
 * 页面快照接口
 */
export interface PageSnapshot {
  snapshotId: string;
  pageRevision: number;
  path: string;
  /**
   * Context 内部用于兼容现有 observation diff 的 Page 根作用域别名。
   * V2 公共契约只序列化 scopes/edges，不公开此字段。
   */
  elements: ElementSnapshot[];
  /** 以下图字段由 V2 capture 始终生成；optional 仅用于读取旧缓存/测试夹具。 */
  rootScopeId?: string;
  complete?: boolean;
  budget?: SnapshotBudget;
  usage?: SnapshotUsage;
  scopes?: SnapshotScope[];
  edges?: SnapshotScopeEdge[];
}

/**
 * Context 对一次页面状态扫描的原子提交结果。
 *
 * snapshot、elementMap 与 pageRevision 必须来自同一次提交；调用方不能把
 * 扫描中的 draft 与当前 Context 状态混用。
 */
export interface PageStateCommit {
  snapshot: PageSnapshot;
  elementMap: Map<string, ElementMapInfo>;
  pagePath: string;
  pageRevision: number;
  /** 本次提交是否检测到未被 markPageMutation 覆盖的同页 DOM 变化。 */
  domChanged: boolean;
  /** 提交前最近一次稳定扫描；首次扫描时为 null。 */
  previousSnapshot: PageSnapshot | null;
}

/**
 * 元素映射信息接口
 * 用于精确定位页面元素
 */
export interface ElementMapInfo {
  selector: string;
  index: number;
  /** ref generation 的来源；旧的手工构造映射可省略以保持兼容。 */
  generationKind?: 'snapshot' | 'query';
  snapshotId?: string;
  pageRevision?: number;
  pagePath?: string;
  element?: Element;
  fingerprint?: ElementFingerprint;
  /** 从 Page 逐级进入自定义组件、最终抵达元素的完整内部地址链。 */
  address?: ElementAddress;
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
  ref: string;
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
  pageRevision: number;
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
export type InputTextOptions = { uid: string } & TextInputCommand;

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
