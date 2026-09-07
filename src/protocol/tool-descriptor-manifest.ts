import { readFileSync } from 'node:fs';

import { ToolCategory } from '../config/tool-category.js';
import type { ToolDescriptor } from '../config/tool-profile.js';

import { canonicalJson } from './canonical-json.js';

export const TOOL_DESCRIPTOR_MANIFEST_VERSION = 2;
export const TOOL_RESULT_SCHEMA_VERSION = '2.0';

export interface ToolDescriptorManifest {
  formatVersion: typeof TOOL_DESCRIPTOR_MANIFEST_VERSION;
  resultSchemaVersion: typeof TOOL_RESULT_SCHEMA_VERSION;
  toolCount: number;
  tools: ToolDescriptor[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isToolCategory(value: unknown): value is ToolCategory {
  return Object.values(ToolCategory).some(category => category === value);
}

function isToolDescriptor(value: unknown): value is ToolDescriptor {
  if (!isRecord(value) || typeof value.name !== 'string') return false;
  if (typeof value.description !== 'string') return false;
  if (!isRecord(value.inputSchema) || value.inputSchema.type !== 'object') return false;
  if (!isRecord(value.outputSchema) || value.outputSchema.type !== 'object') return false;
  return isRecord(value._meta) && isToolCategory(value._meta.category);
}

export function createToolDescriptorManifest(
  tools: readonly ToolDescriptor[],
): ToolDescriptorManifest {
  return {
    formatVersion: TOOL_DESCRIPTOR_MANIFEST_VERSION,
    resultSchemaVersion: TOOL_RESULT_SCHEMA_VERSION,
    toolCount: tools.length,
    tools: [...tools],
  };
}

export function assertToolDescriptorsMatchManifest(
  manifest: ToolDescriptorManifest,
  runtimeDescriptors: readonly ToolDescriptor[],
): void {
  if (canonicalJson(manifest.tools) !== canonicalJson(runtimeDescriptors)) {
    throw new TypeError('工具实现与构建期 descriptor manifest 不一致，请重新执行 npm run build');
  }
}

export function parseToolDescriptorManifest(serialized: string): ToolDescriptorManifest {
  const candidate: unknown = JSON.parse(serialized);
  if (!isRecord(candidate) || candidate.formatVersion !== TOOL_DESCRIPTOR_MANIFEST_VERSION) {
    throw new TypeError('工具描述符 manifest 版本不受支持，请重新执行 npm run build');
  }
  if (candidate.resultSchemaVersion !== TOOL_RESULT_SCHEMA_VERSION) {
    throw new TypeError('工具描述符结果 schema 版本不受支持，请重新执行 npm run build');
  }
  if (!Array.isArray(candidate.tools)) {
    throw new TypeError('工具描述符 manifest 内容无效，请重新执行 npm run build');
  }
  const tools: ToolDescriptor[] = [];
  for (const tool of candidate.tools) {
    if (!isToolDescriptor(tool)) {
      throw new TypeError('工具描述符 manifest 内容无效，请重新执行 npm run build');
    }
    tools.push(tool);
  }
  if (candidate.toolCount !== tools.length) {
    throw new TypeError('工具描述符 manifest 数量不一致，请重新执行 npm run build');
  }

  const names = new Set(tools.map(tool => tool.name));
  if (names.size !== tools.length) {
    throw new TypeError('工具描述符 manifest 包含重复工具名，请重新执行 npm run build');
  }

  return createToolDescriptorManifest(tools);
}

export function loadToolDescriptorManifest(fileUrl: URL): ToolDescriptorManifest {
  return parseToolDescriptorManifest(readFileSync(fileUrl, 'utf8'));
}
