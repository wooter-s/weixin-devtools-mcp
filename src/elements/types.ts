/** 可供工具公开使用的元素目标。 */
export type ElementTarget =
  | { kind: 'ref'; ref: string }
  | { kind: 'testId'; value: string }
  | { kind: 'id'; value: string }
  | { kind: 'selector'; value: string; index?: number }
  | { kind: 'text'; value: string; exact?: boolean; tagName?: string; index?: number };

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

export type ElementResolutionErrorCode =
  | 'ELEMENT_NOT_FOUND'
  | 'AMBIGUOUS_ELEMENT'
  | 'STALE_ELEMENT'
  | 'INVALID_ELEMENT_TARGET';
