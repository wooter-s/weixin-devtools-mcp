/* global process, console */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'monitoring-probe', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['build/server.js', '--tools-profile=full'], stderr: 'pipe' });
transport.stderr?.on('data', () => {});
try {
  await client.connect(transport);
  for (const [name, args] of [
    ['connect_devtools', {target: process.env.PROBE_PROJECT ? {kind:'project',projectPath:process.env.PROBE_PROJECT,autoPort:9431,cliPath:'/Applications/wechatwebdevtools.app/Contents/MacOS/cli'} : {kind:'wsEndpoint',endpoint:process.env.INTEGRATION_WS_ENDPOINT || 'ws://127.0.0.1:9420'},timeoutMs:15000,healthCheck:false}],
    ['evaluate_script', {function: `() => { console.log('mcp-monitoring-probe'); return { page: getCurrentPages().map(p=>p.route), adapter: typeof getApp().$xfetch?.requestAdapter, request: typeof wx.request, task: 'not-called' }; }`}],
    ['list_console_messages', {pageSize:5}],
  ]) {
    const result = await client.callTool({name, arguments:args}, undefined, {timeout:20000});
    console.log(name, JSON.stringify(result.structuredContent));
    if (!result.structuredContent?.ok) {process.exitCode=1;break;}
  }
} finally {
  await client.callTool({ name: 'disconnect_devtools', arguments: {} }).catch(e=>console.error(e.message));
  await client.close();
}
