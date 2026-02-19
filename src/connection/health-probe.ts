import type { MiniProgram } from 'miniprogram-automator';

import type {
  ConnectionHealth,
  HealthCheckItem,
  HealthLevel,
} from './types.js';

async function runCheck(
  name: HealthCheckItem['name'],
  execute: () => Promise<{ passed: boolean; message: string }>,
): Promise<HealthCheckItem> {
  const start = Date.now();
  try {
    const result = await execute();
    return {
      name,
      status: result.passed ? 'pass' : 'fail',
      message: result.message,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name,
      status: 'fail',
      message,
      durationMs: Date.now() - start,
    };
  }
}

function resolveLevel(checks: HealthCheckItem[]): HealthLevel {
  const failures = checks.filter(check => check.status === 'fail').length;
  if (failures === 0) {
    return 'healthy';
  }

  const transportCheck = checks.find(check => check.name === 'transport');
  if (!transportCheck || transportCheck.status === 'fail') {
    return 'unhealthy';
  }

  return 'degraded';
}

export async function probeConnectionHealth(miniProgram: MiniProgram): Promise<ConnectionHealth> {
  const checks: HealthCheckItem[] = [];

  checks.push(await runCheck('transport', async () => {
    await miniProgram.evaluate(() => true);
    return { passed: true, message: 'evaluate 调用成功' };
  }));

  let pagePath = '';

  checks.push(await runCheck('session', async () => {
    const page = await miniProgram.currentPage();
    if (!page) {
      return { passed: false, message: 'currentPage 为空' };
    }
    pagePath = await page.path;
    return { passed: true, message: 'currentPage 可访问' };
  }));

  checks.push(await runCheck('page', async () => {
    if (!pagePath) {
      return { passed: false, message: '页面路径为空' };
    }
    return { passed: true, message: `当前页面: ${pagePath}` };
  }));

  return {
    level: resolveLevel(checks),
    checks,
    checkedAt: new Date().toISOString(),
  };
}
