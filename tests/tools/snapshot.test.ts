/**
 * 快照工具单元测试
 * 测试 getPageSnapshotTool handler 的业务逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SimpleToolResponse } from '../../src/tools/ToolDefinition.js';
import type { ToolContext } from '../../src/tools/ToolDefinition.js';
import { getPageSnapshotTool } from '../../src/tools/snapshot.js';

// Mock 快照获取函数
vi.mock('../../src/tools.js', async () => {
  const actual = await vi.importActual('../../src/tools.js');
  return {
    ...actual,
    getPageSnapshot: vi.fn().mockResolvedValue({
      snapshot: {
        path: 'pages/test/test',
        elements: [
          {
            uid: 'view.container',
            tagName: 'view',
            text: 'Test View',
            position: { left: 0, top: 0, width: 375, height: 667 }
          },
          {
            uid: 'button.submit',
            tagName: 'button',
            text: 'Submit',
            position: { left: 100, top: 400, width: 175, height: 44 }
          }
        ]
      },
      elementMap: new Map([
        ['view.container', { selector: 'view.container', index: 0 }],
        ['button.submit', { selector: 'button.submit', index: 0 }]
      ])
    })
  };
});

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

describe('getPageSnapshotTool', () => {
  let context: ToolContext;
  let response: SimpleToolResponse;

  beforeEach(() => {
    // 创建 mock context
    context = {
      miniProgram: {} as any,
      currentPage: {} as any,
      elementMap: new Map(),
      consoleStorage: {
        isMonitoring: false,
        messages: []
      },
      networkStorage: {
        isMonitoring: false,
        requests: [],
        originalMethods: new Map()
      }
    };

    response = new SimpleToolResponse();
  });

  describe('基本功能', () => {
    it('应该成功获取页面快照（默认compact格式）', async () => {
      await getPageSnapshotTool.handler(
        { params: { format: 'compact' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('📊 页面快照获取成功');
      expect(responseText).toContain('pages/test/test');
      expect(responseText).toContain('元素数量: 2');
      expect(responseText).toContain('输出格式: compact');
      expect(responseText).toMatch(/uid=view\.container/);
      expect(responseText).toMatch(/uid=button\.submit/);

      // 验证 elementMap 已更新
      expect(context.elementMap.size).toBe(2);
      expect(context.elementMap.has('view.container')).toBe(true);
      expect(context.elementMap.has('button.submit')).toBe(true);
    });

    it('应该在没有当前页面时抛出错误', async () => {
      context.currentPage = null as any;

      await expect(
        getPageSnapshotTool.handler({ params: {} }, response, context)
      ).rejects.toThrow('请先获取当前页面');
    });
  });

  describe('格式选项', () => {
    it('应该支持 compact 格式', async () => {
      await getPageSnapshotTool.handler(
        { params: { format: 'compact' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('输出格式: compact');
      expect(responseText).toMatch(/uid=\w+/);
      expect(responseText).toMatch(/pos=\[/); // 默认包含位置信息
    });

    it('应该支持 minimal 格式', async () => {
      await getPageSnapshotTool.handler(
        { params: { format: 'minimal' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('输出格式: minimal');
      expect(responseText).toMatch(/view\.container view/);
      expect(responseText).not.toMatch(/pos=\[/); // minimal格式不包含位置
    });

    it('应该支持 json 格式', async () => {
      await getPageSnapshotTool.handler(
        { params: { format: 'json' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('输出格式: json');

      // 提取JSON内容并验证
      const jsonMatch = responseText.match(/\{[\s\S]*"path"[\s\S]*"elements"[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        expect(parsed.path).toBe('pages/test/test');
        expect(parsed.elements).toHaveLength(2);
      }
    });
  });

  describe('高级选项', () => {
    it('应该支持不包含位置信息', async () => {
      await getPageSnapshotTool.handler(
        { params: { format: 'compact', includePosition: false } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).not.toMatch(/pos=\[/);
      expect(responseText).not.toMatch(/size=\[/);
    });

    it('应该支持包含属性信息', async () => {
      // 修改 mock 数据包含属性
      const { getPageSnapshot } = await import('../../src/tools.js');
      vi.mocked(getPageSnapshot).mockResolvedValueOnce({
        snapshot: {
          path: 'pages/test/test',
          elements: [
            {
              uid: 'button.submit',
              tagName: 'button',
              text: 'Submit',
              attributes: {
                class: 'btn primary',
                type: 'submit'
              },
              position: { left: 100, top: 400, width: 175, height: 44 }
            }
          ]
        },
        elementMap: new Map([
          ['button.submit', { selector: 'button.submit', index: 0 }]
        ])
      });

      await getPageSnapshotTool.handler(
        { params: { format: 'compact', includeAttributes: true } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toMatch(/class="btn primary"/);
      expect(responseText).toMatch(/type="submit"/);
    });

    it('应该支持限制元素数量', async () => {
      await getPageSnapshotTool.handler(
        { params: { format: 'compact', maxElements: 1 } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('元素数量: 1');
      expect(responseText).toMatch(/uid=view\.container/);
      expect(responseText).not.toMatch(/uid=button\.submit/);
    });

    it('应该支持保存到文件', async () => {
      const filePath = '/tmp/test-snapshot.txt';

      await getPageSnapshotTool.handler(
        { params: { format: 'compact', filePath } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('✅ 页面快照已保存到');
      expect(responseText).toContain(filePath);
      expect(responseText).not.toContain('Token估算'); // 文件模式不显示token估算
    });
  });

  describe('Token 估算', () => {
    it('应该显示 token 估算信息（非文件模式）', async () => {
      await getPageSnapshotTool.handler(
        { params: { format: 'compact' } },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toMatch(/Token估算: ~\d+ tokens/);
    });

    it('应该针对不同格式显示对应的 token 估算', async () => {
      // compact
      await getPageSnapshotTool.handler(
        { params: { format: 'compact' } },
        response,
        context
      );
      const compactText = response.getResponseText();
      const compactTokens = compactText.match(/Token估算: ~(\d+) tokens/)?.[1];
      expect(compactTokens).toBeDefined();

      // minimal
      response = new SimpleToolResponse();
      await getPageSnapshotTool.handler(
        { params: { format: 'minimal' } },
        response,
        context
      );
      const minimalText = response.getResponseText();
      const minimalTokens = minimalText.match(/Token估算: ~(\d+) tokens/)?.[1];
      expect(minimalTokens).toBeDefined();

      // json
      response = new SimpleToolResponse();
      await getPageSnapshotTool.handler(
        { params: { format: 'json' } },
        response,
        context
      );
      const jsonText = response.getResponseText();
      const jsonTokens = jsonText.match(/Token估算: ~(\d+) tokens/)?.[1];
      expect(jsonTokens).toBeDefined();

      // 验证：minimal < compact < json
      expect(Number(minimalTokens)).toBeLessThan(Number(compactTokens));
      expect(Number(compactTokens)).toBeLessThan(Number(jsonTokens));
    });
  });

  describe('错误处理', () => {
    it('应该处理快照获取失败', async () => {
      const { getPageSnapshot } = await import('../../src/tools.js');
      vi.mocked(getPageSnapshot).mockRejectedValueOnce(
        new Error('模拟快照获取失败')
      );

      await expect(
        getPageSnapshotTool.handler({ params: {} }, response, context)
      ).rejects.toThrow('模拟快照获取失败');

      const responseText = response.getResponseText();
      expect(responseText).toContain('❌ 获取页面快照失败');
    });
  });

  describe('elementMap 更新', () => {
    it('应该清空之前的 elementMap', async () => {
      // 预先添加一些旧的映射
      context.elementMap.set('old.element', { selector: 'old', index: 0 });
      expect(context.elementMap.size).toBe(1);

      await getPageSnapshotTool.handler(
        { params: {} },
        response,
        context
      );

      // 旧的映射应该被清除
      expect(context.elementMap.has('old.element')).toBe(false);
      // 新的映射应该存在
      expect(context.elementMap.has('view.container')).toBe(true);
      expect(context.elementMap.size).toBe(2);
    });

    it('应该正确同步 elementMap', async () => {
      await getPageSnapshotTool.handler(
        { params: {} },
        response,
        context
      );

      const viewInfo = context.elementMap.get('view.container');
      expect(viewInfo).toBeDefined();
      expect(viewInfo?.selector).toBe('view.container');
      expect(viewInfo?.index).toBe(0);

      const buttonInfo = context.elementMap.get('button.submit');
      expect(buttonInfo).toBeDefined();
      expect(buttonInfo?.selector).toBe('button.submit');
      expect(buttonInfo?.index).toBe(0);
    });
  });

  describe('边界条件', () => {
    it('应该处理空页面（无元素）', async () => {
      const { getPageSnapshot } = await import('../../src/tools.js');
      vi.mocked(getPageSnapshot).mockResolvedValueOnce({
        snapshot: {
          path: 'pages/empty/empty',
          elements: []
        },
        elementMap: new Map()
      });

      await getPageSnapshotTool.handler(
        { params: {} },
        response,
        context
      );

      const responseText = response.getResponseText();
      expect(responseText).toContain('元素数量: 0');
      expect(context.elementMap.size).toBe(0);
    });
  });
});
