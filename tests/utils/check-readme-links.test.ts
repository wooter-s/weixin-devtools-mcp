import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/check-readme-links.mjs');

async function runLinkCheck(tempRoot: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: tempRoot,
    env: {
      ...process.env,
      README_LINK_CHECK_ROOT: tempRoot,
    },
    encoding: 'utf8',
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
  };
}

function createFixture(structure: Record<string, string>): string {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-link-check-'));

  for (const [relativePath, content] of Object.entries(structure)) {
    const absolutePath = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
  }

  return tempRoot;
}

function createBaseFixture(overrides: Record<string, string>): string {
  return createFixture({
    'README.md': [
      '# Demo',
      '',
      '[![Version](https://img.shields.io/badge/version-0.5.0-blue.svg)](https://github.com/example/weixin-devtools-mcp)',
      '[Repository](https://github.com/example/weixin-devtools-mcp)',
      '[Issues](https://github.com/example/weixin-devtools-mcp/issues)',
      '[License](LICENSE)',
    ].join('\n'),
    'LICENSE': 'MIT\n',
    'package.json': JSON.stringify({
      name: 'weixin-devtools-mcp',
      version: '0.5.0',
      repository: {
        type: 'git',
        url: 'https://github.com/example/weixin-devtools-mcp.git',
      },
      homepage: 'https://github.com/example/weixin-devtools-mcp#readme',
      bugs: {
        url: 'https://github.com/example/weixin-devtools-mcp/issues',
      },
      files: ['README.md', 'LICENSE', 'build'],
    }),
    'package-lock.json': JSON.stringify({
      name: 'weixin-devtools-mcp',
      version: '0.5.0',
      packages: {
        '': {
          name: 'weixin-devtools-mcp',
          version: '0.5.0',
        },
      },
    }),
    'CHANGELOG.md': '# 变更日志\n\n## v0.5.0\n',
    ...overrides,
  });
}

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

describe('check-readme-links script', () => {
  it('允许 README 使用仓库绝对文档链接与有效锚点', async () => {
    const tempRoot = createBaseFixture({
      'README.md': [
        '# Demo',
        '',
        '[![Version](https://img.shields.io/badge/version-0.5.0-blue.svg)](https://github.com/example/weixin-devtools-mcp)',
        '[Repository](https://github.com/example/weixin-devtools-mcp)',
        '[Issues](https://github.com/example/weixin-devtools-mcp/issues)',
        '[License](LICENSE)',
        '[Guide](https://github.com/example/weixin-devtools-mcp/blob/main/docs/guide.md#overview)',
      ].join('\n'),
      'docs/guide.md': ['# Guide', '', '## Overview', '', 'content'].join('\n'),
    });
    tempRoots.push(tempRoot);

    const result = await runLinkCheck(tempRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('一致性校验通过');
  });

  it('checks translated README version, anchors and npm-relative links', async () => {
    const tempRoot = createBaseFixture({
      'README.zh-CN.md': [
        '# 中文',
        '[![Version](https://img.shields.io/badge/version-0.4.0-blue.svg)](https://github.com/example/weixin-devtools-mcp)',
        '[Issues](https://github.com/example/weixin-devtools-mcp/issues)',
        '[Guide](docs/guide.md#missing)',
      ].join('\n'),
      'docs/guide.md': '# Guide\n',
    });
    tempRoots.push(tempRoot);
    const result = await runLinkCheck(tempRoot);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('README.zh-CN.md');
    expect(result.stderr).toContain('version badge');
    expect(result.stderr).toContain('npm 发布视角');
    expect(result.stderr).toContain('missing');
  });

  it('阻止 README 中指向未发布文件的相对链接', async () => {
    const tempRoot = createBaseFixture({
      'README.md': ['# Demo', '', '[![Version](https://img.shields.io/badge/version-0.5.0-blue.svg)](https://github.com/example/weixin-devtools-mcp)', '[Guide](docs/guide.md)'].join('\n'),
      'docs/guide.md': '# Guide\n',
    });
    tempRoots.push(tempRoot);

    const result = await runLinkCheck(tempRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('README npm 发布视角链接校验失败');
    expect(result.stderr).toContain('docs/guide.md');
  });

  it('阻止 README 中的目录链接', async () => {
    const tempRoot = createBaseFixture({
      'README.md': ['# Demo', '', '[![Version](https://img.shields.io/badge/version-0.5.0-blue.svg)](https://github.com/example/weixin-devtools-mcp)', '[Docs](docs/)'].join('\n'),
      'docs/index.md': '# Docs\n',
    });
    tempRoots.push(tempRoot);

    const result = await runLinkCheck(tempRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('README 目录链接校验失败');
    expect(result.stderr).toContain('docs/');
  });

  it('校验 README 或文档中的 Markdown 锚点是否存在', async () => {
    const tempRoot = createBaseFixture({
      'README.md': [
        '# Demo',
        '',
        '[![Version](https://img.shields.io/badge/version-0.5.0-blue.svg)](https://github.com/example/weixin-devtools-mcp)',
        '[License](LICENSE)',
        '[Guide](https://github.com/example/weixin-devtools-mcp/blob/main/docs/guide.md#missing-anchor)',
      ].join('\n'),
      'docs/guide.md': ['# Guide', '', '## Overview'].join('\n'),
    });
    tempRoots.push(tempRoot);

    const result = await runLinkCheck(tempRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Markdown 锚点校验失败');
    expect(result.stderr).toContain('missing-anchor');
  });

  it('阻止 README version badge 与 package.json.version 漂移', async () => {
    const tempRoot = createBaseFixture({
      'README.md': [
        '# Demo',
        '',
        '[![Version](https://img.shields.io/badge/version-0.4.9-blue.svg)](https://github.com/example/weixin-devtools-mcp)',
        '[Repository](https://github.com/example/weixin-devtools-mcp)',
      ].join('\n'),
    });
    tempRoots.push(tempRoot);

    const result = await runLinkCheck(tempRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('README 版本徽章校验失败');
    expect(result.stderr).toContain('package.json.version (0.5.0)');
  });

  it('阻止 CHANGELOG 最新版本与 package.json.version 漂移', async () => {
    const tempRoot = createBaseFixture({
      'CHANGELOG.md': '# 变更日志\n\n## v0.4.9\n',
    });
    tempRoots.push(tempRoot);

    const result = await runLinkCheck(tempRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('CHANGELOG 版本校验失败');
    expect(result.stderr).toContain('v0.5.0');
  });

  it('阻止 package-lock.json 与 package.json 名称或版本漂移', async () => {
    const tempRoot = createBaseFixture({
      'package-lock.json': JSON.stringify({
        name: 'weixin-devtools-mcp-renamed',
        version: '0.4.9',
        packages: {
          '': {
            name: 'weixin-devtools-mcp-renamed',
            version: '0.4.9',
          },
        },
      }),
    });
    tempRoots.push(tempRoot);

    const result = await runLinkCheck(tempRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('package-lock.json 一致性校验失败');
    expect(result.stderr).toContain('顶层 name');
    expect(result.stderr).toContain('顶层 version');
    expect(result.stderr).toContain('packages[""].name');
    expect(result.stderr).toContain('packages[""].version');
  });
});
