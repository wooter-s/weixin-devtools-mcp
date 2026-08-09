import type { PageStateCommit } from '../core/types.js';

import type {
  SimpleToolResponse,
  ToolDefinition,
  ToolResponse,
} from './ToolDefinition.js';

export interface RuntimeToolResponse extends ToolResponse {
  getResponseText(): string;
  getAttachedImages(): Array<{ data: string; mimeType: string }>;
  getPageStateCommit(): PageStateCommit | undefined;
}

export interface ToolRuntimeModule {
  allTools: readonly ToolDefinition[];
  SimpleToolResponse: new () => RuntimeToolResponse;
}

export interface ToolRuntimeLoader {
  load(): Promise<ToolRuntimeModule>;
}

type RuntimeImporter = () => Promise<{
  allTools: readonly ToolDefinition[];
  SimpleToolResponse: typeof SimpleToolResponse;
}>;

/**
 * 工具实现只在首次 tools/call 时载入。并发首调共享同一个 Promise；若载入失败，
 * 清除缓存以允许后续调用重试。
 */
export function createToolRuntimeLoader(
  importer: RuntimeImporter = () => import('./index.js'),
): ToolRuntimeLoader {
  let pending: Promise<ToolRuntimeModule> | undefined;

  return {
    load() {
      pending ??= importer()
        .then(runtime => ({
          allTools: runtime.allTools,
          SimpleToolResponse: runtime.SimpleToolResponse,
        }))
        .catch(error => {
          pending = undefined;
          throw error;
        });
      return pending;
    },
  };
}

const defaultLoader = createToolRuntimeLoader();

export function loadToolRuntime(): Promise<ToolRuntimeModule> {
  return defaultLoader.load();
}
