/**
 * 断言验证核心逻辑
 * 从 src/tools.ts 提取
 */

import type {
  ElementMapInfo,
  AssertResult,
  ExistenceAssertOptions,
  StateAssertOptions,
  ContentAssertOptions,
} from './types.js';

import { extractErrorMessage } from '../utils/error.js';

/**
 * 断言元素存在性
 */
export async function assertElementExists(
  page: any,
  options: ExistenceAssertOptions
): Promise<AssertResult> {
  const { selector, uid, timeout = 5000, shouldExist } = options;

  if (!selector && !uid) {
    throw new Error("必须提供selector或uid参数");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  const startTime = Date.now();
  let element = null;
  let actualExists = false;

  try {
    while (Date.now() - startTime < timeout) {
      try {
        if (selector) {
          element = await page.$(selector);
        } else if (uid) {
          element = await page.$(uid);
        }

        actualExists = !!element;

        if (actualExists === shouldExist) {
          return {
            passed: true,
            message: `断言通过: 元素${shouldExist ? '存在' : '不存在'}`,
            actual: actualExists,
            expected: shouldExist,
            timestamp: Date.now()
          };
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // 继续检查直到超时
      }
    }

    return {
      passed: false,
      message: `断言失败: 期望元素${shouldExist ? '存在' : '不存在'}，实际${actualExists ? '存在' : '不存在'}`,
      actual: actualExists,
      expected: shouldExist,
      timestamp: Date.now()
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    return {
      passed: false,
      message: `断言执行失败: ${errorMessage}`,
      actual: null,
      expected: shouldExist,
      timestamp: Date.now()
    };
  }
}

/**
 * 断言元素可见性
 */
export async function assertElementVisible(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: StateAssertOptions
): Promise<AssertResult> {
  const { uid, visible } = options;

  if (visible === undefined) {
    throw new Error("必须指定visible参数");
  }

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      return {
        passed: false,
        message: `断言失败: 找不到uid为 ${uid} 的元素`,
        actual: null,
        expected: visible,
        timestamp: Date.now()
      };
    }

    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      return {
        passed: false,
        message: `断言失败: 无法找到选择器为 ${mapInfo.selector} 的元素`,
        actual: false,
        expected: visible,
        timestamp: Date.now()
      };
    }

    if (mapInfo.index >= elements.length) {
      return {
        passed: false,
        message: `断言失败: 元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`,
        actual: false,
        expected: visible,
        timestamp: Date.now()
      };
    }

    const element = elements[mapInfo.index];
    if (!element) {
      return {
        passed: false,
        message: `断言失败: 无法获取索引为 ${mapInfo.index} 的元素`,
        actual: false,
        expected: visible,
        timestamp: Date.now()
      };
    }

    const size = await element.size();
    const actualVisible = size.width > 0 && size.height > 0;

    const passed = actualVisible === visible;
    return {
      passed,
      message: passed
        ? `断言通过: 元素${visible ? '可见' : '不可见'}`
        : `断言失败: 期望元素${visible ? '可见' : '不可见'}，实际${actualVisible ? '可见' : '不可见'}`,
      actual: actualVisible,
      expected: visible,
      timestamp: Date.now()
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    return {
      passed: false,
      message: `断言执行失败: ${errorMessage}`,
      actual: null,
      expected: visible,
      timestamp: Date.now()
    };
  }
}

/**
 * 断言元素文本内容
 */
export async function assertElementText(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: ContentAssertOptions
): Promise<AssertResult> {
  const { uid, text, textContains, textMatches } = options;

  if (!text && !textContains && !textMatches) {
    throw new Error("必须指定text、textContains或textMatches参数之一");
  }

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      return {
        passed: false,
        message: `断言失败: 找不到uid为 ${uid} 的元素`,
        actual: null,
        expected: text || textContains || textMatches,
        timestamp: Date.now()
      };
    }

    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      return {
        passed: false,
        message: `断言失败: 无法找到选择器为 ${mapInfo.selector} 的元素`,
        actual: null,
        expected: text || textContains || textMatches,
        timestamp: Date.now()
      };
    }

    if (mapInfo.index >= elements.length) {
      return {
        passed: false,
        message: `断言失败: 元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`,
        actual: null,
        expected: text || textContains || textMatches,
        timestamp: Date.now()
      };
    }

    const element = elements[mapInfo.index];
    if (!element) {
      return {
        passed: false,
        message: `断言失败: 无法获取索引为 ${mapInfo.index} 的元素`,
        actual: null,
        expected: text || textContains || textMatches,
        timestamp: Date.now()
      };
    }

    const actualText = await element.text();
    let passed = false;
    let expectedValue = '';
    let message = '';

    if (text) {
      passed = actualText === text;
      expectedValue = text;
      message = passed
        ? `断言通过: 文本精确匹配`
        : `断言失败: 期望文本 "${text}"，实际 "${actualText}"`;
    } else if (textContains) {
      passed = actualText.includes(textContains);
      expectedValue = textContains;
      message = passed
        ? `断言通过: 文本包含 "${textContains}"`
        : `断言失败: 期望包含 "${textContains}"，实际文本 "${actualText}"`;
    } else if (textMatches) {
      const regex = new RegExp(textMatches);
      passed = regex.test(actualText);
      expectedValue = textMatches;
      message = passed
        ? `断言通过: 文本匹配正则 ${textMatches}`
        : `断言失败: 期望匹配正则 ${textMatches}，实际文本 "${actualText}"`;
    }

    return {
      passed,
      message,
      actual: actualText,
      expected: expectedValue,
      timestamp: Date.now()
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    return {
      passed: false,
      message: `断言执行失败: ${errorMessage}`,
      actual: null,
      expected: text || textContains || textMatches,
      timestamp: Date.now()
    };
  }
}

/**
 * 断言元素属性
 */
export async function assertElementAttribute(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: ContentAssertOptions
): Promise<AssertResult> {
  const { uid, attribute } = options;

  if (!attribute) {
    throw new Error("必须指定attribute参数");
  }

  if (!uid) {
    throw new Error("元素uid是必需的");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const mapInfo = elementMap.get(uid);
    if (!mapInfo) {
      return {
        passed: false,
        message: `断言失败: 找不到uid为 ${uid} 的元素`,
        actual: null,
        expected: attribute.value,
        timestamp: Date.now()
      };
    }

    const elements = await page.$$(mapInfo.selector);
    if (!elements || elements.length === 0) {
      return {
        passed: false,
        message: `断言失败: 无法找到选择器为 ${mapInfo.selector} 的元素`,
        actual: null,
        expected: attribute.value,
        timestamp: Date.now()
      };
    }

    if (mapInfo.index >= elements.length) {
      return {
        passed: false,
        message: `断言失败: 元素索引 ${mapInfo.index} 超出范围，共找到 ${elements.length} 个元素`,
        actual: null,
        expected: attribute.value,
        timestamp: Date.now()
      };
    }

    const element = elements[mapInfo.index];
    if (!element) {
      return {
        passed: false,
        message: `断言失败: 无法获取索引为 ${mapInfo.index} 的元素`,
        actual: null,
        expected: attribute.value,
        timestamp: Date.now()
      };
    }

    const actualValue = await element.attribute(attribute.key);
    const passed = actualValue === attribute.value;

    return {
      passed,
      message: passed
        ? `断言通过: 属性 ${attribute.key} 值为 "${attribute.value}"`
        : `断言失败: 期望属性 ${attribute.key} 值为 "${attribute.value}"，实际 "${actualValue}"`,
      actual: actualValue,
      expected: attribute.value,
      timestamp: Date.now()
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    return {
      passed: false,
      message: `断言执行失败: ${errorMessage}`,
      actual: null,
      expected: attribute.value,
      timestamp: Date.now()
    };
  }
}
