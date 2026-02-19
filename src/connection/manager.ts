import type { MiniProgram, Page } from 'miniprogram-automator';

import { executeConnectionStrategy } from './adapters.js';
import type {
  ConnectionError} from './errors.js';
import {
  HealthCheckConnectionError,
  ValidationConnectionError,
  normalizeConnectionError,
} from './errors.js';
import { probeConnectionHealth } from './health-probe.js';
import { resolveConnectionPlan } from './resolver.js';
import {
  createDisconnectedStatus,
  type ConnectionConnectResult,
  type ConnectionErrorSummary,
  type ConnectionHealth,
  type ConnectionRequest,
  type ConnectionStatusSnapshot,
  type ResolvedConnectionRequest,
} from './types.js';

interface StoredSession {
  miniProgram: MiniProgram;
  currentPage: Page;
}

function createConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneStatus(status: ConnectionStatusSnapshot): ConnectionStatusSnapshot {
  return {
    ...status,
    health: status.health
      ? {
          ...status.health,
          checks: status.health.checks.map(check => ({ ...check })),
        }
      : null,
    lastError: status.lastError ? { ...status.lastError } : null,
  };
}

export class ConnectionManager {
  #session: StoredSession | null = null;
  #status: ConnectionStatusSnapshot = createDisconnectedStatus();
  #lastRequest: ResolvedConnectionRequest | null = null;

  getSession(): StoredSession | null {
    return this.#session;
  }

  getStatusSnapshot(): ConnectionStatusSnapshot {
    return cloneStatus(this.#status);
  }

  getLastRequest(): ResolvedConnectionRequest | null {
    return this.#lastRequest ? { ...this.#lastRequest, fallback: [...this.#lastRequest.fallback] } : null;
  }

  async connect(request: ConnectionRequest): Promise<ConnectionConnectResult> {
    const plan = resolveConnectionPlan(request);
    this.#status = {
      ...this.#status,
      state: 'connecting',
      connected: false,
      strategyUsed: null,
      endpoint: null,
      lastError: null,
    };

    const startedAt = Date.now();
    const warnings: string[] = [];
    let latestError: ConnectionError | null = null;

    for (const strategy of plan.attempts) {
      const attemptStartedAt = Date.now();
      try {
        const adapterResult = await executeConnectionStrategy(strategy, plan.request);
        const connectMs = Date.now() - attemptStartedAt;
        const healthStart = Date.now();
        const health: ConnectionHealth = plan.request.healthCheck
          ? await probeConnectionHealth(adapterResult.miniProgram)
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

        const connectionId = createConnectionId();
        const totalMs = Date.now() - startedAt;
        const healthMs = Date.now() - healthStart;
        const pagePath = adapterResult.pagePath;
        const status = health.level === 'healthy' ? 'connected' : 'degraded';

        this.#session = {
          miniProgram: adapterResult.miniProgram,
          currentPage: adapterResult.currentPage,
        };
        this.#lastRequest = {
          ...plan.request,
          strategy,
          fallback: plan.request.fallback.filter(item => item !== strategy),
        };
        this.#status = {
          connectionId,
          state: status,
          strategyUsed: adapterResult.strategyUsed,
          endpoint: adapterResult.endpoint,
          connected: true,
          hasCurrentPage: pagePath.length > 0,
          pagePath,
          health,
          lastError: null,
          lastConnectedAt: new Date().toISOString(),
          lastHealthCheckAt: health.checkedAt,
        };

        return {
          ...adapterResult,
          connectionId,
          health,
          status,
          timing: {
            totalMs,
            connectMs,
            healthMs,
          },
          warnings,
        };
      } catch (error) {
        latestError = normalizeConnectionError(error instanceof Error ? error : new Error(String(error)));
        warnings.push(`[${strategy}] ${latestError.message}`);
      }
    }

    if (!latestError) {
      latestError = new ValidationConnectionError('未执行任何连接尝试');
    }

    this.#session = null;
    this.#status = {
      ...createDisconnectedStatus(),
      lastError: latestError.toSummary(),
    };

    throw latestError;
  }

  async reconnect(request?: ConnectionRequest): Promise<ConnectionConnectResult> {
    const baseRequest = request ?? this.#lastRequest;
    if (!baseRequest) {
      throw new ValidationConnectionError(
        '没有可用于重连的历史连接参数',
        ['调用 reconnect_devtools 时显式传入连接参数'],
      );
    }

    await this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 300));
    return this.connect(baseRequest);
  }

  async disconnect(): Promise<ConnectionStatusSnapshot> {
    if (this.#session?.miniProgram) {
      const miniProgram = this.#session.miniProgram;
      try {
        miniProgram.removeAllListeners('console');
        miniProgram.removeAllListeners('exception');
      } catch {
        // 忽略监听器清理异常
      }

      try {
        await miniProgram.disconnect();
      } catch {
        // 忽略断连异常，始终清理本地状态
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    this.#session = null;
    this.#status = createDisconnectedStatus();
    return this.getStatusSnapshot();
  }

  async refreshHealth(): Promise<ConnectionStatusSnapshot> {
    if (!this.#session) {
      this.#status = createDisconnectedStatus();
      return this.getStatusSnapshot();
    }

    const health = await probeConnectionHealth(this.#session.miniProgram);
    const levelToState: Record<typeof health.level, ConnectionStatusSnapshot['state']> = {
      healthy: 'connected',
      degraded: 'degraded',
      unhealthy: 'disconnected',
    };

    if (health.level === 'unhealthy') {
      this.#session = null;
      this.#status = {
        ...createDisconnectedStatus(),
        lastError: {
          code: 'HEALTH_CHECK_FAILED',
          phase: 'health_check',
          message: '连接健康检查失败，已自动标记为断开',
          suggestions: ['调用 connect_devtools 或 reconnect_devtools 重新建立连接'],
          timestamp: new Date().toISOString(),
        },
      };
      return this.getStatusSnapshot();
    }

    const pagePath = this.#session.currentPage ? await this.#session.currentPage.path : null;
    this.#status = {
      ...this.#status,
      state: levelToState[health.level],
      connected: true,
      hasCurrentPage: !!pagePath,
      pagePath,
      health,
      lastHealthCheckAt: health.checkedAt,
    };

    return this.getStatusSnapshot();
  }

  markDisconnectedWithError(error: ConnectionErrorSummary): ConnectionStatusSnapshot {
    this.#session = null;
    this.#status = {
      ...createDisconnectedStatus(),
      lastError: error,
    };
    return this.getStatusSnapshot();
  }
}
