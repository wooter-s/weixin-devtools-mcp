export { createElementRef, createSnapshotId } from './identity.js';
export { elementTargetSchema } from './schema.js';
export type { ElementTargetInput, ElementTargetValue } from './schema.js';
export { applyTextInput, fromLegacyInputOptions } from './input.js';
export type { TextInputCommand, TextInputElement } from './input.js';
export {
  ElementResolutionError,
  elementTargetToSelector,
  resolveElementTarget,
} from './locator.js';
export type { ResolveElementOptions, ResolvedElement } from './locator.js';
export type {
  ElementFingerprint,
  ElementResolutionErrorCode,
  ElementTarget,
  LocatorStability,
} from './types.js';
