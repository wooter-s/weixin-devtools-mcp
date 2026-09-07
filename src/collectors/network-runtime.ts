import type { NetworkRequest, NetworkRequestType } from './NetworkCollector.js';

interface RuntimeResult {
  statusCode?: number;
  status?: number;
  data?: NetworkRequest['response'];
  header?: Record<string, string>;
  headers?: Record<string, string>;
  errMsg?: string;
  tempFilePath?: string;
  filePath?: string;
}
interface RuntimeOptions {
  url?: string;
  method?: string;
  header?: Record<string, string>;
  data?: NetworkRequest['data'];
  params?: NetworkRequest['params'];
  filePath?: string;
  name?: string;
  formData?: NetworkRequest['data'];
  success?: RuntimeCallback;
  fail?: RuntimeCallback;
}
type RuntimeCallback = (this: object, ...args: RuntimeResult[]) => void;
type RuntimeMethod = (this: object, options: RuntimeOptions, ...args: object[]) => object;
interface RuntimeTarget { [name: string]: RuntimeMethod }
interface RuntimePatch {
  target: RuntimeTarget;
  name: string;
  original?: PropertyDescriptor;
  wrapper: RuntimeMethod;
}
interface RuntimeState {
  owner: string;
  active: boolean;
  patches: RuntimePatch[];
}
interface RuntimeHost {
  __weixinMcpNetwork?: RuntimeState;
  __networkLogs?: NetworkRequest[];
}
export interface NetworkRuntimeCommand {
  action: 'install' | 'stop' | 'read' | 'clear';
  owner: string;
}

/** Self-contained: automator serializes this function into the app service runtime. */
export function networkRuntime(command: NetworkRuntimeCommand): NetworkRequest[] {
  // @ts-expect-error wx exists only in the mini program runtime
  const api = wx as RuntimeTarget & RuntimeHost;
  const previous = api.__weixinMcpNetwork;
  const restore = (state: RuntimeState): void => {
    state.active = false;
    const failures: RuntimePatch[] = [];
    for (const patch of [...state.patches].reverse()) {
      try {
        if (Object.getOwnPropertyDescriptor(patch.target, patch.name)?.value !== patch.wrapper) continue;
        if (patch.original) Object.defineProperty(patch.target, patch.name, patch.original);
        else delete patch.target[patch.name];
      } catch {
        failures.push(patch);
      }
    }
    state.patches = failures;
    if (failures.length) throw new Error('恢复网络包装失败');
  };
  if (command.action !== 'install') {
    if (!previous || previous.owner !== command.owner) return [];
    if (command.action === 'stop') restore(previous);
    const rows = api.__networkLogs || [];
    api.__networkLogs = [];
    return rows;
  }
  if (previous?.owner === command.owner && previous.active) return [];
  if (previous) restore(previous);
  const state: RuntimeState = { owner: command.owner, active: true, patches: [] };
  api.__weixinMcpNetwork = state;
  api.__networkLogs = [];
  const ids = new WeakMap<RuntimeOptions, { id: string; finished: boolean }>();
  let sequence = 0;
  const install = (target: RuntimeTarget, name: string, type: NetworkRequestType, source: string): void => {
    const original = Object.getOwnPropertyDescriptor(target, name);
    const method = target[name];
    if (typeof method !== 'function') throw new Error(`网络方法不可用: ${source}`);
    const wrapper: RuntimeMethod = function(options, ...args) {
      if (!state.active || !options || typeof options !== 'object') return method.call(this, options, ...args);
      let forwarded = options;
      try {
        // Copy descriptors without invoking unrelated option getters or mutating caller options.
        const descriptors = Object.getOwnPropertyDescriptors(options);
        delete descriptors.success;
        delete descriptors.fail;
        forwarded = Object.create(Object.getPrototypeOf(options), descriptors) as RuntimeOptions;
        const request = ids.get(options) || { id: `${command.owner}_${++sequence}`, finished: false };
        ids.set(forwarded, request);
        const startedAt = Date.now();
        const row: NetworkRequest = {
          id: request.id, type, url: options.url || '', method: options.method || (type === 'uploadFile' ? 'POST' : 'GET'),
          headers: options.header, params: options.params,
          data: type === 'uploadFile' ? { filePath: options.filePath, name: options.name, formData: options.formData } : options.data,
          timestamp: new Date(startedAt).toISOString(), success: false, pending: true, source,
        };
        const finish = (success: boolean, result: RuntimeResult): void => {
          try {
            if (!state.active || request.finished) return;
            const completed: NetworkRequest = {
              ...row, success, pending: false, statusCode: result?.statusCode ?? result?.status,
              response: type === 'downloadFile'
                ? { tempFilePath: result?.tempFilePath, filePath: result?.filePath } : result?.data,
              responseHeaders: result?.header ?? result?.headers,
              error: success ? undefined : result?.errMsg || 'Network request failed',
              duration: Date.now() - startedAt, completedAt: new Date().toISOString(),
            };
            // Detach payloads at capture time; circular/host values cannot break business callbacks.
            const snapshot = JSON.parse(JSON.stringify(completed)) as NetworkRequest;
            const queue = api.__networkLogs || (api.__networkLogs = []);
            queue.push(snapshot);
            if (queue.length > 1000) queue.splice(0, queue.length - 1000);
            request.finished = true;
          } catch { /* Collection is best effort; business callbacks execute outside this catch. */ }
        };
        for (const key of ['success', 'fail'] as const) {
          const callback = options[key];
          Object.defineProperty(forwarded, key, {
            configurable: true, enumerable: true, writable: true,
            value: function(this: object, ...values: RuntimeResult[]) {
              finish(key === 'success', values[0]);
              if (typeof callback === 'function') return callback.apply(this, values);
            },
          });
        }
      } catch {
        // Unsupported options must still reach the original API unchanged.
        forwarded = options;
      }
      return method.call(this, forwarded, ...args);
    };
    Object.defineProperty(target, name, original && 'value' in original
      ? { ...original, value: wrapper }
      : { configurable: true, enumerable: original?.enumerable ?? true, writable: true, value: wrapper });
    state.patches.push({ target, name, original, wrapper });
  };
  try {
    for (const name of ['request', 'uploadFile', 'downloadFile'] as const) install(api, name, name, `wx.${name}`);
    // @ts-expect-error getApp exists only in the mini program runtime
    const app = typeof getApp === 'function' ? getApp() as { $xfetch?: RuntimeTarget } : undefined;
    if (app?.$xfetch && typeof app.$xfetch.requestAdapter === 'function') {
      install(app.$xfetch, 'requestAdapter', 'request', 'mpx.requestAdapter');
    }
  } catch (error) {
    restore(state);
    throw error;
  }
  return [];
}
