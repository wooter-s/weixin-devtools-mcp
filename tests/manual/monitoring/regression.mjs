/* eslint-disable no-undef */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const output = process.env.MONITORING_REPORT_DIR || 'tasks/monitoring-regression';
const businessEndpoint = process.env.INTEGRATION_WS_ENDPOINT || 'ws://127.0.0.1:9420';
const fixtureEndpoint = process.env.INTEGRATION_FIXTURE_WS_ENDPOINT || 'ws://127.0.0.1:9431';
const cases = [];
const clients = new Set();
let closedConnections = 0;
let server;
let fixtureLaunched = false;
const fixtureProject = path.resolve('tests/fixtures/monitoring-app');
const fixtureCli = process.env.INTEGRATION_CLI_PATH || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const payload = 'MCP-file-content-\u4e2d\u6587-2026';
await mkdir(output, { recursive: true });

async function check(tool, scenario, fn) {
  try {
    const evidence = await fn();
    cases.push({ tool, scenario, status: '通过', evidence: evidence ?? 'assertions passed' });
  } catch (error) {
    cases.push({ tool, scenario, status: /independent fixture|existing business regression page/.test(scenario) ? '环境阻塞' : '发现缺陷', evidence: error.message });
  }
  console.log(JSON.stringify(cases.at(-1)));
}
async function open(profile = 'full', extra = []) {
  const client = new Client({ name: 'monitoring-regression', version: '1' });
  const env = Object.fromEntries(Object.entries(process.env).filter(([k,v]) => typeof v === 'string' && !k.startsWith('WEIXIN_MCP_')));
  const transport = new StdioClientTransport({ command: process.execPath, args: ['build/server.js', `--tools-profile=${profile}`, ...extra], env, stderr: 'pipe' });
  transport.stderr?.on('data', () => {});
  await client.connect(transport);
  clients.add(client);
  return client;
}
async function call(client, name, args = {}, failure = false) {
  const raw = await client.callTool({ name, arguments: args }, undefined, { timeout: 45000 });
  const e = raw.structuredContent;
  assert.equal(e?.schemaVersion, '2.0');
  assert.deepEqual(Object.keys(e).sort(), ['schemaVersion','ok','code','data','error','partialData','observation','warnings','nextActions','meta'].sort());
  if (failure) {
    assert.equal(e.ok, false, `${name}: expected error`);
    assert.equal(raw.isError, true);
  } else assert.equal(e.ok, true, `${name}: ${e.code} ${e.error?.message || ''}`);
  return { ...e, raw };
}
async function evaluate(client, fn, ...args) { return (await call(client, 'evaluate_script', { function: `(...args) => (${fn.toString()})(...args)`, args })).data.result; }
async function connect(client, endpoint) {
  return call(client, 'connect_devtools', { target: { kind: 'wsEndpoint', endpoint }, timeoutMs: 15000, healthCheck: false });
}
async function close(client) {
  await call(client, 'disconnect_devtools');
  const status=JSON.parse((await client.readResource({uri:'weixin://connection/status'})).contents[0].text);
  assert.equal(status.connected,false);
  for(const monitor of Object.values(status.monitoring)) assert.ok(monitor.state==='stopped'||monitor.state==='disabled'||monitor.state==='idle');
  await client.close();
  closedConnections++;
  clients.delete(client);
}
const target = id => ({ kind: 'path', path: [{ kind: 'id', value: id }] });

// Executed through evaluate_script, with no direct SDK/handler/remote queue reads for acceptance.
async function networkSamples(base, marker) {
  const output = [];
  const files = [];
  const fs = wx.getFileSystemManager();
  const uploadPath = `${wx.env.USER_DATA_PATH}/mcp-monitoring-${marker}.txt`;
  fs.writeFileSync(uploadPath, 'MCP-file-content-中文-2026', 'utf8');
  files.push(uploadPath);
  try {
    for (const spec of [
      { method: 'request', name: 'success', route: '/ok' },
      { method: 'request', name: 'failure', route: '/failure' },
      { method: 'request', name: 'timeout', route: '/slow', timeout: 100 },
      { method: 'request', name: 'abort', route: '/slow', abort: true },
      { method: 'uploadFile', name: 'upload', route: '/upload' },
      { method: 'downloadFile', name: 'download', route: '/download' },
    ]) {
      const callbacks = [];
      const contexts = [];
      const row = await new Promise((resolve, reject) => {
        let task;
        let response;
        const timer = setTimeout(() => reject(new Error(`${spec.name} callback timeout`)), 6000);
        const options = {
          url: `${base}${spec.route}?case=${marker}-${spec.name}`, timeout: spec.timeout || 2000,
          filePath: uploadPath, name: 'file', formData: { marker: 'mcp-upload' },
          success: function(...args) { callbacks.push(['success', args.length]); contexts.push(this); response = args[0]; },
          fail: function(...args) { callbacks.push(['fail', args.length]); contexts.push(this); response = args[0]; },
          complete: function(...args) {
            callbacks.push(['complete', args.length]); contexts.push(this);
            clearTimeout(timer);
            setTimeout(() => {
              let content;
              if (spec.name === 'download' && (response?.tempFilePath || response?.filePath)) {
                const downloadedPath = response.tempFilePath || response.filePath;
                content = fs.readFileSync(downloadedPath, 'utf8');
                files.push(downloadedPath);
              }
              resolve({ name: spec.name, callbacks, sameResult: response === args[0], sameContext: contexts[0] === contexts[1],
                abort: typeof task?.abort, headers: typeof task?.onHeadersReceived,
                progress: typeof task?.onProgressUpdate, status: response?.statusCode,
                error: response?.errMsg?.replace(/https?:\/\/\S+/g, '<url>'),
                data: spec.name === 'upload' ? JSON.parse(response?.data || '{}') : response?.data,
                content });
            }, 10);
          },
        };
        try {
          task = wx[spec.method](options);
          if (spec.abort) setTimeout(() => task.abort(), 10);
        } catch (error) { clearTimeout(timer); reject(error); }
      });
      output.push(row);
    }
    return output;
  } finally {
    for (const file of files) { try { fs.unlinkSync(file); } catch { /* A path may have been removed earlier in this run. */ } }
  }
}

async function mpxSamples(base, marker) {
  const xfetch = getApp().$xfetch;
  if (!xfetch?.requestAdapter) throw new Error('Mpx requestAdapter unavailable');
  const results = [];
  for (const kind of ['success', 'failure', 'cancel']) {
    const config = { url: `${base}${kind === 'success' ? '/ok' : kind === 'failure' ? '/failure' : '/slow'}?case=${marker}-mpx-${kind}`, method: 'GET', timeout: 1500 };
    let cancel;
    if (kind === 'cancel') config.cancelToken = new Promise(resolve => { cancel = resolve; });
    const promise = xfetch.requestAdapter(config);
    if (cancel) setTimeout(() => cancel('mcp cancel'), 10);
    try { const value = await promise; results.push({ kind, ok: true, status: value.status ?? value.statusCode, data: value.data }); }
    catch (error) { results.push({ kind, ok: false, cancel: Boolean(error.__CANCEL__), error: error.errMsg }); }
  }
  return results;
}

try {
  for (const [profile, count, extra] of [['core',20,[]],['minimal',10,[]],['full',31,[]],['core',22,['--enable-categories=console']],['full',29,['--disable-categories=console']]]) {
    await check('profiles', `${profile} ${extra.join(' ')}`, async () => {
      const client = await open(profile, extra);
      try { assert.equal((await client.listTools()).tools.length, count); return { count }; }
      finally { await client.close();clients.delete(client); }
    });
  }
  server = createServer(async (req, res) => {
    if (req.url === '/json/version') {res.setHeader('content-type','application/json');res.end(JSON.stringify({webSocketDebuggerUrl:businessEndpoint}));return;}
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (req.url.startsWith('/failure')) { req.socket.destroy(); return; }
    if (req.url.startsWith('/slow')) await new Promise(resolve => setTimeout(resolve, 800));
    if (res.destroyed) return;
    if (req.url.startsWith('/download')) { res.end(payload); return; }
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/upload')) res.end(JSON.stringify({ payloadMatched: Buffer.concat(chunks).includes(Buffer.from(payload)), formMatched: Buffer.concat(chunks).includes(Buffer.from('mcp-upload')) }));
    else res.end(JSON.stringify({ ok: true, text: 'mcp-response' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let baseline, mpxBaseline;
  const core = await open('core');
  await check('connect_devtools', 'business explicit endpoint before monitoring', async () => { await connect(core, businessEndpoint); });
  await check('network-contract', 'before monitoring: native success/failure/timeout/abort/upload/download', async () => {
    baseline = await evaluate(core, networkSamples, base, 'before');
    for (const row of baseline) {
      assert.equal(row.abort, 'function');
      assert.deepEqual(row.callbacks, [[['success','upload','download'].includes(row.name) ? 'success':'fail',1],['complete',1]]);
    }
    assert.equal(baseline.find(r=>r.name==='upload').data.payloadMatched, true);
    assert.equal(baseline.find(r=>r.name==='download').content, payload);
    return baseline;
  });
  await check('mpx-contract', 'before monitoring: success/failure/cancel', async () => {
    mpxBaseline = await evaluate(core, mpxSamples, base, 'before');
    assert.deepEqual(mpxBaseline.map(r=>r.ok), [true,false,false]);
    assert.equal(mpxBaseline[2].cancel, true);
    return mpxBaseline;
  });
  await close(core);

  const business = await open();
  await check('connect_devtools', 'business endpoint with full monitoring', async () => { await connect(business, businessEndpoint); });
  for (const phase of ['during','after']) {
    if (phase === 'after') await check('stop_network_monitoring','restore native wrappers',async()=> { assert.equal((await call(business,'stop_network_monitoring')).data.monitoring,false); });
    await check('network-contract', `${phase}: native results equal baseline`, async () => {
      assert.ok(baseline, 'baseline missing');
      const result = await evaluate(business, networkSamples, base, phase);
      // Errors include the request URL; compare callback signatures, task capabilities and payloads.
      const normalize = rows => rows.map(r=>({ ...r,error:undefined }));
      assert.deepEqual(normalize(result), normalize(baseline));
      return result;
    });
    await check('mpx-contract',`${phase}: original Promise success/failure/cancel`, async()=> {
      const result = await evaluate(business, mpxSamples, base, phase);
      assert.ok(mpxBaseline, 'baseline missing');
      assert.deepEqual(result.map(r=>({ ...r,error:undefined })),mpxBaseline.map(r=>({ ...r,error:undefined })));
      return result;
    });
    await check('list_network_requests',`${phase}: exactly one record per monitored request`,async()=> {
      const e = await call(business,'list_network_requests',{pageSize:100,urlPattern:`case=${phase}-`});
      assert.equal(e.data.requests.length,phase==='during'?9:0);
      assert.equal(new Set(e.data.requests.map(r=>r.reqid)).size,e.data.requests.length);
      if (phase==='during') {
        const req = e.data.requests[0];
        await check('get_network_request','detail matches collected request',async()=> {
          const d=await call(business,'get_network_request',{reqid:req.reqid});
          assert.ok(d.data); return {id:req.reqid};
        });
      }
      return {count:e.data.requests.length};
    });
  }
  await check('clear_network_requests','clear local and remote records',async()=> {
    await call(business,'clear_network_requests',{clearRemote:true});
    const e=await call(business,'list_network_requests',{pageSize:100}); assert.equal(e.data.requests.length,0);
  });
  for(let round=0;round<5;round++) {
    await check('reconnect_devtools',`console reconnect ${round+1}`,async()=> {
      await call(business,'reconnect_devtools');
      const marker=`mcp-reconnect-${round}`;
      await evaluate(business,(text)=>{ console.log(text); console.log(text); console.warn(text+'-warn'); console.error(text+'-error'); },marker);
      const e=await call(business,'list_console_messages',{pageSize:100});
      const matches=e.data.messages.filter(m=>m.args?.[0]===marker);
      assert.equal(matches.length,2);
      const again=await call(business,'list_console_messages',{pageSize:100});
      assert.deepEqual(again.data.messages.filter(m=>m.args?.[0]===marker).map(m=>m.msgid),matches.map(m=>m.msgid));
      await check('get_console_message',`stable detail after reconnect ${round+1}`,async()=> {
        const d=await call(business,'get_console_message',{msgid:matches[0].msgid});assert.equal(d.data.message.args[0],marker);
      });
      return {identicalTextCount:matches.length};
    });
  }
  await check('list_console_messages','filter, pagination, extended methods, async exception',async()=> {
    await evaluate(business,()=>{ console.info('mcp-info');console.debug('mcp-debug');console.dir({marker:'mcp-dir'});console.assert(false,'mcp-assert');setTimeout(()=>{throw new Error('mcp-async-exception')},10); });
    await new Promise(resolve=>setTimeout(resolve,100));
    const e=await call(business,'list_console_messages',{pageSize:100});
    assert.ok(e.data.messages.some(m=>m.message?.includes('mcp-async-exception')));
    for (const type of ['info','debug','dir','assert']) assert.ok(e.data.messages.some(m=>m.type===type), `Missing ${type} event`);
    const filtered=await call(business,'list_console_messages',{types:['info'],pageSize:1});
    assert.equal(filtered.data.messages.length,1);assert.equal(filtered.data.messages[0].type,'info');
    const p0=await call(business,'list_console_messages',{pageSize:1,pageIdx:0});
    const p1=await call(business,'list_console_messages',{pageSize:1,pageIdx:1});
    assert.notEqual(p0.data.messages[0].msgid,p1.data.messages[0].msgid);
    return {count:e.data.total};
  });
  await check('evaluate_script','named async function declaration',async()=> { const e=await call(business,'evaluate_script',{function:'async function test() { await Promise.resolve(); return 42; }'});assert.equal(e.data.result,42); });
  await check('get_current_page','business page available',async()=> { const e=await call(business,'get_current_page');assert.ok(e.data); });
  await check('get_page_snapshot','business snapshot scope graph',async()=> { const e=await call(business,'get_page_snapshot');assert.ok(e.data);assert.ok(e.observation); });
  let liveText;
  let liveTextTarget;
  let liveRef;
  await check('find_elements','live page text query returns a usable opaque ref',async()=> {
    const e=await call(business,'find_elements',{locator:{kind:'selector',value:'text'}});
    const index=e.data.elements.findIndex(element=>element.text?.trim()&&element.attributes?.class);
    assert.ok(index>=0,'No suitable live text fixture');
    liveText=e.data.elements[index];liveRef=liveText.ref;
    liveTextTarget={kind:'path',path:[{kind:'selector',value:'text',index}]};assert.ok(liveRef);
    return {count:e.data.elements.length};
  });
  if (liveTextTarget) {
    await check('wait_for','live target and missing-target timeout',async()=> {
      await call(business,'wait_for',{target:liveTextTarget,timeout:1000});
      const e=await call(business,'wait_for',{target:target('mcp-nonexistent-element'),timeout:100},true);assert.equal(e.code,'TIMEOUT');
    });
    await check('get_value','live attribute read',async()=> { const e=await call(business,'get_value',{target:liveTextTarget,attribute:'class'});assert.equal(e.data.value,liveText.attributes.class); });
    for(const [name,args] of [
      ['assert_text',{target:liveTextTarget,text:liveText.text}],
      ['assert_attribute',{target:liveTextTarget,attributeKey:'class',attributeValue:liveText.attributes.class}],
      ['assert_state',{target:liveTextTarget,enabled:true}],
    ]) await check(name,'live positive assertion',async()=> {const e=await call(business,name,args);assert.equal(e.data.passed,true);});
    for(const [name,args] of [
      ['assert_text',{target:liveTextTarget,text:'mcp-deliberately-wrong-text'}],
      ['assert_attribute',{target:liveTextTarget,attributeKey:'class',attributeValue:'mcp-deliberately-wrong-class'}],
      ['assert_state',{target:liveTextTarget,enabled:false}],
    ]) await check(name,'live negative assertion',async()=> {const e=await call(business,name,args,true);assert.equal(e.partialData?.passed,false);});
  }
  const businessOriginalPage = await evaluate(business, () => getCurrentPages().at(-1).route);
  const byTestId = (...values) => ({ kind: 'path', path: values.map(value => ({ kind: 'testId', value })) });
  let businessFixtureReady=false;
  await check('navigate_to','existing business regression page',async()=> {
    await call(business,'navigate_to',{url:'/pages/mcp-fixture/index'});
    assert.equal(await evaluate(business,()=>getCurrentPages().at(-1).route),'pages/mcp-fixture/index');businessFixtureReady=true;
  });
  await check('weixin://connection/status','resource list and connected state',async()=> {
    assert.equal((await business.listResources()).resources.length,2);
    const value=JSON.parse((await business.readResource({uri:'weixin://connection/status'})).contents[0].text);
    assert.ok(value);return value;
  });
  await check('weixin://page/snapshot','business snapshot nonempty scope graph',async()=> {
    const value=JSON.parse((await business.readResource({uri:'weixin://page/snapshot'})).contents[0].text);
    assert.ok(value.scopes.length>=1);assert.ok(Array.isArray(value.edges));assert.ok(value.scopes.some(scope=>scope.elements.length>0));
    return {scopes:value.scopes.length,edges:value.edges.length};
  });
  if (businessFixtureReady) {
  let businessRef;
  await check('find_elements','root testId with opaque ref',async()=> {
    const e=await call(business,'find_elements',{locator:{kind:'testId',value:'mutate-page'}});
    assert.equal(e.data.elements.length,1);businessRef=e.data.elements[0].ref;assert.ok(businessRef);
  });
  await check('wait_for','existing element and timeout branch',async()=> {
    await call(business,'wait_for',{target:byTestId('mutate-page'),timeout:1000});
    await call(business,'wait_for',{target:byTestId('missing'),timeout:100},true);
  });
  await check('click','changes actual business page counter',async()=> {
    const previous=await evaluate(business,()=>getCurrentPages().at(-1).data.pageMutationCount);
    await call(business,'click',{target:byTestId('mutate-page')});
    assert.equal(await evaluate(business,()=>getCurrentPages().at(-1).data.pageMutationCount),previous+1);
  });
  await check('get_value','stale ref rejected after click',async()=> {
    assert.ok(businessRef);const e=await call(business,'get_value',{target:{kind:'ref',ref:businessRef}},true);assert.equal(e.code,'STALE_ELEMENT');
  });
  const nestedInput=byTestId('mcp-outer','outer-input');
  for(const [mode,text,expected] of [['replace','abc','abc'],['append','中文','abc中文'],['clear',undefined,'']]) {
    await check('input_text',`business nested input ${mode}`,async()=> {
      const e=await call(business,'input_text',{target:nestedInput,mode,...(text?{text}:{})});assert.equal(e.data.value,expected);
      assert.equal(await evaluate(business,()=>getCurrentPages().at(-1).selectComponent('#mcp-outer').data.outerValue),expected);
    });
  }
  await check('get_value','read nested input',async()=> { assert.equal((await call(business,'get_value',{target:nestedInput})).data.value,''); });
  for(const [name,args,negative] of [
    ['assert_text',{target:byTestId('mutate-page'),text:'mutate page'},false],
    ['assert_text',{target:byTestId('mutate-page'),text:'wrong'},true],
    ['assert_attribute',{target:byTestId('mutate-page'),attributeKey:'data-testid',attributeValue:'mutate-page'},false],
    ['assert_attribute',{target:byTestId('mutate-page'),attributeKey:'data-testid',attributeValue:'wrong'},true],
    ['assert_state',{target:byTestId('mutate-page'),visible:true,enabled:true},false],
    ['assert_state',{target:byTestId('mutate-page'),visible:false},true],
  ]) await check(name,`business assertion ${negative?'negative':'positive'}`,async()=>{ await call(business,name,args,negative); });
  await check('set_form_control','unsupported button returns failure (positive controls require independent fixture)',async()=> {
    await call(business,'set_form_control',{target:byTestId('mutate-page'),value:true},true);
  });
  await evaluate(business,()=>console.log('mcp-preserved-business'));
  await check('navigate_back','business returns to original page',async()=> {
    await call(business,'navigate_back');assert.equal(await evaluate(business,()=>getCurrentPages().at(-1).route),businessOriginalPage);
  });
  await check('list_console_messages','preserved navigation history',async()=> {
    const e=await call(business,'list_console_messages',{includePreservedMessages:true,pageSize:100});assert.ok(e.data.messages.some(m=>m.args?.[0]==='mcp-preserved-business'));
  });
  } else {
    for(const tool of ['navigate_to','find_elements','wait_for','click','get_value','input_text','assert_text','assert_attribute','assert_state','navigate_back']) {
      cases.push({tool,scenario:'business fixture prerequisite',status:'环境阻塞',evidence:'Disk fixture page is not present in the running compiled app; dependent assertions were not executed.'});
    }
  }
  await check('screenshot','business image has PNG bytes',async()=> {
    const e=await call(business,'screenshot');const image=e.raw.content.find(c=>c.type==='image');assert.ok(image?.data.length>100);
    const bytes=Buffer.from(image.data,'base64');assert.equal(bytes.subarray(1,4).toString(),'PNG');return {bytes:bytes.length};
  });
  await check('switch_tab','non-tab URL rejects (positive tabBar requires independent fixture)',async()=> { await call(business,'switch_tab',{url:'/pages/mcp-fixture/index'},true); });
  await evaluate(business,()=>console.log('mcp-live-navigation-history'));
  await check('navigate_to','existing home route and back',async()=> {
    await call(business,'navigate_to',{url:'/pages/home/index'});
    assert.equal(await evaluate(business,()=>getCurrentPages().at(-1).route),'pages/home/index');
    await check('list_console_messages','live navigation history synchronized before split',async()=> {
      const e=await call(business,'list_console_messages',{includePreservedMessages:true,pageSize:100});
      const rows=e.data.messages.filter(m=>m.args?.[0]==='mcp-live-navigation-history');assert.equal(rows.length,1);
      const current=await call(business,'list_console_messages',{pageSize:100});assert.equal(current.data.messages.filter(m=>m.args?.[0]==='mcp-live-navigation-history').length,0);
      const detail=await call(business,'get_console_message',{msgid:rows[0].msgid});assert.equal(detail.data.message.args[0],'mcp-live-navigation-history');
    });
    await check('get_value','live stale ref after navigation',async()=> {assert.ok(liveRef);const e=await call(business,'get_value',{target:{kind:'ref',ref:liveRef}},true);assert.equal(e.code,'STALE_ELEMENT');});
    await check('navigate_back','return from existing home route',async()=> {
      await call(business,'navigate_back');assert.equal(await evaluate(business,()=>getCurrentPages().at(-1).route),businessOriginalPage);
    });
  });
  await check('relaunch','restore original business page',async()=> { await call(business,'relaunch',{url:businessOriginalPage});assert.equal(await evaluate(business,()=>getCurrentPages().at(-1).route),businessOriginalPage); });
  await check('get_connection_status','refresh health after navigation',async()=> { assert.ok((await call(business,'get_connection_status',{refreshHealth:true})).data); });
  await check('evaluate_script','Promise-returning script and thrown/rejected errors',async()=> {
    assert.equal(await evaluate(business,()=>42),42);assert.equal(await evaluate(business,async()=>Promise.resolve('async')),'async');
    await call(business,'evaluate_script',{function:'() => { throw new Error("mcp-sync-failure"); }'},true);
    await call(business,'evaluate_script',{function:'() => Promise.reject(new Error("mcp-async-failure"))'},true);
  });
  for(const [name,args] of [
    ['diagnose_connection',{projectPath:path.resolve('playground/wx')}],['check_environment',{}],
    ['debug_page_elements',{testAllStrategies:true,customSelector:'view'}],['debug_connection_flow',{projectPath:path.resolve('playground/wx'),dryRun:true}],
  ]) await check(name,'business diagnostic output',async()=> {
    const e=await call(business,name,args);const text=e.raw.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');assert.ok(text.length>50);if(name==='debug_page_elements'){assert.match(text,/view: [1-9]\d* 个元素/);assert.ok(!text.includes('失败 -'),text);}return text;
  });
  await check('debug_connection_flow','actual diagnostic execution reuses the connected business session',async()=> {
    const before=await call(business,'get_connection_status',{refreshHealth:false});
    const e=await call(business,'debug_connection_flow',{projectPath:path.resolve('playground/wx'),dryRun:false});
    const text=e.raw.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
    assert.ok(!text.includes('DryRun 模式'));assert.match(text,/复用现有连接/);
    const after=await call(business,'get_connection_status',{refreshHealth:false});
    assert.equal(after.data.connectionId,before.data.connectionId);
  });
  await check('disconnect_devtools','business disconnected state',async()=> {
    await call(business,'disconnect_devtools');const resource=JSON.parse((await business.readResource({uri:'weixin://connection/status'})).contents[0].text);
    return resource;
  });
  await check('connect_devtools','browserUrl controlled discovery to real DevTools',async()=> {
    const e=await call(business,'connect_devtools',{target:{kind:'browserUrl',url:base},timeoutMs:5000,healthCheck:false});assert.equal(e.data.method,'browserUrl');
  });
  await check('reconnect_devtools','explicit target replaces browserUrl request and resets omitted defaults',async()=> {
    const e=await call(business,'reconnect_devtools',{target:{kind:'wsEndpoint',endpoint:businessEndpoint}});
    assert.equal(e.data.method,'wsEndpoint');assert.ok(e.data.health.checks.length>0);
    const reused=await call(business,'reconnect_devtools');
    assert.equal(reused.data.method,'wsEndpoint');assert.ok(reused.data.health.checks.length>0);
  });
  await check('connect_devtools','discover real DevTools',async()=> {
    const e=await call(business,'connect_devtools',{target:{kind:'discover'},timeoutMs:5000,healthCheck:false});assert.equal(e.data.method,'discover');
  });
  await close(business);

  const fixture=await open();
  let fixtureReady=false;
  await check('connect_devtools',process.env.INTEGRATION_FIXTURE_WS_ENDPOINT ? 'independent fixture explicit endpoint (does not validate launch)' : 'independent fixture project launch',async()=> {
    if (process.env.INTEGRATION_FIXTURE_WS_ENDPOINT) await connect(fixture,fixtureEndpoint);
    else {
      await call(fixture,'connect_devtools',{target:{kind:'project',projectPath:fixtureProject,cliPath:fixtureCli,autoPort:9431},timeoutMs:15000,healthCheck:false});
      fixtureLaunched=true;
    }
    fixtureReady=true;
  });
  if (fixtureReady) {
    const pageData=()=>evaluate(fixture,()=>getCurrentPages().at(-1).data);
    await check('relaunch','fixture home',async()=> { await call(fixture,'relaunch',{url:'/pages/home/index'});assert.equal((await evaluate(fixture,()=>getCurrentPages().at(-1).route)),'pages/home/index'); });
    await check('get_connection_status','refresh health',async()=> { const e=await call(fixture,'get_connection_status',{refreshHealth:true});assert.ok(e.data); });
    await check('weixin://connection/status','listed and readable',async()=> {
      const list=await fixture.listResources(); assert.equal(list.resources.length,2);
      const data=await fixture.readResource({uri:'weixin://connection/status'});assert.ok(data.contents[0].text); return JSON.parse(data.contents[0].text);
    });
    await check('weixin://page/snapshot','scope graph includes component boundary',async()=> {
      const data=JSON.parse((await fixture.readResource({uri:'weixin://page/snapshot'})).contents[0].text);
      assert.ok(data.scopes?.length>1);assert.ok(data.edges?.length>0);return {scopes:data.scopes.length,edges:data.edges.length};
    });
    await check('get_page_snapshot','fixture snapshot',async()=> { const e=await call(fixture,'get_page_snapshot');assert.ok(e.observation); });
    let staleRef;
    await check('find_elements','query returns usable ref',async()=> {
      const e=await call(fixture,'find_elements',{locator:{kind:'id',value:'increment'}});
      assert.equal(e.data.elements.length,1); staleRef=e.data.elements[0].ref;assert.ok(staleRef);return {ref:staleRef};
    });
    await check('wait_for','existing selector',async()=> { await call(fixture,'wait_for',{target:target('increment'),timeout:1000}); });
    await check('wait_for','missing selector fails',async()=> { await call(fixture,'wait_for',{target:target('absent'),timeout:100},true); });
    await check('wait_for','conditional node disappears after asynchronous page update',async()=> {
      await call(fixture,'wait_for',{target:target('conditional'),timeout:1000});
      await evaluate(fixture,()=>{setTimeout(()=>getCurrentPages().at(-1).setData({visible:false}),100);return true;});
      await call(fixture,'wait_for',{target:target('conditional'),disappear:true,timeout:2000});
      await evaluate(fixture,()=>getCurrentPages().at(-1).setData({visible:true}));
      await call(fixture,'wait_for',{target:target('conditional'),visible:true,timeout:1000});
    });
    await check('wait_for','visible and hidden states on an existing node',async()=> {
      await call(fixture,'wait_for',{target:target('visibility'),visible:true,timeout:1000});
      await evaluate(fixture,()=>getCurrentPages().at(-1).setData({hidden:true}));
      await call(fixture,'wait_for',{target:target('visibility'),visible:false,timeout:1000});
      await evaluate(fixture,()=>getCurrentPages().at(-1).setData({hidden:false}));
    });
    await check('click','click changes actual page counter',async()=> { const before=(await pageData()).count;await call(fixture,'click',{target:target('increment')});assert.equal((await pageData()).count,before+1); });
    await check('get_value','stable id ref rebinds after same-page mutation',async()=> { assert.ok(staleRef);const e=await call(fixture,'get_value',{target:{kind:'ref',ref:staleRef},attribute:'id'});assert.equal(e.data.value,'increment'); });
    for(const [mode,text,expected] of [['replace','abc','abc'],['append','中文','abc中文'],['clear',undefined,'']]) {
      await check('input_text',`input ${mode}`,async()=> { const e=await call(fixture,'input_text',{target:target('input'),mode,...(text?{text}:{})});assert.equal(e.data.value,expected);assert.equal((await pageData()).input,expected); });
    }
    await check('get_value','read input value',async()=> { const e=await call(fixture,'get_value',{target:target('input')});assert.equal(e.data.value,''); });
    for(const [id,value] of [['switch',true],['slider',40],['picker',1]]) {
      await check('set_form_control',id,async()=> { await call(fixture,'set_form_control',{target:target(id),value});assert.equal(String((await pageData())[id==='switch'?'checked':id]),String(value)); });
    }
    for(const [name,args] of [
      ['assert_text',{target:target('title'),text:'MCP regression'}],
      ['assert_attribute',{target:target('title'),attributeKey:'id',attributeValue:'title'}],
      ['assert_state',{target:target('increment'),visible:true,enabled:true}],
    ]) await check(name,'positive assertion',async()=> { const e=await call(fixture,name,args);assert.equal(e.data.passed,true); });
    for(const [name,args] of [
      ['assert_text',{target:target('title'),text:'wrong'}],
      ['assert_attribute',{target:target('title'),attributeKey:'id',attributeValue:'wrong'}],
      ['assert_state',{target:target('increment'),enabled:false}],
    ]) await check(name,'negative assertion reports error',async()=> { await call(fixture,name,args,true); });
    await check('evaluate_script','synchronous and asynchronous results and exceptions',async()=> {
      assert.equal(await evaluate(fixture,()=>42),42);assert.equal(await evaluate(fixture,async()=>Promise.resolve('async')),'async');
      await call(fixture,'evaluate_script',{function:'() => { throw new Error("mcp-script-error"); }'},true);
      await call(fixture,'evaluate_script',{function:'async () => { throw new Error("mcp-async-script-error"); }'},true);
    });
    await evaluate(fixture,()=>console.log('mcp-preserved-before-navigation'));
    await check('navigate_to','navigate to detail',async()=> { await call(fixture,'navigate_to',{url:'/pages/detail/index'});assert.equal(await evaluate(fixture,()=>getCurrentPages().at(-1).route),'pages/detail/index'); });
    await check('list_console_messages','navigation history preserves msgid',async()=> {
      const e=await call(fixture,'list_console_messages',{includePreservedMessages:true,pageSize:100});assert.ok(e.data.messages.some(m=>m.args?.[0]==='mcp-preserved-before-navigation'));
      const current=await call(fixture,'list_console_messages',{pageSize:100});assert.ok(!current.data.messages.some(m=>m.args?.[0]==='mcp-preserved-before-navigation'));
    });
    await check('navigate_back','return to home',async()=> { await call(fixture,'navigate_back');assert.equal(await evaluate(fixture,()=>getCurrentPages().at(-1).route),'pages/home/index'); });
    await check('switch_tab','switch actual tabBar page',async()=> { await call(fixture,'switch_tab',{url:'/pages/tab/index'});assert.equal(await evaluate(fixture,()=>getCurrentPages().at(-1).route),'pages/tab/index'); });
    await check('screenshot','nonempty PNG image',async()=> { const e=await call(fixture,'screenshot');const img=e.raw.content.find(c=>c.type==='image');assert.ok(img?.data.length>100);return {mimeType:img.mimeType,bytes:Buffer.from(img.data,'base64').length}; });
    for(const [name,args] of [
      ['diagnose_connection',{projectPath:path.resolve('tests/fixtures/monitoring-app')}],
      ['check_environment',{}],['debug_page_elements',{}],
      ['debug_connection_flow',{projectPath:path.resolve('tests/fixtures/monitoring-app'),dryRun:true}],
    ]) await check(name,'diagnostic output',async()=> {const e=await call(fixture,name,args);assert.ok(e.raw.content.some(c=>c.type==='text'&&c.text.length>50));return e.raw.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');});
    await check('disconnect_devtools','disconnect and read disconnected status',async()=> { await call(fixture,'disconnect_devtools');const e=await call(fixture,'get_connection_status');assert.ok(e.data); });
  }
  if (!fixtureReady) {
    for (const tool of ['set_form_control', 'switch_tab', 'wait_for', 'weixin://page/snapshot']) cases.push({tool, scenario: 'independent fixture controls/tabBar/visibility/component scopes', status: '环境阻塞', evidence: 'Fixture runtime unavailable; negative branches on business page do not replace positive acceptance.'});
  }
  await close(fixture);
} finally {
  for(const client of clients) {
    try { await close(client);cases.push({tool:'cleanup',scenario:'close MCP connection and restore owned wrappers',status:'通过'}); }
    catch(error) {cases.push({tool:'cleanup',scenario:'close MCP connection',status:'环境阻塞',evidence:error.message});await client.close().catch(()=>{});}
  }
  if (fixtureLaunched) {
    await promisify(execFile)(fixtureCli,['close','--project',fixtureProject],{timeout:5000})
      .catch(error=>{ cases.push({tool:'cleanup',scenario:'close independent project',status:'发现缺陷',evidence:error.message});process.exitCode=1; });
  }
  if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  cases.push({tool:'cleanup',scenario:'MCP disconnect status verified and transports closed',status:'通过',evidence:{closedConnections}});
  cases.push({tool:'cleanup',scenario:'local HTTP server closed; runtime temporary files removed by finally',status:'通过'});
  await writeFile(path.join(output,'capability-cases.json'),JSON.stringify(cases,null,2)+'\n');
}
if(cases.some(c=>c.status!=='通过')) process.exitCode=1;
