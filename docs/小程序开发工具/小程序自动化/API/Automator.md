# Automator

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/automator.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 小程序自动化 /API /Automator /

---

# Automator

Automator 模块提供了启动及连接开发者工具的方法。

## 方法

### automator.connect

连接开发者工具。
```typescript
automator.connect(options: Object): Promise<MiniProgram>
```
options 字段定义如下：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| wsEndpoint | string | 是 | - | 开发者工具 WebSocket 地址 |

开发者工具开启自动化功能可以通过命令行调用。

`--auto <project_root>`：打开指定项目并开启自动化功能。

`--auto-port <port>`：指定自动化监听端口。
```bash
cli --auto /Users/username/demo --auto-port 9420
```
> 关于命令行调用的使用说明，可点此查看。

示例代码：
```javascript
automator.connect({
  wsEndpoint: 'ws://localhost:9420'
}).then(async miniProgram => {
  const page = await miniProgram.navigateTo('/page/component/index')
  await page.setData({})
})
```

### automator.launch

启动并连接开发者工具。

> 确保工具安全设置中已开启 CLI/HTTP 调用功能。
```typescript
automator.launch(options: Object): Promise<MiniProgram>
```
options 字段定义如下：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| cliPath | string | 否 | - | 开发者工具命令行工具绝对路径 |
| projectPath | string | 是 | - | 项目绝对路径 |
| timeout | number | 否 | 30000 | 启动最长等待时间 |
| port | number | 否 | - | WebSocket 端口号 |
| account | string | 否 | - | 用户 openid |
| projectConfig | Object | 否 | - | 覆盖 project.config.json 中的配置 |
| ticket | string | 否 | - | 开发者工具登录票据 |

cliPath 未设置时将会在以下几个位置尝试寻找：

- Mac：/Applications/wechatwebdevtools.app/Contents/MacOS/cli

- Win：C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat

account 可以使用多账号调试中已添加的用户打开项目窗口，与 miniProgram.testAccounts 接口配合使用。

ticket 可以使用其它机器上已登录的开发者工具身份，与 miniProgram.getTicket 接口配合使用。

示例代码：
```javascript
automator.launch({
  cliPath: 'path/to/cli',
  projectPath: 'path/to/project',
  projectConfig: {
    setting: {
      autoAudits: true,
    },
  },
}).then(async miniProgram => {
  const page = await miniProgram.navigateTo('/page/component/index')
  await page.setData({})
})
```
接下来的示例代码为方便会省略 launch 参数传递。

## 代码示例
```typescript
automator.connect(options: Object): Promise<MiniProgram>
```
```typescript
automator.connect(options: Object): Promise<MiniProgram>
```
```bash
cli --auto /Users/username/demo --auto-port 9420
```
```bash
cli --auto /Users/username/demo --auto-port 9420
```
```javascript
automator.connect({
  wsEndpoint: 'ws://localhost:9420'
}).then(async miniProgram => {
  const page = await miniProgram.navigateTo('/page/component/index')
  await page.setData({})
})
```
```javascript
automator.connect({
  wsEndpoint: 'ws://localhost:9420'
}).then(async miniProgram => {
  const page = await miniProgram.navigateTo('/page/component/index')
  await page.setData({})
})
```
```typescript
automator.launch(options: Object): Promise<MiniProgram>
```
```typescript
automator.launch(options: Object): Promise<MiniProgram>
```
```javascript
automator.launch({
  cliPath: 'path/to/cli',
  projectPath: 'path/to/project',
  projectConfig: {
    setting: {
      autoAudits: true,
    },
  },
}).then(async miniProgram => {
  const page = await miniProgram.navigateTo('/page/component/index')
  await page.setData({})
})
```
```javascript
automator.launch({
  cliPath: 'path/to/cli',
  projectPath: 'path/to/project',
  projectConfig: {
    setting: {
      autoAudits: true,
    },
  },
}).then(async miniProgram => {
  const page = await miniProgram.navigateTo('/page/component/index')
  await page.setData({})
})
```
