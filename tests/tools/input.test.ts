/**
 * input.ts 新功能测试
 * 测试输入交互工具的新增功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock tools.js 中的输入函数
vi.mock('../../src/tools.js', () => ({
  clickElement: vi.fn(),
  inputText: vi.fn(),
  getElementValue: vi.fn(),
  setFormControl: vi.fn()
}))

// 导入被测试的工具
import {
  clickTool,
  inputTextTool,
  getValueTool,
  setFormControlTool
} from '../../src/tools/input.js'

// 导入mock的函数用于验证
import {
  clickElement,
  inputText,
  getElementValue,
  setFormControl
} from '../../src/tools.js'

describe('input.ts 新功能测试', () => {
  // 创建 mock 元素对象
  const createMockElement = () => ({
    tap: vi.fn().mockResolvedValue(undefined),
    input: vi.fn().mockResolvedValue(undefined),
    value: '',
    trigger: vi.fn().mockResolvedValue(undefined),
  });

  // 创建测试用的上下文对象
  const mockContext = {
    currentPage: {
      path: '/pages/test/test',
      $$: async (selector: string) => {
        // 根据选择器返回 mock 元素数组
        return [createMockElement()];
      }
    },
    elementMap: new Map([
      ['input-1', { selector: 'input[type="text"]', index: 0 }],
      ['picker-1', { selector: 'picker[data-test="select"]', index: 0 }],
      ['switch-1', { selector: 'switch[data-test="toggle"]', index: 0 }],
      ['slider-1', { selector: 'slider[data-test="range"]', index: 0 }],
      ['button-1', { selector: 'button[data-test="submit"]', index: 0 }]
    ]),
    miniProgram: {},
    consoleStorage: {
      consoleMessages: [],
      exceptionMessages: [],
      isMonitoring: false,
      startTime: null
    },
    networkStorage: {
      requests: [],
      isMonitoring: false,
      startTime: null,
      originalMethods: {}
    },
    // 实现 getElementByUid 方法
    getElementByUid: async (uid: string) => {
      const mapInfo = mockContext.elementMap.get(uid);
      if (!mapInfo) {
        throw new Error(`找不到 UID: ${uid}`);
      }
      const elements = await mockContext.currentPage.$$(mapInfo.selector);
      return elements[mapInfo.index];
    }
  } as any

  // 创建测试用的请求和响应对象
  const createMockRequest = (params: any) => ({ params })
  const createMockResponse = () => {
    const lines: string[] = []
    return {
      appendResponseLine: vi.fn((line: string) => lines.push(line)),
      setIncludeSnapshot: vi.fn(),
      getLines: () => lines
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getValueTool - 获取元素值（新功能）', () => {
    it('应该成功获取元素的默认值', async () => {
      const request = createMockRequest({
        uid: 'input-1'
      })
      const response = createMockResponse()

      vi.mocked(getElementValue).mockResolvedValue('测试内容')

      await getValueTool.handler(request, response, mockContext)

      expect(getElementValue).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'input-1', attribute: undefined }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('获取元素值成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('UID: input-1')
      expect(response.appendResponseLine).toHaveBeenCalledWith('值: 测试内容')
    })

    it('应该成功获取元素的指定属性', async () => {
      const request = createMockRequest({
        uid: 'input-1',
        attribute: 'placeholder'
      })
      const response = createMockResponse()

      vi.mocked(getElementValue).mockResolvedValue('请输入内容')

      await getValueTool.handler(request, response, mockContext)

      expect(getElementValue).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'input-1', attribute: 'placeholder' }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('属性: placeholder')
      expect(response.appendResponseLine).toHaveBeenCalledWith('值: 请输入内容')
    })

    it('应该要求currentPage存在', async () => {
      const request = createMockRequest({
        uid: 'input-1'
      })
      const response = createMockResponse()
      const contextWithoutPage = { ...mockContext, currentPage: null }

      await expect(getValueTool.handler(request, response, contextWithoutPage))
        .rejects.toThrow('请先获取当前页面')
    })

    it('应该处理获取值失败', async () => {
      const request = createMockRequest({
        uid: 'input-1'
      })
      const response = createMockResponse()

      vi.mocked(getElementValue).mockRejectedValue(new Error('元素不存在'))

      await expect(getValueTool.handler(request, response, mockContext))
        .rejects.toThrow('元素不存在')

      expect(response.appendResponseLine).toHaveBeenCalledWith('获取元素值失败: 元素不存在')
    })

    it('应该处理空值和特殊值', async () => {
      const testCases = [
        { value: '', description: '空字符串' },
        { value: 0, description: '数字0' },
        { value: false, description: '布尔false' },
        { value: null, description: 'null值' }
      ]

      for (const { value, description } of testCases) {
        vi.clearAllMocks()
        const request = createMockRequest({ uid: 'input-1' })
        const response = createMockResponse()

        vi.mocked(getElementValue).mockResolvedValue(value)

        await getValueTool.handler(request, response, mockContext)

        expect(response.appendResponseLine).toHaveBeenCalledWith(`值: ${value}`)
      }
    })
  })

  describe('setFormControlTool - 设置表单控件（新功能）', () => {
    it('应该成功设置表单控件值', async () => {
      const request = createMockRequest({
        uid: 'picker-1',
        value: 2,
        trigger: 'change'
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      await setFormControlTool.handler(request, response, mockContext)

      expect(setFormControl).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'picker-1', value: 2, trigger: 'change' }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('设置表单控件成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('UID: picker-1')
      expect(response.appendResponseLine).toHaveBeenCalledWith('值: 2')
      expect(response.appendResponseLine).toHaveBeenCalledWith('事件: change')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })

    it('应该使用默认trigger值', async () => {
      const request = createMockRequest({
        uid: 'picker-1',
        value: 'option1'
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      await setFormControlTool.handler(request, response, mockContext)

      expect(setFormControl).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'picker-1', value: 'option1', trigger: undefined }
      )
    })

    it('应该支持复杂值类型', async () => {
      const complexValue = { selected: [0, 1], text: ['选项1', '选项2'] }
      const request = createMockRequest({
        uid: 'picker-1',
        value: complexValue,
        trigger: 'columnchange'
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      await setFormControlTool.handler(request, response, mockContext)

      expect(setFormControl).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'picker-1', value: complexValue, trigger: 'columnchange' }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith(`值: ${JSON.stringify(complexValue)}`)
    })

    it('应该处理设置失败', async () => {
      const request = createMockRequest({
        uid: 'picker-1',
        value: 999
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockRejectedValue(new Error('选项不存在'))

      await expect(setFormControlTool.handler(request, response, mockContext))
        .rejects.toThrow('选项不存在')

      expect(response.appendResponseLine).toHaveBeenCalledWith('设置表单控件失败: 选项不存在')
    })
  })

  describe('已有功能测试（确保兼容性）', () => {
    it('clickTool应该继续正常工作', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        dblClick: false
      })
      const response = createMockResponse()

      await clickTool.handler(request, response, mockContext)

      // 验证响应内容
      expect(response.appendResponseLine).toHaveBeenCalledWith('点击元素成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('UID: button-1')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })

    it('inputTextTool应该继续正常工作', async () => {
      const request = createMockRequest({
        uid: 'input-1',
        text: '测试文本',
        clear: false,
        append: false
      })
      const response = createMockResponse()

      await inputTextTool.handler(request, response, mockContext)

      // 验证响应内容
      expect(response.appendResponseLine).toHaveBeenCalledWith('输入文本成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('UID: input-1')
      expect(response.appendResponseLine).toHaveBeenCalledWith('内容: 测试文本')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })
  })

  describe('错误处理测试', () => {
    it('应该在所有工具中验证currentPage存在', async () => {
      const contextWithoutPage = { ...mockContext, currentPage: null }
      const response = createMockResponse()

      const tools = [
        { tool: getValueTool, params: { uid: 'input-1' } },
        { tool: setFormControlTool, params: { uid: 'picker-1', value: 1 } }
      ]

      for (const { tool, params } of tools) {
        const request = createMockRequest(params)
        await expect(tool.handler(request, response, contextWithoutPage))
          .rejects.toThrow('请先获取当前页面')
      }
    })

    it('应该处理非Error类型的异常', async () => {
      const request = createMockRequest({
        uid: 'input-1'
      })
      const response = createMockResponse()

      vi.mocked(getElementValue).mockRejectedValue('字符串错误')

      await expect(getValueTool.handler(request, response, mockContext))
        .rejects.toThrow('字符串错误')

      expect(response.appendResponseLine).toHaveBeenCalledWith('获取元素值失败: 字符串错误')
    })

    it('应该处理setIncludeSnapshot调用', async () => {
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      const request = createMockRequest({ uid: 'picker-1', value: 1 })
      await setFormControlTool.handler(request, response, mockContext)

      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })
  })

  describe('参数类型验证', () => {
    it('应该正确处理数字、字符串和数组类型的表单控件值', async () => {
      const testCases = [
        { value: 0, type: 'number' },
        { value: 'option1', type: 'string' },
        { value: [0, 1, 2], type: 'array' }
      ]

      for (const { value, type } of testCases) {
        vi.clearAllMocks()
        const request = createMockRequest({
          uid: 'picker-1',
          value: value
        })
        const response = createMockResponse()

        vi.mocked(setFormControl).mockResolvedValue(undefined)

        await setFormControlTool.handler(request, response, mockContext)

        expect(setFormControl).toHaveBeenCalledWith(
          mockContext.currentPage,
          mockContext.elementMap,
          { uid: 'picker-1', value: value, trigger: undefined }
        )
      }
    })
  })
})