/**
 * $ 工具和 waitFor 工具的单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { queryElements, waitForCondition } from '../../src/tools.js';

describe('页面查询工具测试', () => {
  describe('queryElements 函数测试', () => {
    let mockPage: any;
    let mockElementMap: Map<string, string>;
    let mockElement: any;

    beforeEach(() => {
      mockElement = {
        tagName: 'view',
        text: vi.fn().mockResolvedValue('测试文本'),
        size: vi.fn().mockResolvedValue({ width: 100, height: 50 }),
        offset: vi.fn().mockResolvedValue({ left: 10, top: 20 }),
        attribute: vi.fn().mockImplementation((attr: string) => {
          if (attr === 'class') return Promise.resolve('test-class');
          if (attr === 'id') return Promise.resolve('test-id');
          return Promise.resolve(null);
        })
      };

      mockPage = {
        $$: vi.fn().mockResolvedValue([mockElement])
      };

      mockElementMap = new Map<string, string>();
    });

    it('应该验证选择器不能为空字符串', async () => {
      await expect(queryElements(mockPage, mockElementMap, { selector: '' }))
        .rejects.toThrow('选择器不能为空');
    });

    it('应该验证选择器不能为空格字符串', async () => {
      await expect(queryElements(mockPage, mockElementMap, { selector: '   ' }))
        .rejects.toThrow('选择器不能为空');
    });

    it('应该验证选择器不能为null', async () => {
      await expect(queryElements(mockPage, mockElementMap, { selector: null as any }))
        .rejects.toThrow('选择器不能为空');
    });

    it('应该验证选择器不能为undefined', async () => {
      await expect(queryElements(mockPage, mockElementMap, { selector: undefined as any }))
        .rejects.toThrow('选择器不能为空');
    });

    it('应该验证选择器必须是字符串类型', async () => {
      await expect(queryElements(mockPage, mockElementMap, { selector: 123 as any }))
        .rejects.toThrow('选择器不能为空');
    });

    it('应该验证页面对象是必需的', async () => {
      await expect(queryElements(null, mockElementMap, { selector: 'view' }))
        .rejects.toThrow('页面对象是必需的');
    });

    it('应该成功查询有效的选择器', async () => {
      const results = await queryElements(mockPage, mockElementMap, { selector: 'view.test' });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining({
        tagName: 'view',
        text: '测试文本',
        position: expect.objectContaining({
          left: 10,
          top: 20,
          width: 100,
          height: 50
        }),
        attributes: expect.objectContaining({
          class: 'test-class',
          id: 'test-id'
        })
      }));

      expect(mockPage.$$).toHaveBeenCalledWith('view.test');
    });

    it('应该处理没有找到元素的情况', async () => {
      mockPage.$$ = vi.fn().mockResolvedValue([]);

      const results = await queryElements(mockPage, mockElementMap, { selector: 'view.nonexistent' });

      expect(results).toHaveLength(0);
    });

    it('应该正确处理元素查询错误', async () => {
      mockPage.$$ = vi.fn().mockRejectedValue(new Error('查询失败'));

      await expect(queryElements(mockPage, mockElementMap, { selector: 'view' }))
        .rejects.toThrow('查询元素失败: 查询失败');
    });

    it('应该为查询到的元素生成UID并更新映射', async () => {
      const results = await queryElements(mockPage, mockElementMap, { selector: 'view.test' });

      expect(results).toHaveLength(1);
      expect(results[0].uid).toBeDefined();
      // UID 生成优先使用 ID 属性，mock 元素有 id='test-id'
      expect(results[0].uid).toBe('view#test-id');
      expect(mockElementMap.has(results[0].uid)).toBe(true);
    });

    it('应该处理多个元素查询结果', async () => {
      const mockElement2 = {
        ...mockElement,
        attribute: vi.fn().mockImplementation((attr: string) => {
          if (attr === 'class') return Promise.resolve('test-class-2');
          if (attr === 'id') return Promise.resolve('test-id-2');
          return Promise.resolve(null);
        })
      };
      mockPage.$$ = vi.fn().mockResolvedValue([mockElement, mockElement2]);

      const results = await queryElements(mockPage, mockElementMap, { selector: 'view' });

      expect(results).toHaveLength(2);
      expect(mockElementMap.size).toBe(2);

      // 验证每个元素都有唯一的UID（优先使用ID属性）
      expect(results[0].uid).toBe('view#test-id');
      expect(results[1].uid).toBe('view#test-id-2');
    });

    it('应该忽略元素属性获取错误', async () => {
      mockElement.attribute = vi.fn().mockRejectedValue(new Error('属性获取失败'));

      const results = await queryElements(mockPage, mockElementMap, { selector: 'view' });

      expect(results).toHaveLength(1);
      expect(results[0].attributes).toBeUndefined();
    });

    it('应该忽略元素位置获取错误', async () => {
      mockElement.size = vi.fn().mockRejectedValue(new Error('大小获取失败'));
      mockElement.offset = vi.fn().mockRejectedValue(new Error('位置获取失败'));

      const results = await queryElements(mockPage, mockElementMap, { selector: 'view' });

      expect(results).toHaveLength(1);
      expect(results[0].position).toBeUndefined();
    });

    it('应该忽略元素文本获取错误', async () => {
      mockElement.text = vi.fn().mockRejectedValue(new Error('文本获取失败'));

      const results = await queryElements(mockPage, mockElementMap, { selector: 'view' });

      expect(results).toHaveLength(1);
      expect(results[0].text).toBeUndefined();
    });
  });

  describe('waitForCondition 函数测试', () => {
    let mockPage: any;

    beforeEach(() => {
      mockPage = {
        $: vi.fn(),
        $$: vi.fn(),
        waitFor: vi.fn().mockResolvedValue(undefined)
      };
    });

    it('应该支持简单的时间等待', async () => {
      const result = await waitForCondition(mockPage, 1000);

      expect(result).toBe(true);
      expect(mockPage.waitFor).toHaveBeenCalledWith(1000);
    });

    it('应该支持选择器字符串等待', async () => {
      const mockElement = { text: vi.fn().mockResolvedValue('') };
      mockPage.$ = vi.fn().mockResolvedValue(mockElement);

      const result = await waitForCondition(mockPage, 'view.test');

      expect(result).toBe(true);
    });

    it('应该支持复杂的等待条件对象', async () => {
      const mockElement = {
        text: vi.fn().mockResolvedValue('测试文本'),
        size: vi.fn().mockResolvedValue({ width: 100, height: 50 })
      };
      mockPage.$ = vi.fn().mockResolvedValue(mockElement);

      const result = await waitForCondition(mockPage, {
        selector: 'view.test',
        text: '测试文本',
        timeout: 3000
      });

      expect(result).toBe(true);
    });

    it('应该在超时时抛出错误', async () => {
      mockPage.$ = vi.fn().mockResolvedValue(null);

      await expect(waitForCondition(mockPage, {
        selector: 'view.nonexistent',
        timeout: 100  // 短超时时间
      })).rejects.toThrow('等待条件失败');
    });

    it('应该支持可见性检查', async () => {
      const mockElement = {
        size: vi.fn().mockResolvedValue({ width: 100, height: 50 })
      };
      mockPage.$ = vi.fn().mockResolvedValue(mockElement);

      const result = await waitForCondition(mockPage, {
        selector: 'view.test',
        visible: true,
        timeout: 1000
      });

      expect(result).toBe(true);
    });

    it('应该支持元素消失等待', async () => {
      mockPage.$ = vi.fn().mockResolvedValue(null);

      const result = await waitForCondition(mockPage, {
        selector: 'view.test',
        disappear: true,
        timeout: 1000
      });

      expect(result).toBe(true);
    });
  });
});