import path from 'path';

import type { MiniProgram } from 'miniprogram-automator';

import { MiniProgramContext } from '../../../src/MiniProgramContext.js';
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

const DEFAULT_PROJECT_PATH = path.resolve(process.cwd(), 'playground/wx');
const DEFAULT_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

export interface IntegrationHarnessOptions {
  projectPath?: string;
  cliPath?: string;
  startPort?: number;
  portCount?: number;
  connectTimeoutMs?: number;
  connectRetries?: number;
  verbose?: boolean;
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

export class IntegrationHarness {
  static #sharedSessions: Map<string, SharedSession> = new Map();

  readonly #projectPath: string;
  readonly #cliPath: string;
  readonly #startPort: number;
  readonly #portCount: number;
  readonly #connectTimeoutMs: number;
  readonly #connectRetries: number;
  readonly #verbose: boolean;
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
    this.#cliPath = options.cliPath ?? DEFAULT_CLI_PATH;
    this.#startPort = options.startPort ?? 9420;
    this.#portCount = options.portCount ?? 8;
    this.#connectTimeoutMs = options.connectTimeoutMs ?? 60_000;
    this.#connectRetries = options.connectRetries ?? 3;
    this.#verbose = options.verbose ?? false;
    this.#enabled = process.env.RUN_INTEGRATION_TESTS === 'true';
    this.#reuseSession = options.reuseSession ?? process.env.INTEGRATION_REUSE_SESSION !== 'false';
    this.#sessionKey = `${this.#projectPath}::${this.#cliPath}`;
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

    const envCheck = await checkIntegrationTestEnvironment(this.#projectPath, this.#cliPath);
    this.#warnings = [...envCheck.warnings];
    this.#issues = [...envCheck.issues];

    if (!envCheck.isReady) {
      this.#reason = `环境检查失败: ${this.#issues.join('; ')}`;
      this.#ready = false;
      return this.getState();
    }

    const cleanupSuccess = await cleanupConflictingWeChatInstances(this.#projectPath, this.#cliPath);
    if (!cleanupSuccess) {
      this.#warnings.push('冲突实例清理未完全成功，连接稳定性可能受影响');
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

    const targetContext = context ?? MiniProgramContext.create();
    const attempts = Math.max(1, this.#connectRetries);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const autoPort = overrides.autoPort ?? await this.reservePort();
      const params: ConnectionRequest = {
        strategy: 'auto',
        projectPath: this.#projectPath,
        cliPath: this.#cliPath,
        autoPort,
        timeoutMs: this.#connectTimeoutMs,
        healthCheck: false,
        autoDiscover: true,
        verbose: this.#verbose,
        ...overrides,
      };

      try {
        const response = await runTool(targetContext, connectDevtoolsTool.handler, params);
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
    overrides: Partial<ConnectionRequest> = {}
  ): Promise<SimpleToolResponse> {
    const params: Partial<ConnectionRequest> = {
      strategy: 'auto',
      projectPath: this.#projectPath,
      cliPath: this.#cliPath,
      timeoutMs: this.#connectTimeoutMs,
      healthCheck: false,
      autoDiscover: true,
      ...overrides,
    };
    return runTool(context, reconnectDevtoolsTool.handler, params);
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
    await safeCleanup(async () => {
      await runTool(context, disconnectDevtoolsTool.handler, {});
    });

    const miniProgram = context.miniProgram;
    if (miniProgram) {
      await closeMiniProgramSafely(miniProgram);
    }
    context.disconnect();
  }
}
