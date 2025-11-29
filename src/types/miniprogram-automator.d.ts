/**
 * miniprogram-automator SDK 类型定义
 *
 * 这是为微信小程序自动化测试 SDK 创建的 TypeScript 类型定义文件。
 * 基于 miniprogram-automator ^0.12.1 版本的实际 API 使用情况。
 *
 * @see https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/
 */

declare module 'miniprogram-automator' {
  /**
   * 连接微信开发者工具的选项
   * 使用 projectPath 或 wsEndpoint 二选一
   */
  export interface ConnectOptions {
    /** 微信开发者工具 CLI 路径 */
    cliPath?: string;
    /** 小程序项目路径（与 wsEndpoint 二选一） */
    projectPath?: string;
    /** 连接端口号 */
    port?: number;
    /** 连接超时时间（毫秒） */
    timeout?: number;
    /** WebSocket 端点地址（与 projectPath 二选一，用于直接连接） */
    wsEndpoint?: string;
  }

  /**
   * 连接到微信开发者工具并返回 MiniProgram 实例
   */
  export function connect(options: ConnectOptions): Promise<MiniProgram>;

  /**
   * 启动微信开发者工具并返回 MiniProgram 实例
   */
  export function launch(options: ConnectOptions): Promise<MiniProgram>;

  /**
   * Console 消息事件数据
   */
  export interface ConsoleMessage {
    /** 消息类型: log, warn, error, info, debug 等 */
    type: string;
    /** 消息参数数组 */
    args: unknown[];
    /** 消息文本 */
    text?: string;
  }

  /**
   * 异常信息事件数据
   */
  export interface ExceptionInfo {
    /** 异常消息 */
    message: string;
    /** 异常堆栈 */
    stack?: string;
  }

  /**
   * 截图选项
   */
  export interface ScreenshotOptions {
    /** 保存路径 */
    path?: string;
  }

  /**
   * 等待选项
   */
  export interface WaitOptions {
    /** 超时时间（毫秒） */
    timeout?: number;
  }

  /**
   * MiniProgram 实例 - 代表连接到的小程序
   */
  export interface MiniProgram {
    /**
     * 获取当前激活的页面
     */
    currentPage(): Promise<Page>;

    /**
     * 在小程序 AppService 中执行 JavaScript 代码
     * @param fn 要执行的函数或函数字符串
     * @param args 传递给函数的参数
     * @returns 函数的返回值
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evaluate<T = unknown>(fn: string | ((...args: any[]) => T), ...args: unknown[]): Promise<T>;

    /**
     * 导航到指定页面
     * @param url 页面路径，可带参数
     */
    navigateTo(url: string): Promise<void>;

    /**
     * 返回上一页
     * @param delta 返回的页面层数，默认 1
     */
    navigateBack(delta?: number): Promise<void>;

    /**
     * 切换到指定 tab 页面
     * @param url tab 页面路径
     */
    switchTab(url: string): Promise<void>;

    /**
     * 关闭所有页面，打开到指定页面
     * @param url 页面路径
     */
    reLaunch(url: string): Promise<void>;

    /**
     * 关闭当前页面，跳转到指定页面
     * @param url 页面路径
     */
    redirectTo(url: string): Promise<void>;

    /**
     * 截图
     * @param options 截图选项，不传则返回 base64 数据
     */
    screenshot(options?: ScreenshotOptions): Promise<string | Buffer>;

    /**
     * 模拟 wx API 方法
     * @param method wx 方法名（如 'request', 'uploadFile'）
     * @param handler 模拟处理函数
     */
    mockWxMethod(method: string, handler: MockWxMethodHandler): Promise<void>;

    /**
     * 恢复被模拟的 wx API 方法
     * @param method wx 方法名
     */
    restoreWxMethod(method: string): Promise<void>;

    /**
     * 监听事件
     * @param event 事件名称
     * @param handler 事件处理函数
     */
    on(event: 'console', handler: (msg: ConsoleMessage) => void): void;
    on(event: 'exception', handler: (err: ExceptionInfo) => void): void;
    on(event: 'pageNavigate', handler: (data: PageNavigateInfo) => void): void;
    on(event: string, handler: (...args: unknown[]) => void): void;

    /**
     * 移除指定事件的所有监听器
     * @param event 事件名称
     */
    removeAllListeners(event: string): void;

    /**
     * 断开与开发者工具的连接
     */
    disconnect(): Promise<void>;

    /**
     * 关闭小程序
     */
    close(): Promise<void>;
  }

  /**
   * 页面导航事件信息
   */
  export interface PageNavigateInfo {
    /** 导航类型 */
    type: 'navigateTo' | 'navigateBack' | 'switchTab' | 'reLaunch' | 'redirectTo';
    /** 目标页面路径 */
    path: string;
  }

  /**
   * wx 方法模拟处理函数
   */
  export type MockWxMethodHandler = (this: MockWxMethodContext, options: WxMethodOptions) => void;

  /**
   * wx 方法模拟上下文
   */
  export interface MockWxMethodContext {
    /** 调用原始方法 */
    callOriginal(): void;
  }

  /**
   * wx 方法选项（通用）
   */
  export interface WxMethodOptions {
    /** 请求 URL（用于 request/uploadFile/downloadFile） */
    url?: string;
    /** 请求数据 */
    data?: unknown;
    /** 请求方法 */
    method?: string;
    /** 请求头 */
    header?: Record<string, string>;
    /** 成功回调 */
    success?: (res: unknown) => void;
    /** 失败回调 */
    fail?: (err: unknown) => void;
    /** 完成回调 */
    complete?: () => void;
    /** 其他参数 */
    [key: string]: unknown;
  }

  /**
   * Page 实例 - 代表小程序中的一个页面
   */
  export interface Page {
    /** 页面路径 */
    path: string;

    /**
     * 查询单个元素
     * @param selector CSS 选择器
     * @returns 匹配的元素，未找到返回 null
     */
    $(selector: string): Promise<Element | null>;

    /**
     * 查询所有匹配的元素
     * @param selector CSS 选择器
     * @returns 匹配的元素数组
     */
    $$(selector: string): Promise<Element[]>;

    /**
     * 等待条件满足
     * @param condition 选择器字符串、毫秒数或函数
     * @param options 等待选项
     */
    waitFor(condition: string | number | (() => boolean | Promise<boolean>), options?: WaitOptions): Promise<void>;

    /**
     * 获取页面数据
     * @param path 数据路径，不传则返回全部数据
     */
    data(path?: string): Promise<unknown>;

    /**
     * 设置页面数据
     * @param data 要设置的数据
     */
    setData(data: Record<string, unknown>): Promise<void>;

    /**
     * 获取页面视口尺寸
     */
    size(): Promise<{ width: number; height: number }>;

    /**
     * 滚动页面
     * @param options 滚动选项
     */
    scrollTo(options: ScrollOptions): Promise<void>;
  }

  /**
   * 滚动选项
   */
  export interface ScrollOptions {
    /** 滚动到的 X 坐标 */
    x?: number;
    /** 滚动到的 Y 坐标 */
    y?: number;
    /** 是否使用动画 */
    animated?: boolean;
  }

  /**
   * Element 实例 - 代表页面中的一个元素
   */
  export interface Element {
    /** 元素标签名 */
    tagName: string;

    /** 元素值（用于表单元素） */
    value?: string;

    /**
     * 获取元素的文本内容
     */
    text(): Promise<string>;

    /**
     * 获取元素的属性值
     * @param name 属性名
     */
    attribute(name: string): Promise<string | null>;

    /**
     * 获取元素的 WXML
     */
    outerWxml(): Promise<string>;

    /**
     * 获取元素的值（用于 input/textarea 等）
     */
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    value(): Promise<string | unknown>;

    /**
     * 点击元素
     */
    tap(): Promise<void>;

    /**
     * 长按元素
     */
    longpress(): Promise<void>;

    /**
     * 在元素上触摸移动
     */
    touchmove(options: TouchMoveOptions): Promise<void>;

    /**
     * 输入文本（用于 input/textarea）
     * @param text 要输入的文本
     */
    input(text: string): Promise<void>;

    /**
     * 触发元素事件
     * @param eventName 事件名（如 'tap', 'change'）
     * @param detail 事件详情
     */
    trigger(eventName: string, detail?: Record<string, unknown>): Promise<void>;

    /**
     * 滚动元素到可见区域
     */
    scrollIntoView(): Promise<void>;

    /**
     * 获取元素的位置和尺寸
     */
    boundingClientRect(): Promise<BoundingClientRect>;

    /**
     * 获取元素的样式
     * @param name 样式属性名
     */
    style(name: string): Promise<string>;
  }

  /**
   * 触摸移动选项
   */
  export interface TouchMoveOptions {
    /** 目标 X 坐标 */
    x: number;
    /** 目标 Y 坐标 */
    y: number;
    /** 移动持续时间（毫秒） */
    duration?: number;
  }

  /**
   * 元素边界矩形
   */
  export interface BoundingClientRect {
    /** 左边距 */
    left: number;
    /** 上边距 */
    top: number;
    /** 右边距 */
    right: number;
    /** 下边距 */
    bottom: number;
    /** 宽度 */
    width: number;
    /** 高度 */
    height: number;
  }
}
