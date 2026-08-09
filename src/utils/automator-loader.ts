import type automator from 'miniprogram-automator';

export type MiniProgramAutomator = typeof automator;

type AsyncLoader<T> = () => Promise<T>;
type AutomatorModule = {
  default?: MiniProgramAutomator;
  connect?: MiniProgramAutomator['connect'];
  launch?: MiniProgramAutomator['launch'];
};

/**
 * 创建并发安全的异步懒加载器。成功结果按进程缓存；失败会清空缓存，允许后续调用重试。
 */
export function createRetryableLazyLoader<T>(loader: AsyncLoader<T>): AsyncLoader<T> {
  let cachedPromise: Promise<T> | null = null;

  return () => {
    if (cachedPromise) {
      return cachedPromise;
    }

    const attempt = Promise.resolve().then(loader);
    cachedPromise = attempt.catch(error => {
      cachedPromise = null;
      throw error;
    });
    return cachedPromise;
  };
}

function resolveAutomatorModule(module: AutomatorModule): MiniProgramAutomator {
  const candidate = module.default ?? module;
  if (typeof candidate.connect !== 'function' || typeof candidate.launch !== 'function') {
    throw new TypeError('miniprogram-automator 模块缺少 connect 或 launch 导出');
  }
  return candidate as MiniProgramAutomator;
}

export const loadMiniProgramAutomator = createRetryableLazyLoader(async () => {
  const module = await import('miniprogram-automator');
  return resolveAutomatorModule(module as AutomatorModule);
});
