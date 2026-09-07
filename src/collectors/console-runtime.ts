import type { ConsoleMessage } from './ConsoleCollector.js';

export interface RuntimeConsoleEvent extends ConsoleMessage { sequence: number }
interface ConsolePatch {
  name: string;
  original?: PropertyDescriptor;
  wrapper: ConsoleMethod;
}
type ConsoleMethod = (this: object, ...args: ConsoleMessage['args']) => void;
interface ConsoleState {
  owner: string;
  active: boolean;
  sequence: number;
  events: RuntimeConsoleEvent[];
  patches: ConsolePatch[];
}
export interface ConsoleRuntimeCommand {
  action: 'install' | 'read' | 'stop';
  owner: string;
  after?: number;
}

/** Self-contained function evaluated in the app service, without SDK App.enableLog. */
export function consoleRuntime(command: ConsoleRuntimeCommand): RuntimeConsoleEvent[] {
  // @ts-expect-error wx is provided by the mini program runtime
  const host = wx as { __weixinMcpConsole?: ConsoleState };
  const output = console as typeof console & Record<string, ConsoleMethod>;
  const restore = (state: ConsoleState): void => {
    state.active = false;
    const failures: ConsolePatch[] = [];
    for (const patch of [...state.patches].reverse()) {
      try {
        if (Object.getOwnPropertyDescriptor(output, patch.name)?.value !== patch.wrapper) continue;
        if (patch.original) Object.defineProperty(output, patch.name, patch.original);
        else delete output[patch.name];
      } catch { failures.push(patch); }
    }
    state.patches = failures;
    if (failures.length) throw new Error('恢复 Console 包装失败');
  };
  const previous = host.__weixinMcpConsole;
  if (command.action !== 'install') {
    if (!previous || previous.owner !== command.owner) return [];
    if (command.action === 'stop') restore(previous);
    return previous.events.filter(event => event.sequence > (command.after ?? 0));
  }
  if (previous?.owner === command.owner && previous.active) return [];
  if (previous) restore(previous);
  const state: ConsoleState = { owner: command.owner, active: true, sequence: 0, events: [], patches: [] };
  host.__weixinMcpConsole = state;
  const methods: ConsoleMessage['type'][] = [
    'log', 'debug', 'info', 'error', 'warn', 'dir', 'dirxml', 'table', 'trace', 'clear',
    'group', 'groupCollapsed', 'groupEnd', 'assert', 'count', 'timeEnd', 'verbose',
  ];
  try {
    for (const name of methods) {
      const method = output[name] as ConsoleMethod;
      if (typeof method !== 'function') continue;
      const original = Object.getOwnPropertyDescriptor(output, name);
      const wrapper: ConsoleMethod = function(...args) {
        try {
          if (state.active && !(name === 'assert' && args[0])) {
            const values = args.map(value => {
              try {
                if (value instanceof Error) return { message: value.message, stack: value.stack };
                if (value === undefined) return 'undefined';
                return JSON.parse(JSON.stringify(value)) as ConsoleMessage['args'][number];
              } catch { return '[unserializable]'; }
            });
            state.events.push({ sequence: ++state.sequence, type: name, args: values,
              timestamp: new Date().toISOString(), source: 'miniprogram' });
            if (state.events.length > 1000) state.events.splice(0, state.events.length - 1000);
          }
        } catch { /* A collector failure must never suppress the native console call. */ }
        return method.apply(this, args);
      };
      Object.defineProperty(output, name, original && 'value' in original
        ? { ...original, value: wrapper }
        : { configurable: true, enumerable: original?.enumerable ?? true, writable: true, value: wrapper });
      state.patches.push({ name, original, wrapper });
    }
  } catch (error) {
    restore(state);
    throw error;
  }
  return [];
}
