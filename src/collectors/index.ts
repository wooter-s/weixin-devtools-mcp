/**
 * Collectors 模块导出
 *
 * 提供通用的数据收集器模式：
 * - Collector: 通用基类
 * - ConsoleCollector: Console 消息收集
 * - NetworkCollector: 网络请求收集
 */

// 基类和通用类型
export {
  Collector,
  type CollectorOptions,
  type NavigationSession,
  type QueryOptions,
} from './Collector.js';

// Console 收集器
export {
  ConsoleCollector,
  type ConsoleMessage,
  type ExceptionMessage,
  type ConsoleEntry,
  type ConsoleQueryOptions,
  isConsoleMessage,
  isExceptionMessage,
} from './ConsoleCollector.js';

// Network 收集器
export {
  NetworkCollector,
  type NetworkRequest,
  type NetworkRequestType,
  type NetworkQueryOptions,
  type WxNetworkMethod,
  type OriginalMethods,
} from './NetworkCollector.js';

// ID 工具（重新导出）
export {
  createIdGenerator,
  stableIdSymbol,
  type WithStableId,
} from '../utils/idGenerator.js';
