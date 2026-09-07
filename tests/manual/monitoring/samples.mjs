/* global wx, getApp, setTimeout, clearTimeout */
export async function networkSamples(base, marker) {
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

export async function mpxSamples(base, marker) {
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
