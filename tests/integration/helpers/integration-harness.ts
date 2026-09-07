import path from 'path';

import type { MiniProgram } from 'miniprogram-automator';

import { MiniProgramContext } from '../../../src/MiniProgramContext.js';
import { ToolCategory } from '../../../src/config/tool-category.js';
import type { ConnectionRequest } from '../../../src/connection/index.js';
import { SimpleToolResponse } from '../../../src/tools/ToolDefinition.js';
import {
  connectDevtoolsTool,
  disconnectDevtoolsTool,
  reconnectDevtoolsTool,
} from '../../../src/tools/connection.js';
import {
  allocatePorts,
  checkIntegrationTestEnvironment,
  cleanupConflictingWeChatInstances,
  findAvailablePort,
  safeCleanup,
  sleep,
} from '../../utils/test-utils.js';

import {
  handleIntegrationUnavailable,
  isIntegrationStrictMode,
  shouldRunIntegrationTests,
} from './integration-mode.js';

const DEFAULT_PROJECT_PATH = path.resolve(process.env.INTEGRATION_PROJECT_PATH || 'tests/fixtures/monitoring-app');
const DEFAULT_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

export interface IntegrationHarnessOptions {
  /** Explicit existing endpoint; null forces project launch even when the env variable is set. */
  wsEndpoint?: string | null;
  projectPath?: string;
  cliPath?: string;
  startPort?: number;
  portCount?: number;
  connectTimeoutMs?: number;
  connectRetries?: number;
  reuseSession?: boolean;
}

export interface IntegrationPrepareState {
  enabled: boolean;
  ready: boolean;
  projectPath: string;
  cliPath: string;
  warnings: string[];
  issues: string[];
  reason: string | null;
}

interface SharedSession {
  context: MiniProgramContext;
  refs: number;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function isTransientConnectionError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('connection closed') ||
    message.includes('连接微信开发者工具失败') ||
    message.includes('failed connecting to ws://') ||
    message.includes('websocket')
  );
}

async function closeMiniProgramSafely(miniProgram: MiniProgram): Promise<void> {
  const closable = miniProgram as MiniProgram & {
    disconnect?: () => Promise<void>;
    close?: () => Promise<void>;
  };

  await safeCleanup(async () => {
    if (typeof closable.disconnect === 'function') {
      await closable.disconnect();
    }
  });

  await safeCleanup(async () => {
    if (typeof closable.close === 'function') {
      await closable.close();
    }
  });
}

export async function runTool<TParams>(
  context: MiniProgramContext,
  handler: (request: { params: TParams }, response: SimpleToolResponse, ctx: MiniProgramContext) => Promise<void>,
  params: TParams
): Promise<SimpleToolResponse> {
  const response = new SimpleToolResponse();
  await handler({ params }, response, context);
  return response;
}

/** 集成链路覆盖全部工具类别，避免默认 core profile 将监听明确置为 disabled。 */
export function createIntegrationContext(): MiniProgramContext {
  return MiniProgramContext.create({
    toolProfile: {
      profile: 'full',
      activeToolCount: 31,
      disabledToolCount: 0,
      activeCategories: Object.values(ToolCategory),
      inactiveCategories: [],
    },
  });
}

export class IntegrationHarness {
  static #sharedSessions: Map<string, SharedSession> = new Map();

  readonly #projectPath: string;
  readonly #wsEndpoint: string | null;
  readonly #cliPath: string;
  readonly #startPort: number;
  readonly #portCount: number;
  readonly #connectTimeoutMs: number;
  readonly #connectRetries: number;
  readonly #enabled: boolean;
  readonly #reuseSession: boolean;
  readonly #sessionKey: string;

  #allocatedPorts: number[] = [];
  #cursor = 0;
  #prepared = false;
  #ready = false;
  #warnings: string[] = [];
  #issues: string[] = [];
  #reason: string | null = null;
  #boundSharedContext: MiniProgramContext | null = null;

  constructor(options: IntegrationHarnessOptions = {}) {
    this.#projectPath = options.projectPath ?? DEFAULT_PROJECT_PATH;
    this.#wsEndpoint = options.wsEndpoint === undefined ? process.env.INTEGRATION_WS_ENDPOINT || null : options.wsEndpoint;
    this.#cliPath = options.cliPath ?? process.env.INTEGRATION_CLI_PATH ?? DEFAULT_CLI_PATH;
    this.#startPort = options.startPort ?? 9420;
    this.#portCount = options.portCount ?? 8;
    this.#connectTimeoutMs = options.connectTimeoutMs ?? 60_000;
    this.#connectRetries = options.connectRetries ?? 3;
    this.#enabled = shouldRunIntegrationTests();
    this.#reuseSession = options.reuseSession ?? process.env.INTEGRATION_REUSE_SESSION !== 'false';
    this.#sessionKey = `${this.#projectPath}::${this.#cliPath}::${this.#wsEndpoint ?? "project"}`;
  }

  get projectPath(): string {
    return this.#projectPath;
  }

  get cliPath(): string {
    return this.#cliPath;
  }

  isReady(): boolean {
    return this.#ready;
  }

  getState(): IntegrationPrepareState {
    return {
      enabled: this.#enabled,
      ready: this.#ready,
      projectPath: this.#projectPath,
      cliPath: this.#cliPath,
      warnings: [...this.#warnings],
      issues: [...this.#issues],
      reason: this.#reason,
    };
  }

  async prepare(): Promise<IntegrationPrepareState> {
    if (this.#prepared) {
      return this.getState();
    }
    this.#prepared = true;

    if (!this.#enabled) {
      this.#reason = 'RUN_INTEGRATION_TESTS 未启用';
      this.#ready = false;
      return this.getState();
    }

    if (this.#wsEndpoint) {
      this.#ready = true;
      this.#warnings.push(`显式连接已有端点: ${this.#wsEndpoint}；本 suite 不验证 project 启动`);
      return this.getState();
    }

    const envCheck = await checkIntegrationTestEnvironment(this.#projectPath, this.#cliPath);
    this.#warnings = [...envCheck.warnings];
    this.#issues = [...envCheck.issues];

    if (!envCheck.isReady) {
      this.#reason = `环境检查失败: ${this.#issues.join('; ')}`;
      this.#ready = false;
      handleIntegrationUnavailable('环境检查失败', this.#reason);
      return this.getState();
    }

    const cleanupSuccess = await cleanupConflictingWeChatInstances(this.#projectPath, this.#cliPath);
    if (!cleanupSuccess) {
      const cleanupMessage = '冲突实例清理未完全成功，连接稳定性可能受影响';
      this.#warnings.push(cleanupMessage);
      if (isIntegrationStrictMode()) {
        this.#ready = false;
        this.#reason = cleanupMessage;
        handleIntegrationUnavailable('环境清理失败', cleanupMessage);
      }
    }

    try {
      this.#allocatedPorts = await allocatePorts(this.#portCount);
      this.#cursor = 0;
      this.#ready = true;
      this.#reason = null;
    } catch (error) {
      const normalizedError = normalizeError(error);
      this.#ready = false;
      this.#issues.push(`端口池分配失败: ${normalizedError.message}`);
      this.#reason = normalizedError.message;
      handleIntegrationUnavailable('端口池分配失败', normalizedError);
    }

    return this.getState();
  }

  async reservePort(): Promise<number> {
    if (this.#cursor < this.#allocatedPorts.length) {
      const port = this.#allocatedPorts[this.#cursor];
      this.#cursor += 1;
      return port;
    }

    const fallbackPort = await findAvailablePort(this.#startPort + this.#cursor);
    this.#cursor += 1;
    return fallbackPort;
  }

  async connect(
    context?: MiniProgramContext,
    overrides: Partial<ConnectionRequest> = {}
  ): Promise<{ context: MiniProgramContext; response: SimpleToolResponse }> {
    if (this.#reuseSession) {
      const sharedSession = IntegrationHarness.#sharedSessions.get(this.#sessionKey);
      if (sharedSession) {
        try {
          const status = await sharedSession.context.getConnectionStatus({ refreshHealth: false });
          if (status.connected) {
            sharedSession.refs += 1;
            this.#boundSharedContext = sharedSession.context;
            const response = new SimpleToolResponse();
            response.appendResponseLine('♻️ 复用已有连接会话');
            return { context: sharedSession.context, response };
          }
        } catch {
          // 忽略旧会话状态异常，后续建立新连接
        }

        await this.#disconnectDirect(sharedSession.context);
        IntegrationHarness.#sharedSessions.delete(this.#sessionKey);
      }
    }

    const targetContext = context ?? createIntegrationContext();
    const attempts = Math.max(1, this.#connectRetries);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const target = overrides.target ?? (this.#wsEndpoint ? { kind: 'wsEndpoint' as const, endpoint: this.#wsEndpoint } : {
        kind: 'project' as const,
        projectPath: this.#projectPath,
        cliPath: this.#cliPath,
        autoPort: await this.reservePort(),
      });
      const params: ConnectionRequest = {
        target,
        timeoutMs: overrides.timeoutMs ?? this.#connectTimeoutMs,
        healthCheck: overrides.healthCheck ?? false,
      };

      try {
        const response = await runTool(targetContext, connectDevtoolsTool.handler, params);
        if (!targetContext.miniProgram || !targetContext.connectionStatus.connected) {
          throw new Error('连接工具返回成功，但 Context 未持有可用 MiniProgram 会话');
        }
        if (this.#reuseSession) {
          IntegrationHarness.#sharedSessions.set(this.#sessionKey, {
            context: targetContext,
            refs: 1,
          });
          this.#boundSharedContext = targetContext;
        }
        return { context: targetContext, response };
      } catch (error) {
        lastError = normalizeError(error);
        await this.#disconnectDirect(targetContext);

        if (!isTransientConnectionError(lastError) || attempt >= attempts) {
          throw lastError;
        }

        await sleep(1200 * attempt);
      }
    }

    throw lastError ?? new Error('连接失败，且没有可用错误信息');
  }

  async reconnect(
    context: MiniProgramContext,
    request?: ConnectionRequest
  ): Promise<SimpleToolResponse> {
    return runTool(context, reconnectDevtoolsTool.handler, request ?? {});
  }

  async disconnect(context: MiniProgramContext): Promise<void> {
    if (this.#reuseSession) {
      const sharedSession = IntegrationHarness.#sharedSessions.get(this.#sessionKey);
      if (sharedSession && (sharedSession.context === context || sharedSession.context === this.#boundSharedContext)) {
        sharedSession.refs -= 1;
        if (sharedSession.refs > 0) {
          return;
        }

        IntegrationHarness.#sharedSessions.delete(this.#sessionKey);
        this.#boundSharedContext = null;
        await this.#disconnectDirect(sharedSession.context);
        return;
      }
    }

    await this.#disconnectDirect(context);
  }

  async #disconnectDirect(context: MiniProgramContext): Promise<void> {
    if (isIntegrationStrictMode()) {
      await runTool(context, disconnectDevtoolsTool.handler, {});
    } else {
      await safeCleanup(async () => {
        await runTool(context, disconnectDevtoolsTool.handler, {});
      });
    }

    const miniProgram = context.miniProgram;
    if (miniProgram) {
      await closeMiniProgramSafely(miniProgram);
    }
    context.disconnect();
  }
}
