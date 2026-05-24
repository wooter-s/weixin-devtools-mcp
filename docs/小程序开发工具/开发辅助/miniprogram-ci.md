# 开发辅助 / miniprogram-ci

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 开发辅助 /miniprogram-ci /

---

## 概述

[miniprogram-ci](https://www.npmjs.com/package/miniprogram-ci) 是从[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/devtools.html)中抽离的关于小程序/小游戏项目代码的编译模块。

开发者可不打开小程序开发者工具，独立使用 miniprogram-ci 进行小程序代码的上传、预览等操作。

> miniprogram-ci 从 1.0.28 开始支持第三方平台开发的上传和预览，调用方式与普通开发模式无异。查看详情

## 密钥及 IP 白名单配置

使用 miniprogram-ci 前应访问"[微信公众平台](https://mp.weixin.qq.com)-管理-开发管理-开发设置-小程序代码上传"生成「代码上传密钥」，并配置 IP 白名单
开发者可选择打开 IP 白名单，打开后只有白名单中的 IP 才能调用相关接口。我们建议所有开发者默认开启这个选项，降低风险
代码上传密钥拥有预览、上传代码的权限，密钥不会明文存储在微信公众平台上，一旦遗失必须重置，请开发者妥善保管

## 功能

miniprogram-ci 目前提供以下能力：

1. 上传代码，对应小程序开发者工具的上传

2. 预览代码，对应小程序开发者工具的预览

3. 构建 npm，对应小程序开发者工具的: 菜单-工具-构建npm

4. 上传云开发云函数代码，对应小程序开发者工具的上传云函数能力

5. 上传云托管代码，对应小程序开发者工具的上传云托管能力

6. 上传云存储/静态托管文件，对应小程序开发者工具-云开发-云存储和静态托管文件管理

7. 代理，配置 miniprogram-ci 的网络请求代理方式

8. 支持获取最近上传版本的 sourceMap

9. 支持 node 脚本调用方式和 命令行 调用方式

## 脚本调用
```shell
npm install miniprogram-ci --save
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
const ci = require('miniprogram-ci')
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

### 上传
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const uploadResult = await ci.upload({
    project,
    version: '1.1.1',

    desc: 'hello',
    setting: {
      es6: true,
    },
    onProgressUpdate: console.log,
  })
  console.log(uploadResult)
})()
```

#### 参数

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| project | IProject | 是 | #项目对象 |
| version | string | 是 | 自定义版本号 |
| desc | string | 否 | 自定义备注 |
| setting | object | 否 | #编译设置 |
| onProgressUpdate | function | 否 | 进度更新监听函数 |
| robot | number | 否 | 指定使用哪一个 ci 机器人，可选值：1 ~ 30 |
| threads | number | 否 | 指定本地编译过程中开启的线程数 |

#### 返回

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| subPackageInfo | Array<{name:string, size:number}> | 否 | 小程序包信息, `name` 为 `__FULL__` 时表示整个小程序包， `name` 为 `__APP__` 时表示小程序主包，其他情况都表示分包 |
| pluginInfo | Array<{pluginProviderAppid:string, version: string, size:number}> | 否 | 小程序插件信息 |
| devPluginId | string | 否 | 插件开发模式下，上传版本的插件 id |

### 预览
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const previewResult = await ci.preview({
    project,
    desc: 'hello', // 此备注将显示在“小程序助手”开发版列表中
    setting: {
      es6: true,
    },
    qrcodeFormat: 'image',
    qrcodeOutputDest: '/path/to/qrcode/file/destination.jpg',
    onProgressUpdate: console.log,
    // pagePath: 'pages/index/index', // 预览页面
    // searchQuery: 'a=1&b=2',  // 预览参数 [注意!]这里的`&`字符在命令行中应写成转义字符`\&`
  })
  console.log(previewResult)
})()
```

#### 参数

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| project | IProject | 是 | #项目对象 |
| desc | string | 否 | 自定义备注，将显示在“小程序助手”开发版列表中 |
| setting | object | 否 | #编译设置 |
| onProgressUpdate | function | 否 | 进度更新监听函数 |
| robot | number | 否 | 指定使用哪一个 ci 机器人，可选值：1 ~ 30 |
| qrcodeFormat | string | 否 | 返回二维码文件的格式 `"image"` 或 `"base64"`， 默认值 `"terminal"` 供调试用 |
| qrcodeOutputDest | string | 是 | 二维码文件保存路径 |
| pagePath: | string | 否 | 预览页面路径 |
| searchQuery: | string | 否 | 预览页面路径启动参数 |
| scene | number | 否 | 默认值 `1011`，具体含义见[场景值列表](https://developers.weixin.qq.com/miniprogram/dev/reference/scene-list.html) |

#### 返回

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| subPackageInfo | Array<{name:string, size:number}> | 否 | 小程序包信息, `name` 为 `__FULL__` 时表示整个小程序包， `name` 为 `__APP__` 时表示小程序主包，其他情况都表示分包 |
| pluginInfo | Array<{pluginProviderAppid:string, version: string, size:number}> | 否 | 小程序插件信息 |

### 构建npm

对应开发者工具[构建npm](https://developers.weixin.qq.com/miniprogram/dev/devtools/npm.html)功能。
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  // 在有需要的时候构建npm
  const warning = await ci.packNpm(project, {
    ignores: ['pack_npm_ignore_list'],
    reporter: (infos) => { console.log(infos) }
  })
  console.warn(warning)
  // 可对warning进行格式化
  /*
    warning.map((it, index) => {
            return `${index + 1}. ${it.msg}
    \t> code: ${it.code}
    \t@ ${it.jsPath}:${it.startLine}-${it.endLine}`
          }).join('---------------\n')
  */
  // 完成构建npm之后，可用ci.preview或者ci.upload
})()
```
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| project | IProject | 是 | 项目对象 |
| options.ignores | string[] | 否 | 指定构建npm需要排除的规则 |
| options.reporter | function | 否 | 构建回调信息 |

### 拉取最近上传版本的sourceMap
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  await ci.getDevSourceMap({
    project,
    robot: 1,
    sourceMapSavePath: './sm.zip'
  })
})()
```

#### 参数

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| project | IProject | 是 | #项目对象 |
| robot | number | 是 | 指定使用哪一个 ci 机器人，可选值：1 ~ 30 |
| sourceMapSavePath | string | 是 | 保存的路径 |

### 自定义 node_modules 位置的构建 npm

有的时候，需要被构建模块对应的 `node_modules` 可能并不在小程序项目内，所以提供了一个新的接口来支持这个需求。
例如有如下项目结构
```text
├── lib # lib目录存放要被构建的 node_modules

│   ├── node_modules
│   │   └── is-object
│   └── package.json
└── miniprogram-project # 这里是小程序项目路径

    ├── miniprogram # 我们希望最终把 miniprogram_npm 构建在 miniprogram/ 目录之下

    │   ├── app.js
    │   ├── app.json
    │   ├── app.wxss
    │   ├── pages
    │   │   ├── index
    │   │   └── logs
    │   └── sitemap.json
    └── project.config.json
```
于是可以这样调用
```javascript
let packResult = await ci.packNpmManually({
  packageJsonPath: './lib/package.json',
  miniprogramNpmDistDir: './miniprogram-project/miniprogram/',
})

console.log('pack done, packResult:', packResult)
// 输出 pack done, packResult: { miniProgramPackNum: 0, otherNpmPackNum: 1, warnList: [] }
```
得到的最终项目
```text
.
├── lib
│   ├── node_modules
│   │   └── is-object
│   └── package.json
└── miniprogram-project
    ├── miniprogram
    │   ├── app.js
    │   ├── app.json
    │   ├── app.wxss
    │   ├── miniprogram_npm # &lt;--- 这就是构建出来的由 lib/node_modules 里 miniprogram_npm 了

    │   ├── pages
    │   └── sitemap.json
    └── project.config.json
```
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| options.packageJsonPath | string | 是 | 希望被构建的`node_modules` 对应的 `package.json` 的路径 |
| options.miniprogramNpmDistDir | string | 是 | 被构建 `miniprogram_npm` 的目标位置目标位置 |
| options.ignores | string[] | 否 | 指定需要排除的规则 |

### 上传云开发云函数

对应开发者工具[云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)的[云函数](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/capabilities.html#%E4%BA%91%E5%87%BD%E6%95%B0)上传能力。
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })

  const result = await ci.cloud.uploadFunction({
    project,
    env: '云环境 ID',
    name: '云函数名称',
    path: '云函数代码目录',
    remoteNpmInstall: true, // 是否云端安装依赖
  })
  console.warn(result)
})()
```
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| project | IProject | 是 | 项目对象 |
| env | string | 是 | 云环境 ID |
| name | string | 是 | 云函数名称 |
| path | string | 是 | 云函数代码目录 |
| remoteNpmInstall | boolean | 否 | 是否云端安装依赖，默认 false |

`remoteNpmInstall` 额外说明：true 时云端安装依赖，不会上传本地 `node_modules`，false 时全量上传，包括上传 `node_modules`。

### 上传云开发静态网站/云存储

对应开发者工具[云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)的[静态网站托管](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/staticstorage/introduction.html)和[云存储](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/storage.html)的上传能力。

需要安装 alpha 版本：`npm install --save miniprogram-ci@alpha`
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  // 静态网站
  const resultStatic = await ci.cloud.uploadStaticStorage({
    project,
    env: '云环境 ID',
    path: '本地文件目录',
    remotePath: '要上传到的远端文件目录',
  })
  // 云存储
  const resultStorage = await ci.cloud.uploadStorage({
    project,
    env: '云环境 ID',
    path: '本地文件目录',
    remotePath: '要上传到的远端文件目录',
  })
  console.warn(resultStatic, resultStorage)
})()
```
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| project | IProject | 是 | 项目对象 |
| env | string | 是 | 云环境 ID |
| path | string | 是 | 本地文件目录 |
| remotePath | boolean | 否 | 要上传到的远端文件目录 |

### 新建云开发云托管版本

对应开发者工具[云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)的[云托管](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/container/)新建版本能力。

需要安装 alpha 版本：`npm install --save miniprogram-ci@alpha`
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const result = await ci.cloud.uploadContainer({
    project,
    env: '云环境 ID',
    version: {
      uploadType: 'package', // 上传方式
      flowRatio: 0, // 流量比例
      cpu: 0.25, // CPU 核心数

      mem: 0.5, // 内存大小

      minNum: 0, // 最小副本数
      maxNum: 1, // 最大副本数
      policyType: 'cpu', // 扩缩容条件
      policyThreshold: 60, // 扩缩容阈值
      containerPort: 80, // 容器监听端口
      serverName: 'server', // 服务名称
      versionRemark: 'ci', // 版本备注
      envParams: '{}', // 环境变量
      buildDir: '', // 构建目录
      dockerfilePath: '' // Dockerfile 路径
    },
    containerRoot: 'the/path/to/container' // 需要上传的版本文件目录
  })
  console.warn(result)
})()
```
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| project | IProject | 是 | 项目对象 |
| env | string | 是 | 云环境 ID |
| containerRoot | string | 是 | 本地容器文件目录 |
| version.uploadType | string | 是 | 上传类型（package/repository/image） |
| version.flowRatio | number | 是 | 新建版本后的默认流量比例 |
| version.cpu | number | 是 | CPU 核心数量（需参考 [容器规格](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/container/concept.html#%E5%AE%B9%E5%99%A8%E8%A7%84%E6%A0%BC)） |
| version.mem | number | 是 | 内存大小（需参考 [容器规格](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/container/concept.html#%E5%AE%B9%E5%99%A8%E8%A7%84%E6%A0%BC)） |
| version.minNum | number | 是 | 最小副本数 |
| version.maxNum | number | 是 | 最大副本数 |
| version.policyType | string | 是 | 扩缩容条件，目前只支持：cpu |
| version.policyThreshold | number | 是 | 扩缩容阈值 |
| version.containerPort | number | 是 | 容器监听端口 |
| version.serverName | string | 是 | 服务名称 |
| version.versionRemark | string | 否 | 版本备注 |
| version.dockerfilePath | string | 否 | Dockerfile 路径 |
| version.buildDir | string | 否 | 构建目录 |
| version.envParams | string | 否 | 环境变量 |

### 代理

miniprogram-ci 使用了 [get-proxy](https://www.npmjs.com/package/get-proxy) 模块来自动获取代理地址。
如果不适用`ci.proxy()`方法或者`--proxy`参数来指定代理，那么 miniprogram-ci 将会按照以下顺序去获取 https 代理地址

1. 获取环境变量中的 `HTTPS_PROXY`

2. 获取环境变量中的 `https_proxy`

3. 获取环境变量中的 `HTTP_PROXY`

4. 获取环境变量中的 `http_proxy`

5. 获取npm配置的 `https-proxy`

6. 获取npm配置的 `http-proxy`

7. 获取npm配置的 `proxy`

8. 把 `servicewechat.com`加入到环境变量中的 `no_proxy`，miniprogram-ci 将不通过代理发送网络请求
```javascript
const ci = require('miniprogram-ci')
ci.proxy('YOUR_PROXY_URL')
```

## 命令行调用
```shell
npm install -g miniprogram-ci
```
```shell
# help
miniprogram-ci --help

# preview
miniprogram-ci \
  preview \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  --uv PACKAGE_VERSION \
  -r 1 \
  --enable-es6 true \
  --proxy YOUR_PROXY \
  --qrcode-format image \
  --qrcode-output-dest '/tmp/x.jpg' \

# upload

miniprogram-ci \
  upload \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  --uv PACKAGE_VERSION \
  -r 1 \
  --enable-es6 true \

# pack-npm
miniprogram-ci \
  pack-npm \
  --pp ./YOUR_PROJECT/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \

# pack-npm-manually
miniprogram-ci \
pack-npm-manually \

--pack-npm-manually-package-json-path PACKAGE_JSON_PATH \

--pack-npm-manually-miniprogram-npm-dist-dir DISTPATH

# cloudbase upload cloudfunction
miniprogram-ci cloud functions upload \
  --pp ./YOUR_PROJECT/ \
  --appid YOUR_APPID \
  --pkp ./private.YOUR_APPID.key \
  --env YOUR_CLOUD_ENV_ID \
  --name YOUR_CLOUD_FUNCTION_NAME \
  --path ./YOUR_CLOUD_FUNCTION_FOLDER_PATH/ \
  --remote-npm-install true

# proxy
export HTTPS_PROXY = YOUR_PROXY_URL # 可以在shell脚本里声明临时proxy

miniprogram-ci \
  upload \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  --uv PACKAGE_VERSION \
  -r 1 \
  --enable-es6 true \
  --proxy YOUR_PROXY_URL # 也可以使用这个参数声明proxy

# get dev source map
  miniprogram-ci \
  get-dev-source-map \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  -r 1 \ # 获取具体哪个robot最近上传的版本的sourceMap

  --source-map-save-path ./sourcemap.zip #保存路径，推荐zip结尾，最后得到的是一个zip包
```

### 编译设置

| 键 | 类型 | 说明 |
| --- | --- | --- |
| es6 | boolean | 对应小程序开发者工具的 "es6 转 es5" |
| es7 | boolean | 对应小程序开发者工具的 "增强编译" |
| minifyJS | boolean | 压缩 JS 代码 |
| minifyWXML | boolean | 压缩 WXML 代码 |
| minifyWXSS | boolean | 压缩 WXSS 代码 |
| minify | boolean | 压缩所有代码，对应小程序开发者工具的 "压缩代码" |
| codeProtect | boolean | 对应小程序开发者工具的 "代码保护" |
| autoPrefixWXSS | boolean | 对应小程序开发者工具的 "样式自动补全" |

> 关于小程序开发者工具代码编译选项

## 第三方平台开发

`miniprogram-ci` 从 `1.0.28` 开始支持第三方平台开发的上传和预览，调用方式与普通开发模式无异。

使用第三方平台开发模式时，应注意：

- 请确保项目中存在正确的 `ext.json`

- 密钥文件是第三方平台绑定的开发小程序 `appid`的密钥文件

- ip白名单是第三方平台绑定的开发小程序 `appid`的 ip 白名单

- 调用传入的 `appid`是第三方平台绑定的开发小程序 `appid`关于第三方平台开发模式，请参考 [这里](https://developers.weixin.qq.com/miniprogram/dev/devtools/ext.html)

## 代码示例
```shell
npm install miniprogram-ci --save
```
```shell
npm install miniprogram-ci --save
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
const ci = require('miniprogram-ci')
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
const ci = require('miniprogram-ci')
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
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const uploadResult = await ci.upload({
    project,
    version: '1.1.1',

    desc: 'hello',
    setting: {
      es6: true,
    },
    onProgressUpdate: console.log,
  })
  console.log(uploadResult)
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const uploadResult = await ci.upload({
    project,
    version: '1.1.1',

    desc: 'hello',
    setting: {
      es6: true,
    },
    onProgressUpdate: console.log,
  })
  console.log(uploadResult)
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const previewResult = await ci.preview({
    project,
    desc: 'hello', // 此备注将显示在“小程序助手”开发版列表中
    setting: {
      es6: true,
    },
    qrcodeFormat: 'image',
    qrcodeOutputDest: '/path/to/qrcode/file/destination.jpg',
    onProgressUpdate: console.log,
    // pagePath: 'pages/index/index', // 预览页面
    // searchQuery: 'a=1&b=2',  // 预览参数 [注意!]这里的`&`字符在命令行中应写成转义字符`\&`
  })
  console.log(previewResult)
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const previewResult = await ci.preview({
    project,
    desc: 'hello', // 此备注将显示在“小程序助手”开发版列表中
    setting: {
      es6: true,
    },
    qrcodeFormat: 'image',
    qrcodeOutputDest: '/path/to/qrcode/file/destination.jpg',
    onProgressUpdate: console.log,
    // pagePath: 'pages/index/index', // 预览页面
    // searchQuery: 'a=1&b=2',  // 预览参数 [注意!]这里的`&`字符在命令行中应写成转义字符`\&`
  })
  console.log(previewResult)
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  // 在有需要的时候构建npm
  const warning = await ci.packNpm(project, {
    ignores: ['pack_npm_ignore_list'],
    reporter: (infos) => { console.log(infos) }
  })
  console.warn(warning)
  // 可对warning进行格式化
  /*
    warning.map((it, index) => {
            return `${index + 1}. ${it.msg}
    \t> code: ${it.code}
    \t@ ${it.jsPath}:${it.startLine}-${it.endLine}`
          }).join('---------------\n')
  */
  // 完成构建npm之后，可用ci.preview或者ci.upload
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  // 在有需要的时候构建npm
  const warning = await ci.packNpm(project, {
    ignores: ['pack_npm_ignore_list'],
    reporter: (infos) => { console.log(infos) }
  })
  console.warn(warning)
  // 可对warning进行格式化
  /*
    warning.map((it, index) => {
            return `${index + 1}. ${it.msg}
    \t> code: ${it.code}
    \t@ ${it.jsPath}:${it.startLine}-${it.endLine}`
          }).join('---------------\n')
  */
  // 完成构建npm之后，可用ci.preview或者ci.upload
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  await ci.getDevSourceMap({
    project,
    robot: 1,
    sourceMapSavePath: './sm.zip'
  })
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  await ci.getDevSourceMap({
    project,
    robot: 1,
    sourceMapSavePath: './sm.zip'
  })
})()
```
```text
├── lib # lib目录存放要被构建的 node_modules

│   ├── node_modules
│   │   └── is-object
│   └── package.json
└── miniprogram-project # 这里是小程序项目路径

    ├── miniprogram # 我们希望最终把 miniprogram_npm 构建在 miniprogram/ 目录之下

    │   ├── app.js
    │   ├── app.json
    │   ├── app.wxss
    │   ├── pages
    │   │   ├── index
    │   │   └── logs
    │   └── sitemap.json
    └── project.config.json
```
```text
├── lib # lib目录存放要被构建的 node_modules

│   ├── node_modules
│   │   └── is-object
│   └── package.json
└── miniprogram-project # 这里是小程序项目路径

    ├── miniprogram # 我们希望最终把 miniprogram_npm 构建在 miniprogram/ 目录之下

    │   ├── app.js
    │   ├── app.json
    │   ├── app.wxss
    │   ├── pages
    │   │   ├── index
    │   │   └── logs
    │   └── sitemap.json
    └── project.config.json
```
```javascript
let packResult = await ci.packNpmManually({
  packageJsonPath: './lib/package.json',
  miniprogramNpmDistDir: './miniprogram-project/miniprogram/',
})

console.log('pack done, packResult:', packResult)
// 输出 pack done, packResult: { miniProgramPackNum: 0, otherNpmPackNum: 1, warnList: [] }
```
```javascript
let packResult = await ci.packNpmManually({
  packageJsonPath: './lib/package.json',
  miniprogramNpmDistDir: './miniprogram-project/miniprogram/',
})

console.log('pack done, packResult:', packResult)
// 输出 pack done, packResult: { miniProgramPackNum: 0, otherNpmPackNum: 1, warnList: [] }
```
```text
.
├── lib
│   ├── node_modules
│   │   └── is-object
│   └── package.json
└── miniprogram-project
    ├── miniprogram
    │   ├── app.js
    │   ├── app.json
    │   ├── app.wxss
    │   ├── miniprogram_npm # &lt;--- 这就是构建出来的由 lib/node_modules 里 miniprogram_npm 了

    │   ├── pages
    │   └── sitemap.json
    └── project.config.json
```
```text
.
├── lib
│   ├── node_modules
│   │   └── is-object
│   └── package.json
└── miniprogram-project
    ├── miniprogram
    │   ├── app.js
    │   ├── app.json
    │   ├── app.wxss
    │   ├── miniprogram_npm # &lt;--- 这就是构建出来的由 lib/node_modules 里 miniprogram_npm 了

    │   ├── pages
    │   └── sitemap.json
    └── project.config.json
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })

  const result = await ci.cloud.uploadFunction({
    project,
    env: '云环境 ID',
    name: '云函数名称',
    path: '云函数代码目录',
    remoteNpmInstall: true, // 是否云端安装依赖
  })
  console.warn(result)
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })

  const result = await ci.cloud.uploadFunction({
    project,
    env: '云环境 ID',
    name: '云函数名称',
    path: '云函数代码目录',
    remoteNpmInstall: true, // 是否云端安装依赖
  })
  console.warn(result)
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  // 静态网站
  const resultStatic = await ci.cloud.uploadStaticStorage({
    project,
    env: '云环境 ID',
    path: '本地文件目录',
    remotePath: '要上传到的远端文件目录',
  })
  // 云存储
  const resultStorage = await ci.cloud.uploadStorage({
    project,
    env: '云环境 ID',
    path: '本地文件目录',
    remotePath: '要上传到的远端文件目录',
  })
  console.warn(resultStatic, resultStorage)
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  // 静态网站
  const resultStatic = await ci.cloud.uploadStaticStorage({
    project,
    env: '云环境 ID',
    path: '本地文件目录',
    remotePath: '要上传到的远端文件目录',
  })
  // 云存储
  const resultStorage = await ci.cloud.uploadStorage({
    project,
    env: '云环境 ID',
    path: '本地文件目录',
    remotePath: '要上传到的远端文件目录',
  })
  console.warn(resultStatic, resultStorage)
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const result = await ci.cloud.uploadContainer({
    project,
    env: '云环境 ID',
    version: {
      uploadType: 'package', // 上传方式
      flowRatio: 0, // 流量比例
      cpu: 0.25, // CPU 核心数

      mem: 0.5, // 内存大小

      minNum: 0, // 最小副本数
      maxNum: 1, // 最大副本数
      policyType: 'cpu', // 扩缩容条件
      policyThreshold: 60, // 扩缩容阈值
      containerPort: 80, // 容器监听端口
      serverName: 'server', // 服务名称
      versionRemark: 'ci', // 版本备注
      envParams: '{}', // 环境变量
      buildDir: '', // 构建目录
      dockerfilePath: '' // Dockerfile 路径
    },
    containerRoot: 'the/path/to/container' // 需要上传的版本文件目录
  })
  console.warn(result)
})()
```
```javascript
const ci = require('miniprogram-ci')
;(async () => {
  const project = new ci.Project({
    appid: 'wxsomeappid',
    type: 'miniProgram',
    projectPath: 'the/project/path',
    privateKeyPath: 'the/path/to/privatekey',
    ignores: ['node_modules/**/*'],
  })
  const result = await ci.cloud.uploadContainer({
    project,
    env: '云环境 ID',
    version: {
      uploadType: 'package', // 上传方式
      flowRatio: 0, // 流量比例
      cpu: 0.25, // CPU 核心数

      mem: 0.5, // 内存大小

      minNum: 0, // 最小副本数
      maxNum: 1, // 最大副本数
      policyType: 'cpu', // 扩缩容条件
      policyThreshold: 60, // 扩缩容阈值
      containerPort: 80, // 容器监听端口
      serverName: 'server', // 服务名称
      versionRemark: 'ci', // 版本备注
      envParams: '{}', // 环境变量
      buildDir: '', // 构建目录
      dockerfilePath: '' // Dockerfile 路径
    },
    containerRoot: 'the/path/to/container' // 需要上传的版本文件目录
  })
  console.warn(result)
})()
```
```javascript
const ci = require('miniprogram-ci')
ci.proxy('YOUR_PROXY_URL')
```
```javascript
const ci = require('miniprogram-ci')
ci.proxy('YOUR_PROXY_URL')
```
```shell
npm install -g miniprogram-ci
```
```shell
npm install -g miniprogram-ci
```
```shell
# help
miniprogram-ci --help

# preview
miniprogram-ci \
  preview \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  --uv PACKAGE_VERSION \
  -r 1 \
  --enable-es6 true \
  --proxy YOUR_PROXY \
  --qrcode-format image \
  --qrcode-output-dest '/tmp/x.jpg' \

# upload

miniprogram-ci \
  upload \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  --uv PACKAGE_VERSION \
  -r 1 \
  --enable-es6 true \

# pack-npm
miniprogram-ci \
  pack-npm \
  --pp ./YOUR_PROJECT/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \

# pack-npm-manually
miniprogram-ci \
pack-npm-manually \

--pack-npm-manually-package-json-path PACKAGE_JSON_PATH \

--pack-npm-manually-miniprogram-npm-dist-dir DISTPATH

# cloudbase upload cloudfunction
miniprogram-ci cloud functions upload \
  --pp ./YOUR_PROJECT/ \
  --appid YOUR_APPID \
  --pkp ./private.YOUR_APPID.key \
  --env YOUR_CLOUD_ENV_ID \
  --name YOUR_CLOUD_FUNCTION_NAME \
  --path ./YOUR_CLOUD_FUNCTION_FOLDER_PATH/ \
  --remote-npm-install true

# proxy
export HTTPS_PROXY = YOUR_PROXY_URL # 可以在shell脚本里声明临时proxy

miniprogram-ci \
  upload \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  --uv PACKAGE_VERSION \
  -r 1 \
  --enable-es6 true \
  --proxy YOUR_PROXY_URL # 也可以使用这个参数声明proxy

# get dev source map
  miniprogram-ci \
  get-dev-source-map \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  -r 1 \ # 获取具体哪个robot最近上传的版本的sourceMap

  --source-map-save-path ./sourcemap.zip #保存路径，推荐zip结尾，最后得到的是一个zip包
```
```shell
# help
miniprogram-ci --help

# preview
miniprogram-ci \
  preview \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  --uv PACKAGE_VERSION \
  -r 1 \
  --enable-es6 true \
  --proxy YOUR_PROXY \
  --qrcode-format image \
  --qrcode-output-dest '/tmp/x.jpg' \

# upload

miniprogram-ci \
  upload \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  --uv PACKAGE_VERSION \
  -r 1 \
  --enable-es6 true \

# pack-npm
miniprogram-ci \
  pack-npm \
  --pp ./YOUR_PROJECT/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \

# pack-npm-manually
miniprogram-ci \
pack-npm-manually \

--pack-npm-manually-package-json-path PACKAGE_JSON_PATH \

--pack-npm-manually-miniprogram-npm-dist-dir DISTPATH

# cloudbase upload cloudfunction
miniprogram-ci cloud functions upload \
  --pp ./YOUR_PROJECT/ \
  --appid YOUR_APPID \
  --pkp ./private.YOUR_APPID.key \
  --env YOUR_CLOUD_ENV_ID \
  --name YOUR_CLOUD_FUNCTION_NAME \
  --path ./YOUR_CLOUD_FUNCTION_FOLDER_PATH/ \
  --remote-npm-install true

# proxy
export HTTPS_PROXY = YOUR_PROXY_URL # 可以在shell脚本里声明临时proxy

miniprogram-ci \
  upload \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  --uv PACKAGE_VERSION \
  -r 1 \
  --enable-es6 true \
  --proxy YOUR_PROXY_URL # 也可以使用这个参数声明proxy

# get dev source map
  miniprogram-ci \
  get-dev-source-map \
  --pp ./demo-proj/ \
  --pkp ./private.YOUR_APPID.key \
  --appid YOUR_APPID \
  -r 1 \ # 获取具体哪个robot最近上传的版本的sourceMap

  --source-map-save-path ./sourcemap.zip #保存路径，推荐zip结尾，最后得到的是一个zip包
```
