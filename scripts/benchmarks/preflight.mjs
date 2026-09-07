#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  collectEnvironment,
  FIXTURE_FINGERPRINT_EXCLUDES,
  findRunningDevtoolsProcesses,
  fingerprintPaths,
  sha256,
  sourceFingerprint,
  stableStringify,
} from './lib/core.mjs';

const USAGE = '用法: node scripts/benchmarks/preflight.mjs --phase baseline|optimized --output <preflight.json> [--repo-root <path>] [--devtools-app <path>] [--allow-existing-devtools]';

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  const args = { repoRoot: process.cwd(), phase: null, output: null, allowExistingDevtools: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-existing-devtools') {
      args.allowExistingDevtools = true;
      continue;
    }
    if (['--repo-root', '--phase', '--output', '--devtools-app'].includes(argument)) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} 缺少值`);
      }
      args[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`未知参数: ${argument}`);
  }
  if (!['baseline', 'optimized'].includes(args.phase) || !args.output) {
    throw new Error(USAGE);
  }
  return args;
}

export function runPreflight(options) {
  const repoRoot = path.resolve(options.repoRoot);
  const workloadPath = path.join(repoRoot, 'benchmarks', 'workload.v1.json');
  const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'benchmark-app');
  const issues = [];

  if (!fs.existsSync(workloadPath)) {
    issues.push({ code: 'WORKLOAD_NOT_FOUND', message: 'benchmarks/workload.v1.json 不存在' });
  }
  if (!fs.existsSync(fixturePath)) {
    issues.push({ code: 'FIXTURE_NOT_FOUND', message: 'tests/fixtures/benchmark-app 不存在' });
  }

  const environment = collectEnvironment({ devtoolsAppPath: options.devtoolsAppPath });
  if (!environment.devtoolsVersion) {
    issues.push({ code: 'DEVTOOLS_NOT_FOUND', message: '未发现可读取版本的微信开发者工具' });
  }
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
    issues.push({ code: 'NODE_VERSION_UNSUPPORTED', message: `基准要求 Node >=22，当前为 ${process.versions.node}` });
  }

  const runningDevtools = findRunningDevtoolsProcesses();
  if (runningDevtools.length > 0 && !options.allowExistingDevtools) {
    issues.push({
      code: 'UNOWNED_DEVTOOLS_RUNNING',
      message: `发现 ${runningDevtools.length} 个既有 DevTools 进程；为避免影响用户会话，预检已中止且不会主动终止进程`,
      pids: runningDevtools.map((item) => item.pid),
    });
  }

  let workload = null;
  if (fs.existsSync(workloadPath)) {
    const definition = JSON.parse(fs.readFileSync(workloadPath, 'utf8'));
    workload = {
      version: definition.version,
      fingerprint: sha256(stableStringify(definition)),
      path: 'benchmarks/workload.v1.json',
    };
  }
  const fixture = fs.existsSync(fixturePath)
    ? fingerprintPaths(repoRoot, ['tests/fixtures/benchmark-app'], {
        exclude: FIXTURE_FINGERPRINT_EXCLUDES,
      })
    : null;
  const source = sourceFingerprint(repoRoot);

  return {
    schemaVersion: '1.0',
    recordType: 'preflight',
    phase: options.phase,
    createdAt: new Date().toISOString(),
    valid: issues.length === 0,
    environment,
    workload,
    fixture,
    source,
    issues,
    safety: {
      existingDevtoolsAllowed: options.allowExistingDevtools,
      processesTerminated: 0,
    },
  };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(USAGE);
      return;
    }
    const result = runPreflight({
      repoRoot: args.repoRoot,
      phase: args.phase,
      devtoolsAppPath: args.devtoolsApp,
      allowExistingDevtools: args.allowExistingDevtools,
    });
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    if (!result.valid) {
      for (const issue of result.issues) {
        console.error(`${issue.code}: ${issue.message}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`预检通过，环境指纹: ${result.environment.comparisonFingerprint}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
