import { spawn } from 'node:child_process';

export class StdioJsonRpcClient {
  constructor(options) {
    this.command = options.command;
    this.args = options.args ?? [];
    this.cwd = options.cwd;
    this.env = options.env;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.child = null;
    this.closing = false;
  }

  async start() {
    if (this.child) {
      throw new Error('stdio client 已启动');
    }
    const child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.onStdout(chunk));
    child.stderr.on('data', (chunk) => {
      this.stderrBuffer = `${this.stderrBuffer}${chunk}`.slice(-8192);
    });
    child.on('exit', (code, signal) => {
      this.child = null;
      if (!this.closing) {
        this.rejectPending(new Error(`MCP stdio 子进程退出: code=${code} signal=${signal}`));
      }
    });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'weixin-mcp-benchmark', version: '1.0.0' },
    });
    this.notify('notifications/initialized', {});
  }

  onStdout(chunk) {
    this.stdoutBuffer += chunk;
    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline < 0) {
        return;
      }
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) {
        continue;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.rejectPending(new Error('MCP stdout 包含非 JSON-RPC 内容'));
        continue;
      }
      if (message.id === undefined || message.id === null) {
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) {
        continue;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        const error = new Error(message.error.message ?? 'JSON-RPC error');
        error.code = `JSONRPC_${message.error.code ?? 'ERROR'}`;
        pending.reject(error);
      } else {
        pending.resolve(message.result);
      }
    }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  request(method, params = {}) {
    if (!this.child?.stdin.writable) {
      return Promise.reject(new Error('MCP stdio 子进程未连接'));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        const suffix = this.stderrBuffer ? '（子进程有 stderr，已省略以避免泄露）' : '';
        reject(new Error(`MCP 请求超时: ${method}${suffix}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method, params = {}) {
    if (!this.child?.stdin.writable) {
      throw new Error('MCP stdio 子进程未连接');
    }
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  listTools() {
    return this.request('tools/list', {});
  }

  callTool(name, args = {}) {
    return this.request('tools/call', { name, arguments: args });
  }

  async close() {
    const child = this.child;
    if (!child) {
      return;
    }
    this.closing = true;
    child.stdin.end();
    const exited = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 1000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
    if (!exited && child.exitCode === null) {
      child.kill('SIGTERM');
    }
    this.rejectPending(new Error('MCP stdio client 已关闭'));
    this.child = null;
  }
}
