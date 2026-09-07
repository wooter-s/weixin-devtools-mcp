import type { MiniProgram } from 'miniprogram-automator';

import { executeConnectionStrategy } from './adapters.js';
import type { ConnectionError } from './errors.js';
import {
  ConnectionAttemptsExhaustedError,
  ConnectionTimeoutError,
  HealthCheckConnectionError,
  normalizeConnectionError,
} from './errors.js';
import { probeConnectionHealth } from './health-probe.js';
import { ProjectStartup } from './project-startup.js';
import { resolveConnectionPlan } from './resolver.js';
import type {
  ConnectionAttemptRecord,
  ConnectionConnectResult,
  ConnectionHealth,
  ConnectionRequest,
  ResolvedConnectionPlan,
  ResolvedConnectionRequest,
} from './types.js';

const DEFAULT_HEALTH_REFRESH_TIMEOUT_MS = 5_000;
const CANDIDATE_CLOSE_TIMEOUT_MS = 2_000;

export interface ConnectionExecutionResult {
  result: ConnectionConnectResult;
  reconnectRequest: ResolvedConnectionRequest;
}

export interface ConnectionExecutionOptions {
  trustedProjectEndpoint?: string;
  /** 当前执行阶段可使用的剩余预算；不会改写可复用的原始连接请求。 */
  remainingTimeoutMs?: number;
  /** 用于让 timing.totalMs 覆盖 manager 之前的连接生命周期阶段。 */
  timingStartedAt?: number;
}

function createConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneResolvedRequest(request: ResolvedConnectionRequest): ResolvedConnectionRequest {
  return {
    ...request,
    target: { ...request.target },
  };
}

function remainingTime(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

async function runWithinDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  phase: 'connect' | 'health_check',
  onLateSuccess?: (value: T) => Promise<void> | void,
): Promise<T> {
  if (timeoutMs <= 0) {
    void operation.then(async value => {
      if (onLateSuccess) {
        await onLateSuccess(value);
      }
    }).catch(() => undefined);
    throw new ConnectionTimeoutError('连接总超时已耗尽', phase);
  }

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observedOperation = operation.then(async value => {
    if (timedOut && onLateSuccess) {
      try {
        await onLateSuccess(value);
      } catch {
        // 迟到候选的清理失败不能制造未处理拒绝；会话所有权已经失效。
      }
    }
    return value;
  });
  try {
    return await Promise.race([
      observedOperation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new ConnectionTimeoutError(
            `连接操作在 ${timeoutMs}ms 内未完成`,
            phase,
            { timeoutMs },
          ));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function createAttemptRecord(
  index: number,
  method: ConnectionAttemptRecord['method'],
  startedAt: number,
  endpoint: string | null,
  error: ConnectionError | null,
): ConnectionAttemptRecord {
  return {
    index,
    method,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    outcome: error ? 'failed' : 'connected',
    endpoint,
    error: error?.toSummary() ?? null,
  };
}

/**
 * 无状态的连接策略执行器。
 *
 * 活跃会话、连接状态、生命周期队列和最近请求均由 MiniProgramContext 持有；
 * 此类只负责执行一次已解析连接计划及清理失败的候选连接。
 */
export class ConnectionManager {
  async disconnect(miniProgram: MiniProgram): Promise<void> {
    try {
      await miniProgram.disconnect();
    } catch {
      // 远端可能已经断开；调用方仍需收敛本地状态。
    }
  }

  async refreshHealth(
    miniProgram: MiniProgram,
    timeoutMs = DEFAULT_HEALTH_REFRESH_TIMEOUT_MS,
  ): Promise<ConnectionHealth> {
    if (timeoutMs <= 0) {
      throw new ConnectionTimeoutError('健康检查总超时已耗尽', 'health_check');
    }
    return runWithinDeadline(
      probeConnectionHealth(miniProgram),
      timeoutMs,
      'health_check',
    );
  }

  async #cleanupCandidate(
    method: ConnectionAttemptRecord['method'],
    miniProgram: MiniProgram,
  ): Promise<void> {
    if (method === 'launch') {
      const closable = miniProgram as MiniProgram & {
        close?: () => Promise<void> | void;
      };
      if (typeof closable.close === 'function') {
        try {
          await runWithinDeadline(
            Promise.resolve(closable.close()),
            CANDIDATE_CLOSE_TIMEOUT_MS,
            'connect',
          );
          return;
        } catch {
          // close 失败时仍需释放当前 transport。
        }
      }
    }
    await this.disconnect(miniProgram);
  }

  async connect(
    request: ConnectionRequest,
    options: ConnectionExecutionOptions = {},
  ): Promise<ConnectionExecutionResult> {
    return this.connectResolved(resolveConnectionPlan(request), options);
  }

  async connectResolved(
    plan: ResolvedConnectionPlan,
    options: ConnectionExecutionOptions = {},
  ): Promise<ConnectionExecutionResult> {
    const projectStartup = plan.request.target.kind === 'project' ? new ProjectStartup() : undefined;
    try {
      const executionStartedAt = Date.now();
      const timingStartedAt = options.timingStartedAt ?? executionStartedAt;
      const requestDeadline = timingStartedAt + plan.request.timeoutMs;
      const executionDeadline = options.remainingTimeoutMs === undefined
        ? requestDeadline
        : executionStartedAt + Math.max(0, options.remainingTimeoutMs);
      const deadline = Math.min(requestDeadline, executionDeadline);
      const warnings: string[] = [];
      const attempts: ConnectionAttemptRecord[] = [];
      let latestError: ConnectionError | null = null;

      for (const [attemptOffset, attempt] of plan.attempts.entries()) {
        const timeoutMs = remainingTime(deadline);
        if (timeoutMs <= 0) {
          latestError = new ConnectionTimeoutError(
            `连接总超时 ${plan.request.timeoutMs}ms 已耗尽`,
            'connect',
            { timeoutMs: plan.request.timeoutMs },
          );
          break;
        }

        const attemptStartedAt = Date.now();
        let candidate: MiniProgram | null = null;
        let endpoint: string | null = null;

        try {
          const strategyOptions = {
            ...(projectStartup ? { projectStartup } : {}),
            ...(attempt.method === 'connect' && options.trustedProjectEndpoint
              ? { trustedProjectEndpoint: options.trustedProjectEndpoint } : {}),
          };
          const strategyOperation = Object.keys(strategyOptions).length
            ? executeConnectionStrategy(attempt, timeoutMs, strategyOptions)
            : executeConnectionStrategy(attempt, timeoutMs);
          const adapterResult = await runWithinDeadline(
            strategyOperation,
            timeoutMs,
            'connect',
            lateResult => this.#cleanupCandidate(attempt.method, lateResult.miniProgram),
          );
          candidate = adapterResult.miniProgram;
          endpoint = adapterResult.endpoint;

          const connectMs = Date.now() - attemptStartedAt;
          const healthStart = Date.now();
          const health: ConnectionHealth = plan.request.healthCheck
            ? await this.refreshHealth(adapterResult.miniProgram, remainingTime(deadline))
            : {
                level: 'healthy',
                checks: [],
                checkedAt: new Date().toISOString(),
              };

          if (health.level === 'unhealthy') {
            throw new HealthCheckConnectionError('连接后健康检查失败', {
              method: attempt.method,
              endpoint: adapterResult.endpoint,
            });
          }

          attempts.push(createAttemptRecord(
            attemptOffset + 1,
            attempt.method,
            attemptStartedAt,
            endpoint,
            null,
          ));
          candidate = null;

          projectStartup?.commit();
          return {
            result: {
              ...adapterResult,
              connectionId: createConnectionId(),
              health,
              status: health.level === 'healthy' ? 'connected' : 'degraded',
              timing: {
                totalMs: Date.now() - timingStartedAt,
                connectMs,
                healthMs: Date.now() - healthStart,
              },
              attempts,
              warnings,
            },
            reconnectRequest: cloneResolvedRequest(plan.request),
          };
        } catch (error) {
          if (candidate) {
            await runWithinDeadline(
              this.#cleanupCandidate(attempt.method, candidate),
              remainingTime(deadline),
              'connect',
            ).catch(() => undefined);
          }

          latestError = normalizeConnectionError(
            error instanceof Error ? error : new Error(String(error)),
          );
          attempts.push(createAttemptRecord(
            attemptOffset + 1,
            attempt.method,
            attemptStartedAt,
            endpoint,
            latestError,
          ));
          warnings.push(`[${attempt.method}] ${latestError.message}`);
          if (latestError.code === 'CONNECTION_TIMEOUT') {
            // 底层 automator 不支持协作取消；超时 attempt 未收敛前不能启动下一次争抢。
            break;
          }
        }
      }

      throw new ConnectionAttemptsExhaustedError(attempts, latestError);
    } finally {
      await projectStartup?.dispose();
    }
  }
}
