import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      // 阶段1: 警告级别（逐步提升为错误）
      // 注意: 禁用需要类型信息的规则以避免内存溢出
      // 这些规则需要 parserOptions.project，会消耗大量内存
      '@typescript-eslint/no-explicit-any': 'warn',
      // '@typescript-eslint/no-unsafe-assignment': 'warn',  // 需要类型信息
      // '@typescript-eslint/no-unsafe-member-access': 'warn',  // 需要类型信息
      // '@typescript-eslint/no-unsafe-call': 'warn',  // 需要类型信息
      // '@typescript-eslint/no-unsafe-return': 'warn',  // 需要类型信息

      // 基础代码质量规则（不需要类型信息）
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-var-requires': 'warn',
      '@typescript-eslint/prefer-as-const': 'warn',

      // 导入顺序
      'import/order': ['warn', {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index'
        ],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' }
      }],
    },
  },
  {
    // 临时豁免现有文件（逐步移除）
    files: [
      'src/index.ts',
      'src/server.ts',
      'src/tools/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // 测试文件特殊配置
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // 测试文件允许any
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    ignores: [
      'build/**',
      'coverage/**',
      'node_modules/**',
      'gac_workspace/**',
      '*.js',
      '*.cjs',
      '*.mjs',
      'playground/**',
    ],
  }
);
