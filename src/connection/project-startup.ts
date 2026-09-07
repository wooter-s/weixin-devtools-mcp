import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

import type { MiniProgram } from 'miniprogram-automator';

import type { DetailedConnectResult, EnhancedConnectOptions } from '../core/types.js';
import { loadMiniProgramAutomator } from '../utils/automator-loader.js';

import { waitForAutomation } from './automation-probe.js';
import { ConnectionTimeoutError, EnvironmentConnectionError, SessionConflictConnectionError } from './errors.js';

export function portIsListening(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (listening: boolean): void => {
      clearTimeout(timer);
      socket.destroy();
      resolve(listening);
    };
    const timer = setTimeout(() => finish(false), Math.max(1, timeoutMs));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export function defaultCliPath(): string {
  if (process.platform === 'darwin') return '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  if (process.platform === 'win32') return 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat';
  throw new EnvironmentConnectionError(`不支持的平台: ${process.platform}，请指定 cliPath`, 'resolve');
}

/** Request-scoped ownership; never trusts a port merely because it is listening. */
export class ProjectStartup {
  #port: number | null = null;
  #projectPath: string | null = null;
  #cliPath: string | null = null;
  #process: ChildProcess | null = null;
  #disposed = false;
  #committed = false;
  #owned = false;

  commit(): void { this.#committed = true; }

  #remaining(deadline: number): number {
    if (this.#disposed || Date.now() >= deadline) {
      throw new ConnectionTimeoutError('项目启动总预算已耗尽', 'startup');
    }
    return deadline - Date.now();
  }

  async #runCli(cliPath: string, projectPath: string, port: number, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(cliPath, ['auto', '--project', projectPath, '--auto-port', String(port)], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.#process = child;
      let output = '';
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new ConnectionTimeoutError(`CLI 启动超时: ${output.slice(-1000)}`, 'startup'));
      }, timeoutMs);
      const read = (data: Buffer): void => { output = (output + data.toString()).slice(-8000); };
      child.stdout?.on('data', read);
      child.stderr?.on('data', read);
      child.once('error', error => finish(new EnvironmentConnectionError(error.message, 'startup')));
      child.once('exit', (code, signal) => {
        if (code === 0 && !this.#disposed) {
          this.#owned = true;
          finish();
        } else {
          finish(new EnvironmentConnectionError(
            `CLI 启动失败 (code=${code}, signal=${signal}): ${output}`, 'startup',
          ));
        }
      });
    });
  }

  async connect(options: EnhancedConnectOptions): Promise<DetailedConnectResult> {
    const startedAt = Date.now();
    // Finish with useful startup diagnostics before the manager's outer deadline wins.
    const deadline = startedAt + Math.max(1, (options.timeout ?? 45_000) - 25);
    const projectPath = options.projectPath.startsWith('@playground/')
      ? path.resolve(options.projectPath.replace('@playground/', 'playground/'))
      : path.resolve(options.projectPath);
    const canonicalPath = fs.realpathSync(projectPath);
    if (this.#projectPath && this.#projectPath !== canonicalPath) {
      throw new SessionConflictConnectionError('启动所有权不能跨项目复用');
    }
    this.#projectPath = canonicalPath;
    this.#cliPath = options.cliPath ?? defaultCliPath();
    let port = this.#port ?? options.autoPort ?? options.port ?? 9420;
    const occupied = await portIsListening(port, Math.min(500, this.#remaining(deadline)));
    if (occupied && !(this.#owned && this.#port === port)) {
      if (options.autoPort || options.port || options.mode === 'connect') {
        throw new SessionConflictConnectionError(`端口 ${port} 已被现有进程占用，无法验证其项目归属`, { port });
      }
      do { port += 1; } while (await portIsListening(port, Math.min(500, this.#remaining(deadline))));
    }
    this.#port = port;
    if (!occupied || !this.#owned) {
      this.#owned = false;
      if (typeof options.autoAudits === 'boolean') {
        const configPath = path.join(canonicalPath, 'project.config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { setting?: { autoAudits?: boolean } };
        config.setting = { ...config.setting, autoAudits: options.autoAudits };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      }
      await this.#runCli(this.#cliPath, canonicalPath, port, this.#remaining(deadline));
    }
    await waitForAutomation(`ws://127.0.0.1:${port}`, this.#remaining(deadline));
    this.#remaining(deadline);
    const automator = await loadMiniProgramAutomator();
    const candidate = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${port}`, timeout: this.#remaining(deadline) });
    try {
      this.#remaining(deadline);
      const currentPage = await candidate.currentPage();
      this.#remaining(deadline);
      if (!currentPage || !currentPage.path) throw new Error('无法获取当前页面');
      return {
        miniProgram: candidate,
        currentPage,
        pagePath: currentPage.path,
        connectionMode: options.mode === 'connect' ? 'connect' : 'launch',
        startupTime: Date.now() - startedAt,
        healthStatus: 'healthy',
        processInfo: { pid: this.#process?.pid ?? 0, port },
      };
    } catch (error) {
      await this.#disconnect(candidate);
      throw error;
    }
  }

  async #disconnect(candidate: MiniProgram): Promise<void> {
    try { await candidate.disconnect(); } catch { /* Already closed. */ }
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    const child = this.#process;
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    if (!this.#committed && this.#owned && this.#cliPath && this.#projectPath) {
      this.#owned = false;
      try {
        await promisify(execFile)(this.#cliPath, ['close', '--project', this.#projectPath], { timeout: 2000 });
      } catch { /* Cleanup must not replace the startup diagnosis. */ }
    }
  }
}
