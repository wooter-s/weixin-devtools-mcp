import type { Element } from 'miniprogram-automator';

/** miniprogram-automator 对自定义组件暴露的稳定能力集合。 */
export interface CustomComponentElement extends Element {
  $(selector: string): Promise<Element | null>;
  $$(selector: string): Promise<Element[]>;
  setData(data: Record<string, unknown>): Promise<void>;
  data(path?: string): Promise<unknown>;
  callMethod(method: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * 不依赖 tagName 或 SDK 私有 nodeId，通过公开运行时能力识别 CustomElement。
 */
export function isCustomComponentElement(
  element: Element
): element is CustomComponentElement {
  const candidate = element as Element & Partial<CustomComponentElement>;
  return (
    typeof candidate.$ === 'function' &&
    typeof candidate.$$ === 'function' &&
    typeof candidate.data === 'function' &&
    typeof candidate.setData === 'function' &&
    typeof candidate.callMethod === 'function'
  );
}
