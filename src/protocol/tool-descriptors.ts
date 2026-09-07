import { createHash } from 'node:crypto';

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  ignoreOverride,
  zodToJsonSchema,
  type JsonSchema7AnyType,
  type JsonSchema7RecordType,
} from 'zod-to-json-schema';

import { ToolCategory } from '../config/tool-category.js';
import type { ToolDescriptor } from '../config/tool-profile.js';
import type { ToolDefinition } from '../tools/ToolDefinition.js';
import {
  jsonObjectSchema,
  jsonValueSchema,
  TOOL_ERROR_CODES,
} from '../tools/result.js';

import { canonicalJson } from './canonical-json.js';

const OUTPUT_SCHEMA_ID_PREFIX = 'urn:weixin-devtools-mcp:schema:output:sha256:';
const DATA_SCHEMA_BASE_PATH = ['#', 'oneOf', '0', 'properties', 'data'];
const ANY_JSON_SCHEMA: JsonSchema7AnyType = {};
const JSON_OBJECT_SCHEMA: JsonSchema7RecordType = {
  type: 'object',
  additionalProperties: ANY_JSON_SCHEMA,
};

type McpInputSchema = Tool['inputSchema'];
type McpOutputSchema = NonNullable<Tool['outputSchema']>;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObjectRoot(schema: ReturnType<typeof zodToJsonSchema>, toolName: string): McpInputSchema {
  const candidate: unknown = schema;
  if (!isJsonObject(candidate) || candidate.type !== 'object') {
    throw new TypeError(`${toolName} 的 inputSchema 必须以 object 为根节点`);
  }
  return candidate as McpInputSchema;
}

function toProtocolAnnotations(annotations: ToolDefinition['annotations']): Tool['annotations'] {
  if (!annotations) return undefined;
  const {
    title,
    readOnlyHint,
    destructiveHint,
    idempotentHint,
    openWorldHint,
  } = annotations;
  const protocolAnnotations = {
    ...(title !== undefined ? { title } : {}),
    ...(readOnlyHint !== undefined ? { readOnlyHint } : {}),
    ...(destructiveHint !== undefined ? { destructiveHint } : {}),
    ...(idempotentHint !== undefined ? { idempotentHint } : {}),
    ...(openWorldHint !== undefined ? { openWorldHint } : {}),
  };
  return Object.keys(protocolAnnotations).length > 0 ? protocolAnnotations : undefined;
}

/**
 * 为 JSON Schema 生成只依赖 schema 内容的稳定 ID。已有的根级 `$id` 不参与摘要，
 * 从而相同内容可复用 MCP SDK/Ajv 已编译的 validator。
 */
export function withContentAddressedSchemaId(schema: McpOutputSchema): McpOutputSchema {
  const schemaWithoutId = { ...schema };
  delete schemaWithoutId.$id;
  const digest = createHash('sha256')
    .update(canonicalJson(schemaWithoutId))
    .digest('hex');
  return {
    ...schemaWithoutId,
    $id: `${OUTPUT_SCHEMA_ID_PREFIX}${digest}`,
  };
}

/**
 * ListTools 只公开稳定信封与工具特有 data 的精确结构；可演进的辅助信息保持对象边界，
 * 避免在每个工具中重复展开 observation、warnings 和 nextActions 的深层字段。
 */
export function buildCompactOutputSchema(tool: Pick<ToolDefinition, 'dataSchema'>): McpOutputSchema {
  const dataSchema = zodToJsonSchema(tool.dataSchema, {
    strictUnions: true,
    basePath: DATA_SCHEMA_BASE_PATH,
    // JSON Schema 的空 schema 已精确覆盖所有可经 MCP 传输的 JSON value，
    // 无需重复展开递归 primitive/array/object 联合。
    override: def => {
      if (def === jsonValueSchema._def) return ANY_JSON_SCHEMA;
      if (def === jsonObjectSchema._def) return JSON_OBJECT_SCHEMA;
      return ignoreOverride;
    },
  });
  delete dataSchema.$schema;

  const failureErrorSchema = {
    type: 'object',
    properties: {
      message: { type: 'string' },
      retryable: { type: 'boolean' },
      // 深层字段由运行时严格判别联合校验，避免 31 个工具重复携带同一份大型诊断 schema。
      diagnostic: {
        anyOf: [
          { type: 'object' },
          { type: 'null' },
        ],
      },
    },
    required: ['message', 'retryable', 'diagnostic'],
    additionalProperties: false,
  };

  return withContentAddressedSchemaId({
    type: 'object',
    properties: {
      schemaVersion: { type: 'string', const: '2.0' },
      ok: { type: 'boolean' },
      code: { type: 'string', enum: ['OK', ...TOOL_ERROR_CODES] },
      data: ANY_JSON_SCHEMA,
      error: ANY_JSON_SCHEMA,
      partialData: ANY_JSON_SCHEMA,
      observation: { anyOf: [{ type: 'object' }, { type: 'null' }] },
      warnings: { type: 'array', items: { type: 'object' } },
      nextActions: { type: 'array', items: { type: 'object' } },
      meta: { type: 'object' },
    },
    required: [
      'schemaVersion',
      'ok',
      'code',
      'data',
      'error',
      'partialData',
      'observation',
      'warnings',
      'nextActions',
      'meta',
    ],
    oneOf: [
      {
        properties: {
          ok: { const: true },
          code: { const: 'OK' },
          data: dataSchema,
          error: { type: 'null' },
          partialData: { type: 'null' },
        },
      },
      {
        properties: {
          ok: { const: false },
          code: { not: { const: 'OK' } },
          data: { type: 'null' },
          error: failureErrorSchema,
          partialData: { anyOf: [{ type: 'object' }, { type: 'null' }] },
        },
      },
    ],
    additionalProperties: false,
  });
}

export function buildToolDescriptors(tools: readonly ToolDefinition[]): ToolDescriptor[] {
  return tools.map<ToolDescriptor>(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: requireObjectRoot(
      zodToJsonSchema(tool.schema, { strictUnions: true }),
      tool.name,
    ),
    outputSchema: buildCompactOutputSchema(tool),
    annotations: toProtocolAnnotations(tool.annotations),
    _meta: {
      category: tool.annotations?.category ?? ToolCategory.CORE,
      ...(tool.annotations?.audience ? { audience: tool.annotations.audience } : {}),
      ...(tool.annotations?.experimental !== undefined
        ? { experimental: tool.annotations.experimental }
        : {}),
    },
  }));
}

export interface ToolDescriptorCache {
  get(): Tool[];
  invalidate(): void;
}

/** 创建进程内描述符缓存；动态工具集变更时由调用方显式 invalidate。 */
export function createToolDescriptorCache(tools: readonly ToolDefinition[]): ToolDescriptorCache {
  let cached: Tool[] | undefined;
  return {
    get() {
      cached ??= buildToolDescriptors(tools);
      return cached;
    },
    invalidate() {
      cached = undefined;
    },
  };
}
