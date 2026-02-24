import { defineConfig } from 'vitest/config'

const isIntegrationRun = process.env.RUN_INTEGRATION_TESTS === 'true'

export default defineConfig({
  test: {
    // 设置测试环境为 Node.js
    environment: 'node',

    // 启用全局测试函数（describe, it, expect等）
    globals: true,

    // 测试文件匹配模式
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    // 排除模式
    exclude: ['node_modules', 'build', 'dist'],

    // 设置测试超时时间（毫秒）
    testTimeout: isIntegrationRun ? 120000 : 10000,

    // 设置 Hook 超时时间（毫秒） - 用于集成测试
    hookTimeout: isIntegrationRun ? 180000 : 40000,

    // 集成测试依赖真实微信开发者工具，串行执行可避免资源竞争与端口冲突
    fileParallelism: !isIntegrationRun,

    // 覆盖率配置
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'coverage/**',
        'dist/**',
        'build/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/node_modules/**',
        'tests/**',
        'scripts/**'
      ],
      // 覆盖率阈值要求
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 75,
        lines: 75
      }
    },

    // 支持 TypeScript 和 ESM (修复过时警告)
    server: {
      deps: {
        external: [/node_modules/]
      }
    }
  },

  // 解析配置
  resolve: {
    alias: {
      '@': './src'
    }
  }
})
