#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import http from 'node:http';

import { sha256 } from './lib/core.mjs';

const USAGE = '用法: node scripts/benchmarks/local-server.mjs [--port <port>]';

export function startBenchmarkServer(options = {}) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 19420;
  const requests = [];
  const server = http.createServer((request, response) => {
    const parsed = new URL(request.url ?? '/', `http://${host}:${port}`);
    const token = parsed.searchParams.get('token') ?? '';
    requests.push({
      method: request.method ?? 'GET',
      path: parsed.pathname,
      tokenHash: token ? sha256(token) : null,
      seq: parsed.searchParams.get('seq'),
    });
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify({ ok: true, path: parsed.pathname }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('无法确定本地基准服务端口'));
        return;
      }
      resolve({
        server,
        requests,
        url: `http://${host}:${address.port}/benchmark`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => error ? closeReject(error) : closeResolve());
        }),
      });
    });
  });
}

function parsePort(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return null;
  }
  if (argv.length === 0) {
    return 19420;
  }
  if (argv.length !== 2 || argv[0] !== '--port') {
    throw new Error(USAGE);
  }
  const port = Number.parseInt(argv[1], 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('port 必须是 0 到 65535 的整数');
  }
  return port;
}

async function main() {
  try {
    const port = parsePort(process.argv.slice(2));
    if (port === null) {
      console.log(USAGE);
      return;
    }
    const handle = await startBenchmarkServer({ port });
    console.log(JSON.stringify({ ready: true, url: handle.url }));
    const stop = async () => {
      await handle.close();
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
