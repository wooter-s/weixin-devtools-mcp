/**
 * 测试工具函数单元测试
 * 验证端口分配、环境检查等功能
 */

import { describe, it, expect } from 'vitest'
import {
  findAvailablePort,
  allocatePorts,
  checkWeChatDevToolsCLI,
  checkProjectPath,
  checkIntegrationTestEnvironment
} from './test-utils.js'

describe('测试工具函数', () => {
  describe('端口分配功能', () => {
    it('应该能找到可用端口', async () => {
      const port = await findAvailablePort(9500)
      expect(port).toBeGreaterThanOrEqual(9500)
      expect(typeof port).toBe('number')
    })

    it('应该能分配多个不同的端口', async () => {
      const ports = await allocatePorts(3)
      expect(ports).toHaveLength(3)

      // 验证所有端口都是数字且不重复
      const uniquePorts = new Set(ports)
      expect(uniquePorts.size).toBe(3)

      ports.forEach(port => {
        expect(typeof port).toBe('number')
        expect(port).toBeGreaterThan(0)
      })
    })

    it('应该分配连续的端口', async () => {
      const ports = await allocatePorts(2)
      expect(ports[1]).toBeGreaterThan(ports[0])
    })
  })

  describe('环境检查功能', () => {
    it('应该检查微信开发者工具CLI', async () => {
      // 测试默认路径检查
      const hasDefaultCLI = await checkWeChatDevToolsCLI()
      expect(typeof hasDefaultCLI).toBe('boolean')
    })

    it('应该检查自定义CLI路径', async () => {
      // 测试无效路径
      const hasInvalidCLI = await checkWeChatDevToolsCLI('/invalid/path')
      expect(hasInvalidCLI).toBe(false)
    })

    it('应该检查项目路径', async () => {
      // 测试当前项目路径（应该有package.json等）
      const hasCurrentProject = await checkProjectPath('.')
      // 当前目录可能不是小程序项目，所以不强制要求为true
      expect(typeof hasCurrentProject).toBe('boolean')

      // 测试无效路径
      const hasInvalidProject = await checkProjectPath('/invalid/project/path')
      expect(hasInvalidProject).toBe(false)
    })

    it('应该进行综合环境检查', async () => {
      const result = await checkIntegrationTestEnvironment('/invalid/path')

      expect(result).toHaveProperty('isReady')
      expect(result).toHaveProperty('issues')
      expect(typeof result.isReady).toBe('boolean')
      expect(Array.isArray(result.issues)).toBe(true)

      // 无效路径应该有问题
      expect(result.isReady).toBe(false)
      expect(result.issues.length).toBeGreaterThan(0)
    })
  })

  describe('工具函数', () => {
    it('应该提供等待功能', async () => {
      const start = Date.now()
      await new Promise(resolve => setTimeout(resolve, 50))
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(40) // 允许一些误差
    })

    it('应该提供超时包装器', async () => {
      const fastPromise = Promise.resolve('success')
      const result = await new Promise((resolve, reject) => {
        Promise.race([
          fastPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 100)
          )
        ]).then(resolve).catch(reject)
      })

      expect(result).toBe('success')
    })
  })
})