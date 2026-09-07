import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ToolCategory } from '../../src/config/tool-category.js';
import {
  resolveToolDescriptorsByProfile,
  type ToolProfileConfig,
} from '../../src/config/tool-profile.js';
import {
  assertToolDescriptorsMatchManifest,
  createToolDescriptorManifest,
  parseToolDescriptorManifest,
  TOOL_DESCRIPTOR_MANIFEST_VERSION,
  TOOL_RESULT_SCHEMA_VERSION,
} from '../../src/protocol/tool-descriptor-manifest.js';
import { buildToolDescriptors } from '../../src/protocol/tool-descriptors.js';
import { allTools } from '../../src/tools/tools.js';

const generatedManifestUrl = new URL(
  '../../build/protocol/tool-descriptors.generated.json',
  import.meta.url,
);

function config(
  profile: ToolProfileConfig['profile'],
  enabledCategories: readonly ToolCategory[] = [],
  disabledCategories: readonly ToolCategory[] = [],
): ToolProfileConfig {
  return {
    profile,
    enabledCategories: new Set(enabledCategories),
    disabledCategories: new Set(disabledCategories),
  };
}

describe('构建期工具描述符 manifest', () => {
  it('与当前 31 个工具定义完全一致，防止构建产物过期', () => {
    const serialized = readFileSync(generatedManifestUrl, 'utf8');
    const generated = parseToolDescriptorManifest(serialized);
    const expected = createToolDescriptorManifest(buildToolDescriptors(allTools));

    expect(generated).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(serialized).toBe(`${JSON.stringify(expected)}\n`);
    expect(generated.formatVersion).toBe(TOOL_DESCRIPTOR_MANIFEST_VERSION);
    expect(generated.resultSchemaVersion).toBe(TOOL_RESULT_SCHEMA_VERSION);
    expect(generated.toolCount).toBe(31);
    expect(generated.tools).toHaveLength(31);
  });

  it('拒绝旧 manifest 或结果 schema 版本', () => {
    const current = createToolDescriptorManifest(buildToolDescriptors(allTools));

    expect(() => parseToolDescriptorManifest(JSON.stringify({
      ...current,
      formatVersion: 1,
    }))).toThrow('manifest 版本不受支持');
    expect(() => parseToolDescriptorManifest(JSON.stringify({
      ...current,
      resultSchemaVersion: '1.0',
    }))).toThrow('结果 schema 版本不受支持');
  });

  it('31 个描述符均保留 input/output schema 与分类元数据', () => {
    const manifest = parseToolDescriptorManifest(readFileSync(generatedManifestUrl, 'utf8'));

    for (const descriptor of manifest.tools) {
      expect(descriptor.inputSchema.type, descriptor.name).toBe('object');
      expect(descriptor.outputSchema?.type, descriptor.name).toBe('object');
      expect(descriptor.outputSchema?.$id, descriptor.name).toMatch(
        /^urn:weixin-devtools-mcp:schema:output:sha256:[a-f0-9]{64}$/,
      );
      expect(Object.values(ToolCategory), descriptor.name).toContain(
        descriptor._meta.category,
      );
    }
  });

  it('同名工具的 schema、描述或分类漂移时拒绝运行时注册', () => {
    const manifest = createToolDescriptorManifest(buildToolDescriptors(allTools));
    const mutations: Array<(tools: typeof manifest.tools) => void> = [
      tools => {
        tools[0].description = `${tools[0].description} drift`;
      },
      tools => {
        tools[0].inputSchema = {
          ...tools[0].inputSchema,
          properties: {
            ...tools[0].inputSchema.properties,
            drift: { type: 'boolean' },
          },
        };
      },
      tools => {
        tools[0]._meta.category = ToolCategory.DEBUG;
      },
    ];

    for (const mutate of mutations) {
      const runtimeDescriptors = JSON.parse(JSON.stringify(manifest.tools)) as typeof manifest.tools;
      mutate(runtimeDescriptors);
      expect(() => assertToolDescriptorsMatchManifest(manifest, runtimeDescriptors))
        .toThrow('descriptor manifest 不一致');
    }
    expect(() => assertToolDescriptorsMatchManifest(manifest, manifest.tools)).not.toThrow();
  });

  it('静态描述符沿用 full/core/minimal 与类别开关语义', () => {
    const { tools } = parseToolDescriptorManifest(readFileSync(generatedManifestUrl, 'utf8'));

    expect(resolveToolDescriptorsByProfile(tools, config('full')).activeTools).toHaveLength(31);
    expect(resolveToolDescriptorsByProfile(tools, config('core')).activeTools).toHaveLength(20);
    expect(resolveToolDescriptorsByProfile(tools, config('minimal')).activeTools).toHaveLength(10);

    const withNetwork = resolveToolDescriptorsByProfile(
      tools,
      config('core', [ToolCategory.NETWORK]),
    );
    expect(withNetwork.activeTools).toHaveLength(24);
    expect(withNetwork.activeTools.map(tool => tool.name)).toContain('list_network_requests');

    const withoutDebug = resolveToolDescriptorsByProfile(
      tools,
      config('full', [], [ToolCategory.DEBUG]),
    );
    expect(withoutDebug.activeTools).toHaveLength(26);
    expect(withoutDebug.disabledTools.has('diagnose_connection')).toBe(true);
  });
});
