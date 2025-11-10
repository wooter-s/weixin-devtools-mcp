/**
 * connection.ts 工具测试
 * 测试MCP工具层的连接管理功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock tools.ts 中的连接函数
vi.mock('../../src/tools.js', () => ({
  connectDevtools: vi.fn(),
  connectDevtoolsEnhanced: vi.fn(),
  DevToolsConnectionError: class DevToolsConnectionError extends Error {
    constructor(
      message: string,
      public phase: 'startup' | 'connection' | 'health_check',
      public originalError?: Error,
      public details?: Record<string, any>
    ) {
      super(message)
      this.name = 'DevToolsConnectionError'
    }
  }
}))

// 导入被测试的工具
import {
  connectDevtoolsTool,
  connectDevtoolsEnhancedTool,
  getCurrentPageTool
} from '../../src/tools/connection.js'

// 导入mock的函数用于验证
import {
  connectDevtools,
  connectDevtoolsEnhanced,
  DevToolsConnectionError
} from '../../src/tools.js'

describe('connection.ts 工具测试', () => {
  // 创建测试用的页面对象
  const mockCurrentPage = {
    path: '/pages/home/index'
  }

  // 创建测试用的MiniProgram对象
  const mockMiniProgram = {
    currentPage: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    evaluate: vi.fn()
  }

  // 创建测试用的上下文对象
  const mockContext = {
    miniProgram: null as any,
    currentPage: null as any,
    elementMap: new Map(),
    consoleStorage: {
      isMonitoring: false,
      startTime: '',
      consoleMessages: [] as any[],
      exceptionMessages: [] as any[]
    },
    networkStorage: {
      isMonitoring: false,
      startTime: '',
      networkRequests: [] as any[]
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
    mockMiniProgram.currentPage.mockResolvedValue(mockCurrentPage)
    mockMiniProgram.evaluate.mockResolvedValue(undefined)
    mockContext.miniProgram = null
    mockContext.currentPage = null
    mockContext.elementMap.clear()
    mockContext.consoleStorage = {
      isMonitoring: false,
      startTime: '',
      consoleMessages: [],
      exceptionMessages: []
    }
    mockContext.networkStorage = {
      isMonitoring: false,
      startTime: '',
      networkRequests: []
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('connectDevtoolsTool - 传统连接工具', () => {
    it('应该成功连接到微信开发者工具', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project'
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index'
      }

      vi.mocked(connectDevtools).mockResolvedValue(connectResult)

      await connectDevtoolsTool.handler(request, response, mockContext)

      expect(connectDevtools).toHaveBeenCalledWith({
        projectPath: '/path/to/project'
      })

      expect(mockContext.miniProgram).toBe(mockMiniProgram)
      expect(mockContext.currentPage).toBe(mockCurrentPage)
      expect(response.appendResponseLine).toHaveBeenCalledWith('成功连接到微信开发者工具 (传统模式)')
      expect(response.appendResponseLine).toHaveBeenCalledWith('项目路径: /path/to/project')
      expect(response.appendResponseLine).toHaveBeenCalledWith('当前页面: /pages/home/index')
    })

    it('应该支持可选的cliPath和port参数', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        cliPath: '/custom/cli/path',
        port: 9420
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index'
      }

      vi.mocked(connectDevtools).mockResolvedValue(connectResult)

      await connectDevtoolsTool.handler(request, response, mockContext)

      expect(connectDevtools).toHaveBeenCalledWith({
        projectPath: '/path/to/project',
        cliPath: '/custom/cli/path',
        port: 9420
      })
    })

    it('应该传递 autoAudits 参数', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        autoAudits: true
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index'
      }

      vi.mocked(connectDevtools).mockResolvedValue(connectResult)

      await connectDevtoolsTool.handler(request, response, mockContext)

      expect(connectDevtools).toHaveBeenCalledWith({
        projectPath: '/path/to/project',
        autoAudits: true
      })
    })

    it('应该复用已有的活跃连接', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project'
      })
      const response = createMockResponse()

      // 设置已有连接
      mockContext.miniProgram = mockMiniProgram
      mockContext.currentPage = mockCurrentPage

      await connectDevtoolsTool.handler(request, response, mockContext)

      // 不应该调用 connectDevtools
      expect(connectDevtools).not.toHaveBeenCalled()

      // 应该输出复用连接的消息
      expect(response.appendResponseLine).toHaveBeenCalledWith('✅ 检测到已有活跃连接，复用现有连接')
      expect(response.appendResponseLine).toHaveBeenCalledWith('项目路径: /path/to/project')
      expect(response.appendResponseLine).toHaveBeenCalledWith('当前页面: /pages/home/index')
      expect(response.appendResponseLine).toHaveBeenCalledWith('说明: 跳过重新连接，使用已建立的连接')
    })

    it('应该在连接失效时重新连接', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project'
      })
      const response = createMockResponse()

      // 设置已有连接，但 currentPage 会失败
      mockContext.miniProgram = mockMiniProgram
      mockMiniProgram.currentPage.mockRejectedValueOnce(new Error('连接已失效'))

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index'
      }

      vi.mocked(connectDevtools).mockResolvedValue(connectResult)

      await connectDevtoolsTool.handler(request, response, mockContext)

      // 应该重新连接
      expect(connectDevtools).toHaveBeenCalled()
      expect(mockContext.miniProgram).toBe(mockMiniProgram)
      expect(mockContext.currentPage).toBe(mockCurrentPage)
    })

    it('应该自动启动console监听', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project'
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index'
      }

      vi.mocked(connectDevtools).mockResolvedValue(connectResult)

      await connectDevtoolsTool.handler(request, response, mockContext)

      expect(mockMiniProgram.removeAllListeners).toHaveBeenCalledWith('console')
      expect(mockMiniProgram.removeAllListeners).toHaveBeenCalledWith('exception')
      expect(mockMiniProgram.on).toHaveBeenCalledWith('console', expect.any(Function))
      expect(mockMiniProgram.on).toHaveBeenCalledWith('exception', expect.any(Function))
      expect(mockContext.consoleStorage.isMonitoring).toBe(true)
      expect(response.appendResponseLine).toHaveBeenCalledWith('Console监听已自动启动')
    })

    it('应该自动启动网络监听', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project'
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index'
      }

      vi.mocked(connectDevtools).mockResolvedValue(connectResult)

      await connectDevtoolsTool.handler(request, response, mockContext)

      expect(mockMiniProgram.evaluate).toHaveBeenCalled()
      expect(mockContext.networkStorage.isMonitoring).toBe(true)
      expect(response.appendResponseLine).toHaveBeenCalledWith('网络监听已自动启动（增强型拦截）')
    })

    it('应该处理连接失败', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project'
      })
      const response = createMockResponse()

      vi.mocked(connectDevtools).mockRejectedValue(new Error('连接失败'))

      await expect(connectDevtoolsTool.handler(request, response, mockContext))
        .rejects.toThrow('连接失败')

      expect(response.appendResponseLine).toHaveBeenCalledWith('连接失败: 连接失败')
    })
  })

  describe('connectDevtoolsEnhancedTool - 增强连接工具', () => {
    it('应该成功智能连接到微信开发者工具', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        mode: 'auto',
        verbose: true,
        healthCheck: true
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index',
        connectionMode: 'launch' as const,
        startupTime: 1234,
        healthStatus: 'healthy' as const
      }

      vi.mocked(connectDevtoolsEnhanced).mockResolvedValue(connectResult)

      await connectDevtoolsEnhancedTool.handler(request, response, mockContext)

      expect(connectDevtoolsEnhanced).toHaveBeenCalledWith({
        projectPath: '/path/to/project',
        mode: 'auto',
        cliPath: undefined,
        autoPort: undefined,
        autoAccount: undefined,
        timeout: undefined,
        fallbackMode: undefined,
        healthCheck: true,
        verbose: true,
        autoAudits: undefined
      })

      expect(mockContext.miniProgram).toBe(mockMiniProgram)
      expect(mockContext.currentPage).toBe(mockCurrentPage)
      expect(response.appendResponseLine).toHaveBeenCalledWith('✅ 智能连接成功')
      expect(response.appendResponseLine).toHaveBeenCalledWith('项目路径: /path/to/project')
      expect(response.appendResponseLine).toHaveBeenCalledWith('当前页面: /pages/home/index')
      expect(response.appendResponseLine).toHaveBeenCalledWith('连接模式: launch')
      expect(response.appendResponseLine).toHaveBeenCalledWith('启动耗时: 1234ms')
      expect(response.appendResponseLine).toHaveBeenCalledWith('健康状态: healthy')
    })

    it('应该支持所有增强参数', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        mode: 'connect',
        cliPath: '/custom/cli',
        autoPort: 9440,
        autoAccount: 'test-account',
        timeout: 30000,
        fallbackMode: false,
        healthCheck: false,
        verbose: true
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index',
        connectionMode: 'connect' as const,
        startupTime: 2345,
        healthStatus: 'healthy' as const,
        processInfo: {
          pid: 12345,
          port: 9440
        }
      }

      vi.mocked(connectDevtoolsEnhanced).mockResolvedValue(connectResult)

      await connectDevtoolsEnhancedTool.handler(request, response, mockContext)

      expect(connectDevtoolsEnhanced).toHaveBeenCalledWith({
        projectPath: '/path/to/project',
        mode: 'connect',
        cliPath: '/custom/cli',
        autoPort: 9440,
        autoAccount: 'test-account',
        timeout: 30000,
        fallbackMode: false,
        healthCheck: false,
        verbose: true,
        autoAudits: undefined
      })

      expect(response.appendResponseLine).toHaveBeenCalledWith('进程信息: PID=12345, Port=9440')
    })

    it('应该传递 autoAudits 参数到增强连接', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        mode: 'launch',
        autoAudits: true
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index',
        connectionMode: 'launch' as const,
        startupTime: 1000,
        healthStatus: 'healthy' as const
      }

      vi.mocked(connectDevtoolsEnhanced).mockResolvedValue(connectResult)

      await connectDevtoolsEnhancedTool.handler(request, response, mockContext)

      expect(connectDevtoolsEnhanced).toHaveBeenCalledWith({
        projectPath: '/path/to/project',
        mode: 'launch',
        cliPath: undefined,
        autoPort: undefined,
        autoAccount: undefined,
        timeout: undefined,
        fallbackMode: undefined,
        healthCheck: undefined,
        verbose: undefined,
        autoAudits: true
      })
    })

    it('应该复用已有的活跃连接', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        mode: 'auto',
        verbose: true
      })
      const response = createMockResponse()

      // 设置已有连接
      mockContext.miniProgram = mockMiniProgram
      mockContext.currentPage = mockCurrentPage

      await connectDevtoolsEnhancedTool.handler(request, response, mockContext)

      // 不应该调用 connectDevtoolsEnhanced
      expect(connectDevtoolsEnhanced).not.toHaveBeenCalled()

      // 应该输出复用连接的消息
      expect(response.appendResponseLine).toHaveBeenCalledWith('✅ 检测到已有活跃连接，复用现有连接')
      expect(response.appendResponseLine).toHaveBeenCalledWith('项目路径: /path/to/project')
      expect(response.appendResponseLine).toHaveBeenCalledWith('当前页面: /pages/home/index')
      expect(response.appendResponseLine).toHaveBeenCalledWith('说明: 跳过重新连接，使用已建立的连接')
      expect(response.appendResponseLine).toHaveBeenCalledWith('提示: 如需强制重新连接，请先关闭微信开发者工具')
    })

    it('应该在verbose模式下输出连接失效提示', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        mode: 'auto',
        verbose: true
      })
      const response = createMockResponse()

      // 设置已有连接，但 currentPage 会失败
      mockContext.miniProgram = mockMiniProgram
      mockMiniProgram.currentPage.mockRejectedValueOnce(new Error('连接已失效'))

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index',
        connectionMode: 'launch' as const,
        startupTime: 1234,
        healthStatus: 'healthy' as const
      }

      vi.mocked(connectDevtoolsEnhanced).mockResolvedValue(connectResult)

      await connectDevtoolsEnhancedTool.handler(request, response, mockContext)

      // 应该输出失效提示
      expect(response.appendResponseLine).toHaveBeenCalledWith('检测到已有连接但已失效，准备重新连接...')

      // 应该重新连接
      expect(connectDevtoolsEnhanced).toHaveBeenCalled()
    })

    it('应该正确格式化WebSocket超时错误', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        mode: 'connect',
        autoPort: 9420,
        timeout: 5000,
        verbose: true
      })
      const response = createMockResponse()

      const error = new DevToolsConnectionError(
        'WebSocket服务启动超时，端口: 9420，已等待: 5209ms',
        'startup',
        new Error('WebSocket服务启动超时，端口: 9420，已等待: 5209ms'),
        { timestamp: new Date().toISOString() }
      )

      vi.mocked(connectDevtoolsEnhanced).mockRejectedValue(error)

      await expect(connectDevtoolsEnhancedTool.handler(request, response, mockContext))
        .rejects.toThrow()

      // 验证错误消息格式
      expect(response.appendResponseLine).toHaveBeenCalledWith('❗ startup阶段失败: WebSocket服务启动超时，端口: 9420，已等待: 5209ms')
      expect(response.appendResponseLine).toHaveBeenCalledWith('原始错误: WebSocket服务启动超时，端口: 9420，已等待: 5209ms')
      expect(response.appendResponseLine).toHaveBeenCalledWith(expect.stringContaining('详细信息:'))
    })

    it('应该处理普通错误', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        mode: 'auto'
      })
      const response = createMockResponse()

      vi.mocked(connectDevtoolsEnhanced).mockRejectedValue(new Error('连接失败'))

      await expect(connectDevtoolsEnhancedTool.handler(request, response, mockContext))
        .rejects.toThrow('连接失败')

      expect(response.appendResponseLine).toHaveBeenCalledWith('连接失败: 连接失败')
    })

    it('应该自动启动console和网络监听', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        mode: 'auto'
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index',
        connectionMode: 'launch' as const,
        startupTime: 1234,
        healthStatus: 'healthy' as const
      }

      vi.mocked(connectDevtoolsEnhanced).mockResolvedValue(connectResult)

      await connectDevtoolsEnhancedTool.handler(request, response, mockContext)

      // 验证console监听
      expect(mockMiniProgram.removeAllListeners).toHaveBeenCalledWith('console')
      expect(mockMiniProgram.removeAllListeners).toHaveBeenCalledWith('exception')
      expect(mockMiniProgram.on).toHaveBeenCalledWith('console', expect.any(Function))
      expect(mockMiniProgram.on).toHaveBeenCalledWith('exception', expect.any(Function))
      expect(mockContext.consoleStorage.isMonitoring).toBe(true)
      expect(response.appendResponseLine).toHaveBeenCalledWith('Console监听已自动启动')

      // 验证网络监听
      expect(mockMiniProgram.evaluate).toHaveBeenCalled()
      expect(mockContext.networkStorage.isMonitoring).toBe(true)
      expect(response.appendResponseLine).toHaveBeenCalledWith('网络监听已自动启动（增强型拦截）')
    })
  })

  describe('getCurrentPageTool - 获取当前页面', () => {
    it('应该成功获取当前页面信息', async () => {
      const request = createMockRequest({})
      const response = createMockResponse()

      mockContext.miniProgram = mockMiniProgram

      await getCurrentPageTool.handler(request, response, mockContext)

      expect(mockMiniProgram.currentPage).toHaveBeenCalled()
      expect(mockContext.currentPage).toBe(mockCurrentPage)
      expect(response.appendResponseLine).toHaveBeenCalledWith('当前页面: /pages/home/index')
    })

    it('应该要求先连接到开发者工具', async () => {
      const request = createMockRequest({})
      const response = createMockResponse()

      await expect(getCurrentPageTool.handler(request, response, mockContext))
        .rejects.toThrow('请先连接到微信开发者工具')
    })

    it('应该处理获取页面失败', async () => {
      const request = createMockRequest({})
      const response = createMockResponse()

      mockContext.miniProgram = mockMiniProgram
      mockMiniProgram.currentPage.mockRejectedValue(new Error('获取失败'))

      await expect(getCurrentPageTool.handler(request, response, mockContext))
        .rejects.toThrow('获取失败')

      expect(response.appendResponseLine).toHaveBeenCalledWith('获取当前页面失败: 获取失败')
    })
  })

  describe('错误处理测试', () => {
    it('应该处理console监听启动失败', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project'
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index'
      }

      vi.mocked(connectDevtools).mockResolvedValue(connectResult)
      mockMiniProgram.on.mockImplementation(() => {
        throw new Error('监听失败')
      })

      await connectDevtoolsTool.handler(request, response, mockContext)

      expect(response.appendResponseLine).toHaveBeenCalledWith('警告: Console监听启动失败 - 监听失败')
    })

    it('应该处理网络监听启动失败', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project'
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index'
      }

      vi.mocked(connectDevtools).mockResolvedValue(connectResult)
      mockMiniProgram.evaluate.mockRejectedValue(new Error('注入失败'))

      await connectDevtoolsTool.handler(request, response, mockContext)

      expect(response.appendResponseLine).toHaveBeenCalledWith('警告: 网络监听启动失败 - 注入失败')
    })
  })

  describe('上下文状态管理测试', () => {
    it('应该清空elementMap在新连接时', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project'
      })
      const response = createMockResponse()

      const connectResult = {
        miniProgram: mockMiniProgram,
        currentPage: mockCurrentPage,
        pagePath: '/pages/home/index'
      }

      // 设置一些旧的元素映射
      mockContext.elementMap.set('old-uid', 'old-selector')

      vi.mocked(connectDevtools).mockResolvedValue(connectResult)

      await connectDevtoolsTool.handler(request, response, mockContext)

      expect(mockContext.elementMap.size).toBe(0)
    })

    it('应该正确更新上下文状态', async () => {
      const request = createMockRequest({
        projectPath: '/path/to/project',
        mode: 'auto'
      })
      const response = createMockResponse()

      const newMiniProgram = { ...mockMiniProgram }
      const newPage = { path: '/pages/new/new' }

      const connectResult = {
        miniProgram: newMiniProgram,
        currentPage: newPage,
        pagePath: '/pages/new/new',
        connectionMode: 'launch' as const,
        startupTime: 1234,
        healthStatus: 'healthy' as const
      }

      vi.mocked(connectDevtoolsEnhanced).mockResolvedValue(connectResult)

      await connectDevtoolsEnhancedTool.handler(request, response, mockContext)

      expect(mockContext.miniProgram).toBe(newMiniProgram)
      expect(mockContext.currentPage).toBe(newPage)
    })
  })
})
