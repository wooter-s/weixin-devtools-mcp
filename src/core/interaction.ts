/**
 * 交互操作核心逻辑
 * 从 src/tools.ts 提取
 */

import type { ElementMapInfo, ClickOptions, InputTextOptions, GetValueOptions, FormControlOptions } from './types.js';

/**
 * 点击页面元素
 */
export async function clickElement(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: ClickOptions
): Promise<void> {
  const { uid, dblClick = false } = options;

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    console.error(`[Click] 准备点击元素 - UID: ${uid}, Selector: ${mapInfo.selector}, Index: ${mapInfo.index}`);

    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(`无法找到选择器为 ${mapInfo.selector} 的元素`);
    }

    if (mapInfo.index >= elements.length) {
      throw new Error(`元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`);
    }

    const element = elements[mapInfo.index];
    if (!element) {
      throw new Error(`无法获取索引为 ${mapInfo.index} 的元素`);
    }

    const beforePath = await page.path;
    console.error(`[Click] 点击前页面: ${beforePath}`);

    await element.tap();
    console.error(`[Click] 已执行 tap() 操作`);

    if (dblClick) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await element.tap();
      console.error(`[Click] 已执行第二次 tap() (双击)`);
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const afterPath = await page.path;
      console.error(`[Click] 点击后页面: ${afterPath}`);
      if (beforePath !== afterPath) {
        console.error(`[Click] ✅ 页面已切换: ${beforePath} → ${afterPath}`);
      } else {
        console.error(`[Click] ⚠️  页面未切换，可能是同页面操作或导航延迟`);
      }
    } catch (error) {
      console.warn(`[Click] 无法获取点击后的页面路径:`, error);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Click] 点击失败:`, error);
    throw new Error(`点击元素失败: ${errorMessage}`);
  }
}

/**
 * 向元素输入文本
 */
export async function inputText(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: InputTextOptions
): Promise<void> {
  const { uid, text, clear = false, append = false } = options;

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(`无法找到选择器为 ${mapInfo.selector} 的元素`);
    }

    if (mapInfo.index >= elements.length) {
      throw new Error(`元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`);
    }

    const element = elements[mapInfo.index];
    if (!element) {
      throw new Error(`无法获取索引为 ${mapInfo.index} 的元素`);
    }

    if (clear && !append) {
      await element.clear();
    }

    if (append) {
      const currentValue = await element.value().catch(() => '');
      await element.input(currentValue + text);
    } else {
      await element.input(text);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`文本输入失败: ${errorMessage}`);
  }
}

/**
 * 获取元素值
 */
export async function getElementValue(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: GetValueOptions
): Promise<string | null> {
  const { uid, attribute } = options;

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(`无法找到选择器为 ${mapInfo.selector} 的元素`);
    }

    if (mapInfo.index >= elements.length) {
      throw new Error(`元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`);
    }

    const element = elements[mapInfo.index];
    if (!element) {
      throw new Error(`无法获取索引为 ${mapInfo.index} 的元素`);
    }

    if (attribute) {
      return await element.attribute(attribute);
    } else {
      try {
        return await element.value();
      } catch (error) {
        return await element.text();
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`获取元素值失败: ${errorMessage}`);
  }
}

/**
 * 设置表单控件值
 */
export async function setFormControl(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: FormControlOptions
): Promise<void> {
  const { uid, value, trigger = 'change' } = options;

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      throw new Error(`找不到uid为 ${uid} 的元素，请先获取页面快照`);
    }

    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      throw new Error(`无法找到选择器为 ${mapInfo.selector} 的元素`);
    }

    if (mapInfo.index >= elements.length) {
      throw new Error(`元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`);
    }

    const element = elements[mapInfo.index];
    if (!element) {
      throw new Error(`无法获取索引为 ${mapInfo.index} 的元素`);
    }

    await element.trigger(trigger, { value });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`设置表单控件失败: ${errorMessage}`);
  }
}
