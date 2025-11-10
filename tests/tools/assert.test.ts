/**
 * assert.ts 工具测试
 * 测试断言验证工具的各种场景
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock tools.js 中的断言函数
vi.mock('../../src/tools.js', () => ({
  assertElementExists: vi.fn(),
  assertElementVisible: vi.fn(),
  assertElementText: vi.fn(),
  assertElementAttribute: vi.fn()
}))

// 导入被测试的工具
import {
  assertExistsTool,
  assertVisibleTool,
  assertTextTool,
  assertAttributeTool,
  assertStateTool
} from '../../src/tools/assert.js'

// 导入mock的函数用于验证
import {
  assertElementExists,
  assertElementVisible,
  assertElementText,
  assertElementAttribute
} from '../../src/tools.js'

describe('assert.ts 工具测试', () => {
  // 创建测试用的上下文对象
  const mockContext = {
    currentPage: {
      path: '/pages/test/test'
    },
    elementMap: new Map([
      ['button-1', 'button[data-test="submit"]'],
      ['input-1', 'input[type="text"]']
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
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('assertExistsTool - 断言元素存在', () => {
    it('应该成功断言元素存在（使用selector）', async () => {
      const request = createMockRequest({
        selector: 'button[data-test="submit"]',
        shouldExist: true,
        timeout: 5000
      })
      const response = createMockResponse()

      vi.mocked(assertElementExists).mockResolvedValue(successResult)

      await assertExistsTool.handler(request, response, mockContext)

      expect(assertElementExists).toHaveBeenCalledWith(mockContext.currentPage, {
        selector: 'button[data-test="submit"]',
        uid: undefined,
        shouldExist: true,
        timeout: 5000
      })

      expect(response.appendResponseLine).toHaveBeenCalledWith('断言结果: 通过')
      expect(response.appendResponseLine).toHaveBeenCalledWith('消息: 断言通过')
    })

    it('应该成功断言元素存在（使用uid）', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        shouldExist: true
      })
      const response = createMockResponse()

      vi.mocked(assertElementExists).mockResolvedValue(successResult)

      await assertExistsTool.handler(request, response, mockContext)

      expect(assertElementExists).toHaveBeenCalledWith(mockContext.currentPage, {
        selector: undefined,
        uid: 'button-1',
        shouldExist: true,
        timeout: undefined
      })
    })

    it('应该处理断言失败的情况', async () => {
      const request = createMockRequest({
        selector: 'button[data-test="missing"]',
        shouldExist: true
      })
      const response = createMockResponse()

      vi.mocked(assertElementExists).mockResolvedValue(failureResult)

      await expect(assertExistsTool.handler(request, response, mockContext))
        .rejects.toThrow('断言失败: 断言失败')

      expect(response.appendResponseLine).toHaveBeenCalledWith('断言结果: 失败')
    })

    it('应该要求selector或uid参数', async () => {
      const request = createMockRequest({
        shouldExist: true
      })
      const response = createMockResponse()

      await expect(assertExistsTool.handler(request, response, mockContext))
        .rejects.toThrow('必须提供selector或uid参数')
    })

    it('应该要求currentPage存在', async () => {
      const request = createMockRequest({
        selector: 'button',
        shouldExist: true
      })
      const response = createMockResponse()
      const contextWithoutPage = { ...mockContext, currentPage: null }

      await expect(assertExistsTool.handler(request, response, contextWithoutPage))
        .rejects.toThrow('请先获取当前页面')
    })

    it('应该处理底层函数抛出的异常', async () => {
      const request = createMockRequest({
        selector: 'button',
        shouldExist: true
      })
      const response = createMockResponse()

      vi.mocked(assertElementExists).mockRejectedValue(new Error('网络连接失败'))

      await expect(assertExistsTool.handler(request, response, mockContext))
        .rejects.toThrow('网络连接失败')

      expect(response.appendResponseLine).toHaveBeenCalledWith('断言执行失败: 网络连接失败')
    })
  })

  describe('assertVisibleTool - 断言元素可见性', () => {
    it('应该成功断言元素可见', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        visible: true
      })
      const response = createMockResponse()

      const visibleResult = {
        ...successResult,
        expected: true,
        actual: true
      }

      vi.mocked(assertElementVisible).mockResolvedValue(visibleResult)

      await assertVisibleTool.handler(request, response, mockContext)

      expect(assertElementVisible).toHaveBeenCalledWith(
        mockContext.currentPage,
        mockContext.elementMap,
        { uid: 'button-1', visible: true }
      )

      expect(response.appendResponseLine).toHaveBeenCalledWith('期望: 可见')
      expect(response.appendResponseLine).toHaveBeenCalledWith('实际: 可见')
    })

    it('应该成功断言元素不可见', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        visible: false
      })
      const response = createMockResponse()

      const invisibleResult = {
        ...successResult,
        expected: false,
        actual: false
      }

      vi.mocked(assertElementVisible).mockResolvedValue(invisibleResult)

      await assertVisibleTool.handler(request, response, mockContext)

      expect(response.appendResponseLine).toHaveBeenCalledWith('期望: 不可见')
      expect(response.appendResponseLine).toHaveBeenCalledWith('实际: 不可见')
    })

    it('应该处理可见性断言失败', async () => {
      const request = createMockRequest({
        uid: 'button-1',
        visible: true
      })
      const response = createMockResponse()

      const failedVisibilityResult = {
        ...failureResult,
        expected: true,
        actual: false
      }

      vi.mocked(assertElementVisible).mockResolvedValue(failedVisibilityResult)

      await expect(assertVisibleTool.handler(request, response, mockContext))
        .rejects.toThrow('断言失败: 断言失败')
    })
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
      expect(response.appendResponseLine).toHaveBeenCalledWith('1. 断言失败')
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
        visible: true
        // 注意：当前版本只实现了visible，其他状态需要后续扩展
      })
      const response = createMockResponse()

      vi.mocked(assertElementVisible).mockResolvedValue(successResult)

      await assertStateTool.handler(request, response, mockContext)

      expect(response.appendResponseLine).toHaveBeenCalledWith('检查项数: 1')
    })
  })

  describe('错误处理测试', () => {
    it('应该处理非Error类型的异常', async () => {
      const request = createMockRequest({
        selector: 'button',
        shouldExist: true
      })
      const response = createMockResponse()

      vi.mocked(assertElementExists).mockRejectedValue('字符串错误')

      await expect(assertExistsTool.handler(request, response, mockContext))
        .rejects.toThrow('字符串错误')

      expect(response.appendResponseLine).toHaveBeenCalledWith('断言执行失败: 字符串错误')
    })

    it('应该在所有工具中验证currentPage存在', async () => {
      const contextWithoutPage = { ...mockContext, currentPage: null }
      const response = createMockResponse()

      const tools = [
        { tool: assertVisibleTool, params: { uid: 'test', visible: true } },
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

  describe('参数验证测试', () => {
    it('应该正确处理默认timeout值', async () => {
      const request = createMockRequest({
        selector: 'button',
        shouldExist: true
        // timeout未指定，应该使用默认值5000
      })
      const response = createMockResponse()

      vi.mocked(assertElementExists).mockResolvedValue(successResult)

      await assertExistsTool.handler(request, response, mockContext)

      expect(assertElementExists).toHaveBeenCalledWith(mockContext.currentPage, {
        selector: 'button',
        uid: undefined,
        shouldExist: true,
        timeout: undefined
      })
    })

    it('应该正确处理自定义timeout值', async () => {
      const request = createMockRequest({
        selector: 'button',
        shouldExist: true,
        timeout: 10000
      })
      const response = createMockResponse()

      vi.mocked(assertElementExists).mockResolvedValue(successResult)

      await assertExistsTool.handler(request, response, mockContext)

      expect(assertElementExists).toHaveBeenCalledWith(mockContext.currentPage, {
        selector: 'button',
        uid: undefined,
        shouldExist: true,
        timeout: 10000
      })
    })
  })
})