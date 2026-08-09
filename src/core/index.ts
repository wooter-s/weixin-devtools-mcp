/**
 * Core 模块 barrel re-export
 * 统一导出所有核心功能
 */

// 类型定义
export type {
  ConnectOptions,
  EnhancedConnectOptions,
  ConnectResult,
  StartupResult,
  DetailedConnectResult,
  ElementSnapshot,
  PageSnapshot,
  PageStateCommit,
  ElementMapInfo,
  ClickOptions,
  ScreenshotOptions,
  QueryResult,
  QueryOptions,
  WaitForOptions,
  InputTextOptions,
  FormControlOptions,
  GetValueOptions,
  AssertResult,
  ExistenceAssertOptions,
  StateAssertOptions,
  ContentAssertOptions,
  NavigateOptions,
  NavigateBackOptions,
  SwitchTabOptions,
  PageStateOptions,
  PageInfo,
  AutomatorLaunchOptions,
} from './types.js';

export {
  ElementResolutionError,
  applyTextInput,
  createElementRef,
  createSnapshotId,
  elementTargetToSelector,
  fromLegacyInputOptions,
  resolveElementTarget,
} from '../elements/index.js';
export type {
  ElementFingerprint,
  ElementResolutionErrorCode,
  ElementTarget,
  LocatorStability,
  ResolveElementOptions,
  ResolvedElement,
  TextInputCommand,
  TextInputElement,
} from '../elements/index.js';

// 连接管理
export {
  DevToolsConnectionError,
  connectDevtools,
  connectDevtoolsEnhanced,
  waitForWebSocketReady,
  checkDevToolsRunning,
  detectIDEPort,
} from './connection.js';

// 页面快照
export {
  collectPageTopology,
  getPageSnapshot,
} from './snapshot.js';
export type {
  GetPageSnapshotOptions,
  PageTopologyCapture,
  SnapshotCollectionStrategy,
} from './snapshot.js';

// 交互操作
export {
  clickElement,
  inputText,
  getElementValue,
  setFormControl,
} from './interaction.js';

// 断言验证
export {
  assertElementExists,
  assertElementVisible,
  assertElementText,
  assertElementAttribute,
} from './assertion.js';

// 页面导航
export {
  navigateToPage,
  navigateBack,
  switchTab,
  getCurrentPageInfo,
  reLaunch,
  toAbsolutePagePath,
} from './navigation.js';

// 页面查询
export {
  queryElements,
  waitForCondition,
} from './query.js';

// 截图
export {
  takeScreenshot,
} from './screenshot.js';
