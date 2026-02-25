/**
 * 页面快照核心逻辑
 * 从 src/tools.ts 提取
 */

import type { ElementSnapshot, PageSnapshot, ElementMapInfo } from './types.js';

/**
 * 生成简单的文本哈希（用于增强 UID 唯一性）
 */
function simpleTextHash(text: string): string {
  if (!text || text.length === 0) return '';
  const sanitized = text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').slice(0, 8);
  if (sanitized.length === 0) return '';
  return `_${sanitized}`;
}

/**
 * 生成元素的唯一标识符 (uid)
 */
export async function generateElementUid(element: any, index: number): Promise<string> {
  try {
    const tagName = element.tagName;

    const [className, id, testId, dataId, text] = await Promise.all([
      element.attribute('class').catch(() => ''),
      element.attribute('id').catch(() => ''),
      element.attribute('data-testid').catch(() => ''),
      element.attribute('data-id').catch(() => ''),
      element.text().catch(() => '')
    ]);

    console.error(`[generateElementUid] tagName=${tagName}, id="${id}", testId="${testId}", dataId="${dataId}", className="${className}", index=${index}`);

    let selector = tagName;

    if (testId) {
      selector += `[data-testid="${testId}"]`;
    } else if (id) {
      selector += `#${id}`;
    } else if (dataId) {
      selector += `[data-id="${dataId}"]`;
    } else if (className) {
      const firstClass = className.split(' ')[0];
      const textHash = simpleTextHash(text);
      selector += `.${firstClass}${textHash}`;
    } else {
      selector += `:nth-child(${index + 1})`;
    }

    console.error(`[generateElementUid] Generated UID: ${selector}`);
    return selector;
  } catch (error) {
    console.error(`[generateElementUid] Error:`, error);
    return `${element.tagName || 'unknown'}:nth-child(${index + 1})`;
  }
}

/**
 * 获取页面元素快照
 */
export async function getPageSnapshot(page: any): Promise<{
  snapshot: PageSnapshot;
  elementMap: Map<string, ElementMapInfo>;
}> {
  if (!page) {
    throw new Error("页面对象是必需的");
  }

  try {
    const elements: ElementSnapshot[] = [];
    const elementMap = new Map<string, ElementMapInfo>();

    await new Promise(resolve => setTimeout(resolve, 1000));

    let childElements: any[] = [];
    let usedStrategy = 'unknown';

    // 策略1: 通配符
    try {
      childElements = await page.$$('*');
      if (childElements.length > 0) {
        usedStrategy = 'wildcard(*)';
        console.error(`✅ 策略1成功: 通配符查询获取到 ${childElements.length} 个元素`);
      }
    } catch (error) {
      console.warn('⚠️  策略1失败 (*)', error);
    }

    // 策略2: 常用组件选择器
    if (childElements.length === 0) {
      console.error('🔄 策略1无结果，降级到策略2（常用组件选择器）');
      const commonSelectors = [
        'view', 'text', 'button', 'image', 'input', 'textarea', 'picker', 'switch',
        'slider', 'scroll-view', 'swiper', 'icon', 'rich-text', 'progress',
        'navigator', 'form', 'checkbox', 'radio', 'cover-view', 'cover-image'
      ];

      for (const selector of commonSelectors) {
        try {
          const selectorElements = await page.$$(selector);
          childElements.push(...selectorElements);
          if (selectorElements.length > 0) {
            console.error(`  - ${selector}: ${selectorElements.length} 个元素`);
          }
        } catch (error) {
          // 忽略单个选择器失败
        }
      }

      if (childElements.length > 0) {
        usedStrategy = 'common-selectors';
        console.error(`✅ 策略2成功: 获取到 ${childElements.length} 个元素`);
      }
    }

    // 策略3: 层级选择器
    if (childElements.length === 0) {
      console.error('🔄 策略2无结果，降级到策略3（层级选择器）');
      try {
        const rootElements = await page.$$('page > *');
        childElements = rootElements;
        if (childElements.length > 0) {
          usedStrategy = 'hierarchical(page>*)';
          console.error(`✅ 策略3成功: 获取到 ${childElements.length} 个元素`);
        }
      } catch (error) {
        console.warn('⚠️  策略3失败 (page > *)', error);
      }
    }

    if (childElements.length === 0) {
      console.warn('❌ 所有策略均未获取到元素');
      return {
        snapshot: { path: await page.path, elements: [] },
        elementMap: new Map()
      };
    }

    console.error(`📊 最终获取到 ${childElements.length} 个元素（策略：${usedStrategy}）`);

    const selectorIndexMap = new Map<string, number>();
    const startTime = Date.now();

    for (let i = 0; i < childElements.length; i++) {
      const element = childElements[i];
      try {
        const [
          tagNameResult,
          textResult,
          classResult,
          idResult,
          testIdResult,
          dataIdResult,
          sizeResult,
          offsetResult
        ] = await Promise.allSettled([
          Promise.resolve(element.tagName || 'unknown'),
          element.text().catch(() => ''),
          element.attribute('class').catch(() => ''),
          element.attribute('id').catch(() => ''),
          element.attribute('data-testid').catch(() => ''),
          element.attribute('data-id').catch(() => ''),
          element.size().catch(() => null),
          element.offset().catch(() => null)
        ]);

        const tagName = tagNameResult.status === 'fulfilled' ? tagNameResult.value : 'unknown';
        const text = textResult.status === 'fulfilled' ? textResult.value : '';
        const className = classResult.status === 'fulfilled' ? classResult.value : '';
        const id = idResult.status === 'fulfilled' ? idResult.value : '';
        const testId = testIdResult.status === 'fulfilled' ? testIdResult.value : '';
        const dataId = dataIdResult.status === 'fulfilled' ? dataIdResult.value : '';
        const size = sizeResult.status === 'fulfilled' ? sizeResult.value : null;
        const offset = offsetResult.status === 'fulfilled' ? offsetResult.value : null;

        let selector = tagName;
        if (testId) {
          selector += `[data-testid="${testId}"]`;
        } else if (id) {
          selector += `#${id}`;
        } else if (dataId) {
          selector += `[data-id="${dataId}"]`;
        } else if (className) {
          const firstClass = className.split(' ')[0];
          const textHash = simpleTextHash(text);
          selector += `.${firstClass}${textHash}`;
        } else {
          selector += `:nth-child(${i + 1})`;
        }

        const uid = selector;

        const snapshot: ElementSnapshot = {
          uid,
          tagName,
        };

        if (text && text.trim()) {
          snapshot.text = text.trim();
        }

        if (size && offset) {
          snapshot.position = {
            left: offset.left,
            top: offset.top,
            width: size.width,
            height: size.height
          };
        }

        elements.push(snapshot);

        let baseSelector = tagName;
        if (testId) {
          baseSelector = `${tagName}[data-testid="${testId}"]`;
        } else if (id) {
          baseSelector = `${tagName}#${id}`;
        } else if (dataId) {
          baseSelector = `${tagName}[data-id="${dataId}"]`;
        } else if (className) {
          baseSelector = `${tagName}.${className.split(' ')[0]}`;
        }

        const currentIndex = selectorIndexMap.get(baseSelector) || 0;
        selectorIndexMap.set(baseSelector, currentIndex + 1);

        elementMap.set(uid, {
          selector: baseSelector,
          index: currentIndex
        });

      } catch (error) {
        console.warn(`⚠️  处理元素 ${i} 时出错:`, error);
      }
    }

    const processingTime = Date.now() - startTime;
    console.error(`⏱️  元素处理耗时: ${processingTime}ms (平均 ${(processingTime / childElements.length).toFixed(2)}ms/元素)`);

    const pagePath = await page.path;
    const snapshotResult: PageSnapshot = {
      path: pagePath,
      elements
    };

    return { snapshot: snapshotResult, elementMap };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`获取页面快照失败: ${errorMessage}`);
  }
}
