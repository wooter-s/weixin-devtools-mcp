/**
 * 页面快照格式化器
 * 提供多种输出格式以优化token使用和可读性
 */

import type { PageSnapshot, ElementSnapshot } from '../tools.js';

/**
 * 输出格式类型
 */
export type SnapshotFormat = 'compact' | 'minimal' | 'json';

/**
 * 格式化配置选项
 */
export interface FormatOptions {
  /** 输出格式 */
  format: SnapshotFormat;
  /** 是否包含位置信息 */
  includePosition?: boolean;
  /** 是否包含属性信息 */
  includeAttributes?: boolean;
  /** 最大元素数量限制 */
  maxElements?: number;
}

/**
 * 格式化页面快照
 *
 * @param snapshot 页面快照数据
 * @param options 格式化选项
 * @returns 格式化后的字符串
 */
export function formatSnapshot(
  snapshot: PageSnapshot,
  options: FormatOptions = { format: 'compact' }
): string {
  const { format, maxElements } = options;

  // 限制元素数量
  const elements = maxElements
    ? snapshot.elements.slice(0, maxElements)
    : snapshot.elements;

  const limitedSnapshot = { ...snapshot, elements };

  switch (format) {
    case 'compact':
      return formatCompact(limitedSnapshot, options);
    case 'minimal':
      return formatMinimal(limitedSnapshot);
    case 'json':
      return formatJSON(limitedSnapshot, options);
    default:
      return formatCompact(limitedSnapshot, options);
  }
}

/**
 * 紧凑文本格式（类似chrome-devtools-mcp风格）
 *
 * 示例输出：
 * # Page: pages/index/index
 * # Elements: 5
 *
 * uid=view.container view "Welcome" pos=[0,64] size=[375x667]
 * uid=button.submit button "Submit" pos=[100,400] size=[175x44]
 */
function formatCompact(
  snapshot: PageSnapshot,
  options: FormatOptions
): string {
  const lines: string[] = [];
  const { includePosition = true, includeAttributes = false } = options;

  // 头部信息
  lines.push(`# Page: ${snapshot.path}`);
  lines.push(`# Elements: ${snapshot.elements.length}`);
  lines.push('');

  // 元素信息
  for (const element of snapshot.elements) {
    const parts: string[] = [];

    // 必需字段：uid tagName
    parts.push(`uid=${element.uid}`);
    parts.push(element.tagName);

    // 文本内容（引号包裹，转义特殊字符）
    if (element.text) {
      const escapedText = escapeText(element.text);
      parts.push(`"${escapedText}"`);
    }

    // 位置信息（紧凑格式）
    if (includePosition && element.position) {
      const { left, top, width, height } = element.position;
      parts.push(`pos=[${left},${top}]`);
      parts.push(`size=[${width}x${height}]`);
    }

    // 属性信息（可选，键值对格式）
    if (includeAttributes && element.attributes) {
      const attrPairs = Object.entries(element.attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      if (attrPairs) {
        parts.push(attrPairs);
      }
    }

    lines.push(parts.join(' '));
  }

  return lines.join('\n');
}

/**
 * 最小化格式（仅保留核心识别信息）
 *
 * 示例输出：
 * # Page: pages/index/index
 * # Elements: 5
 *
 * view.container view
 * button.submit button "Submit"
 * input#username input
 */
function formatMinimal(snapshot: PageSnapshot): string {
  const lines: string[] = [];

  // 头部信息
  lines.push(`# Page: ${snapshot.path}`);
  lines.push(`# Elements: ${snapshot.elements.length}`);
  lines.push('');

  // 元素信息（只有uid、tagName、text）
  for (const element of snapshot.elements) {
    const parts = [element.uid, element.tagName];
    if (element.text) {
      const escapedText = escapeText(element.text);
      parts.push(`"${escapedText}"`);
    }
    lines.push(parts.join(' '));
  }

  return lines.join('\n');
}

/**
 * JSON格式（保留完整信息）
 *
 * 保持向后兼容性，输出完整的JSON结构
 */
function formatJSON(
  snapshot: PageSnapshot,
  options: FormatOptions
): string {
  const { includePosition = true, includeAttributes = false } = options;

  // 根据选项过滤字段
  const filteredElements = snapshot.elements.map(element => {
    const filtered: Partial<ElementSnapshot> = {
      uid: element.uid,
      tagName: element.tagName,
    };

    if (element.text) filtered.text = element.text;
    if (includePosition && element.position) filtered.position = element.position;
    if (includeAttributes && element.attributes) filtered.attributes = element.attributes;

    return filtered as ElementSnapshot;
  });

  return JSON.stringify(
    { path: snapshot.path, elements: filteredElements },
    null,
    2
  );
}

/**
 * 转义文本内容中的特殊字符
 */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')   // 反斜杠
    .replace(/"/g, '\\"')     // 双引号
    .replace(/\n/g, '\\n')    // 换行符
    .replace(/\r/g, '\\r')    // 回车符
    .replace(/\t/g, '\\t')    // 制表符
    .slice(0, 100);           // 限制长度，避免超长文本
}

/**
 * Token使用估算
 *
 * 提供各种格式的token消耗估算，帮助用户选择合适的格式
 */
export function estimateTokens(snapshot: PageSnapshot): {
  compact: number;
  minimal: number;
  json: number;
} {
  // 粗略估算：1 token ≈ 4 characters
  const compactStr = formatCompact(snapshot, { format: 'compact' });
  const minimalStr = formatMinimal(snapshot);
  const jsonStr = formatJSON(snapshot, { format: 'json' });

  return {
    compact: Math.ceil(compactStr.length / 4),
    minimal: Math.ceil(minimalStr.length / 4),
    json: Math.ceil(jsonStr.length / 4),
  };
}
