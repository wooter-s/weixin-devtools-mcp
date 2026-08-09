import type { MiniProgram } from 'miniprogram-automator';

import { executeConnectionStrategy } from './adapters.js';
import type { ConnectionError } from './errors.js';
import {
  HealthCheckConnectionError,
  ValidationConnectionError,
  normalizeConnectionError,
} from './errors.js';
import { probeConnectionHealth } from './health-probe.js';
import { resolveConnectionPlan } from './resolver.js';
import type {
  ConnectionConnectResult,
  ConnectionHealth,
  ConnectionRequest,
  ResolvedConnectionRequest,
} from './types.js';

const DISCONNECT_SETTLE_DELAY_MS = 200;

export interface ConnectionExecutionResult {
  result: ConnectionConnectResult;
  reconnectRequest: ResolvedConnectionRequest;
}

function createConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 无状态的连接策略执行器。
 *
 * 活跃会话、连接状态、生命周期队列和最近请求均由 MiniProgramContext 持有；
 * 此类只负责执行一次连接计划及清理失败的候选连接。
 */
export class ConnectionManager {
  async disconnect(miniProgram: MiniProgram): Promise<void> {
    try {
      await miniProgram.disconnect();
    } catch {
      // 远端可能已经断开；调用方仍需收敛本地状态。
    }

    await new Promise(resolve => setTimeout(resolve, DISCONNECT_SETTLE_DELAY_MS));
  }

  async refreshHealth(miniProgram: MiniProgram): Promise<ConnectionHealth> {
    return probeConnectionHealth(miniProgram);
  }

  async connect(request: ConnectionRequest): Promise<ConnectionExecutionResult> {
    const plan = resolveConnectionPlan(request);
    const startedAt = Date.now();
    const warnings: string[] = [];
    let latestError: ConnectionError | null = null;

    for (const strategy of plan.attempts) {
      const attemptStartedAt = Date.now();
      let candidate: MiniProgram | null = null;

      try {
        const adapterResult = await executeConnectionStrategy(strategy, plan.request);
        candidate = adapterResult.miniProgram;

        const connectMs = Date.now() - attemptStartedAt;
        const healthStart = Date.now();
        const health: ConnectionHealth = plan.request.healthCheck
          ? await this.refreshHealth(adapterResult.miniProgram)
          : {
              level: 'healthy',
              checks: [],
              checkedAt: new Date().toISOString(),
            };

        if (health.level === 'unhealthy') {
          throw new HealthCheckConnectionError('连接后健康检查失败', {
            strategy,
            endpoint: adapterResult.endpoint,
          });
        }

        candidate = null;
        const status = health.level === 'healthy' ? 'connected' : 'degraded';
        const connectionId = createConnectionId();

        return {
          result: {
            ...adapterResult,
            connectionId,
            health,
            status,
            timing: {
              totalMs: Date.now() - startedAt,
              connectMs,
              healthMs: Date.now() - healthStart,
            },
            warnings,
          },
          reconnectRequest: {
            ...plan.request,
            strategy,
            fallback: plan.request.fallback.filter(item => item !== strategy),
          },
        };
      } catch (error) {
        if (candidate) {
          await this.disconnect(candidate);
        }

        latestError = normalizeConnectionError(
          error instanceof Error ? error : new Error(String(error)),
        );
        warnings.push(`[${strategy}] ${latestError.message}`);
      }
    }

    if (!latestError) {
      throw new ValidationConnectionError('未执行任何连接尝试');
    }

    throw latestError;
  }
}
