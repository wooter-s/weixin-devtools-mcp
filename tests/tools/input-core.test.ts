import { describe, expect, it, vi } from 'vitest';

import { applyTextInput, fromLegacyInputOptions } from '../../src/tools.js';

describe('applyTextInput', () => {
  it('replace 直接覆盖且不读取旧值', async () => {
    const element = {
      value: vi.fn(async () => '旧值'),
      input: vi.fn(async () => undefined),
    };

    await applyTextInput(element, { mode: 'replace', text: '新值' });

    expect(element.value).not.toHaveBeenCalled();
    expect(element.input).toHaveBeenCalledWith('新值');
  });

  it('append 必须通过 value() 读取后精确追加', async () => {
    const element = {
      value: vi.fn(async () => '已有'),
      input: vi.fn(async () => undefined),
    };

    await applyTextInput(element, { mode: 'append', text: '内容' });

    expect(element.value).toHaveBeenCalledOnce();
    expect(element.input).toHaveBeenCalledWith('已有内容');
  });

  it('clear 使用 input 空串，不依赖不存在的 clear()', async () => {
    const element = { input: vi.fn(async () => undefined) };

    await applyTextInput(element, { mode: 'clear' });

    expect(element.input).toHaveBeenCalledWith('');
  });

  it('无法读取 value() 时拒绝假装追加成功', async () => {
    const element = { value: '旧值', input: vi.fn(async () => undefined) };

    await expect(applyTextInput(element, { mode: 'append', text: '内容' }))
      .rejects.toThrow('不支持 value()');
    expect(element.input).not.toHaveBeenCalled();
  });

  it('旧参数 clear 与 append 同时为 true 时返回明确错误', () => {
    expect(() => fromLegacyInputOptions('文本', true, true))
      .toThrow('clear 与 append 不能同时为 true');
  });
});
