# MiniProgram

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/miniprogram.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 小程序自动化 /API /MiniProgram /

---

# MiniProgram

MiniProgram 模块提供了控制小程序的方法。

## 方法

### miniProgram.pageStack

获取小程序页面堆栈。
```typescript
miniProgram.pageStack(): Promise<Page[]>
```
示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const pageStack = await miniProgram.pageStack()
  console.log(pageStack.length) // 当前页面栈数量
})
```

### miniProgram.navigateTo

保留当前页面，跳转到应用内的某个页面，同 `wx.navigateTo`。
```typescript
miniProgram.navigateTo(url: string): Promise<Page>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| url | string | 是 | - | 需要跳转的应用内非 tabBar 的页面的路径 |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.navigateTo('/page/component/index')
  console.log(page.path) // -> 'page/component/index'
})
```

### miniProgram.redirectTo

关闭当前页面，跳转到应用内的某个页面，同 `wx.redirectTo`。
```typescript
miniProgram.redirectTo(url: string): Promise<Page>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| url | string | 是 | - | 需要跳转的应用内非 tabBar 的页面的路径 |

### miniProgram.navigateBack

关闭当前页面，返回上一页面或多级页面，同 `wx.navigateBack`。
```typescript
miniProgram.navigateBack(): Promise<Page>
```

### miniProgram.reLaunch

关闭所有页面，打开到应用内的某个页面，同 `wx.reLaunch`。
```typescript
miniProgram.reLaunch(url: string): Promise<Page>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| url | string | 是 | - | 需要跳转的应用内页面路径 |

### miniProgram.switchTab

跳转到 tabBar 页面，并关闭其他所有非 tabBar 页面，同 `wx.switchTab`。
```typescript
miniProgram.switchTab(url: string): Promise<Page>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| url | string | 是 | - | 需要跳转的 tabBar 页面的路径 |

### miniProgram.currentPage

获取当前页面。
```typescript
miniProgram.currentPage(): Promise<Page>
```

### miniProgram.systemInfo

获取系统信息，同 `wx.getSystemInfo`。
```typescript
miniProgram.systemInfo(): Promise<Object>
```
示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const systemInfo = await miniProgram.systemInfo()
  if (systemInfo.platform === 'devtools') {
    // Do something
  }
})
```

### miniProgram.callWxMethod

调用 wx 对象上的指定方法。
```typescript
miniProgram.callWxMethod(method: string, ...args: any[]): Promise<any>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| method | string | 是 | - | 需要调用的方法名 |
| ...args | array<any> | 否 | - | 方法参数 |

调用异步方法时无需传入 success 及 fail 回调函数。

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.callWxMethod('setStorage', {
    key: 'test',
    data: 'test'
  })
  const { data } = await miniProgram.callWxMethod('getStorageSync', 'test')
  console.log(data) // -> 'test'
})
```

### miniProgram.callPluginWxMethod

> 基础库 2.19.3 开始支持。

调用插件 wx 对象上的指定方法，用法同 miniProgram.callWxMethod。
```typescript
miniProgram.callWxMethod(pluginId: string, method: string, ...args: any[]): Promise<any>
```

### miniProgram.mockWxMethod

> 传入函数功能 automator 0.9.0，基础库 2.9.5 开始支持。

覆盖 wx 对象上指定方法的调用结果。

利用该接口，你可以很方便地直接指定 `wx.chooseLocation` 等调用系统组件的返回结果。
```typescript
miniProgram.mockWxMethod(method: string, result: any): Promise<void>
miniProgram.mockWxMethod(method: string, fn: Function | string, ...args: any[]): Promise<void>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| method | string | 是 | - | 需要覆盖的方法名 |
| result | any | 是 | - | 指定调用结果 |

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| method | string | 是 | - | 需要覆盖的方法名 |
| fn | Function string | 是 | - | 处理返回函数 |
| ...args | array<any> | 否 | - | 传入参数 |

> fn 同 miniProgram.evaluate 的 appFunction 参数一样，无法使用闭包来引用外部变量。此外，你还可以在方法内使用 this.origin 来调用原始方法。

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.mockWxMethod('showModal', {
    confirm: true,
    cancel: false
  })

  await miniProgram.mockWxMethod(
    'getStorageSync',
    function(key, defVal) {
      if (key === 'name') return 'redhoodsu'
      if (key === 'sex') return 'male'
      return defVal
    },
    'unknown',
  )
  // 调用 wx.getStorageSync('name') 返回 'redhoodsu'

  // 更改 getSystemInfo 中的 platform 字段
  await miniProgram.mockWxMethod(
    'getSystemInfo',
    function(obj, platform) {
      return new Promise(resolve => {
        // origin 指向原始方法
        this.origin({
          success(res) {
            res.platform = platform
            resolve(res)
          },
        })
      })
    },
    'test',
  )
})
```

### miniProgram.mockPluginWxMethod

> 基础库 2.19.3 开始支持。

覆盖插件 wx 对象上指定方法的调用结果，用法同 miniProgram.mockWxMethod。
```typescript
miniProgram.mockWxMethod(pluginId: string, method: string, result: any): Promise<void>
miniProgram.mockWxMethod(pluginId: string, method: string, fn: Function | string, ...args: any[]): Promise<void>
```

### miniProgram.restoreWxMethod

重置 wx 指定方法，消除 mockWxMethod 调用的影响。
```typescript
miniProgram.restoreWxMethod(method: string): Promise<void>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| method | string | 是 | - | 需要覆盖的方法名 |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  console.log(await miniProgram.callWxMethod('getStorageSync', 'test')) // -> ''
  await miniProgram.mockWxMethod('getStorageSync', 'mockValue')
  console.log(await miniProgram.callWxMethod('getStorageSync', 'test')) // -> 'mockValue'
  await miniProgram.restoreWxMethod('getStorageSync')
  console.log(await miniProgram.callWxMethod('getStorageSync', 'test')) // -> ''
})
```

### miniProgram.restorePluginWxMethod

> 基础库 2.19.3 开始支持。

重置插件 wx 指定方法，消除 mockPluginWxMethod 调用的影响，用法同 miniProgram.restoreWxMethod。
```typescript
miniProgram.restoreWxMethod(pluginId: string, method: string): Promise<void>
```

### miniProgram.evaluate

往 AppService 注入代码片段并返回执行结果。
```typescript
miniProgram.evaluate(appFunction: Function | string, ...args: any[]): Promise<any>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| appFunction | Function string | 是 | - | 代码片段 |
| ...args | array<any> | 否 | - | 执行时传入参数 |

> appFunction 最终会被序列化传递到开发者工具，因此你无法在函数中利用闭包来引用外部变量。也就是说，传递 function () {} 函数事实上等同于传递其字符串。

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  let systemInfo = await miniProgram.evaluate(() => {
    return new Promise(resolve => {
      wx.getSystemInfo({
        success(result) {
          resolve(result)
        }
      })
    })
  })
  systemInfo = await miniProgram.evaluate(() => {
    return wx.getSystemInfoSync()
  })
  console.log(systemInfo)
  await miniProgram.evaluate(key => {
    wx.setStorageSync(key, 'test')
  }, 'test')
  const hasLogin = await miniProgram.evaluate(() => getApp().globalData.hasLogin)
  console.log(hasLogin)
})
```

### miniProgram.pageScrollTo

将页面滚动到目标位置，同 `wx.pageScrollTo`。
```typescript
miniProgram.pageScrollTo(scrollTop: number): Promise<void>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| scrollTop | number | 是 | - | 滚动到页面的目标位置，单位 px |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.pageScrollTo(50)
})
```

### miniProgram.screenshot

> automator 0.9.0，基础库 2.9.5，开发者工具 1.02.2001082 开始支持

对当前页面截图，目前只有开发者工具模拟器支持，客户端无法使用。
```typescript
miniProgram.screenshot(options?: Object): Promise<string | void>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| options | Object | 否 | - | 截图选项 |

如果不传 options，该方法返回图片数据的 base64 编码。

options 字段定义如下：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| path | string | 是 | - | 图片保存路径 |
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.screenshot({
    path: 'screenshot.png'
  })
})
```

### miniProgram.exposeFunction

在 AppService 全局暴露方法，供小程序侧调用测试脚本中的方法。
```typescript
miniProgram.exposeFunction(name: string, bindingFunction: Function): Promise<void>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| name | string | 是 | - | 全局方法名 |
| bindingFunction | Function | 是 | - | 脚本方法 |

> 你可以利用该方法来监听事件，不支持在小程序侧获取调用结果。

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.exposeFunction('onAppShow', options => {
    // Do something...
  })
  await miniProgram.evaluate(function() {
    wx.onAppShow(function(options) {
      onAppShow(options)
    })
  })
})
```

### miniProgram.testAccounts

> automator 0.9.0，开发者工具 1.02.2002272 开始支持

获取多账号调试中已添加的用户列表。
```typescript
miniProgram.testAccounts(): Promise<Account[]>
```
Account 字段定义如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| nickName | string | 用户昵称 |
| openid | string | 账号 openid |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const testAccounts = await miniProgram.testAccounts()
  for (let i = 0, len = testAccounts.length; i < len; i++) {
    const miniProgram = await automator.launch({
      projectPath: 'path/to/project',
      account: testAccounts[i].openid
    })
    // 控制多个用户登录的不同小程序
  }
})
```

### miniProgram.stopAudits

> automator 0.10.0，开发者工具 1.04.2006242 开始支持

停止体验评分并获取报告。
```typescript
miniProgram.stopAudits(options?: Object): Promise<Object>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| options | Object | 否 | - | 选项 |

options 字段定义如下：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| path | string | 否 | - | 报告保存路径 |

> 需要开启自动运行体验评分选项。
```javascript
automator.launch({
  projectConfig: {
    setting: {
      autoAudits: true,
    },
  },
}).then(async miniProgram => {
  const data = await miniProgram.stopAudits({
    path: 'report.html'
  })
  console.log(data) // 体验评分报告数据
})
```

### miniProgram.getTicket

获取开发者工具当前的登录票据。

> 确保工具安全设置中已开启允许获取工具登录票据功能。
```typescript
miniProgram.getTicket(): Promise<Object>
```
**返回值说明**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| ticket | string | 登录票据 |
| expiredTime | number | 票据过期时间 |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  const result = await miniProgram.getTicket()
  console.log(result.ticket)
})
```

### miniProgram.setTicket

设置开发者工具登录票据，可在工具运行测试期间更新失效的登录票据。
```typescript
miniProgram.setTicket(ticket: string): Promise<void>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| ticket | string | 是 | - | 登录票据 |

示例代码：
```javascript
// ticket 从已登录的开发者工具获取
automator.launch({
  ticket,
}).then(async miniProgram => {
  // 如果初始票据已失效，获取新票据后通过 setTicket 更新
  await miniProgram.setTicket(ticket)
})
```

### miniProgram.refreshTicket

刷新开发者工具登录票据，可以使票据过期时间重置为两小时。
```typescript
miniProgram.refreshTicket(): Promise<void>
```
> 刷新票据后原有的票据即使过期时间未到也会过期。

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.refreshTicket()
})
```

### miniProgram.remote

开启工具真机调试功能。
```typescript
miniProgram.remote(auto?: boolean): Promise<void>
```
**参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| auto | boolean | 否 | false | 是否自动真机调试 |

调用后脚本会启动工具真机调试功能，并且在控制台上打印二维码，然后你需要使用真机扫码连接使自动化脚本继续跑下去。

> auto 为 true 时，真机上会自动调起小程序，无需扫码，仅支持微信 7.0.6（安卓）、6.6.7（iOS）及以上版本。有关真机自动化相关内容，请点此查看。

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.remote()
  // 扫码连接成功后在真机上执行自动化脚本
})
```

### miniProgram.disconnect

断开与小程序运行时的连接。
```typescript
miniProgram.disconnect(): void
```
示例代码：
```javascript
automator.launch().then(async miniProgram => {
  miniProgram.disconnect()
})
```

### miniProgram.close

断开与小程序运行时的连接并关闭项目窗口。
```typescript
miniProgram.close(): Promise<void>
```
示例代码：
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.close()
})
```

## 事件

### console

日志打印时触发。

传递一个 msg 参数，其字段如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| type | string | 日志类型，log、info 等 |
| args | array<any> | 日志内容 |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  miniProgram.on('console', msg => {
    console.log(msg.type, msg.args)
  })
})
```

### exception

页面 JS 出错时触发。

传递一个 error 参数，其字段如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| message | string | 错误信息 |
| stack | string | 错误堆栈 |

示例代码：
```javascript
automator.launch().then(async miniProgram => {
  miniProgram.on('exception', err => {
    console.log(err.message, err.stack)
  })
})
```

## 代码示例
```typescript
miniProgram.pageStack(): Promise<Page[]>
```
```typescript
miniProgram.pageStack(): Promise<Page[]>
```
```javascript
automator.launch().then(async miniProgram => {
  const pageStack = await miniProgram.pageStack()
  console.log(pageStack.length) // 当前页面栈数量
})
```
```javascript
automator.launch().then(async miniProgram => {
  const pageStack = await miniProgram.pageStack()
  console.log(pageStack.length) // 当前页面栈数量
})
```
```typescript
miniProgram.navigateTo(url: string): Promise<Page>
```
```typescript
miniProgram.navigateTo(url: string): Promise<Page>
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.navigateTo('/page/component/index')
  console.log(page.path) // -> 'page/component/index'
})
```
```javascript
automator.launch().then(async miniProgram => {
  const page = await miniProgram.navigateTo('/page/component/index')
  console.log(page.path) // -> 'page/component/index'
})
```
```typescript
miniProgram.redirectTo(url: string): Promise<Page>
```
```typescript
miniProgram.redirectTo(url: string): Promise<Page>
```
```typescript
miniProgram.navigateBack(): Promise<Page>
```
```typescript
miniProgram.navigateBack(): Promise<Page>
```
```typescript
miniProgram.reLaunch(url: string): Promise<Page>
```
```typescript
miniProgram.reLaunch(url: string): Promise<Page>
```
```typescript
miniProgram.switchTab(url: string): Promise<Page>
```
```typescript
miniProgram.switchTab(url: string): Promise<Page>
```
```typescript
miniProgram.currentPage(): Promise<Page>
```
```typescript
miniProgram.currentPage(): Promise<Page>
```
```typescript
miniProgram.systemInfo(): Promise<Object>
```
```typescript
miniProgram.systemInfo(): Promise<Object>
```
```javascript
automator.launch().then(async miniProgram => {
  const systemInfo = await miniProgram.systemInfo()
  if (systemInfo.platform === 'devtools') {
    // Do something
  }
})
```
```javascript
automator.launch().then(async miniProgram => {
  const systemInfo = await miniProgram.systemInfo()
  if (systemInfo.platform === 'devtools') {
    // Do something
  }
})
```
```typescript
miniProgram.callWxMethod(method: string, ...args: any[]): Promise<any>
```
```typescript
miniProgram.callWxMethod(method: string, ...args: any[]): Promise<any>
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.callWxMethod('setStorage', {
    key: 'test',
    data: 'test'
  })
  const { data } = await miniProgram.callWxMethod('getStorageSync', 'test')
  console.log(data) // -> 'test'
})
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.callWxMethod('setStorage', {
    key: 'test',
    data: 'test'
  })
  const { data } = await miniProgram.callWxMethod('getStorageSync', 'test')
  console.log(data) // -> 'test'
})
```
```typescript
miniProgram.callWxMethod(pluginId: string, method: string, ...args: any[]): Promise<any>
```
```typescript
miniProgram.callWxMethod(pluginId: string, method: string, ...args: any[]): Promise<any>
```
```typescript
miniProgram.mockWxMethod(method: string, result: any): Promise<void>
miniProgram.mockWxMethod(method: string, fn: Function | string, ...args: any[]): Promise<void>
```
```typescript
miniProgram.mockWxMethod(method: string, result: any): Promise<void>
miniProgram.mockWxMethod(method: string, fn: Function | string, ...args: any[]): Promise<void>
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.mockWxMethod('showModal', {
    confirm: true,
    cancel: false
  })

  await miniProgram.mockWxMethod(
    'getStorageSync',
    function(key, defVal) {
      if (key === 'name') return 'redhoodsu'
      if (key === 'sex') return 'male'
      return defVal
    },
    'unknown',
  )
  // 调用 wx.getStorageSync('name') 返回 'redhoodsu'

  // 更改 getSystemInfo 中的 platform 字段
  await miniProgram.mockWxMethod(
    'getSystemInfo',
    function(obj, platform) {
      return new Promise(resolve => {
        // origin 指向原始方法
        this.origin({
          success(res) {
            res.platform = platform
            resolve(res)
          },
        })
      })
    },
    'test',
  )
})
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.mockWxMethod('showModal', {
    confirm: true,
    cancel: false
  })

  await miniProgram.mockWxMethod(
    'getStorageSync',
    function(key, defVal) {
      if (key === 'name') return 'redhoodsu'
      if (key === 'sex') return 'male'
      return defVal
    },
    'unknown',
  )
  // 调用 wx.getStorageSync('name') 返回 'redhoodsu'

  // 更改 getSystemInfo 中的 platform 字段
  await miniProgram.mockWxMethod(
    'getSystemInfo',
    function(obj, platform) {
      return new Promise(resolve => {
        // origin 指向原始方法
        this.origin({
          success(res) {
            res.platform = platform
            resolve(res)
          },
        })
      })
    },
    'test',
  )
})
```
```typescript
miniProgram.mockWxMethod(pluginId: string, method: string, result: any): Promise<void>
miniProgram.mockWxMethod(pluginId: string, method: string, fn: Function | string, ...args: any[]): Promise<void>
```
```typescript
miniProgram.mockWxMethod(pluginId: string, method: string, result: any): Promise<void>
miniProgram.mockWxMethod(pluginId: string, method: string, fn: Function | string, ...args: any[]): Promise<void>
```
```typescript
miniProgram.restoreWxMethod(method: string): Promise<void>
```
```typescript
miniProgram.restoreWxMethod(method: string): Promise<void>
```
```javascript
automator.launch().then(async miniProgram => {
  console.log(await miniProgram.callWxMethod('getStorageSync', 'test')) // -> ''
  await miniProgram.mockWxMethod('getStorageSync', 'mockValue')
  console.log(await miniProgram.callWxMethod('getStorageSync', 'test')) // -> 'mockValue'
  await miniProgram.restoreWxMethod('getStorageSync')
  console.log(await miniProgram.callWxMethod('getStorageSync', 'test')) // -> ''
})
```
```javascript
automator.launch().then(async miniProgram => {
  console.log(await miniProgram.callWxMethod('getStorageSync', 'test')) // -> ''
  await miniProgram.mockWxMethod('getStorageSync', 'mockValue')
  console.log(await miniProgram.callWxMethod('getStorageSync', 'test')) // -> 'mockValue'
  await miniProgram.restoreWxMethod('getStorageSync')
  console.log(await miniProgram.callWxMethod('getStorageSync', 'test')) // -> ''
})
```
```typescript
miniProgram.restoreWxMethod(pluginId: string, method: string): Promise<void>
```
```typescript
miniProgram.restoreWxMethod(pluginId: string, method: string): Promise<void>
```
```typescript
miniProgram.evaluate(appFunction: Function | string, ...args: any[]): Promise<any>
```
```typescript
miniProgram.evaluate(appFunction: Function | string, ...args: any[]): Promise<any>
```
```javascript
automator.launch().then(async miniProgram => {
  let systemInfo = await miniProgram.evaluate(() => {
    return new Promise(resolve => {
      wx.getSystemInfo({
        success(result) {
          resolve(result)
        }
      })
    })
  })
  systemInfo = await miniProgram.evaluate(() => {
    return wx.getSystemInfoSync()
  })
  console.log(systemInfo)
  await miniProgram.evaluate(key => {
    wx.setStorageSync(key, 'test')
  }, 'test')
  const hasLogin = await miniProgram.evaluate(() => getApp().globalData.hasLogin)
  console.log(hasLogin)
})
```
```javascript
automator.launch().then(async miniProgram => {
  let systemInfo = await miniProgram.evaluate(() => {
    return new Promise(resolve => {
      wx.getSystemInfo({
        success(result) {
          resolve(result)
        }
      })
    })
  })
  systemInfo = await miniProgram.evaluate(() => {
    return wx.getSystemInfoSync()
  })
  console.log(systemInfo)
  await miniProgram.evaluate(key => {
    wx.setStorageSync(key, 'test')
  }, 'test')
  const hasLogin = await miniProgram.evaluate(() => getApp().globalData.hasLogin)
  console.log(hasLogin)
})
```
```typescript
miniProgram.pageScrollTo(scrollTop: number): Promise<void>
```
```typescript
miniProgram.pageScrollTo(scrollTop: number): Promise<void>
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.pageScrollTo(50)
})
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.pageScrollTo(50)
})
```
```typescript
miniProgram.screenshot(options?: Object): Promise<string | void>
```
```typescript
miniProgram.screenshot(options?: Object): Promise<string | void>
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.screenshot({
    path: 'screenshot.png'
  })
})
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.screenshot({
    path: 'screenshot.png'
  })
})
```
```typescript
miniProgram.exposeFunction(name: string, bindingFunction: Function): Promise<void>
```
```typescript
miniProgram.exposeFunction(name: string, bindingFunction: Function): Promise<void>
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.exposeFunction('onAppShow', options => {
    // Do something...
  })
  await miniProgram.evaluate(function() {
    wx.onAppShow(function(options) {
      onAppShow(options)
    })
  })
})
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.exposeFunction('onAppShow', options => {
    // Do something...
  })
  await miniProgram.evaluate(function() {
    wx.onAppShow(function(options) {
      onAppShow(options)
    })
  })
})
```
```typescript
miniProgram.testAccounts(): Promise<Account[]>
```
```typescript
miniProgram.testAccounts(): Promise<Account[]>
```
```javascript
automator.launch().then(async miniProgram => {
  const testAccounts = await miniProgram.testAccounts()
  for (let i = 0, len = testAccounts.length; i < len; i++) {
    const miniProgram = await automator.launch({
      projectPath: 'path/to/project',
      account: testAccounts[i].openid
    })
    // 控制多个用户登录的不同小程序
  }
})
```
```javascript
automator.launch().then(async miniProgram => {
  const testAccounts = await miniProgram.testAccounts()
  for (let i = 0, len = testAccounts.length; i < len; i++) {
    const miniProgram = await automator.launch({
      projectPath: 'path/to/project',
      account: testAccounts[i].openid
    })
    // 控制多个用户登录的不同小程序
  }
})
```
```typescript
miniProgram.stopAudits(options?: Object): Promise<Object>
```
```typescript
miniProgram.stopAudits(options?: Object): Promise<Object>
```
```javascript
automator.launch({
  projectConfig: {
    setting: {
      autoAudits: true,
    },
  },
}).then(async miniProgram => {
  const data = await miniProgram.stopAudits({
    path: 'report.html'
  })
  console.log(data) // 体验评分报告数据
})
```
```javascript
automator.launch({
  projectConfig: {
    setting: {
      autoAudits: true,
    },
  },
}).then(async miniProgram => {
  const data = await miniProgram.stopAudits({
    path: 'report.html'
  })
  console.log(data) // 体验评分报告数据
})
```
```typescript
miniProgram.getTicket(): Promise<Object>
```
```typescript
miniProgram.getTicket(): Promise<Object>
```
```javascript
automator.launch().then(async miniProgram => {
  const result = await miniProgram.getTicket()
  console.log(result.ticket)
})
```
```javascript
automator.launch().then(async miniProgram => {
  const result = await miniProgram.getTicket()
  console.log(result.ticket)
})
```
```typescript
miniProgram.setTicket(ticket: string): Promise<void>
```
```typescript
miniProgram.setTicket(ticket: string): Promise<void>
```
```javascript
// ticket 从已登录的开发者工具获取
automator.launch({
  ticket,
}).then(async miniProgram => {
  // 如果初始票据已失效，获取新票据后通过 setTicket 更新
  await miniProgram.setTicket(ticket)
})
```
```javascript
// ticket 从已登录的开发者工具获取
automator.launch({
  ticket,
}).then(async miniProgram => {
  // 如果初始票据已失效，获取新票据后通过 setTicket 更新
  await miniProgram.setTicket(ticket)
})
```
```typescript
miniProgram.refreshTicket(): Promise<void>
```
```typescript
miniProgram.refreshTicket(): Promise<void>
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.refreshTicket()
})
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.refreshTicket()
})
```
```typescript
miniProgram.remote(auto?: boolean): Promise<void>
```
```typescript
miniProgram.remote(auto?: boolean): Promise<void>
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.remote()
  // 扫码连接成功后在真机上执行自动化脚本
})
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.remote()
  // 扫码连接成功后在真机上执行自动化脚本
})
```
```typescript
miniProgram.disconnect(): void
```
```typescript
miniProgram.disconnect(): void
```
```javascript
automator.launch().then(async miniProgram => {
  miniProgram.disconnect()
})
```
```javascript
automator.launch().then(async miniProgram => {
  miniProgram.disconnect()
})
```
```typescript
miniProgram.close(): Promise<void>
```
```typescript
miniProgram.close(): Promise<void>
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.close()
})
```
```javascript
automator.launch().then(async miniProgram => {
  await miniProgram.close()
})
```
```javascript
automator.launch().then(async miniProgram => {
  miniProgram.on('console', msg => {
    console.log(msg.type, msg.args)
  })
})
```
```javascript
automator.launch().then(async miniProgram => {
  miniProgram.on('console', msg => {
    console.log(msg.type, msg.args)
  })
})
```
```javascript
automator.launch().then(async miniProgram => {
  miniProgram.on('exception', err => {
    console.log(err.message, err.stack)
  })
})
```
```javascript
automator.launch().then(async miniProgram => {
  miniProgram.on('exception', err => {
    console.log(err.message, err.stack)
  })
})
```
