import { z } from 'zod';

const indexedLocatorFields = {
  index: z.number().int().nonnegative().optional().describe('从 0 开始的匹配索引；多匹配时必须提供'),
};

export const elementTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ref'),
    ref: z.string().min(1).describe('页面快照返回的 opaque ref'),
  }),
  z.object({
    kind: z.literal('testId'),
    value: z.string().min(1).describe('data-testid 属性值'),
  }),
  z.object({
    kind: z.literal('id'),
    value: z.string().min(1).describe('id 属性值'),
  }),
  z.object({
    kind: z.literal('selector'),
    value: z.string().min(1).describe('小程序组件选择器'),
    ...indexedLocatorFields,
  }),
  z.object({
    kind: z.literal('text'),
    value: z.string().min(1).describe('元素文本'),
    exact: z.boolean().optional().default(true).describe('是否精确匹配，默认 true'),
    tagName: z.string().min(1).optional().describe('可选的组件标签限制'),
    ...indexedLocatorFields,
  }),
]);

export type ElementTargetInput = z.input<typeof elementTargetSchema>;
export type ElementTargetValue = z.output<typeof elementTargetSchema>;
