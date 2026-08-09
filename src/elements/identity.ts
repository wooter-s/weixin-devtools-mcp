import { randomUUID } from 'node:crypto';

/** 为一次快照生成不携带 selector 语义的标识。 */
export function createSnapshotId(pageRevision = 0): string {
  if (!Number.isSafeInteger(pageRevision) || pageRevision < 0) {
    throw new Error('pageRevision 必须是非负安全整数');
  }

  return `snap_${pageRevision}_${randomUUID()}`;
}

/**
 * ref 只保证在快照生命周期内可作为 opaque key 使用；调用方不得解析其组成。
 */
export function createElementRef(snapshotId: string, index: number): string {
  if (!snapshotId) {
    throw new Error('snapshotId 不能为空');
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error('元素索引必须是非负安全整数');
  }

  const snapshotToken = snapshotId.replace(/[^a-zA-Z0-9]/g, '').slice(-16);
  return `ref_${snapshotToken}_${index.toString(36)}`;
}
