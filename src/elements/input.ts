export interface TextInputElement {
  /** 本地 SDK 声明仍可能把 value 暴露成属性；append 时会做运行时能力检查。 */
  value?: string | (() => Promise<unknown>);
  input(text: string): Promise<void>;
}

export type TextInputCommand =
  | { mode: 'replace'; text: string }
  | { mode: 'append'; text: string }
  | { mode: 'clear' };

/** 用 input('') 清空，兼容 miniprogram-automator 实际公开能力。 */
export async function applyTextInput(
  element: TextInputElement,
  command: TextInputCommand
): Promise<void> {
  if (command.mode === 'clear') {
    await element.input('');
    return;
  }

  if (command.mode === 'replace') {
    await element.input(command.text);
    return;
  }

  if (typeof element.value !== 'function') {
    throw new Error('当前元素不支持 value()，无法安全追加文本');
  }
  const currentValue = await element.value();
  const prefix = currentValue === null || currentValue === undefined
    ? ''
    : String(currentValue);
  await element.input(prefix + command.text);
}

/** 在工具 schema 完成破坏升级前集中兼容旧 clear/append 参数。 */
export function fromLegacyInputOptions(
  text: string,
  clear = false,
  append = false
): TextInputCommand {
  if (clear && append) {
    throw new Error('clear 与 append 不能同时为 true');
  }
  if (append) {
    return { mode: 'append', text };
  }

  return { mode: 'replace', text };
}
