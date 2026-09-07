#!/usr/bin/env node

import automator from 'miniprogram-automator';
import { pathToFileURL } from 'node:url';

import { startBenchmarkServer } from './local-server.mjs';

const USAGE = '用法: node scripts/benchmarks/fixture-smoke.mjs --ws-endpoint ws://127.0.0.1:<owned-port>';

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  if (argv.length !== 2 || argv[0] !== '--ws-endpoint' || !argv[1].startsWith('ws://127.0.0.1:')) {
    throw new Error(USAGE);
  }
  return { wsEndpoint: argv[1] };
}

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = 'FIXTURE_ASSERTION_FAILED';
    throw error;
  }
}

export async function runFixtureSmoke(wsEndpoint) {
  const localServer = await startBenchmarkServer({ port: 0 });
  const miniProgram = await automator.connect({ wsEndpoint });
  const checks = [];
  try {
    await miniProgram.reLaunch(`/pages/index/index?endpoint=${encodeURIComponent(localServer.url)}`);
    const page = await miniProgram.currentPage();
    assert(page?.path === 'pages/index/index', '当前项目不是 benchmark fixture 首页');

    const duplicates = await page.$$('.duplicate-item');
    assert(Array.isArray(duplicates) && duplicates.length === 20, '重复元素数量不是 20');
    await duplicates[7].tap();
    const clickLog = await page.data('actionLog');
    assert(clickLog.at(-1)?.target === 'item-07', '重复元素 actionLog 目标错误');
    checks.push('duplicate-elements');

    const reorder = await page.$('#reorder-items');
    const remove = await page.$('#remove-target');
    const restore = await page.$('#restore-items');
    assert(reorder && remove && restore, '动态列表控制按钮缺失');
    await reorder.tap();
    await remove.tap();
    assert((await page.$$('.duplicate-item')).length === 19, '删除目标后元素数不是 19');
    await restore.tap();
    assert((await page.$$('.duplicate-item')).length === 20, '恢复后元素数不是 20');
    checks.push('reorder-remove-restore');

    const input = await page.$('#benchmark-input');
    const textarea = await page.$('#benchmark-textarea');
    assert(input && textarea, 'input/textarea 缺失');
    await input.input('fixture-input');
    await textarea.input('fixture-textarea');
    assert(await input.value() === 'fixture-input', 'input 回读不一致');
    assert(await textarea.value() === 'fixture-textarea', 'textarea 回读不一致');
    checks.push('input-textarea');

    await page.setData({ consoleToken: 'fixture-console', requestToken: 'fixture-request', requestEndpoint: localServer.url });
    const emitConsole = await page.$('#emit-console');
    const sendRequest = await page.$('#send-request');
    assert(emitConsole && sendRequest, 'Console/Network 控制按钮缺失');
    await emitConsole.tap();
    await sendRequest.tap();
    const requestDeadline = Date.now() + 2000;
    while (localServer.requests.length === 0 && Date.now() < requestDeadline) {
      await page.waitFor(50);
    }
    assert(localServer.requests.length === 1, '本地请求数量不是 1');
    assert(localServer.requests[0].path === '/benchmark', '本地请求路径错误');
    checks.push('console-local-request');

    await miniProgram.navigateTo(`/pages/secondary/index?endpoint=${encodeURIComponent(localServer.url)}`);
    const secondary = await miniProgram.currentPage();
    assert(secondary?.path === 'pages/secondary/index', '未进入第二页');
    const crossPageTarget = await secondary.$('.shared-target');
    assert(crossPageTarget, '第二页同 selector 目标缺失');
    await crossPageTarget.tap();
    const secondaryLog = await secondary.data('actionLog');
    assert(secondaryLog.at(-1)?.target === 'secondary-shared-target', '第二页 actionLog 目标错误');
    checks.push('secondary-page');

    return { schemaVersion: '1.0', recordType: 'fixture-smoke', benchmarkEligible: false, ok: true, checks };
  } finally {
    miniProgram.disconnect();
    await localServer.close();
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(USAGE);
      return;
    }
    console.log(JSON.stringify(await runFixtureSmoke(args.wsEndpoint), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? `${error.code ?? 'ERROR'}: ${error.message}` : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
