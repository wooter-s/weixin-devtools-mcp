# Page

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/page.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 小程序自动化 /API /Page /

---

# Page

Page 模块提供了控制小程序页面的方法。

## 属性

### page.path

页面路径。
```typescript
page.path: string
```

### page.query

页面参数。
```typescript
page.query: Object
```

## 方法

### page.$

获取页面元素。
```typescript
page.$(selector: string): Promise<Element>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| selector | string | 是 | - | 选择器 |

> 同 WXSS，仅支持部分 CSS 选择器，点击此处查看详细信息。

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  const element = await page.$('.index-desc')
  console.log(element.tagName) // -> 'view'
})
```

### page.$$

获取页面元素数组。
```typescript
page.$$(selector: string): Promise<Element[]>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| selector | string | 是 | - | 选择器 |

> 该方法跟 $ 一样均无法选择自定义组件内的元素，请使用 element.$。

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  const elements = await page.$$('.kind-list-text')
  console.log(elements.length)
})
```

### page.waitFor

等待直到指定条件成立。
```typescript
page.waitFor(condition: string | number | Function): Promise<void>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| condition | string number Function | 是 | - | 等待条件 |

如果条件是 string 类型，那么该参数会被当成选择器，当该选择器选中元素个数不为零时，结束等待。

如果条件是 number 类型，那么该参数会被当成超时时长，当经过指定时间后，结束等待。

如果条件是 Function 类型，那么该参数会被当成断言函数，当该函数返回真值时，结束等待。

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await page.waitFor(5000) // 等待 5 秒
  await page.waitFor('picker') // 等待页面中出现 picker 元素
  await page.waitFor(async () => {
    return (await page.$$('picker')).length > 5
  }) // 等待页面中 picker 元素数量大于 5
})
```

### page.data

> 传递数据路径 automator 0.6.0，基础库 2.9.0 开始支持。

获取页面渲染数据。
```typescript
page.data(path?: string): Promise<Object>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| path | string | 否 | - | 数据路径 |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  console.log(await page.data('list'))
})
```

### page.setData

设置页面渲染数据。
```typescript
page.setData(data: Object): Promise<void>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| data | Object | 是 | - | 要改变的数据 |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await page.setData({
    text: 'changed data'
  })
})
```

### page.size

获取页面大小。
```typescript
page.size(): Promise<Object>
```
**返回值说明**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| width | number | 页面可滚动宽度 |
| height | number | 页面可滚动高度 |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  const { width, height } = await page.size()
  console.log(width, height)
})
```

### page.scrollTop

> automator 0.7.0 开始支持。

获取页面滚动位置。
```typescript
page.scrollTop(): Promise<number>
```
示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await miniProgram.pageScrollTo(20)
  console.log(await page.scrollTop())
})
```

### page.callMethod

调用页面指定方法。
```typescript
page.callMethod(method: string, ...args: any[]): Promise<any>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| method | string | 是 | - | 需要调用的方法名 |
| ...args | array<any> | 否 | - | 方法参数 |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await page.callMethod('onShareAppMessage')
})
```

## 代码示例
```typescript
page.path: string
```
```typescript
page.path: string
```
```typescript
page.query: Object
```
```typescript
page.query: Object
```
```typescript
page.$(selector: string): Promise<Element>
```
```typescript
page.$(selector: string): Promise<Element>
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  const element = await page.$('.index-desc')
  console.log(element.tagName) // -> 'view'
})
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  const element = await page.$('.index-desc')
  console.log(element.tagName) // -> 'view'
})
```
```typescript
page.$$(selector: string): Promise<Element[]>
```
```typescript
page.$$(selector: string): Promise<Element[]>
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  const elements = await page.$$('.kind-list-text')
  console.log(elements.length)
})
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  const elements = await page.$$('.kind-list-text')
  console.log(elements.length)
})
```
```typescript
page.waitFor(condition: string | number | Function): Promise<void>
```
```typescript
page.waitFor(condition: string | number | Function): Promise<void>
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await page.waitFor(5000) // 等待 5 秒
  await page.waitFor('picker') // 等待页面中出现 picker 元素
  await page.waitFor(async () => {
    return (await page.$$('picker')).length > 5
  }) // 等待页面中 picker 元素数量大于 5
})
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await page.waitFor(5000) // 等待 5 秒
  await page.waitFor('picker') // 等待页面中出现 picker 元素
  await page.waitFor(async () => {
    return (await page.$$('picker')).length > 5
  }) // 等待页面中 picker 元素数量大于 5
})
```
```typescript
page.data(path?: string): Promise<Object>
```
```typescript
page.data(path?: string): Promise<Object>
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  console.log(await page.data('list'))
})
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  console.log(await page.data('list'))
})
```
```typescript
page.setData(data: Object): Promise<void>
```
```typescript
page.setData(data: Object): Promise<void>
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await page.setData({
    text: 'changed data'
  })
})
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await page.setData({
    text: 'changed data'
  })
})
```
```typescript
page.size(): Promise<Object>
```
```typescript
page.size(): Promise<Object>
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  const { width, height } = await page.size()
  console.log(width, height)
})
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  const { width, height } = await page.size()
  console.log(width, height)
})
```
```typescript
page.scrollTop(): Promise<number>
```
```typescript
page.scrollTop(): Promise<number>
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await miniProgram.pageScrollTo(20)
  console.log(await page.scrollTop())
})
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await miniProgram.pageScrollTo(20)
  console.log(await page.scrollTop())
})
```
```typescript
page.callMethod(method: string, ...args: any[]): Promise<any>
```
```typescript
page.callMethod(method: string, ...args: any[]): Promise<any>
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await page.callMethod('onShareAppMessage')
})
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.currentPage()
  await page.callMethod('onShareAppMessage')
})
```
