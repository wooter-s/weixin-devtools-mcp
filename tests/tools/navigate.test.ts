/**
 * navigate.ts 工具测试
 * 测试页面导航工具的各种场景
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock tools.js 中的导航函数
// toAbsolutePagePath 为纯函数，提供与真实实现一致的轻量实现，
// 以便 redirect 分支正常归一化路径。
vi.mock('../../src/tools.js', () => ({
  navigateToPage: vi.fn(),
  navigateBack: vi.fn(),
  switchTab: vi.fn(),
  reLaunch: vi.fn(),
  toAbsolutePagePath: (url: string) =>
    !url || url.startsWith('/') || url.startsWith('.') ? url : `/${url}`
}))

// 导入被测试的工具
import {
  navigateToTool,
  navigateBackTool,
  switchTabTool,
  reLaunchTool
} from '../../src/tools/navigate.js'

// 导入mock的函数用于验证
import {
  navigateToPage,
  navigateBack,
  switchTab,
  reLaunch
} from '../../src/tools.js'

describe('navigate.ts 工具测试', () => {
  // 创建测试用的页面对象
  const mockCurrentPage = {
    path: '/pages/home/index'
  }

  // 创建测试用的MiniProgram对象
  const mockMiniProgram = {
    currentPage: vi.fn(),
    redirectTo: vi.fn()
  }

  // 创建测试用的上下文对象
  const mockContext = {
    miniProgram: mockMiniProgram,
    currentPage: mockCurrentPage,
    elementMap: new Map(),
    refreshCurrentPage: vi.fn(),
    clearElementMap: vi.fn(),
    invalidateSnapshotCache: vi.fn(),
    splitConsoleAfterNavigation: vi.fn(),
    splitNetworkAfterNavigation: vi.fn(),
  } as any

  // 创建测试用的请求和响应对象
  const createMockRequest = (params: any) => ({ params })
  const createMockResponse = () => {
    const lines: string[] = []
    return {
      appendResponseLine: vi.fn((line: string) => lines.push(line)),
      setIncludeSnapshot: vi.fn(),
      attachImage: vi.fn(),
      shouldIncludeSnapshot: vi.fn(() => false),
      mergeStructuredContent: vi.fn(),
      getStructuredContent: vi.fn(() => ({})),
      getLines: () => lines
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockMiniProgram.currentPage.mockResolvedValue(mockCurrentPage)
    mockContext.refreshCurrentPage.mockImplementation(async () => {
      const page = await mockMiniProgram.currentPage()
      mockContext.currentPage = page
      return page
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('navigateToTool - 跳转到指定页面', () => {
    it('应该成功跳转到指定页面', async () => {
      const request = createMockRequest({
        url: '/pages/profile/profile',
        waitForLoad: true,
        timeout: 10000
      })
      const response = createMockResponse()

      vi.mocked(navigateToPage).mockResolvedValue(undefined)

      await navigateToTool.handler(request, response, mockContext)

      expect(navigateToPage).toHaveBeenCalledWith(mockMiniProgram, {
        url: '/pages/profile/profile',
        params: undefined,
        waitForLoad: true,
        timeout: 10000
      })

      expect(response.appendResponseLine).toHaveBeenCalledWith('✅ 页面跳转成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('目标页面: /pages/profile/profile')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })

    it('redirect 模式应将相对路径归一化为绝对路径再调用 redirectTo', async () => {
      // 传入不带前导 "/" 的 app.json 风格路径，应被补全为 "/..." 再交给 SDK，
      // 避免 SDK 按当前页面相对解析拼出错误路径。
      const request = createMockRequest({
        url: 'pages/profile/profile',
        redirect: true,
        waitForLoad: false,
        timeout: 5000
      })
      const response = createMockResponse()

      await navigateToTool.handler(request, response, mockContext)

      expect(mockMiniProgram.redirectTo).toHaveBeenCalledWith('/pages/profile/profile')
      expect(response.appendResponseLine).toHaveBeenCalledWith('✅ 页面重定向成功')
    })

    it('应该成功跳转到带参数的页面', async () => {
      const request = createMockRequest({
        url: '/pages/detail/detail',
        params: { id: '123', type: 'product' },
        waitForLoad: true,
        timeout: 8000
      })
      const response = createMockResponse()

      vi.mocked(navigateToPage).mockResolvedValue(undefined)

      await navigateToTool.handler(request, response, mockContext)

      expect(navigateToPage).toHaveBeenCalledWith(mockMiniProgram, {
        url: '/pages/detail/detail',
        params: { id: '123', type: 'product' },
        waitForLoad: true,
        timeout: 8000
      })

      expect(response.appendResponseLine).toHaveBeenCalledWith('参数: {"id":"123","type":"product"}')
    })

    it('应该使用默认参数值', async () => {
      const request = createMockRequest({
        url: '/pages/test/test'
      })
      const response = createMockResponse()

      vi.mocked(navigateToPage).mockResolvedValue(undefined)

      await navigateToTool.handler(request, response, mockContext)

      expect(navigateToPage).toHaveBeenCalledWith(mockMiniProgram, {
        url: '/pages/test/test',
        params: undefined,
        waitForLoad: undefined,
        timeout: undefined
      })
    })

    it('应该在跳转后更新当前页面', async () => {
      const request = createMockRequest({
        url: '/pages/new/new'
      })
      const response = createMockResponse()

      const newPage = { path: '/pages/new/new' }
      vi.mocked(navigateToPage).mockResolvedValue(undefined)
      mockMiniProgram.currentPage.mockResolvedValue(newPage)

      await navigateToTool.handler(request, response, mockContext)

      expect(mockContext.refreshCurrentPage).toHaveBeenCalled()
      expect(mockContext.invalidateSnapshotCache).toHaveBeenCalledTimes(1)
      expect(mockContext.clearElementMap).toHaveBeenCalledTimes(1)
      expect(mockContext.splitConsoleAfterNavigation).toHaveBeenCalledTimes(1)
      expect(mockContext.splitNetworkAfterNavigation).toHaveBeenCalledTimes(1)
      expect(mockContext.currentPage).toBe(newPage)
      expect(response.appendResponseLine).toHaveBeenCalledWith('✅ 当前页面已更新')
    })

    it('应该处理页面更新失败的情况', async () => {
      const request = createMockRequest({
        url: '/pages/new/new'
      })
      const response = createMockResponse()

      vi.mocked(navigateToPage).mockResolvedValue(undefined)
      mockContext.refreshCurrentPage.mockRejectedValue(new Error('获取页面失败'))

      await navigateToTool.handler(request, response, mockContext)

      expect(mockContext.invalidateSnapshotCache).toHaveBeenCalledTimes(1)
      expect(mockContext.clearElementMap).toHaveBeenCalledTimes(1)
      expect(mockContext.splitConsoleAfterNavigation).toHaveBeenCalledTimes(1)
      expect(mockContext.splitNetworkAfterNavigation).toHaveBeenCalledTimes(1)
      expect(response.appendResponseLine).toHaveBeenCalledWith('⚠️ 无法更新当前页面信息')
    })

    it('应该要求miniProgram存在', async () => {
      const request = createMockRequest({
        url: '/pages/test/test'
      })
      const response = createMockResponse()
      const contextWithoutMiniProgram = { ...mockContext, miniProgram: null }

      await expect(navigateToTool.handler(request, response, contextWithoutMiniProgram))
        .rejects.toThrow('请先连接到微信开发者工具。使用 connect_devtools 工具建立连接。')
    })

    it('应该处理导航失败', async () => {
      const request = createMockRequest({
        url: '/pages/invalid/invalid'
      })
      const response = createMockResponse()

      vi.mocked(navigateToPage).mockRejectedValue(new Error('页面不存在'))

      await expect(navigateToTool.handler(request, response, mockContext))
        .rejects.toThrow('页面不存在')

      expect(response.appendResponseLine).toHaveBeenCalledWith('❌ 页面跳转失败: 页面不存在')
    })
  })

  describe('navigateBackTool - 返回上一页', () => {
    it('应该成功返回上一页', async () => {
      const request = createMockRequest({
        delta: 1,
        waitForLoad: true,
        timeout: 5000
      })
      const response = createMockResponse()

      vi.mocked(navigateBack).mockResolvedValue(undefined)

      await navigateBackTool.handler(request, response, mockContext)

      expect(navigateBack).toHaveBeenCalledWith(mockMiniProgram, {
        delta: 1,
        waitForLoad: true,
        timeout: 5000
      })

      expect(response.appendResponseLine).toHaveBeenCalledWith('✅ 页面返回成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('返回层数: 1')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })

    it('应该使用默认参数值', async () => {
      const request = createMockRequest({})
      const response = createMockResponse()

      vi.mocked(navigateBack).mockResolvedValue(undefined)

      await navigateBackTool.handler(request, response, mockContext)

      expect(navigateBack).toHaveBeenCalledWith(mockMiniProgram, {
        delta: undefined,
        waitForLoad: undefined,
        timeout: undefined
      })
    })

    it('应该支持返回多级页面', async () => {
      const request = createMockRequest({
        delta: 3,
        waitForLoad: false,
        timeout: 3000
      })
      const response = createMockResponse()

      vi.mocked(navigateBack).mockResolvedValue(undefined)

      await navigateBackTool.handler(request, response, mockContext)

      expect(navigateBack).toHaveBeenCalledWith(mockMiniProgram, {
        delta: 3,
        waitForLoad: false,
        timeout: 3000
      })

      expect(response.appendResponseLine).toHaveBeenCalledWith('返回层数: 3')
    })

    it('应该处理返回失败', async () => {
      const request = createMockRequest({
        delta: 2
      })
      const response = createMockResponse()

      vi.mocked(navigateBack).mockRejectedValue(new Error('无法返回'))

      await expect(navigateBackTool.handler(request, response, mockContext))
        .rejects.toThrow('无法返回')

      expect(response.appendResponseLine).toHaveBeenCalledWith('❌ 页面返回失败: 无法返回')
    })
  })

  describe('switchTabTool - 切换Tab页', () => {
    it('应该成功切换Tab页', async () => {
      const request = createMockRequest({
        url: '/pages/index/index',
        waitForLoad: true,
        timeout: 5000
      })
      const response = createMockResponse()

      vi.mocked(switchTab).mockResolvedValue(undefined)

      await switchTabTool.handler(request, response, mockContext)

      expect(switchTab).toHaveBeenCalledWith(mockMiniProgram, {
        url: '/pages/index/index',
        waitForLoad: true,
        timeout: 5000
      })

      expect(response.appendResponseLine).toHaveBeenCalledWith('✅ Tab切换成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('目标Tab: /pages/index/index')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })

    it('应该使用默认参数值', async () => {
      const request = createMockRequest({
        url: '/pages/profile/profile'
      })
      const response = createMockResponse()

      vi.mocked(switchTab).mockResolvedValue(undefined)

      await switchTabTool.handler(request, response, mockContext)

      expect(switchTab).toHaveBeenCalledWith(mockMiniProgram, {
        url: '/pages/profile/profile',
        waitForLoad: undefined,
        timeout: undefined
      })
    })

    it('应该处理Tab切换失败', async () => {
      const request = createMockRequest({
        url: '/pages/invalid/invalid'
      })
      const response = createMockResponse()

      vi.mocked(switchTab).mockRejectedValue(new Error('Tab页不存在'))

      await expect(switchTabTool.handler(request, response, mockContext))
        .rejects.toThrow('Tab页不存在')

      expect(response.appendResponseLine).toHaveBeenCalledWith('❌ Tab切换失败: Tab页不存在')
    })
  })

  describe('reLaunchTool - 重新启动小程序', () => {
    it('应该成功重新启动小程序', async () => {
      const request = createMockRequest({
        url: '/pages/splash/splash',
        params: { from: 'restart' },
        waitForLoad: true,
        timeout: 10000
      })
      const response = createMockResponse()

      vi.mocked(reLaunch).mockResolvedValue(undefined)

      await reLaunchTool.handler(request, response, mockContext)

      expect(reLaunch).toHaveBeenCalledWith(mockMiniProgram, {
        url: '/pages/splash/splash',
        params: { from: 'restart' },
        waitForLoad: true,
        timeout: 10000
      })

      expect(response.appendResponseLine).toHaveBeenCalledWith('✅ 重新启动成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('目标页面: /pages/splash/splash')
      expect(response.appendResponseLine).toHaveBeenCalledWith('参数: {"from":"restart"}')
      expect(response.setIncludeSnapshot).toHaveBeenCalledWith(true)
    })

    it('应该处理重新启动失败', async () => {
      const request = createMockRequest({
        url: '/pages/app/app'
      })
      const response = createMockResponse()

      vi.mocked(reLaunch).mockRejectedValue(new Error('启动失败'))

      await expect(reLaunchTool.handler(request, response, mockContext))
        .rejects.toThrow('启动失败')

      expect(response.appendResponseLine).toHaveBeenCalledWith('❌ 重新启动失败: 启动失败')
    })
  })

  describe('错误处理测试', () => {
    it('应该在所有导航工具中验证miniProgram存在', async () => {
      const contextWithoutMiniProgram = { ...mockContext, miniProgram: null }
      const response = createMockResponse()

      const tools = [
        { tool: navigateToTool, params: { url: '/pages/test/test' } },
        { tool: navigateBackTool, params: { delta: 1 } },
        { tool: switchTabTool, params: { url: '/pages/tab/tab' } },
        { tool: reLaunchTool, params: { url: '/pages/app/app' } }
      ]

      for (const { tool, params } of tools) {
        const request = createMockRequest(params)
        await expect(tool.handler(request, response, contextWithoutMiniProgram))
          .rejects.toThrow('请先连接到微信开发者工具。使用 connect_devtools 工具建立连接。')
      }
    })

    it('应该处理非Error类型的异常', async () => {
      const request = createMockRequest({
        url: '/pages/test/test'
      })
      const response = createMockResponse()

      vi.mocked(navigateToPage).mockRejectedValue('字符串错误')

      await expect(navigateToTool.handler(request, response, mockContext))
        .rejects.toThrow('字符串错误')

      expect(response.appendResponseLine).toHaveBeenCalledWith('❌ 页面跳转失败: 字符串错误')
    })
  })

  describe('参数验证测试', () => {
    it('应该正确处理默认参数值', async () => {
      const response = createMockResponse()

      // 测试各工具的默认参数
      const testCases = [
        {
          tool: navigateToTool,
          request: createMockRequest({ url: '/pages/test/test' }),
          mockFn: navigateToPage,
          expectedDefaults: { waitForLoad: undefined, timeout: undefined }
        },
        {
          tool: navigateBackTool,
          request: createMockRequest({}),
          mockFn: navigateBack,
          expectedDefaults: { delta: undefined, waitForLoad: undefined, timeout: undefined }
        },
        {
          tool: switchTabTool,
          request: createMockRequest({ url: '/pages/tab/tab' }),
          mockFn: switchTab,
          expectedDefaults: { waitForLoad: undefined, timeout: undefined }
        }
      ]

      for (const { tool, request, mockFn, expectedDefaults } of testCases) {
        vi.clearAllMocks()
        vi.mocked(mockFn).mockResolvedValue(undefined)

        await tool.handler(request, response, mockContext)

        expect(mockFn).toHaveBeenCalledWith(
          mockMiniProgram,
          expect.objectContaining(expectedDefaults)
        )
      }
    })
  })

  describe('导航超时和异常路径测试', () => {
    it('navigateToPage 超时应抛出超时错误', async () => {
      const request = createMockRequest({
        url: '/pages/slow/slow',
        timeout: 1000
      })
      const response = createMockResponse()

      vi.mocked(navigateToPage).mockRejectedValue(new Error('导航超时: 1000ms'))

      await expect(navigateToTool.handler(request, response, mockContext))
        .rejects.toThrow('导航超时')

      expect(response.appendResponseLine).toHaveBeenCalledWith('❌ 页面跳转失败: 导航超时: 1000ms')
    })

    it('switchTab 切换到非 Tab 页应抛出错误', async () => {
      const request = createMockRequest({
        url: '/pages/not-a-tab/index'
      })
      const response = createMockResponse()

      vi.mocked(switchTab).mockRejectedValue(new Error('该页面不是 Tab 页'))

      await expect(switchTabTool.handler(request, response, mockContext))
        .rejects.toThrow('该页面不是 Tab 页')

      expect(response.appendResponseLine).toHaveBeenCalledWith('❌ Tab切换失败: 该页面不是 Tab 页')
    })

    it('reLaunch 重启失败应抛出错误', async () => {
      const request = createMockRequest({
        url: '/pages/broken/broken'
      })
      const response = createMockResponse()

      vi.mocked(reLaunch).mockRejectedValue(new Error('小程序重启失败'))

      await expect(reLaunchTool.handler(request, response, mockContext))
        .rejects.toThrow('小程序重启失败')

      expect(response.appendResponseLine).toHaveBeenCalledWith('❌ 重新启动失败: 小程序重启失败')
    })
  })
})