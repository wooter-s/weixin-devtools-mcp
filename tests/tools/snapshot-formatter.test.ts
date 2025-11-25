/**
 * 快照格式化器单元测试
 */

import { describe, it, expect } from 'vitest';

import {
  formatSnapshot,
  estimateTokens,
  type FormatOptions,
} from '../../src/formatters/snapshotFormatter.js';
import type { PageSnapshot } from '../../src/tools.js';

// 测试数据
const mockSnapshot: PageSnapshot = {
  path: 'pages/index/index',
  elements: [
    {
      uid: 'view.container',
      tagName: 'view',
      text: 'Welcome to our app',
      attributes: {
        class: 'container main-content',
        id: 'main',
      },
      position: {
        left: 0,
        top: 64,
        width: 375,
        height: 667,
      },
    },
    {
      uid: 'button.submit',
      tagName: 'button',
      text: 'Submit',
      attributes: {
        class: 'cube-btn primary',
        type: 'primary',
      },
      position: {
        left: 100,
        top: 400,
        width: 175,
        height: 44,
      },
    },
    {
      uid: 'input#username',
      tagName: 'input',
      attributes: {
        id: 'username',
        placeholder: 'Enter username',
      },
      position: {
        left: 50,
        top: 200,
        width: 275,
        height: 40,
      },
    },
  ],
};

describe('formatSnapshot', () => {
  describe('compact format', () => {
    it('应该生成紧凑文本格式', () => {
      const result = formatSnapshot(mockSnapshot, { format: 'compact' });

      // 验证头部信息
      expect(result).toContain('# Page: pages/index/index');
      expect(result).toContain('# Elements: 3');

      // 验证元素信息
      expect(result).toContain('uid=view.container view');
      expect(result).toContain('"Welcome to our app"');
      expect(result).toContain('pos=[0,64]');
      expect(result).toContain('size=[375x667]');

      expect(result).toContain('uid=button.submit button');
      expect(result).toContain('"Submit"');

      expect(result).toContain('uid=input#username input');
    });

    it('应该支持不包含位置信息', () => {
      const result = formatSnapshot(mockSnapshot, {
        format: 'compact',
        includePosition: false,
      });

      expect(result).not.toContain('pos=[');
      expect(result).not.toContain('size=[');
      expect(result).toContain('uid=view.container');
    });

    it('应该支持包含属性信息', () => {
      const result = formatSnapshot(mockSnapshot, {
        format: 'compact',
        includeAttributes: true,
      });

      expect(result).toContain('class="container main-content"');
      expect(result).toContain('id="main"');
      expect(result).toContain('type="primary"');
    });

    it('应该正确转义特殊字符', () => {
      const snapshotWithSpecialChars: PageSnapshot = {
        path: 'pages/test/test',
        elements: [
          {
            uid: 'text.special',
            tagName: 'text',
            text: 'Line 1\nLine 2\tTab"Quote\\Backslash',
          },
        ],
      };

      const result = formatSnapshot(snapshotWithSpecialChars, {
        format: 'compact',
      });

      expect(result).toContain('\\n');
      expect(result).toContain('\\t');
      expect(result).toContain('\\"');
      expect(result).toContain('\\\\');
    });

    it('应该限制超长文本', () => {
      const longText = 'a'.repeat(200);
      const snapshotWithLongText: PageSnapshot = {
        path: 'pages/test/test',
        elements: [
          {
            uid: 'text.long',
            tagName: 'text',
            text: longText,
          },
        ],
      };

      const result = formatSnapshot(snapshotWithLongText, {
        format: 'compact',
      });

      // 文本应该被截断到100字符
      const lines = result.split('\n');
      const textLine = lines.find(line => line.includes('text.long'));
      const match = textLine?.match(/"([^"]*)"/);
      expect(match?.[1]?.length).toBeLessThanOrEqual(100);
    });
  });

  describe('minimal format', () => {
    it('应该生成最小化格式', () => {
      const result = formatSnapshot(mockSnapshot, { format: 'minimal' });

      // 验证头部信息
      expect(result).toContain('# Page: pages/index/index');
      expect(result).toContain('# Elements: 3');

      // 验证元素信息（只有uid、tagName、text）
      expect(result).toContain('view.container view "Welcome to our app"');
      expect(result).toContain('button.submit button "Submit"');
      expect(result).toContain('input#username input');

      // 不应包含位置和属性
      expect(result).not.toContain('pos=[');
      expect(result).not.toContain('size=[');
      expect(result).not.toContain('class=');
    });

    it('应该处理没有文本的元素', () => {
      const snapshotWithoutText: PageSnapshot = {
        path: 'pages/test/test',
        elements: [
          {
            uid: 'view.empty',
            tagName: 'view',
          },
        ],
      };

      const result = formatSnapshot(snapshotWithoutText, { format: 'minimal' });

      expect(result).toContain('view.empty view');
      expect(result).not.toContain('""'); // 不应有空引号
    });
  });

  describe('json format', () => {
    it('应该生成JSON格式', () => {
      const result = formatSnapshot(mockSnapshot, { format: 'json' });

      // 应该是有效的JSON
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('path', 'pages/index/index');
      expect(parsed).toHaveProperty('elements');
      expect(parsed.elements).toHaveLength(3);
    });

    it('应该支持不包含位置信息', () => {
      const result = formatSnapshot(mockSnapshot, {
        format: 'json',
        includePosition: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.elements[0]).not.toHaveProperty('position');
      expect(parsed.elements[0]).toHaveProperty('uid');
      expect(parsed.elements[0]).toHaveProperty('tagName');
    });

    it('应该支持包含属性信息', () => {
      const result = formatSnapshot(mockSnapshot, {
        format: 'json',
        includeAttributes: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.elements[0]).toHaveProperty('attributes');
      expect(parsed.elements[0].attributes).toHaveProperty('class');
    });

    it('应该默认不包含属性信息', () => {
      const result = formatSnapshot(mockSnapshot, {
        format: 'json',
        includeAttributes: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.elements[0]).not.toHaveProperty('attributes');
    });
  });

  describe('maxElements option', () => {
    it('应该限制元素数量', () => {
      const result = formatSnapshot(mockSnapshot, {
        format: 'compact',
        maxElements: 2,
      });

      expect(result).toContain('# Elements: 2');
      expect(result).toContain('view.container');
      expect(result).toContain('button.submit');
      expect(result).not.toContain('input#username');
    });

    it('应该在所有格式中生效', () => {
      const minimalResult = formatSnapshot(mockSnapshot, {
        format: 'minimal',
        maxElements: 1,
      });
      expect(minimalResult).toContain('# Elements: 1');

      const jsonResult = formatSnapshot(mockSnapshot, {
        format: 'json',
        maxElements: 1,
      });
      const parsed = JSON.parse(jsonResult);
      expect(parsed.elements).toHaveLength(1);
    });
  });

  describe('default format', () => {
    it('应该默认使用compact格式', () => {
      const result = formatSnapshot(mockSnapshot);

      expect(result).toContain('# Page: pages/index/index');
      expect(result).toContain('uid=view.container');
      expect(result).toContain('pos=[0,64]');
    });
  });
});

describe('estimateTokens', () => {
  it('应该估算各格式的token消耗', () => {
    const estimates = estimateTokens(mockSnapshot);

    expect(estimates).toHaveProperty('compact');
    expect(estimates).toHaveProperty('minimal');
    expect(estimates).toHaveProperty('json');

    // token估算应该是正整数
    expect(estimates.compact).toBeGreaterThan(0);
    expect(estimates.minimal).toBeGreaterThan(0);
    expect(estimates.json).toBeGreaterThan(0);
  });

  it('应该反映格式的复杂度差异', () => {
    const estimates = estimateTokens(mockSnapshot);

    // minimal < compact < json
    expect(estimates.minimal).toBeLessThan(estimates.compact);
    expect(estimates.compact).toBeLessThan(estimates.json);
  });

  it('应该处理大量元素', () => {
    const largeSnapshot: PageSnapshot = {
      path: 'pages/large/large',
      elements: Array.from({ length: 100 }, (_, i) => ({
        uid: `element${i}`,
        tagName: 'view',
        text: `Element ${i}`,
        position: { left: 0, top: i * 50, width: 375, height: 50 },
      })),
    };

    const estimates = estimateTokens(largeSnapshot);

    // 大量元素应该消耗更多token
    expect(estimates.compact).toBeGreaterThan(100);
    expect(estimates.json).toBeGreaterThan(estimates.compact);
  });
});

describe('edge cases', () => {
  it('应该处理空快照', () => {
    const emptySnapshot: PageSnapshot = {
      path: 'pages/empty/empty',
      elements: [],
    };

    const compact = formatSnapshot(emptySnapshot, { format: 'compact' });
    expect(compact).toContain('# Elements: 0');

    const json = formatSnapshot(emptySnapshot, { format: 'json' });
    const parsed = JSON.parse(json);
    expect(parsed.elements).toHaveLength(0);
  });

  it('应该处理只有必需字段的元素', () => {
    const minimalSnapshot: PageSnapshot = {
      path: 'pages/minimal/minimal',
      elements: [
        {
          uid: 'view.simple',
          tagName: 'view',
        },
      ],
    };

    const result = formatSnapshot(minimalSnapshot, { format: 'compact' });

    expect(result).toContain('uid=view.simple view');
    expect(result).not.toContain('pos=[');
    expect(result).not.toContain('"'); // 无文本内容
  });

  it('应该处理特殊页面路径', () => {
    const specialPathSnapshot: PageSnapshot = {
      path: 'pages/nested/sub/deep/index',
      elements: [
        {
          uid: 'view.test',
          tagName: 'view',
        },
      ],
    };

    const result = formatSnapshot(specialPathSnapshot, { format: 'compact' });

    expect(result).toContain('# Page: pages/nested/sub/deep/index');
  });
});
