/**
 * assert.ts 工具测试
 * 测试断言验证工具的各种场景
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock tools.js 中的断言函数
vi.mock('../../src/tools.js', () => ({
  assertElementVisible: vi.fn(),
  assertElementText: vi.fn(),
  assertElementAttribute: vi.fn()
}))

// 导入被测试的工具
import {
  assertTextTool,
  assertAttributeTool,
  assertStateTool
} from '../../src/tools/assert.js'

// 导入mock的函数用于验证
import {
  assertElementVisible,
  assertElementText,
  assertElementAttribute
} from '../../src/tools.js'

describe('assert.ts 工具测试', () => {
  const mockElement = {
    attribute: vi.fn(async (_name: string) => null),
  };

  // 创建测试用的上下文对象
  const mockContext = {
    currentPage: {
      path: '/pages/test/test'
    },
    elementMap: new Map([
      ['button-1', 'button[data-test="submit"]'],
      ['input-1', 'input[type="text"]']
    ]),
    miniProgram: {},
    getElementByUid: vi.fn(async () => mockElement),
  } as any

  // 创建测试用的请求和响应对象
  const createMockRequest = (params: any) => ({ params })
  const createMockResponse = () => {
    const lines: string[] = []
    return {
      appendResponseLine: vi.fn((line: string) => lines.push(line)),
      setIncludeSnapshot: vi.fn(),
      getLines: () => lines,
      getResponseText: () => lines.join('\n'),
    }
  }

  // 成功的断言结果
  const successResult = {
    passed: true,
    message: '断言通过',
    expected: '元素存在',
    actual: '元素存在',
    timestamp: Date.now()
  }

  // 失败的断言结果
  const failureResult = {
    passed: false,
    message: '断言失败',
    expected: '元素存在',
    actual: '元素不存在',
    timestamp: Date.now()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.getElementByUid.mockResolvedValue(mockElement)
    mockElement.attribute.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('assertTextTool - 断言元素文本内容', () => {
    it('应该成功断言精确文本匹配', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        text: '提交'
      })
      const response = createMockResponse()

      vi.mocked(assertElementText).mockResolvedValue(successResult)

      await assertTextTool.handler(request, response, mockContext)

      expect(assertElementText).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'button-1', text: '提交', textContains: undefined, textMatches: undefined }
      )
    })

    it('应该成功断言包含文本', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        textContains: '提交'
      })
      const response = createMockResponse()

      vi.mocked(assertElementText).mockResolvedValue(successResult)

      await assertTextTool.handler(request, response, mockContext)

      expect(assertElementText).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'button-1', text: undefined, textContains: '提交', textMatches: undefined }
      )
    })

    it('应该成功断言正则表达式匹配', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        textMatches: '^提交.*$'
      })
      const response = createMockResponse()

      vi.mocked(assertElementText).mockResolvedValue(successResult)

      await assertTextTool.handler(request, response, mockContext)

      expect(assertElementText).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'button-1', text: undefined, textContains: undefined, textMatches: '^提交.*$' }
      )
    })

    it('应该要求至少一个文本参数', async () => {
      const request = createMockRequest({
        uid: 'button-1'
      })
      const response = createMockResponse()

      await expect(assertTextTool.handler(request, response, mockContext))
        .rejects.toThrow('必须指定text、textContains或textMatches参数之一')
    })

    it('应该处理文本断言失败', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        text: '预期文本'
      })
      const response = createMockResponse()

      vi.mocked(assertElementText).mockResolvedValue(failureResult)

      await expect(assertTextTool.handler(request, response, mockContext))
        .rejects.toThrow('断言失败: 断言失败')
    })
  })

  describe('assertAttributeTool - 断言元素属性', () => {
    it('应该成功断言元素属性值', async () => {
      const request = createMockRequest({
        uid: 'input-1',
        attributeKey: 'placeholder',
        attributeValue: '请输入内容'
      })
      const response = createMockResponse()

      vi.mocked(assertElementAttribute).mockResolvedValue(successResult)

      await assertAttributeTool.handler(request, response, mockContext)

      expect(assertElementAttribute).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        {
          uid: 'input-1',
          attribute: {
            key: 'placeholder',
            value: '请输入内容'
          }
        }
      )
    })

    it('应该处理属性断言失败', async () => {
      const request = createMockRequest({
        uid: 'input-1',
        attributeKey: 'value',
        attributeValue: '预期值'
      })
      const response = createMockResponse()

      vi.mocked(assertElementAttribute).mockResolvedValue(failureResult)

      await expect(assertAttributeTool.handler(request, response, mockContext))
        .rejects.toThrow('断言失败: 断言失败')
    })
  })

  describe('assertStateTool - 断言元素状态（通用）', () => {
    it('应该成功断言可见性状态', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        visible: true
      })
      const response = createMockResponse()

      vi.mocked(assertElementVisible).mockResolvedValue(successResult)

      await assertStateTool.handler(request, response, mockContext)

      expect(assertElementVisible).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'button-1', visible: true }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('断言结果: 全部通过')
      expect(response.appendResponseLine).toHaveBeenCalledWith('检查项数: 1')
      expect(response.appendResponseLine).toHaveBeenCalledWith('通过项数: 1')
      expect(response.appendResponseLine).toHaveBeenCalledWith('失败项数: 0')
    })

    it('应该支持 enabled 状态断言', async () => {
      const request = createMockRequest({ uid: 'button-1', enabled: true })
      const response = createMockResponse()
      mockElement.attribute.mockImplementation(async (name: string) => {
        if (name === 'disabled') {
          return null
        }
        return null
      })

      await assertStateTool.handler(request, response, mockContext)

      expect(mockContext.getElementByUid).toHaveBeenCalledWith('button-1')
      expect(mockElement.attribute).toHaveBeenCalledWith('disabled')
      expect(response.getResponseText()).toContain('断言结果: 全部通过')
    })

    it('应该支持 checked 状态断言', async () => {
      const request = createMockRequest({ uid: 'button-1', checked: true })
      const response = createMockResponse()
      mockElement.attribute.mockImplementation(async (name: string) => {
        if (name === 'checked') {
          return 'true'
        }
        return null
      })

      await assertStateTool.handler(request, response, mockContext)

      expect(mockElement.attribute).toHaveBeenCalledWith('checked')
      expect(response.getResponseText()).toContain('断言结果: 全部通过')
    })

    it('应该支持 focused 状态断言（focus）', async () => {
      const request = createMockRequest({ uid: 'button-1', focused: true })
      const response = createMockResponse()
      mockElement.attribute.mockImplementation(async (name: string) => {
        if (name === 'focus') {
          return 'true'
        }
        return null
      })

      await assertStateTool.handler(request, response, mockContext)

      expect(mockElement.attribute).toHaveBeenCalledWith('focus')
      expect(response.getResponseText()).toContain('断言结果: 全部通过')
    })

    it('应该支持 focused 状态断言（focused 回退）', async () => {
      const request = createMockRequest({ uid: 'button-1', focused: true })
      const response = createMockResponse()
      mockElement.attribute.mockImplementation(async (name: string) => {
        if (name === 'focus') {
          return null
        }
        if (name === 'focused') {
          return 'true'
        }
        return null
      })

      await assertStateTool.handler(request, response, mockContext)

      expect(mockElement.attribute).toHaveBeenCalledWith('focus')
      expect(mockElement.attribute).toHaveBeenCalledWith('focused')
      expect(response.getResponseText()).toContain('断言结果: 全部通过')
    })

    it('应该处理部分断言失败', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        visible: true
      })
      const response = createMockResponse()

      vi.mocked(assertElementVisible).mockResolvedValue(failureResult)

      await expect(assertStateTool.handler(request, response, mockContext))
        .rejects.toThrow('状态断言失败: 1/1 项失败')

      expect(response.appendResponseLine).toHaveBeenCalledWith('断言结果: 部分失败')
      expect(response.appendResponseLine).toHaveBeenCalledWith('失败详情:')
      expect(response.appendResponseLine).toHaveBeenCalledWith('1. [visible] 断言失败')
    })

    it('应该要求至少一个状态参数', async () => {
      const request = createMockRequest({
        uid: 'button-1'
      })
      const response = createMockResponse()

      await expect(assertStateTool.handler(request, response, mockContext))
        .rejects.toThrow('必须指定至少一个状态参数')
    })

    it('应该处理多个状态断言', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        visible: true,
        enabled: true,
      })
      const response = createMockResponse()

      vi.mocked(assertElementVisible).mockResolvedValue(successResult)
      mockElement.attribute.mockImplementation(async (name: string) => {
        if (name === 'disabled') {
          return null
        }
        return null
      })

      await assertStateTool.handler(request, response, mockContext)

      expect(response.appendResponseLine).toHaveBeenCalledWith('检查项数: 2')
    })
  })

  describe('错误处理测试', () => {
    it('应该处理非Error类型的异常', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        text: '测试'
      })
      const response = createMockResponse()

      vi.mocked(assertElementText).mockRejectedValue('字符串错误')

      await expect(assertTextTool.handler(request, response, mockContext))
        .rejects.toThrow('字符串错误')

      expect(response.appendResponseLine).toHaveBeenCalledWith('断言执行失败: 字符串错误')
    })

    it('应该在所有工具中验证currentPage存在', async () => {
      const contextWithoutPage = { ...mockContext, currentPage: null }
      const response = createMockResponse()

      const tools = [
        { tool: assertTextTool, params: { uid: 'test', text: 'test' } },
        { tool: assertAttributeTool, params: { uid: 'test', attributeKey: 'test', attributeValue: 'test' } },
        { tool: assertStateTool, params: { uid: 'test', visible: true } }
      ]

      for (const { tool, params } of tools) {
        const request = createMockRequest(params)
        await expect(tool.handler(request, response, contextWithoutPage))
          .rejects.toThrow('请先获取当前页面')
      }
    })
  })

})
