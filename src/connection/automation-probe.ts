import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { ConnectionTimeoutError } from './errors.js';

const replySchema = z.object({
  id: z.string(),
  result: z.object({
    version: z.string().optional(),
    SDKVersion: z.string().optional(),
    pageId: z.union([z.string(), z.number()]).optional(),
    path: z.string().optional(),
  }).optional(),
  error: z.object({ message: z.string().optional() }).optional(),
});

export interface AutomationProbeResult {
  automation: boolean;
  ready: boolean;
  reason: string;
}

/** A bounded, read-only protocol probe. It never enables logs or changes the app. */
export function probeAutomation(endpoint: string, timeoutMs: number, requirePage = false): Promise<AutomationProbeResult> {
  return new Promise(resolve => {
    let automation = false;
    let settled = false;
    let stage: 'info' | 'page' = 'info';
    let id = randomUUID();
    const socket = new WebSocket(endpoint);
    const finish = (ready: boolean, reason: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve({ automation, ready, reason });
    };
    const timer = setTimeout(() => finish(false, stage === 'page' ? '当前页面未就绪' : '自动化协议无响应'), Math.max(1, timeoutMs));
    socket.addEventListener('open', () => {
      if (!settled) socket.send(JSON.stringify({ id, method: 'Tool.getInfo', params: {} }));
    });
    socket.addEventListener('message', event => {
      if (settled || typeof event.data !== 'string') return;
      try {
        const reply = replySchema.safeParse(JSON.parse(event.data));
        if (!reply.success || reply.data.id !== id) return;
        if (reply.data.error) return finish(false, reply.data.error.message ?? '自动化协议返回错误');
        const result = reply.data.result;
        if (stage === 'page') {
          const ready = result?.pageId !== undefined && Boolean(result.path);
          return finish(ready, ready ? 'ready' : '当前页面未就绪');
        }
        automation = Boolean(result?.version);
        if (!automation) return finish(false, '端点不是微信自动化服务');
        if (!requirePage) return finish(false, '自动化协议可用');
        if (!result?.SDKVersion) return finish(false, 'SDKVersion 缺失，运行时未就绪');
        if (result.SDKVersion !== 'dev' && !/^\d+\.\d+\.\d+(?:[-.].*)?$/.test(result.SDKVersion)) {
          return finish(false, 'SDKVersion 格式无效');
        }
        stage = 'page';
        id = randomUUID();
        socket.send(JSON.stringify({ id, method: 'App.getCurrentPage', params: {} }));
      } catch {
        finish(false, '自动化协议返回无效 JSON');
      }
    });
    socket.addEventListener('error', () => finish(false, 'WebSocket 连接失败'));
    socket.addEventListener('close', () => finish(false, 'WebSocket 已关闭'));
  });
}

export async function waitForAutomation(endpoint: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let reason = '自动化协议未就绪';
  while (Date.now() < deadline) {
    const probe = await probeAutomation(endpoint, Math.min(500, deadline - Date.now()), true);
    if (probe.ready) return;
    reason = probe.reason;
    const remaining = deadline - Date.now();
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(100, remaining)));
  }
  throw new ConnectionTimeoutError(`运行时就绪超时: ${reason}`, 'startup', { endpoint, reason });
}
