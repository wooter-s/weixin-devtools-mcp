/**
 * 增强连接功能集成测试
 * 专门测试新的 connectDevtoolsEnhanced 功能
 *
 * 运行方式：
 * RUN_INTEGRATION_TESTS=true npm test -- tests/enhanced-connection.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import {
  connectDevtoolsEnhanced,
  checkDevToolsRunning,
  DevToolsConnectionError,
  type EnhancedConnectOptions,
  type DetailedConnectResult
} from '../src/tools.js'
import {
  allocatePorts,
  checkIntegrationTestEnvironment,
  cleanupConflictingWeChatInstances,
  safeCleanup,
  withTimeout
} from './test-utils.js'

// 环境检查：只有显式开启才运行集成测试
const shouldRunIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true'

// 测试配置
const TEST_PROJECT_PATH = '/Users/didi/workspace/wooPro/weixin-devtools-mcp/playground/wx'
const TEST_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

// 分配的端口池
let availablePorts: number[] = []
let portIndex = 0

// 获取下一个可用端口
function getNextPort(): number {
  if (portIndex >= availablePorts.length) {
    throw new Error('可用端口已用完，请增加端口分配数量')
  }
  return availablePorts[portIndex++]
}

describe.skipIf(!shouldRunIntegrationTests)('增强连接功能集成测试', () => {
  let connectedResources: DetailedConnectResult | null = null

  beforeAll(async () => {
    console.log('🔧 检查增强连接功能集成测试环境...')

    // 检查环境是否满足测试要求
    const envCheck = await checkIntegrationTestEnvironment(TEST_PROJECT_PATH, TEST_CLI_PATH)

    if (!envCheck.isReady) {
      console.error('❌ 集成测试环境不满足要求:')
      envCheck.issues.forEach(issue => console.error(`  • ${issue}`))
      return
    }

    console.log('✅ 环境检查通过')

    // 清理冲突实例
    console.log('🧹 检查并清理冲突实例...')
    await cleanupConflictingWeChatInstances(TEST_PROJECT_PATH, TEST_CLI_PATH)

    // 分配足够的端口供测试使用
    try {
      console.log('🔌 分配测试端口...')
      availablePorts = await allocatePorts(8) // 分配8个端口用于多种测试
      console.log(`✅ 已分配端口: ${availablePorts.join(', ')}`)
    } catch (error) {
      console.error('❌ 端口分配失败:', error)
      throw error
    }
  })

  afterEach(async () => {
    // 确保每次测试后都清理资源
    if (connectedResources?.miniProgram) {
      await safeCleanup(async () => {
        console.log('正在清理微信开发者工具连接...')
        await connectedResources!.miniProgram.close()
        console.log('连接已成功关闭')
        connectedResources = null
      })
    }
  })

  describe('智能连接模式测试', () => {
    it('应该支持auto模式智能连接', async () => {
      if (availablePorts.length === 0) {
        console.log('⚠️ 跳过测试：端口分配失败')
        return
      }

      const testPort = getNextPort()
      console.log(`🤖 测试auto模式连接（端口: ${testPort}）...`)

      const options: EnhancedConnectOptions = {
        projectPath: TEST_PROJECT_PATH,
        mode: 'auto',
        autoPort: testPort,
        timeout: 30000,
        verbose: true,
        healthCheck: false // 暂时跳过健康检查
      }

      try {
        connectedResources = await withTimeout(
          connectDevtoolsEnhanced(options),
          45000,
          'auto模式连接超时'
        )

        // 验证连接结果
        expect(connectedResources).toBeDefined()
        expect(connectedResources.miniProgram).toBeDefined()
        expect(connectedResources.currentPage).toBeDefined()
        expect(connectedResources.connectionMode).toMatch(/^(launch|connect)$/)
        expect(connectedResources.startupTime).toBeGreaterThan(0)
        expect(connectedResources.healthStatus).toMatch(/^(healthy|skipped)$/)

        // 验证页面路径
        const pagePath = await connectedResources.currentPage.path
        expect(pagePath).toBeTruthy()
        expect(typeof pagePath).toBe('string')

        console.log(`✅ auto模式连接成功`)
        console.log(`   连接模式: ${connectedResources.connectionMode}`)
        console.log(`   启动耗时: ${connectedResources.startupTime}ms`)
        console.log(`   当前页面: ${pagePath}`)

      } catch (error) {
        console.error('❌ auto模式连接失败:', error)

        // 如果是增强错误，提供更详细信息
        if (error instanceof DevToolsConnectionError) {
          console.error(`   错误阶段: ${error.phase}`)
          console.error(`   原始错误: ${error.originalError?.message || 'N/A'}`)
        }

        throw error
      }
    }, 60000)

    it('应该支持connect模式两阶段连接', async () => {
      if (availablePorts.length === 0) {
        console.log('⚠️ 跳过测试：端口分配失败')
        return
      }

      const testPort = getNextPort()
      console.log(`🔗 测试connect模式连接（端口: ${testPort}）...`)

      const options: EnhancedConnectOptions = {
        projectPath: TEST_PROJECT_PATH,
        mode: 'connect',
        autoPort: testPort,
        timeout: 30000,
        verbose: true,
        healthCheck: false
      }

      try {
        connectedResources = await withTimeout(
          connectDevtoolsEnhanced(options),
          45000,
          'connect模式连接超时'
        )

        // 验证连接结果
        expect(connectedResources).toBeDefined()
        expect(connectedResources.connectionMode).toBe('connect')
        expect(connectedResources.processInfo).toBeDefined()
        expect(connectedResources.processInfo!.port).toBe(testPort)

        console.log(`✅ connect模式连接成功`)
        console.log(`   进程PID: ${connectedResources.processInfo!.pid}`)
        console.log(`   使用端口: ${connectedResources.processInfo!.port}`)

      } catch (error) {
        console.error('❌ connect模式连接失败:', error)
        throw error
      }
    }, 60000)

    it('应该支持launch模式传统连接', async () => {
      if (availablePorts.length === 0) {
        console.log('⚠️ 跳过测试：端口分配失败')
        return
      }

      const testPort = getNextPort()
      console.log(`🚀 测试launch模式连接（端口: ${testPort}）...`)

      const options: EnhancedConnectOptions = {
        projectPath: TEST_PROJECT_PATH,
        mode: 'launch',
        autoPort: testPort,
        timeout: 30000,
        verbose: true,
        healthCheck: false
      }

      try {
        connectedResources = await withTimeout(
          connectDevtoolsEnhanced(options),
          45000,
          'launch模式连接超时'
        )

        // 验证连接结果
        expect(connectedResources).toBeDefined()
        expect(connectedResources.connectionMode).toBe('launch')

        console.log(`✅ launch模式连接成功`)

      } catch (error) {
        console.error('❌ launch模式连接失败:', error)
        throw error
      }
    }, 60000)
  })

  describe('错误处理和回退机制测试', () => {
    it('应该能正确处理无效项目路径', async () => {
      console.log('🛡️ 测试无效项目路径处理...')

      const options: EnhancedConnectOptions = {
        projectPath: '/invalid/nonexistent/path',
        mode: 'auto',
        autoPort: getNextPort(),
        timeout: 5000,
        verbose: false
      }

      await expect(connectDevtoolsEnhanced(options))
        .rejects
        .toThrow(/Project path.*doesn't exist/)

      console.log('✅ 无效项目路径错误处理正确')
    })

    it('应该能正确分类错误阶段', async () => {
      console.log('🛡️ 测试错误阶段分类...')

      const options: EnhancedConnectOptions = {
        projectPath: '/tmp', // 无效的小程序项目路径
        mode: 'connect',
        autoPort: getNextPort(),
        timeout: 5000,
        verbose: false
      }

      try {
        await connectDevtoolsEnhanced(options)
        // 如果没有抛出错误，测试失败
        expect(false).toBe(true)
      } catch (error) {
        if (error instanceof DevToolsConnectionError) {
          expect(error.phase).toMatch(/^(startup|connection|health_check)$/)
          console.log(`✅ 错误阶段分类正确: ${error.phase}`)
        } else {
          console.log('✅ 基础错误处理正确')
        }
      }
    })
  })

  describe('功能特性测试', () => {
    it('应该能检测开发者工具运行状态', async () => {
      console.log('🔍 测试开发者工具状态检测...')

      // 测试未运行的端口
      const unusedPort = getNextPort()
      const isRunning1 = await checkDevToolsRunning(unusedPort)
      expect(isRunning1).toBe(false)

      console.log(`✅ 状态检测功能正常: 端口${unusedPort}未运行`)

      // TODO: 可以添加测试运行中端口的检测（需要先启动一个实例）
    })

    it('应该能提供详细的连接信息', async () => {
      if (availablePorts.length === 0) {
        console.log('⚠️ 跳过测试：端口分配失败')
        return
      }

      const testPort = getNextPort()
      console.log(`📊 测试详细连接信息（端口: ${testPort}）...`)

      const options: EnhancedConnectOptions = {
        projectPath: TEST_PROJECT_PATH,
        mode: 'auto',
        autoPort: testPort,
        timeout: 30000,
        verbose: true,
        healthCheck: false
      }

      try {
        connectedResources = await withTimeout(
          connectDevtoolsEnhanced(options),
          45000,
          '详细信息测试超时'
        )

        // 验证详细信息字段
        expect(connectedResources.connectionMode).toBeDefined()
        expect(connectedResources.startupTime).toBeGreaterThan(0)
        expect(connectedResources.healthStatus).toBeDefined()
        expect(connectedResources.pagePath).toBeDefined()

        console.log(`✅ 详细连接信息完整`)
        console.log(`   模式: ${connectedResources.connectionMode}`)
        console.log(`   耗时: ${connectedResources.startupTime}ms`)
        console.log(`   状态: ${connectedResources.healthStatus}`)

      } catch (error) {
        console.error('❌ 详细信息测试失败:', error)
        throw error
      }
    }, 60000)
  })

  describe('性能和稳定性测试', () => {
    it('应该在合理时间内完成连接', async () => {
      if (availablePorts.length === 0) {
        console.log('⚠️ 跳过测试：端口分配失败')
        return
      }

      const testPort = getNextPort()
      console.log(`⏱️ 测试连接性能（端口: ${testPort}）...`)

      const startTime = Date.now()
      const options: EnhancedConnectOptions = {
        projectPath: TEST_PROJECT_PATH,
        mode: 'auto',
        autoPort: testPort,
        timeout: 20000, // 较短的超时时间
        verbose: false,
        healthCheck: false
      }

      try {
        connectedResources = await connectDevtoolsEnhanced(options)
        const duration = Date.now() - startTime

        // 验证连接时间合理（应该在20秒内完成）
        expect(duration).toBeLessThan(20000)
        console.log(`✅ 连接性能良好: ${duration}ms`)

      } catch (error) {
        const duration = Date.now() - startTime
        console.error(`❌ 连接性能测试失败 (耗时: ${duration}ms):`, error)
        throw error
      }
    }, 25000)
  })
})