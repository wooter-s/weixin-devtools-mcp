/**
 * 统一错误消息提取
 * 替代重复的 `error instanceof Error ? error.message : String(error)` 模式
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
