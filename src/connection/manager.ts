import type { MiniProgram, Page } from 'miniprogram-automator';

import { executeConnectionStrategy } from './adapters.js';
import type { ConnectionError } from './errors.js';
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

const DISCONNECT_SETTLE_DELAY_MS = 200;
const RECONNECT_DELAY_MS = 300;

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
  #lifecycleQueue: Promise<void> = Promise.resolve();

  #enqueueLifecycleOperation<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.#lifecycleQueue.then(operation, operation);
    this.#lifecycleQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  async #cleanupMiniProgram(miniProgram: MiniProgram): Promise<void> {
    try {
      await miniProgram.disconnect();
    } catch {
      // 忽略断连异常，始终收敛本地状态
    }

    await new Promise(resolve => setTimeout(resolve, DISCONNECT_SETTLE_DELAY_MS));
  }

  async #cleanupCurrentSession(options?: {
    lastError?: ConnectionErrorSummary | null;
    clearLastRequest?: boolean;
  }): Promise<ConnectionStatusSnapshot> {
    const activeSession = this.#session;
    this.#session = null;

    if (activeSession?.miniProgram) {
      await this.#cleanupMiniProgram(activeSession.miniProgram);
    }

    this.#status = {
      ...createDisconnectedStatus(),
      lastError: options?.lastError ?? null,
    };

    if (options?.clearLastRequest) {
      this.#lastRequest = null;
    }

    return this.getStatusSnapshot();
  }

  async #connectInternal(request: ConnectionRequest): Promise<ConnectionConnectResult> {
    const plan = resolveConnectionPlan(request);

    // 单活语义：新建连接前先清理已有会话
    await this.#cleanupCurrentSession();

    this.#status = {
      ...createDisconnectedStatus(),
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
      let attemptSession: StoredSession | null = null;

      try {
        const adapterResult = await executeConnectionStrategy(strategy, plan.request);
        attemptSession = {
          miniProgram: adapterResult.miniProgram,
          currentPage: adapterResult.currentPage,
        };

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

        this.#session = attemptSession;
        attemptSession = null;
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
        if (attemptSession?.miniProgram) {
          await this.#cleanupMiniProgram(attemptSession.miniProgram);
          attemptSession = null;
        }

        latestError = normalizeConnectionError(error instanceof Error ? error : new Error(String(error)));
        warnings.push(`[${strategy}] ${latestError.message}`);
      }
    }

    if (!latestError) {
      latestError = new ValidationConnectionError('未执行任何连接尝试');
    }

    await this.#cleanupCurrentSession({
      lastError: latestError.toSummary(),
    });

    throw latestError;
  }

  async #reconnectInternal(request?: ConnectionRequest): Promise<ConnectionConnectResult> {
    const baseRequest = request ?? this.#lastRequest;
    if (!baseRequest) {
      throw new ValidationConnectionError(
        '没有可用于重连的历史连接参数',
        ['调用 reconnect_devtools 时显式传入连接参数'],
      );
    }

    await this.#disconnectInternal();
    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));

    return this.#connectInternal(baseRequest);
  }

  async #disconnectInternal(): Promise<ConnectionStatusSnapshot> {
    return this.#cleanupCurrentSession();
  }

  async #refreshHealthInternal(): Promise<ConnectionStatusSnapshot> {
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
      return this.#cleanupCurrentSession({
        lastError: {
          code: 'HEALTH_CHECK_FAILED',
          phase: 'health_check',
          message: '连接健康检查失败，已自动断开连接',
          suggestions: ['调用 connect_devtools 或 reconnect_devtools 重新建立连接'],
          timestamp: new Date().toISOString(),
        },
      });
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
    return this.#enqueueLifecycleOperation(() => this.#connectInternal(request));
  }

  async reconnect(request?: ConnectionRequest): Promise<ConnectionConnectResult> {
    return this.#enqueueLifecycleOperation(() => this.#reconnectInternal(request));
  }

  async disconnect(): Promise<ConnectionStatusSnapshot> {
    return this.#enqueueLifecycleOperation(() => this.#disconnectInternal());
  }

  async refreshHealth(): Promise<ConnectionStatusSnapshot> {
    return this.#enqueueLifecycleOperation(() => this.#refreshHealthInternal());
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
