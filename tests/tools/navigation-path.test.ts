/**
 * toAbsolutePagePath 纯函数测试
 * 锁定页面路径归一化逻辑：SDK 的 navigateTo/reLaunch/switchTab/redirectTo
 * 要求绝对路径（以 "/" 开头），相对路径会被按当前页面解析导致路径错误。
 */
import { describe, it, expect } from 'vitest';

import { toAbsolutePagePath } from '../../src/core/navigation.js';

describe('toAbsolutePagePath', () => {
  it('对 app.json 风格的相对路径补全前导 "/"', () => {
    expect(toAbsolutePagePath('pages/home/index')).toBe('/pages/home/index');
    expect(toAbsolutePagePath('subpackages/dev-tool/pages/debug')).toBe(
      '/subpackages/dev-tool/pages/debug'
    );
  });

  it('已是绝对路径时保持不变', () => {
    expect(toAbsolutePagePath('/pages/home/index')).toBe('/pages/home/index');
  });

  it('显式相对路径（以 "." 开头）保持不变', () => {
    expect(toAbsolutePagePath('./detail')).toBe('./detail');
    expect(toAbsolutePagePath('../list')).toBe('../list');
  });

  it('空字符串原样返回', () => {
    expect(toAbsolutePagePath('')).toBe('');
  });
});
