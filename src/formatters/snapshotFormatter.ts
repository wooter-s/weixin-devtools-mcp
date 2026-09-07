/** 页面作用域图格式化器。 */

import type {
  ElementSnapshot,
  PageSnapshot,
  SnapshotScope,
} from '../core/types.js';

export type SnapshotFormat = 'compact' | 'minimal' | 'json';

export interface FormatOptions {
  format: SnapshotFormat;
  includePosition?: boolean;
  includeAttributes?: boolean;
  /** 仅保留为内部/旧调用方的展示上限；生产采集应使用 budget.maxElements。 */
  maxElements?: number;
}

interface SnapshotGraphView {
  rootScopeId: string;
  complete: boolean;
  scopes: SnapshotScope[];
  edges: NonNullable<PageSnapshot['edges']>;
}

function graphView(snapshot: PageSnapshot): SnapshotGraphView {
  const rootScopeId = snapshot.rootScopeId ?? 'scope_0';
  const scopes = snapshot.scopes ?? [{
    scopeId: rootScopeId,
    kind: 'page' as const,
    depth: 0,
    status: 'complete' as const,
    elements: snapshot.elements,
  }];
  return {
    rootScopeId,
    complete: snapshot.complete ?? scopes.every(scope => scope.status === 'complete'),
    scopes,
    edges: snapshot.edges ?? [],
  };
}

function limitForPresentation(snapshot: PageSnapshot, maxElements?: number): PageSnapshot {
  if (maxElements === undefined) return snapshot;
  if (!Number.isSafeInteger(maxElements) || maxElements < 0) {
    throw new Error('maxElements 必须是非负安全整数');
  }

  const graph = graphView(snapshot);
  let remaining = maxElements;
  let wasLimited = false;
  const scopes = graph.scopes.map(scope => {
    const elements = scope.elements.slice(0, remaining);
    if (elements.length < scope.elements.length) wasLimited = true;
    remaining -= elements.length;
    if (remaining === 0 && elements.length === 0 && scope.elements.length > 0) {
      wasLimited = true;
    }
    return wasLimited && elements.length < scope.elements.length
      ? { ...scope, elements, status: 'truncated' as const, reason: 'MAX_ELEMENTS' as const }
      : { ...scope, elements };
  });
  const rootElements = scopes.find(scope => scope.scopeId === graph.rootScopeId)?.elements ?? [];
  const shownElements = scopes.reduce((sum, scope) => sum + scope.elements.length, 0);
  return {
    ...snapshot,
    elements: rootElements,
    complete: graph.complete && !wasLimited,
    usage: snapshot.usage
      ? { ...snapshot.usage, elements: shownElements }
      : { expandedScopes: scopes.filter(scope => scope.status !== 'truncated').length, elements: shownElements },
    scopes,
    edges: graph.edges,
  };
}

export function formatSnapshot(
  snapshot: PageSnapshot,
  options: FormatOptions = { format: 'compact' }
): string {
  const limitedSnapshot = limitForPresentation(snapshot, options.maxElements);
  switch (options.format) {
    case 'compact':
      return formatCompact(limitedSnapshot, options);
    case 'minimal':
      return formatMinimal(limitedSnapshot);
    case 'json':
      return formatJSON(limitedSnapshot, options);
    default:
      return formatCompact(limitedSnapshot, options);
  }
}

function totalElements(scopes: readonly Pick<SnapshotScope, 'elements'>[]): number {
  return scopes.reduce((sum, scope) => sum + scope.elements.length, 0);
}

function scopeHeader(scope: SnapshotScope): string {
  const root = scope.rootRef ? ` root=${scope.rootRef}` : '';
  const reason = scope.reason ? ` reason=${scope.reason}` : '';
  return `@scope ${scope.scopeId} ${scope.kind} depth=${scope.depth} status=${scope.status}${root}${reason}`;
}

function formatCompact(snapshot: PageSnapshot, options: FormatOptions): string {
  const lines: string[] = [];
  const { includePosition = true, includeAttributes = false } = options;
  const graph = graphView(snapshot);

  lines.push(`# Page: ${snapshot.path}`);
  lines.push(`# Snapshot: ${snapshot.snapshotId}`);
  lines.push(`# Revision: ${snapshot.pageRevision}`);
  lines.push(`# Complete: ${graph.complete}`);
  lines.push(`# Scopes: ${graph.scopes.length}`);
  lines.push(`# Elements: ${totalElements(graph.scopes)}`);
  if (snapshot.budget) {
    lines.push(
      `# Budget: depth=${snapshot.budget.maxDepth} scopes=${snapshot.budget.maxExpandedScopes} elements=${snapshot.budget.maxElements}`
    );
  }
  lines.push('');

  for (const scope of graph.scopes) {
    lines.push(scopeHeader(scope));
    for (const element of scope.elements) {
      const parts = [`ref=${element.ref}`, element.tagName];
      if (element.text) parts.push(`"${escapeText(element.text)}"`);
      if (element.componentBoundary) parts.push('component-boundary');
      if (element.locatorStability) parts.push(`locator=${element.locatorStability}`);
      if (includePosition && element.position) {
        const { left, top, width, height } = element.position;
        parts.push(`pos=[${left},${top}]`);
        parts.push(`size=[${width}x${height}]`);
      }
      if (includeAttributes && element.attributes) {
        const attributes = Object.entries(element.attributes)
          .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
          .join(' ');
        if (attributes) parts.push(attributes);
      }
      lines.push(parts.join(' '));
    }
    lines.push('');
  }

  if (graph.edges.length > 0) {
    lines.push('@edges');
    for (const edge of graph.edges) {
      lines.push(`${edge.fromScopeId} --${edge.boundaryRef}--> ${edge.toScopeId}`);
    }
  }
  return lines.join('\n').trimEnd();
}

function formatMinimal(snapshot: PageSnapshot): string {
  const lines: string[] = [];
  const graph = graphView(snapshot);
  lines.push(`# Page: ${snapshot.path}`);
  lines.push(`# Snapshot: ${snapshot.snapshotId}`);
  lines.push(`# Revision: ${snapshot.pageRevision}`);
  lines.push(`# Complete: ${graph.complete}`);
  lines.push(`# Scopes: ${graph.scopes.length}`);
  lines.push(`# Elements: ${totalElements(graph.scopes)}`);
  lines.push('');

  for (const scope of graph.scopes) {
    lines.push(scopeHeader(scope));
    for (const element of scope.elements) {
      const parts = [element.ref, element.tagName];
      if (element.text) parts.push(`"${escapeText(element.text)}"`);
      if (element.componentBoundary) parts.push('[component]');
      lines.push(parts.join(' '));
    }
  }
  return lines.join('\n');
}

function filterElement(
  element: ElementSnapshot,
  options: FormatOptions
): ElementSnapshot {
  const { includePosition = true, includeAttributes = false } = options;
  const filtered: ElementSnapshot = {
    ref: element.ref,
    tagName: element.tagName,
  };
  if (element.text) filtered.text = element.text;
  if (element.locatorStability) filtered.locatorStability = element.locatorStability;
  if (element.componentBoundary !== undefined) {
    filtered.componentBoundary = element.componentBoundary;
  }
  if (includePosition && element.position) filtered.position = element.position;
  if (includeAttributes && element.attributes) filtered.attributes = element.attributes;
  return filtered;
}

/** JSON V2 只输出 scopes/edges，不泄漏内部 PageSnapshot.elements 别名。 */
function formatJSON(snapshot: PageSnapshot, options: FormatOptions): string {
  const graph = graphView(snapshot);
  const scopes = graph.scopes.map(scope => ({
    scopeId: scope.scopeId,
    kind: scope.kind,
    rootRef: scope.rootRef ?? null,
    depth: scope.depth,
    status: scope.status,
    reason: scope.reason ?? null,
    elements: scope.elements.map(element => filterElement(element, options)),
  }));
  return JSON.stringify(
    {
      snapshotId: snapshot.snapshotId,
      pageRevision: snapshot.pageRevision,
      path: snapshot.path,
      rootScopeId: graph.rootScopeId,
      complete: graph.complete,
      budget: snapshot.budget ?? null,
      usage: snapshot.usage ?? {
        expandedScopes: scopes.filter(scope => scope.status !== 'truncated').length,
        elements: totalElements(scopes),
      },
      scopes,
      edges: graph.edges,
    },
    null,
    2
  );
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .slice(0, 100);
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function estimateTokens(snapshot: PageSnapshot): {
  compact: number;
  minimal: number;
  json: number;
} {
  const compact = formatCompact(snapshot, { format: 'compact' });
  const minimal = formatMinimal(snapshot);
  const json = formatJSON(snapshot, { format: 'json' });
  return {
    compact: Math.ceil(compact.length / 4),
    minimal: Math.ceil(minimal.length / 4),
    json: Math.ceil(json.length / 4),
  };
}
