export { createElementRef, createSnapshotId } from './identity.js';
export { elementTargetSchema, locatorSegmentSchema } from './schema.js';
export type { ElementTargetInput, ElementTargetValue } from './schema.js';
export { isCustomComponentElement } from './component.js';
export type { CustomComponentElement } from './component.js';
export { applyTextInput, fromLegacyInputOptions } from './input.js';
export type { TextInputCommand, TextInputElement } from './input.js';
export {
  ElementResolutionError,
  elementTargetToSelector,
  resolveLocatorPath,
  resolveElementTarget,
} from './locator.js';
export type { ResolveElementOptions, ResolvedElement } from './locator.js';
export type {
  ElementFingerprint,
  ElementAddress,
  ElementAddressSegment,
  ElementResolutionErrorCode,
  ElementTarget,
  LocatorSegment,
  LocatorStability,
} from './types.js';
