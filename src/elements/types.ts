/**
 * locator path 的单级定位器。
 *
 * 第一段相对 Page 查询，后续段相对上一段命中的 CustomElement 查询。
 * selector/text 允许显式 index；强定位字段出现多匹配时则直接报歧义，避免
 * 把本应唯一的业务标识悄悄降级为位置定位。
 */
export type LocatorSegment =
  | { kind: 'testId'; value: string }
  | { kind: 'id'; value: string }
  | { kind: 'dataId'; value: string }
  | { kind: 'selector'; value: string; index?: number }
  | { kind: 'text'; value: string; exact?: boolean; tagName?: string; index?: number };

/** 可供工具公开使用的 V2 元素目标。 */
export type ElementTarget =
  | { kind: 'ref'; ref: string }
  | { kind: 'path'; path: LocatorSegment[] };

/** ref 在 DOM 变化后用于拒绝错误重绑的元素特征。 */
export interface ElementFingerprint {
  tagName: string;
  id?: string;
  testId?: string;
  dataId?: string;
  className?: string;
  text?: string;
}

export type LocatorStability = 'stable' | 'contextual' | 'positional';

/**
 * ref registry 内部保存的单级地址。locator 用于重新查询，fingerprint 用于
 * 验证运行时节点身份；二者必须同时成立才允许跨 revision 重绑。
 */
export interface ElementAddressSegment {
  locator: LocatorSegment;
  selector: string;
  index: number;
  stability: LocatorStability;
  fingerprint: ElementFingerprint;
}

/** 从 Page 到目标元素的完整作用域地址链。 */
export interface ElementAddress {
  segments: ElementAddressSegment[];
}

export type ElementResolutionErrorCode =
  | 'ELEMENT_NOT_FOUND'
  | 'AMBIGUOUS_ELEMENT'
  | 'STALE_ELEMENT'
  | 'INVALID_ELEMENT_TARGET';
