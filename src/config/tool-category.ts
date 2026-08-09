/**
 * 工具分类是启动期 profile 过滤所需的轻量元数据。
 * 保持在独立模块中，避免 tools/list 为读取分类而加载完整工具实现。
 */
export enum ToolCategory {
  CORE = 'core',
  CONSOLE = 'console',
  NETWORK = 'network',
  DEBUG = 'debug',
}
