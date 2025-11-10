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

// 导入被测试的工具（包括新增功能）
import {
  clickTool,
  inputTextTool,
  getValueTool,
  setFormControlTool,
  selectPickerTool,
  toggleSwitchTool,
  setSliderTool
} from '../../src/tools/input.js'

// 导入mock的函数用于验证
import {
  clickElement,
  inputText,
  getElementValue,
  setFormControl
} from '../../src/tools.js'

describe('input.ts 新功能测试', () => {
  // 创建测试用的上下文对象
  const mockContext = {
    currentPage: {
      path: '/pages/test/test'
    },
    elementMap: new Map([
      ['input-1', 'input[type="text"]'],
      ['picker-1', 'picker[data-test="select"]'],
      ['switch-1', 'switch[data-test="toggle"]'],
      ['slider-1', 'slider[data-test="range"]'],
      ['button-1', 'button[data-test="submit"]']
    ]),
    miniProgram: {}
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

  describe('selectPickerTool - 选择picker选项（新功能）', () => {
    it('应该成功选择picker选项（数字索引）', async () => {
      const request = createMockRequest({
        uid: 'picker-1',
        value: 2
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      await selectPickerTool.handler(request, response, mockContext)

      expect(setFormControl).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'picker-1', value: 2, trigger: 'change' }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('选择picker选项成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('UID: picker-1')
      expect(response.appendResponseLine).toHaveBeenCalledWith('选项: 2')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })

    it('应该成功选择picker选项（字符串文本）', async () => {
      const request = createMockRequest({
        uid: 'picker-1',
        value: '选项二'
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      await selectPickerTool.handler(request, response, mockContext)

      expect(setFormControl).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'picker-1', value: '选项二', trigger: 'change' }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('选项: "选项二"')
    })

    it('应该成功选择picker选项（多选数组）', async () => {
      const multiSelectValue = [1, 3, 5]
      const request = createMockRequest({
        uid: 'picker-1',
        value: multiSelectValue
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      await selectPickerTool.handler(request, response, mockContext)

      expect(setFormControl).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'picker-1', value: multiSelectValue, trigger: 'change' }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith(`选项: ${JSON.stringify(multiSelectValue)}`)
    })

    it('应该处理picker选择失败', async () => {
      const request = createMockRequest({
        uid: 'picker-1',
        value: 999
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockRejectedValue(new Error('选项索引超出范围'))

      await expect(selectPickerTool.handler(request, response, mockContext))
        .rejects.toThrow('选项索引超出范围')

      expect(response.appendResponseLine).toHaveBeenCalledWith('选择picker选项失败: 选项索引超出范围')
    })
  })

  describe('toggleSwitchTool - 切换开关状态（新功能）', () => {
    it('应该成功开启开关', async () => {
      const request = createMockRequest({
        uid: 'switch-1',
        checked: true
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      await toggleSwitchTool.handler(request, response, mockContext)

      expect(setFormControl).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'switch-1', value: true, trigger: 'change' }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('切换开关状态成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('UID: switch-1')
      expect(response.appendResponseLine).toHaveBeenCalledWith('状态: 开启')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })

    it('应该成功关闭开关', async () => {
      const request = createMockRequest({
        uid: 'switch-1',
        checked: false
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      await toggleSwitchTool.handler(request, response, mockContext)

      expect(setFormControl).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'switch-1', value: false, trigger: 'change' }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('状态: 关闭')
    })

    it('应该处理开关切换失败', async () => {
      const request = createMockRequest({
        uid: 'switch-1',
        checked: true
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockRejectedValue(new Error('开关被禁用'))

      await expect(toggleSwitchTool.handler(request, response, mockContext))
        .rejects.toThrow('开关被禁用')

      expect(response.appendResponseLine).toHaveBeenCalledWith('切换开关状态失败: 开关被禁用')
    })
  })

  describe('setSliderTool - 设置滑块值（新功能）', () => {
    it('应该成功设置滑块值', async () => {
      const request = createMockRequest({
        uid: 'slider-1',
        value: 75
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockResolvedValue(undefined)

      await setSliderTool.handler(request, response, mockContext)

      expect(setFormControl).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'slider-1', value: 75, trigger: 'change' }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('设置滑块值成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('UID: slider-1')
      expect(response.appendResponseLine).toHaveBeenCalledWith('值: 75')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })

    it('应该支持边界值', async () => {
      const testCases = [
        { value: 0, description: '最小值' },
        { value: 100, description: '最大值' },
        { value: 50.5, description: '小数值' }
      ]

      for (const { value, description } of testCases) {
        vi.clearAllMocks()
        const request = createMockRequest({
          uid: 'slider-1',
          value: value
        })
        const response = createMockResponse()

        vi.mocked(setFormControl).mockResolvedValue(undefined)

        await setSliderTool.handler(request, response, mockContext)

        expect(setFormControl).toHaveBeenCalledWith(
          mockContext.currentPage,
          mockContext.elementMap,
          { uid: 'slider-1', value: value, trigger: 'change' }
        )

        expect(response.appendResponseLine).toHaveBeenCalledWith(`值: ${value}`)
      }
    })

    it('应该处理滑块设置失败', async () => {
      const request = createMockRequest({
        uid: 'slider-1',
        value: 150
      })
      const response = createMockResponse()

      vi.mocked(setFormControl).mockRejectedValue(new Error('值超出范围'))

      await expect(setSliderTool.handler(request, response, mockContext))
        .rejects.toThrow('值超出范围')

      expect(response.appendResponseLine).toHaveBeenCalledWith('设置滑块值失败: 值超出范围')
    })
  })

  describe('已有功能测试（确保兼容性）', () => {
    it('clickTool应该继续正常工作', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        dblClick: false
      })
      const response = createMockResponse()

      vi.mocked(clickElement).mockResolvedValue(undefined)

      await clickTool.handler(request, response, mockContext)

      expect(clickElement).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'button-1', dblClick: false }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('点击元素成功')
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

      vi.mocked(inputText).mockResolvedValue(undefined)

      await inputTextTool.handler(request, response, mockContext)

      expect(inputText).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'input-1', text: '测试文本', clear: false, append: false }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('输入文本成功')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })
  })

  describe('错误处理测试', () => {
    it('应该在所有新工具中验证currentPage存在', async () => {
      const contextWithoutPage = { ...mockContext, currentPage: null }
      const response = createMockResponse()

      const newTools = [
        { tool: getValueTool, params: { uid: 'input-1' } },
        { tool: setFormControlTool, params: { uid: 'picker-1', value: 1 } },
        { tool: selectPickerTool, params: { uid: 'picker-1', value: 1 } },
        { tool: toggleSwitchTool, params: { uid: 'switch-1', checked: true } },
        { tool: setSliderTool, params: { uid: 'slider-1', value: 50 } }
      ]

      for (const { tool, params } of newTools) {
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
      const toolsWithSnapshot = [
        { tool: setFormControlTool, params: { uid: 'picker-1', value: 1 } },
        { tool: selectPickerTool, params: { uid: 'picker-1', value: 1 } },
        { tool: toggleSwitchTool, params: { uid: 'switch-1', checked: true } },
        { tool: setSliderTool, params: { uid: 'slider-1', value: 50 } }
      ]

      for (const { tool, params } of toolsWithSnapshot) {
        vi.clearAllMocks()
        vi.mocked(setFormControl).mockResolvedValue(undefined)

        const request = createMockRequest(params)
        await tool.handler(request, response, mockContext)

        expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
      }
    })
  })

  describe('参数类型验证', () => {
    it('应该正确处理数字、字符串和数组类型的picker值', async () => {
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

        await selectPickerTool.handler(request, response, mockContext)

        expect(setFormControl).toHaveBeenCalledWith(
          mockContext.currentPage,
          mockContext.elementMap,
          { uid: 'picker-1', value: value, trigger: 'change' }
        )
      }
    })

    it('应该正确处理布尔类型的switch值', async () => {
      const testCases = [true, false]

      for (const checked of testCases) {
        vi.clearAllMocks()
        const request = createMockRequest({
          uid: 'switch-1',
          checked: checked
        })
        const response = createMockResponse()

        vi.mocked(setFormControl).mockResolvedValue(undefined)

        await toggleSwitchTool.handler(request, response, mockContext)

        expect(setFormControl).toHaveBeenCalledWith(
          mockContext.currentPage,
          mockContext.elementMap,
          { uid: 'switch-1', value: checked, trigger: 'change' }
        )
      }
    })

    it('应该正确处理数字类型的slider值', async () => {
      const testCases = [0, 25, 50, 75, 100, 33.33]

      for (const value of testCases) {
        vi.clearAllMocks()
        const request = createMockRequest({
          uid: 'slider-1',
          value: value
        })
        const response = createMockResponse()

        vi.mocked(setFormControl).mockResolvedValue(undefined)

        await setSliderTool.handler(request, response, mockContext)

        expect(setFormControl).toHaveBeenCalledWith(
          mockContext.currentPage,
          mockContext.elementMap,
          { uid: 'slider-1', value: value, trigger: 'change' }
        )
      }
    })
  })
})