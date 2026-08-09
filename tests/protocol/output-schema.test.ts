import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  buildCompactOutputSchema,
  createToolDescriptorCache,
  withContentAddressedSchemaId,
} from '../../src/protocol/tool-descriptors.js';
import { TOOL_ERROR_CODES } from '../../src/tools/result.js';
import { allTools } from '../../src/tools/tools.js';

describe('工具输出契约', () => {
  it('full profile 的全部工具都暴露对象根 outputSchema', () => {
    expect(allTools).toHaveLength(31);

    for (const tool of allTools) {
      const schema = zodToJsonSchema(tool.outputSchema, { strictUnions: true });
      expect(schema, tool.name).toMatchObject({ type: 'object' });
      expect(tool.dataSchema, tool.name).toBeDefined();
    }
  });

  it('紧凑描述符完整覆盖 full profile 且不超过 95 KB', () => {
    const descriptors = createToolDescriptorCache(allTools).get();
    const responseBytes = Buffer.byteLength(JSON.stringify({ tools: descriptors }), 'utf8');

    expect(descriptors).toHaveLength(31);
    expect(responseBytes).toBeLessThanOrEqual(95_000);
    for (const descriptor of descriptors) {
      expect(descriptor.inputSchema.type, descriptor.name).toBe('object');
      expect(descriptor.outputSchema, descriptor.name).toMatchObject({
        type: 'object',
        $id: expect.stringMatching(
          /^urn:weixin-devtools-mcp:schema:output:sha256:[a-f0-9]{64}$/,
        ),
      });
      expect(descriptor._meta, descriptor.name).toBeDefined();
    }
  });

  it('紧凑 outputSchema 均可由官方 SDK validator 编译', () => {
    const descriptors = createToolDescriptorCache(allTools).get();

    for (const descriptor of descriptors) {
      const outputSchema = descriptor.outputSchema;
      if (!outputSchema) throw new Error(`${descriptor.name} 缺少 outputSchema`);
      expect(
        () => new AjvJsonSchemaValidator().getValidator(outputSchema),
        descriptor.name,
      ).not.toThrow();
      expect(
        () => new Ajv2020({ strict: false }).compile(outputSchema),
        `${descriptor.name} (JSON Schema 2020-12)`,
      ).not.toThrow();
    }
  });

  it('内容寻址 ID 相同当且仅当 outputSchema 内容相同', () => {
    const descriptors = createToolDescriptorCache(allTools).get();
    const contentById = new Map<string, string>();
    const idByContent = new Map<string, string>();

    for (const descriptor of descriptors) {
      const outputSchema = descriptor.outputSchema;
      if (typeof outputSchema?.$id !== 'string') {
        throw new Error(`${descriptor.name} 缺少 outputSchema $id`);
      }
      const content = JSON.stringify({ ...outputSchema, $id: undefined });
      expect(contentById.get(outputSchema.$id) ?? content).toBe(content);
      expect(idByContent.get(content) ?? outputSchema.$id).toBe(outputSchema.$id);
      contentById.set(outputSchema.$id, content);
      idByContent.set(content, outputSchema.$id);
    }
  });

  it('内容寻址 ID 与对象键序和已有 ID 无关，并随 schema 内容变化', () => {
    const left = withContentAddressedSchemaId({
      type: 'object',
      properties: { alpha: { type: 'string' }, beta: { type: 'number' } },
    });
    const reordered = withContentAddressedSchemaId({
      $id: 'urn:old-id',
      properties: { beta: { type: 'number' }, alpha: { type: 'string' } },
      type: 'object',
    });
    const changed = withContentAddressedSchemaId({
      type: 'object',
      properties: { alpha: { type: 'boolean' }, beta: { type: 'number' } },
    });

    expect(left.$id).toBe(reordered.$id);
    expect(changed.$id).not.toBe(left.$id);
  });

  it('公开信封只放宽辅助信息，保留核心字段与工具 data 的精确 schema', () => {
    const tool = allTools.find(candidate => candidate.name === 'get_connection_status');
    expect(tool).toBeDefined();
    if (!tool) return;

    const schema = buildCompactOutputSchema(tool);
    expect(schema.required).toEqual([
      'schemaVersion',
      'ok',
      'code',
      'data',
      'warnings',
      'nextActions',
      'meta',
    ]);
    expect(schema.properties).toMatchObject({
      schemaVersion: { type: 'string', const: '1.0' },
      ok: { type: 'boolean' },
      code: { type: 'string', enum: ['OK', ...TOOL_ERROR_CODES] },
      error: {
        type: 'object',
        required: ['message', 'retryable'],
        additionalProperties: false,
      },
      observation: { type: 'object' },
      warnings: { type: 'array', items: { type: 'object' } },
      nextActions: { type: 'array', items: { type: 'object' } },
      meta: {
        type: 'object',
        required: ['requestId', 'tool', 'durationMs'],
        additionalProperties: false,
      },
    });

    const dataProperty = schema.properties?.data;
    expect(dataProperty).toBeDefined();
    expect(JSON.stringify(dataProperty)).toContain('disconnected');
    expect(JSON.stringify(dataProperty)).toContain('pageRevision');
  });

  it('递归 JSONValue 的空 schema 压缩与 wire JSON 语义等价', () => {
    const tool = allTools.find(candidate => candidate.name === 'evaluate_script');
    expect(tool).toBeDefined();
    if (!tool) return;

    const validateCompact = new AjvJsonSchemaValidator().getValidator(
      buildCompactOutputSchema(tool),
    );
    const jsonValues = [
      'text',
      42,
      true,
      null,
      ['nested', 1, false, null],
      { nested: { array: [1, 'two', null] } },
    ];

    for (const result of jsonValues) {
      const envelope = {
        schemaVersion: '1.0',
        ok: true,
        code: 'OK',
        data: { result },
        warnings: [],
        nextActions: [],
        meta: { requestId: 'req-1', tool: tool.name, durationMs: 0 },
      };
      expect(tool.outputSchema.safeParse(envelope).success).toBe(true);
      expect(validateCompact(envelope).valid).toBe(true);
    }
  });

  it('描述符缓存复用同一结果，并支持显式失效', () => {
    const cache = createToolDescriptorCache(allTools);
    const first = cache.get();

    expect(cache.get()).toBe(first);
    cache.invalidate();
    const rebuilt = cache.get();
    expect(rebuilt).not.toBe(first);
    expect(rebuilt).toEqual(first);
  });

  it('只有内部分类信息时省略空 annotations，但保留 _meta', () => {
    const descriptor = createToolDescriptorCache(allTools).get()[0];

    expect(descriptor.annotations).toBeUndefined();
    expect(descriptor._meta).toMatchObject({ category: expect.any(String) });
  });
});
