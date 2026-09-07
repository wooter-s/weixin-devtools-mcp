/* global process, console */
import assert from 'node:assert/strict';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const endpoint = process.env.INTEGRATION_WS_ENDPOINT || 'ws://127.0.0.1:9420';
for (const profile of ['full', 'core']) {
  const client = new Client({name:'monitoring-cleanup',version:'1'});
  const transport = new StdioClientTransport({command:process.execPath,args:['build/server.js',`--tools-profile=${profile}`],stderr:'pipe'});
  transport.stderr?.on('data',()=>{});
  try {
    await client.connect(transport);
    const connection=await client.callTool({name:'connect_devtools',arguments:{target:{kind:'wsEndpoint',endpoint},healthCheck:false}});
    assert.equal(connection.structuredContent?.ok,true);
    if(profile==='core') {
      // This read verifies cleanup only. Behavioral acceptance reads public list/detail tools.
      const result=await client.callTool({name:'evaluate_script',arguments:{function:`() => ({
        consoleActive: wx.__weixinMcpConsole?.active ?? false,
        consolePatches: wx.__weixinMcpConsole?.patches.length ?? 0,
        networkActive: wx.__weixinMcpNetwork?.active ?? false,
        networkPatches: wx.__weixinMcpNetwork?.patches.length ?? 0,
        temporaryFiles: wx.getFileSystemManager().readdirSync(wx.env.USER_DATA_PATH).filter(name=>name.startsWith('mcp-monitoring-')).length
      })`}});
      assert.equal(result.structuredContent?.ok,true);
      const state=result.structuredContent.data.result;
      console.log(JSON.stringify(state));
      assert.deepEqual(state,{consoleActive:false,consolePatches:0,networkActive:false,networkPatches:0,temporaryFiles:0});
    }
  } finally {
    const result=await client.callTool({name:'disconnect_devtools',arguments:{}});
    assert.equal(result.structuredContent?.ok,true);
    await client.close();
  }
}
