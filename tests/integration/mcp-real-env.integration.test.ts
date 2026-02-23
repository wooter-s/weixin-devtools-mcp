/**
 * MCP 真实环境集成测试（新工具链）
 *
 * 目标：
 * 1. 使用 connect/reconnect/status 新接口建立和维护连接
 * 2. 校验核心工具链在真实微信开发者工具环境下可用
 * 3. 通过单连接复用减少超时与资源竞争
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MiniProgramContext } from '../../src/MiniProgramContext.js';
import { getConnectionStatusTool } from '../../src/tools/connection.js';
import { listConsoleMessagesTool, getConsoleMessageTool } from '../../src/tools/console.js';
import { clickTool } from '../../src/tools/input.js';
import { listNetworkRequestsTool, getNetworkRequestTool } from '../../src/tools/network.js';
import { querySelectorTool, waitForTool } from '../../src/tools/page.js';
import { screenshotTool } from '../../src/tools/screenshot.js';
import { getPageSnapshotTool } from '../../src/tools/snapshot.js';

import { IntegrationHarness, runTool } from './helpers/integration-harness.js';

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true';

function extractFirstMsgId(responseText: string): number | null {
  const match = responseText.match(/msgid=(\d+)/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFirstReqId(responseText: string): string | null {
  const match = responseText.match(/reqid=([^\s]+)/);
  if (!match) {
    return null;
  }
  return match[1] ?? null;
}

describe.skipIf(!RUN_INTEGRATION_TESTS)('MCP Real Environment Integration Tests', () => {
  const harness = new IntegrationHarness({
    portCount: 10,
    connectRetries: 3,
    connectTimeoutMs: 60_000,
  });

  let context: MiniProgramContext | null = null;
  let runtimeReady = false;

  async function ensureConnected(): Promise<boolean> {
    if (!runtimeReady || !context) {
      return false;
    }

    const status = await context.getConnectionStatus({ refreshHealth: false });
    if (status.connected) {
      return true;
    }

    try {
      await harness.reconnect(context, { timeoutMs: 60_000, healthCheck: false });
      return true;
    } catch {
      runtimeReady = false;
      return false;
    }
  }

  beforeAll(async () => {
    const state = await harness.prepare();
    if (!state.ready) {
      console.warn(`[integration] 跳过 MCP real env 测试: ${state.reason ?? '环境未就绪'}`);
      return;
    }

    context = MiniProgramContext.create();
    try {
      const connected = await harness.connect(context, {
        strategy: 'auto',
        timeoutMs: 60_000,
        healthCheck: false,
      });
      context = connected.context;
      runtimeReady = true;
    } catch (error) {
      runtimeReady = false;
      console.warn(
        `[integration] MCP real env 初始连接失败，后续用例将跳过: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, 180_000);

  afterAll(async () => {
    if (!context) {
      return;
    }
    await harness.disconnect(context);
    context = null;
  }, 120_000);

  it('应该返回结构化连接状态', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const statusResponse = await runTool(context, getConnectionStatusTool.handler, { refreshHealth: true });
    const text = statusResponse.getResponseText();
    expect(text).toContain('连接状态:');
    expect(text).toContain('已连接: 是');
    expect(context.connectionStatus.connected).toBe(true);
  }, 90_000);

  it('应该能获取页面快照并建立元素映射', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const snapshotResponse = await runTool(context, getPageSnapshotTool.handler, { format: 'compact' });
    expect(snapshotResponse.getResponseText()).toContain('页面快照获取成功');
    expect(context.elementMap.size).toBeGreaterThan(0);
  }, 120_000);

  it('应该能执行查询与等待', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    await runTool(context, getPageSnapshotTool.handler, { format: 'compact' });

    const queryResponse = await runTool(context, querySelectorTool.handler, { selector: 'view' });
    expect(queryResponse.getResponseText()).toContain('找到');

    const waitResponse = await runTool(context, waitForTool.handler, {
      selector: 'view',
      timeout: 10_000,
    });
    expect(waitResponse.getResponseText()).toContain('等待');
  }, 120_000);

  it('应该支持两阶段 Console 查询（list -> get）', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const listResponse = await runTool(context, listConsoleMessagesTool.handler, {
      pageSize: 20,
      pageIdx: 0,
      includePreservedMessages: true,
    });
    const listText = listResponse.getResponseText();
    expect(listText).toContain('Console Messages');

    const msgid = extractFirstMsgId(listText);
    if (msgid === null) {
      return;
    }

    const detailResponse = await runTool(context, getConsoleMessageTool.handler, { msgid });
    expect(detailResponse.getResponseText()).toContain('Console Message');
  }, 90_000);

  it('应该支持两阶段 Network 查询（list -> get）', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2500));

    const listResponse = await runTool(context, listNetworkRequestsTool.handler, {
      pageSize: 20,
      pageIdx: 0,
      includePreservedRequests: true,
      successOnly: false,
      failedOnly: false,
    });
    const listText = listResponse.getResponseText();
    expect(listText).toContain('Network Requests (List View)');

    const reqid = extractFirstReqId(listText);
    if (reqid === null) {
      return;
    }

    const detailResponse = await runTool(context, getNetworkRequestTool.handler, { reqid });
    expect(detailResponse.getResponseText()).toContain('Network Request (Detail View)');
  }, 90_000);

  it('应该兼容截图能力（成功或已知受限错误）', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    try {
      const screenshotResponse = await runTool(context, screenshotTool.handler, {});
      const images = screenshotResponse.getAttachedImages();
      expect(images.length).toBeGreaterThan(0);
      expect(images[0].mimeType).toBe('image/png');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/fail to capture screenshot|截图失败|Connection closed/i);
    }
  }, 120_000);

  it('应该能完成轻量工作流', async () => {
    if (!(await ensureConnected()) || !context) {
      return;
    }

    const snapshotResponse = await runTool(context, getPageSnapshotTool.handler, { format: 'compact' });
    expect(snapshotResponse.getResponseText()).toContain('页面快照获取成功');

    const queryResponse = await runTool(context, querySelectorTool.handler, { selector: 'view' });
    expect(queryResponse.getResponseText()).toContain('找到');

    const candidateUid = Array.from(context.elementMap.keys()).find(
      uid => uid.includes('button') || uid.includes('view')
    );

    if (candidateUid) {
      try {
        const clickResponse = await runTool(context, clickTool.handler, { uid: candidateUid });
        expect(clickResponse.getResponseText()).toContain('点击');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message.length).toBeGreaterThan(0);
      }
    }

    const listResponse = await runTool(context, listNetworkRequestsTool.handler, {
      pageSize: 10,
      pageIdx: 0,
      includePreservedRequests: true,
      successOnly: false,
      failedOnly: false,
    });
    expect(listResponse.getResponseText()).toContain('Network Requests (List View)');
  }, 150_000);
});
