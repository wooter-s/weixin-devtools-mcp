/** 页面作用域图快照工具。 */

import { writeFile } from 'node:fs/promises';

import { z } from 'zod';

import type { PageStateCommit } from '../core/types.js';
import { elementTargetSchema } from '../elements/index.js';
import {
  formatSnapshot,
  type SnapshotFormat,
} from '../formatters/snapshotFormatter.js';

import {
  defineTool,
  ensureCurrentPage,
  ResponseFormatter,
  ToolCategory,
} from './ToolDefinition.js';
import { jsonValueSchema, toJsonValue } from './result.js';

const snapshotBudgetSchema = z
  .object({
    maxDepth: z.number().int().min(0).max(8).optional().default(4),
    maxExpandedScopes: z.number().int().min(1).max(256).optional().default(64),
    maxElements: z.number().int().min(1).max(5000).optional().default(1000),
  })
  .strict();

const snapshotScopeSchema = z.object({
  scopeId: z.string(),
  kind: z.enum(['page', 'custom-component']),
  rootRef: z.string().nullable(),
  depth: z.number().int().nonnegative(),
  status: z.enum(['complete', 'partial', 'truncated', 'unavailable']),
  reason: z
    .enum([
      'MAX_DEPTH',
      'MAX_SCOPES',
      'MAX_ELEMENTS',
      'QUERY_UNSUPPORTED',
      'QUERY_FAILED',
      'ELEMENT_READ_FAILED',
    ])
    .nullable(),
  elements: z.array(jsonValueSchema),
});

const snapshotDataSchema = z.object({
  snapshotId: z.string(),
  pageRevision: z.number().int().nonnegative(),
  path: z.string(),
  rootScopeId: z.string(),
  complete: z.boolean(),
  budget: z.object({
    maxDepth: z.number().int().min(0).max(8),
    maxExpandedScopes: z.number().int().min(1).max(256),
    maxElements: z.number().int().min(1).max(5000),
  }),
  usage: z.object({
    expandedScopes: z.number().int().nonnegative(),
    elements: z.number().int().nonnegative(),
  }),
  scopes: z.array(snapshotScopeSchema),
  edges: z.array(
    z.object({
      fromScopeId: z.string(),
      boundaryRef: z.string(),
      toScopeId: z.string(),
    })
  ),
  format: z.enum(['compact', 'minimal', 'json']),
  tokenEstimate: z.number().int().nonnegative(),
  filePath: z.string().nullable(),
});

export const getPageSnapshotTool = defineTool({
  name: 'get_page_snapshot',
  description: '获取 Page 或自定义组件的 V2 scopes/edges 作用域图（默认预算 4/64/1000）',
  schema: z
    .object({
      root: elementTargetSchema.optional().describe('可选；必须唯一定位到自定义组件'),
      budget: snapshotBudgetSchema.optional().default({}),
      format: z.enum(['compact', 'minimal', 'json']).optional().default('compact'),
      includePosition: z.boolean().optional().default(true),
      includeAttributes: z.boolean().optional().default(false),
      filePath: z.string().min(1).optional().describe('可选的 UTF-8 快照输出路径'),
    })
    .strict(),
  outputSchema: snapshotDataSchema,
  annotations: {
    category: ToolCategory.CORE,
    audience: ['developers'],
  },
  handler: async (request, response, context) => {
    const {
      root,
      budget = { maxDepth: 4, maxExpandedScopes: 64, maxElements: 1000 },
      format = 'compact',
      includePosition = true,
      includeAttributes = false,
      filePath,
    } = request.params;

    try {
      let commit: PageStateCommit;
      if (context.capturePageSnapshot) {
        commit = await context.capturePageSnapshot({
          root,
          budget,
          includePosition,
          includeAttributes,
        });
      } else {
        if (!context.synchronizePageState) {
          await context.syncCurrentPage();
          ensureCurrentPage(context);
        }
        const synchronized = context.synchronizePageState
          ? await context.synchronizePageState({ mode: 'snapshot', forceRefresh: true })
          : undefined;
        if (synchronized) {
          commit = synchronized;
        } else {
          const cached = await context.getPageSnapshotCached?.({ forceRefresh: true });
          if (!cached) throw new Error('当前上下文不支持页面快照接口');
          commit = {
            snapshot: cached.snapshot,
            elementMap: cached.elementMap,
            pagePath: cached.snapshot.path,
            pageRevision: cached.snapshot.pageRevision,
            domChanged: false,
            previousSnapshot: null,
          };
        }
      }

      response.setPageStateCommit?.(commit);
      const sourceSnapshot = commit.snapshot;
      const fallbackElements = sourceSnapshot.elements.slice(0, budget.maxElements);
      const snapshot = sourceSnapshot.scopes
        ? sourceSnapshot
        : {
            ...sourceSnapshot,
            elements: fallbackElements,
            rootScopeId: 'scope_0',
            complete: fallbackElements.length === sourceSnapshot.elements.length,
            budget,
            usage: { expandedScopes: 1, elements: fallbackElements.length },
            scopes: [
              {
                scopeId: 'scope_0',
                kind: 'page' as const,
                depth: 0,
                status:
                  fallbackElements.length === sourceSnapshot.elements.length
                    ? ('complete' as const)
                    : ('truncated' as const),
                ...(fallbackElements.length === sourceSnapshot.elements.length
                  ? {}
                  : { reason: 'MAX_ELEMENTS' as const }),
                elements: fallbackElements,
              },
            ],
            edges: [],
          };
      const rootScopeId = snapshot.rootScopeId ?? 'scope_0';
      const sourceScopes = snapshot.scopes ?? [
        {
          scopeId: rootScopeId,
          kind: 'page' as const,
          depth: 0,
          status: 'complete' as const,
          elements: snapshot.elements,
        },
      ];
      const scopes = sourceScopes.map((scope) => ({
        scopeId: scope.scopeId,
        kind: scope.kind,
        rootRef: scope.rootRef ?? null,
        depth: scope.depth,
        status: scope.status,
        reason: scope.reason ?? null,
        elements: toJsonValue(scope.elements),
      }));
      const edges = snapshot.edges ?? [];
      const actualBudget = snapshot.budget ?? budget;
      const usage = snapshot.usage ?? {
        expandedScopes: sourceScopes.length,
        elements: sourceScopes.reduce((sum, scope) => sum + scope.elements.length, 0),
      };
      const complete =
        snapshot.complete ?? sourceScopes.every((scope) => scope.status === 'complete');
      const formattedSnapshot = formatSnapshot(snapshot, {
        format: format as SnapshotFormat,
        includePosition,
        includeAttributes,
      });
      const tokenEstimate = Math.ceil(formattedSnapshot.length / 4);

      if (filePath) {
        await writeFile(filePath, formattedSnapshot, 'utf8');
        response.appendResponseLine(ResponseFormatter.success(`页面快照已保存到: ${filePath}`));
      } else {
        response.appendResponseLine('📊 页面快照获取成功（V2 作用域图）');
        response.appendResponseLine(`页面: ${snapshot.path}`);
        response.appendResponseLine(`作用域: ${sourceScopes.length}`);
        response.appendResponseLine(`元素数量: ${usage.elements}`);
        response.appendResponseLine(`输出格式: ${format}`);
        response.appendResponseLine(`完整: ${complete ? '是' : '否'}`);
        response.appendResponseLine(`Token估算: ~${tokenEstimate} tokens`);
        response.appendResponseLine('');
        response.appendResponseLine(formattedSnapshot);
      }

      response.mergeStructuredContent({
        snapshotId: snapshot.snapshotId,
        pageRevision: snapshot.pageRevision,
        path: snapshot.path,
        rootScopeId,
        complete,
        budget: toJsonValue(actualBudget),
        usage: toJsonValue(usage),
        scopes: toJsonValue(scopes),
        edges: toJsonValue(edges),
        format,
        tokenEstimate,
        filePath: filePath ?? null,
      });
      response.setIncludeSnapshot(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(ResponseFormatter.error(`获取页面快照失败: ${message}`));
      response.appendResponseLine(
        ResponseFormatter.hint('检查连接状态、root target 和快照预算后重试')
      );
      throw error;
    }
  },
});
