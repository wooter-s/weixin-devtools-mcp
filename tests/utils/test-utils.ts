/**
 * 集成测试工具函数
 * 提供端口管理、环境验证等功能
 */

import { execSync } from 'child_process'
import { access, constants } from 'fs/promises'
import { createServer } from 'net'

export type IntegrationCleanupMode = 'reuse' | 'smart' | 'force'

export function getIntegrationCleanupMode(): IntegrationCleanupMode {
  const rawMode = process.env.INTEGRATION_CLEANUP_MODE
  if (rawMode === 'smart') {
    return 'smart'
  }
  if (rawMode === 'force') {
    return 'force'
  }
  return 'reuse'
}

/**
 * 检查端口是否被微信开发者工具占用
 */
export function isPortOccupiedByWeChat(port: number): boolean {
  try {
    const result = execSync(`lsof -i :${port} 2>/dev/null | grep wechatweb`, { encoding: 'utf8' })
    return result.trim().length > 0
  } catch {
    return false
  }
}

/**
 * 检查端口是否可用（不被任何进程占用）
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()

    server.listen(port, () => {
      server.close(() => {
        resolve(true)
      })
    })

    server.on('error', () => {
      resolve(false)
    })
  })
}

/**
 * 查找可用端口（避开微信开发者工具占用的端口）
 */
export async function findAvailablePort(startPort: number = 9420): Promise<number> {
  let currentPort = startPort
  const skippedPorts: number[] = []

  while (currentPort < startPort + 100) { // 最多尝试100个端口
    // 检查端口是否被微信开发者工具占用
    if (isPortOccupiedByWeChat(currentPort)) {
      skippedPorts.push(currentPort)
      currentPort++
      continue
    }

    // 检查端口是否真正可用
    if (await isPortAvailable(currentPort)) {
      if (skippedPorts.length > 0) {
        console.log(`⚠️ 跳过占用端口: [${skippedPorts.join(', ')}]`)
      }
      return currentPort
    }

    currentPort++
  }

  throw new Error(`无法在 ${startPort}-${startPort + 99} 范围内找到可用端口`)
}

/**
 * 分配多个可用端口
 */
export async function allocatePorts(count: number): Promise<number[]> {
  const ports: number[] = []
  let startPort = 9420

  console.log(`🔌 分配 ${count} 个可用端口...`)

  for (let i = 0; i < count; i++) {
    const port = await findAvailablePort(startPort)
    ports.push(port)
    startPort = port + 1
  }

  console.log(`✅ 已分配端口: ${ports.join(', ')}`)
  return ports
}

/**
 * 检查微信开发者工具CLI是否可用
 */
export async function checkWeChatDevToolsCLI(cliPath?: string): Promise<boolean> {
  const defaultPaths = [
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    '/Applications/微信开发者工具.app/Contents/MacOS/cli'
  ]

  const pathsToCheck = cliPath ? [cliPath] : defaultPaths

  for (const path of pathsToCheck) {
    try {
      await access(path, constants.F_OK | constants.X_OK)
      return true
    } catch {
      // 继续检查下一个路径
    }
  }

  return false
}

/**
 * 检查项目路径是否存在且有效
 */
export async function checkProjectPath(projectPath: string): Promise<boolean> {
  try {
    // 检查项目目录是否存在
    await access(projectPath, constants.F_OK)

    // 检查是否包含微信小程序必要文件
    const requiredFiles = ['app.json', 'project.config.json']
    for (const file of requiredFiles) {
      const filePath = `${projectPath}/${file}`
      try {
        await access(filePath, constants.F_OK)
      } catch {
        console.warn(`⚠️ 项目文件缺失: ${filePath}`)
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

/**
 * 检查微信开发者工具是否正在运行其他项目
 */
export function getRunningWeChatProjects(): Array<{port: number, project: string}> {
  try {
    const result = execSync('lsof -i :9420-9430 2>/dev/null | grep wechatweb', { encoding: 'utf8' })
    const projects: Array<{port: number, project: string}> = []

    result.split('\n').forEach(line => {
      const match = line.match(/:([0-9]+).*LISTEN/)
      if (match) {
        const port = parseInt(match[1])
        // 尝试获取正在运行的项目路径
        try {
          const psResult = execSync(`ps aux | grep "auto --project" | grep ":${port}" | grep -v grep`, { encoding: 'utf8' })
          const projectMatch = psResult.match(/--project ([^\s]+)/)
          const projectPath = projectMatch ? projectMatch[1] : '未知项目'
          projects.push({ port, project: projectPath })
        } catch {
          projects.push({ port, project: '未知项目' })
        }
      }
    })

    return projects
  } catch {
    return []
  }
}

/**
 * 使用微信开发者工具CLI正确关闭项目
 */
export async function closeWeChatProject(cliPath?: string): Promise<boolean> {
  const cli = cliPath || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

  try {
    console.log('🔌 使用CLI关闭微信开发者工具项目...')
    execSync(`"${cli}" close`, { stdio: 'ignore' })
    await sleep(2000) // 等待关闭完成
    console.log('✅ 项目已关闭')
    return true
  } catch {
    console.log('⚠️ 关闭项目失败，可能没有项目正在运行')
    return false
  }
}

/**
 * 强制清理所有微信开发者工具进程
 */
export async function forceCleanupAllWeChatProcesses(cliPath?: string): Promise<boolean> {
  console.log('🧹 开始强制清理所有微信开发者工具进程...')

  try {
    // 方法 1: 使用CLI退出
    const cli = cliPath || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
    try {
      console.log('🔌 使用CLI退出微信开发者工具...')
      execSync(`"${cli}" quit`, { stdio: 'ignore', timeout: 10000 })
      console.log('✅ CLI退出成功')
    } catch {
      console.log('⚠️ CLI退出失败，继续强制清理')
    }

    // 等待CLI命令生效
    await sleep(3000)

    // 方法 2: 强制终止所有相关进程
    console.log('🔧 强制终止所有wechatwebdevtools进程...')
    try {
      execSync('pkill -9 -f wechatwebdevtools', { stdio: 'ignore', timeout: 5000 })
      console.log('✅ 进程终止命令执行完成')
    } catch {
      console.log('⚠️ 进程终止命令失败，但继续执行')
    }

    // 等待进程完全终止
    await sleep(5000)

    // 验证清理效果
    const remainingProjects = getRunningWeChatProjects()
    if (remainingProjects.length === 0) {
      console.log('✅ 所有微信开发者工具进程已清理干净')
      return true
    } else {
      console.log(`⚠️ 仍有 ${remainingProjects.length} 个进程运行`)
      remainingProjects.forEach(({ port, project }) => {
        console.log(`  • 端口 ${port}: ${project}`)
      })
      return false
    }
  } catch (error) {
    console.error('❗ 清理过程中出错:', error)
    return false
  }
}

/**
 * 清理微信开发者工具的冲突实例
 */
export async function cleanupConflictingWeChatInstances(targetProjectPath: string, cliPath?: string): Promise<boolean> {
  const runningProjects = getRunningWeChatProjects()
  const cleanupMode = getIntegrationCleanupMode()

  if (runningProjects.length === 0) {
    console.log('💪 没有发现冲突的微信开发者工具实例')
    return true
  }

  console.log('📌 发现正在运行的微信开发者工具实例:')
  runningProjects.forEach(({ port, project }) => {
    console.log(`  • 端口 ${port}: ${project}`)
  })

  // 检查是否有实例正在运行目标项目
  const targetRunning = runningProjects.find(p => p.project.includes(targetProjectPath))
  if (targetRunning) {
    console.log(`✅ 目标项目已在端口 ${targetRunning.port} 上运行，无需清理`)
    return true
  }

  if (cleanupMode === 'reuse') {
    console.log('♻️ 清理策略=reuse：保留现有实例，优先复用会话')
    return true
  }

  if (cleanupMode === 'smart') {
    console.log('🧹 清理策略=smart：先尝试优雅关闭当前项目')
    const closedByCli = await closeWeChatProject(cliPath)
    if (closedByCli) {
      return true
    }
    console.log('⚠️ 优雅关闭失败，回退到强制清理')
    return await forceCleanupAllWeChatProcesses(cliPath)
  }

  console.log('🧹 清理策略=force：执行完全环境清理...')
  return await forceCleanupAllWeChatProcesses(cliPath)
}

/**
 * 综合环境检查（包含端口冲突检测）
 */
export async function checkIntegrationTestEnvironment(
  projectPath: string,
  cliPath?: string
): Promise<{ isReady: boolean; issues: string[]; warnings: string[] }> {
  const issues: string[] = []
  const warnings: string[] = []

  // 检查微信开发者工具
  const hasDevTools = await checkWeChatDevToolsCLI(cliPath)
  if (!hasDevTools) {
    issues.push('微信开发者工具CLI不可用或未安装')
  }

  // 检查项目路径
  const hasValidProject = await checkProjectPath(projectPath)
  if (!hasValidProject) {
    issues.push(`项目路径无效或缺少必要文件: ${projectPath}`)
  }

  // 检查端口冲突
  const runningProjects = getRunningWeChatProjects()
  if (runningProjects.length > 0) {
    const conflictMsg = `检测到其他项目正在运行: ${runningProjects.map(p => `${p.project}(端口${p.port})`).join(', ')}`
    warnings.push(conflictMsg)
  }

  return {
    isReady: issues.length === 0,
    issues,
    warnings
  }
}

/**
 * 等待指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带超时的Promise包装器
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = '操作超时'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ])
}

/**
 * 安全的资源清理函数
 */
export async function safeCleanup(cleanupFn: () => Promise<void> | void): Promise<void> {
  try {
    await cleanupFn()
  } catch (error) {
    console.warn('清理资源时出错:', error)
  }
}
