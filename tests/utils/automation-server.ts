import { createServer } from 'node:http';
import { createRequire } from 'node:module';

// The installed automator owns ws; this fixture only models its wire protocol.
interface Socket {
  on(event: 'message', handler: (data: string) => void): void;
  send(data: string): void;
  terminate(): void;
}
interface WireServer {
  clients: Set<Socket>;
  on(event: 'connection', handler: (socket: Socket) => void): void;
  close(callback: () => void): void;
}
const { Server } = createRequire(import.meta.url)('ws') as {
  Server: new (options: { server: ReturnType<typeof createServer> }) => WireServer;
};

export async function automationServer(
  reply: (method: string) => object = method => method === 'Tool.getInfo'
    ? { version: '2.02.2607271', SDKVersion: '3.0.0' }
    : { pageId: 1, path: 'pages/home/index', query: {} },
  port = 0,
) {
  const methods: string[] = [];
  const http = createServer((_request, response) => { response.writeHead(426); response.end(); });
  const wire = new Server({ server: http });
  wire.on('connection', socket => socket.on('message', data => {
    const message = JSON.parse(String(data)) as { id: string; method: string };
    methods.push(message.method);
    socket.send(JSON.stringify({ id: message.id, result: reply(message.method) }));
  }));
  await new Promise<void>(resolve => http.listen(port, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  return {
    port: address.port, methods, wire,
    async close() {
      for (const socket of wire.clients) socket.terminate();
      await new Promise<void>(resolve => wire.close(resolve));
      http.closeAllConnections();
      await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
    },
  };
}
