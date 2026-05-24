# 开发辅助 / miniprogram-mp-ci

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/miniprogram-mp-ci.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 开发辅助 /miniprogram-mp-ci /

---

## 概述

miniprogram-mp-ci 是一个 npm 包，旨在简化小程序的成员管理流程。它允许开发者直接通过代码，而不是手动通过[微信公众平台](https://mp.weixin.qq.com/)，来执行批量管理任务。这个工具包提供了一系列自动化功能，使得管理小程序成员变得快捷高效。

## 密钥及 IP 白名单配置

使用 miniprogram-mp-ci 前应访问"[微信公众平台](https://mp.weixin.qq.com)-管理-开发管理-开发设置-小程序代码上传"生成「代码上传密钥」，并配置 IP 白名单
开发者可选择打开 IP 白名单，打开后只有白名单中的 IP 才能调用相关接口。我们建议所有开发者默认开启这个选项，降低风险
代码上传密钥拥有预览、上传代码的权限，密钥不会明文存储在微信公众平台上，一旦遗失必须重置，请开发者妥善保管

## 功能

miniprogram-mp-ci 目前提供以下能力：

1. 批量成员管理

## 脚本调用
```shell
npm install miniprogram-mp-ci --save
```

### 项目对象

项目对象是本模块主要的入参，可以依据下边的定义自行实现

**项目对象的定义：**
```typescript
interface IProject {
  appid: string
  type: string
  projectPath: string
  privateKey: string
  attr(): Promise<IProjectAttr>
  stat(prefix: string, filePath: string): IStat | undefined
  getFile(prefix: string, filePath: string): Promise<Buffer>
  getFileList(prefix: string, extName: string): string[]
  updateFiles: () => void
}
```
| 键 | 类型 | 说明 |
| --- | --- | --- |
| appid | 属性 | 小程序/小游戏项目的 appid |
| type | 属性 | 项目的类型，有效值 miniProgram/miniProgramPlugin/miniGame/miniGamePlugin |
| projectPath | 属性 | 项目的路径，即 project.config.json 所在的目录 |
| privateKey | 属性 | 私钥，在获取项目属性和上传时用于鉴权使用，在 [微信公众平台](https://mp.weixin.qq.com) 上登录后下载 |
| attr | 异步方法 | 项目的属性，如指定了 privateKey 则会使用真实的项目属性 |
| stat | 同步方法 | 特定目录下前缀下（prefix）文件路径 (filePath) 的 stat, 如果不存在则返回 undefined |
| getFile | 异步方法 | 特定目录下前缀下（prefix）文件路径 (filePath) 的 Buffer |
| getFileList | 同步方法 | 特定目录下前缀下（prefix）文件路径 (filePath) 下的文件列表 |
| updateFile | 同步方法 | 更新项目文件 |

也可以通过指定项目路径来创建该对象
```javascript
const ci = require('miniprogram-mp-ci')
// 注意： new ci.Project 调用时，请确保项目代码已经是完整的，避免编译过程出现找不到文件的报错。
const project = new ci.Project({
  appid: 'wxsomeappid',
  type: 'miniProgram',
  projectPath: 'the/project/path',
  privateKeyPath: 'the/privatekey/path',
  ignores: ['node_modules/**/*'],
})
```
| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| appid | string | 是 | 合法的小程序/小游戏 appid |
| projectPath | string | 是 | 项目路径 |
| privateKeyPath | string | 是 | 私钥的路径 |
| type | string | 否 | 显示指明当前的项目类型, 默认为 miniProgram，有效值 miniProgram/miniProgramPlugin/miniGame/miniGamePlugin |
| ignores | string[] | 否 | 指定需要排除的规则 |

### 批量成员管理
```javascript
const ci = require('miniprogram-mp-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const result = await ci.manageProjectMember({
    project,
    action: "add_project_member_data",
    robot: 1,
    member_list: [
      {
         wechatid: "wechatid1",
         remark: "remark1"
      }
      {
         wechatid: "wechatid2",
         remark: "remark2"
      }
    ]
  })
  console.log(result)
})()
```

#### 参数

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| project | IProject | 是 | #项目对象 |
| action | string | 是 | #成员管理action |
| robot | number | 是 | 指定使用哪一个 ci 机器人，可选值：1 ~ 30 |
| member_list | array | 是 | #成员对象数组 |

#### 成员管理action

| 可选值 | 说明 |
| --- | --- |
| add_experiencer | 批量添加体验成员查看体验版权限 |
| delete_experiencer | 批量删除体验成员查看体验版权限 |
| add_experiencer_dev | 批量添加体验成员查看开发版权限 |
| delete_experiencer_dev | 批量删除体验成员查看开发版权限 |
| add_project_member_operator | 批量添加项目成员运营者权限 |
| delete_project_member_operator | 批量删除项目成员运营者权限 |
| add_project_member_developer | 批量添加项目成员开发者权限 |
| delete_project_member_developer | 批量删除项目成员开发者权限 |
| add_project_member_data | 批量添加项目成员数据分析者权限 |
| delete_project_member_data | 批量删除项目成员数据分析者权限 |

#### 成员对象

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| wechatid | string | 是 | 目标用户的微信号 |
| remark | string | 否 | 备注 |

#### 返回

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| errCode | number | 否 | #errCode解释 |
| errMsg | string | 否 | 操作失败的文字说明 |

#### errCode解释

| 值 | 说明 |
| --- | --- |
| 0 | 操作成功 |
| -1 | 请求失败 |
| 80601 | 新增的成员已存在 |
| 80602 | 删除的成员不存在 |
| 80603 | 操作的微信号列表超出上限 |
| 80604 | 操作的微信号列表中有微信号不存在 |
| 80605 | 无法操作管理员 |

#### 常见问题

Q1．生效方式是什么？
A1：确保信息无误，调用成功后，管理员微信会收到“公众平台安全助手“下发的消息通知，管理员确认后立即生效。

## 代码示例
```shell
npm install miniprogram-mp-ci --save
```
```shell
npm install miniprogram-mp-ci --save
```
```typescript
interface IProject {
  appid: string
  type: string
  projectPath: string
  privateKey: string
  attr(): Promise<IProjectAttr>
  stat(prefix: string, filePath: string): IStat | undefined
  getFile(prefix: string, filePath: string): Promise<Buffer>
  getFileList(prefix: string, extName: string): string[]
  updateFiles: () => void
}
```
```typescript
interface IProject {
  appid: string
  type: string
  projectPath: string
  privateKey: string
  attr(): Promise<IProjectAttr>
  stat(prefix: string, filePath: string): IStat | undefined
  getFile(prefix: string, filePath: string): Promise<Buffer>
  getFileList(prefix: string, extName: string): string[]
  updateFiles: () => void
}
```
```javascript
const ci = require('miniprogram-mp-ci')
// 注意： new ci.Project 调用时，请确保项目代码已经是完整的，避免编译过程出现找不到文件的报错。
const project = new ci.Project({
  appid: 'wxsomeappid',
  type: 'miniProgram',
  projectPath: 'the/project/path',
  privateKeyPath: 'the/privatekey/path',
  ignores: ['node_modules/**/*'],
})
```
```javascript
const ci = require('miniprogram-mp-ci')
// 注意： new ci.Project 调用时，请确保项目代码已经是完整的，避免编译过程出现找不到文件的报错。
const project = new ci.Project({
  appid: 'wxsomeappid',
  type: 'miniProgram',
  projectPath: 'the/project/path',
  privateKeyPath: 'the/privatekey/path',
  ignores: ['node_modules/**/*'],
})
```
```javascript
const ci = require('miniprogram-mp-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const result = await ci.manageProjectMember({
    project,
    action: "add_project_member_data",
    robot: 1,
    member_list: [
      {
         wechatid: "wechatid1",
         remark: "remark1"
      }
      {
         wechatid: "wechatid2",
         remark: "remark2"
      }
    ]
  })
  console.log(result)
})()
```
```javascript
const ci = require('miniprogram-mp-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const result = await ci.manageProjectMember({
    project,
    action: "add_project_member_data",
    robot: 1,
    member_list: [
      {
         wechatid: "wechatid1",
         remark: "remark1"
      }
      {
         wechatid: "wechatid2",
         remark: "remark2"
      }
    ]
  })
  console.log(result)
})()
```
