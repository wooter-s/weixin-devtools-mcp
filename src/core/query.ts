/**
 * 页面查询核心逻辑
 * 从 src/tools.ts 提取
 */

import type { ElementMapInfo, QueryResult, QueryOptions, WaitForOptions } from './types.js';
import { generateElementUid } from './snapshot.js';

import { extractErrorMessage } from '../utils/error.js';

/**
 * 通过选择器查询页面元素
 */
export async function queryElements(
  page: any,
  elementMap: Map<string, ElementMapInfo>,
  options: QueryOptions
): Promise<QueryResult[]> {
  const { selector } = options;

  if (!selector || typeof selector !== 'string' || selector.trim() === '') {
    throw new Error("选择器不能为空");
  }

  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const elements = await page.$$(selector);
    const results: QueryResult[] = [];

    const uidCounter = new Map<string, number>();

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      try {
        const baseUid = await generateElementUid(element, i);

        const count = uidCounter.get(baseUid) || 0;
        uidCounter.set(baseUid, count + 1);

        const uid = count === 0 ? baseUid : `${baseUid}[${count + 1}]`;

        const result: QueryResult = {
          uid,
          tagName: element.tagName || 'unknown',
        };

        try {
          const text = await element.text();
          if (text && text.trim()) {
            result.text = text.trim();
          }
        } catch (error) {
          // 忽略无法获取文本的元素
        }

        try {
          const [size, offset] = await Promise.all([
            element.size(),
            element.offset()
          ]);

          result.position = {
            left: offset.left,
            top: offset.top,
            width: size.width,
            height: size.height
          };
        } catch (error) {
          // 忽略无法获取位置的元素
        }

        try {
          const attributes: Record<string, string> = {};
          const commonAttrs = ['class', 'id', 'data-testid'];
          for (const attr of commonAttrs) {
            try {
              const value = await element.attribute(attr);
              if (value) {
                attributes[attr] = value;
              }
            } catch (error) {
              // 忽略不存在的属性
            }
          }

          if (Object.keys(attributes).length > 0) {
            result.attributes = attributes;
          }
        } catch (error) {
          // 忽略属性获取错误
        }

        results.push(result);

        elementMap.set(uid, {
          selector: selector,
          index: i
        });

      } catch (error) {
        console.warn(`Error processing element ${i}:`, error);
      }
    }

    return results;
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    throw new Error(`查询元素失败: ${errorMessage}`);
  }
}

/**
 * 等待条件满足
 */
export async function waitForCondition(
  page: any,
  options: WaitForOptions | number | string
): Promise<boolean> {
  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    if (typeof options === 'number') {
      await page.waitFor(options);
      return true;
    }

    if (typeof options === 'string') {
      const startTime = Date.now();
      const timeout = 5000;

      while (Date.now() - startTime < timeout) {
        try {
          const element = await page.$(options);
          if (element) {
            return true;
          }
        } catch (error) {
          // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`等待元素 ${options} 超时`);
    }

    const {
      selector,
      timeout = 5000,
      text,
      visible,
      disappear = false
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        if (selector) {
          const element = await page.$(selector);

          if (disappear) {
            if (!element) {
              return true;
            }
          } else {
            if (element) {
              if (text) {
                try {
                  const elementText = await element.text();
                  if (!elementText || !elementText.includes(text)) {
                    throw new Error('文本不匹配');
                  }
                } catch (error) {
                  throw new Error('文本不匹配');
                }
              }

              if (visible !== undefined) {
                try {
                  const size = await element.size();
                  const isVisible = size.width > 0 && size.height > 0;
                  if (isVisible !== visible) {
                    throw new Error('可见性不匹配');
                  }
                } catch (error) {
                  throw new Error('可见性不匹配');
                }
              }

              return true;
            }
          }
        } else if (typeof timeout === 'number') {
          await page.waitFor(timeout);
          return true;
        }
      } catch (error) {
        // 继续等待，直到超时
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    let errorMsg = '等待条件超时: ';
    if (selector) {
      errorMsg += `选择器 ${selector}`;
      if (disappear) errorMsg += ' 消失';
      if (text) errorMsg += ` 包含文本 "${text}"`;
      if (visible !== undefined) errorMsg += ` ${visible ? '可见' : '隐藏'}`;
    }
    throw new Error(errorMsg);

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    throw new Error(`等待条件失败: ${errorMessage}`);
  }
}
