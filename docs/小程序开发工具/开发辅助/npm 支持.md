# npm 支持

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/npm.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 开发辅助 /npm 支持 /

---

# npm 支持

从小程序基础库版本 [2.2.1](../framework/compatibility.html) 或以上、及[开发者工具](./download.html) 1.02.1808300 或以上开始，小程序支持使用 npm 安装第三方包。

此文档要求开发者们对 npm 有一定的了解，因此不会再去介绍 npm 的基本功能。如若之前未接触过 npm，请翻阅 [官方 npm 文档](https://docs.npmjs.com/getting-started/what-is-npm) 进行学习。

> tips：在小程序中使用npm包前，需先构建 npm

## 使用 npm 包

### 1. 安装 npm 包

在小程序 package.json 所在的目录中执行命令安装 npm 包：
```text
npm install
```
此处要求参与构建 npm 的 package.json 需要在 project.config.json 定义的 miniprogramRoot 之内。

> tips：开发者工具  v1.02.1811150 版本开始，调整为根据 package.json 的 dependencies 字段构建，所以声明在 devDependencies 里的包也可以在开发过程中被安装使用而不会参与到构建中。如果是这之前的版本，则建议使用--production选项，可以减少安装一些业务无关的 npm 包，从而减少整个小程序包的大小。

> tips: miniprogramRoot 字段不存在时，miniprogramRoot 就是 project.config.json 所在的目录

### 2. 构建 npm

点击开发者工具中的菜单栏：工具 --> 构建 npm

> 为何要有此步骤?

### 3. 构建完成后即可使用 npm 包。

js 中引入 npm 包：
```js
const myPackage = require('packageName')
const packageOther = require('packageName/other')
```
使用 npm 包中的自定义组件：
```json
{
  "usingComponents": {
    "myPackage": "packageName",
    "package-other": "packageName/other"
  }
}
```
> tips：此处使用 npm 包时如果只引入包名，则默认寻找包名下的 index.js 文件或者 index 组件。

## 发布 npm 包

### 发布小程序 npm 包的约束

这里要发布的 npm 包是特指专为小程序定制的 npm 包（下称小程序 npm 包）。因为小程序自定义组件的特殊性，原有的 npm 包机制无法满足我们的需求，所以这里需要对小程序 npm 包做一些约束：

1. 小程序 npm 包要求根目录下必须有构建文件生成目录（默认为 miniprogram_dist 目录），此目录可以通过在 package.json 文件中新增一个 miniprogram 字段来指定，比如：
```json
{
  "name": "miniprogram-custom-component",
  "version": "1.0.0",

  "description": "",
  "miniprogram": "dist",
  "devDependencies": {},
  "dependencies": {}
}
```

1. 小程序 npm 包里只有构建文件生成目录会被算入小程序包的占用空间，上传小程序代码时也只会上传该目录的代码。如果小程序 npm 包有一些测试、构建相关的代码请放到构建文件生成目录外。另外也可以使用 `.npmignore`文件来避免将一些非业务代码文件发布到 npm 中。

2. 测试、构建相关的依赖请放入 devDependencies 字段中避免被一起打包到小程序包中。

### 发布其他 npm 包的约束

如果是已经发布过的一些 npm 包，因为一些原因无法改造成小程序 npm 包的结构的话，也可以通过微调后被使用，但是请确保遵循以下几点：

1. 只支持纯 js 包，不支持自定义组件。

2. 必须有入口文件，即需要保证 package.json 中的 main 字段是指向一个正确的入口，如果 package.json 中没有 main 字段，则以 npm 包根目录下的 index.js 作为入口文件。

3. 测试、构建相关的依赖请放入 devDependencies 字段中避免被一起打包到小程序包中，这一点和小程序 npm 包的要求相同。

4. 不支持依赖 c++ addon，不支持依赖 nodejs 的内置库：
```js
const addon = require('./addon.node'); // 不支持！
const http = require('http'); // 不支持！
```
> tips：对于一些纯 js 实现的 nodejs 内置库（如 path 模块），可以通过额外安装其他开发者实现的 npm 包来支持。

1. 使用 require 依赖的时候下列几种方式也是不允许的：
```js
// 不允许将 require 赋值给其他变量后再使用，以下代码不会去解析出具体依赖
let r;
r = require;
r('testa');

let r2 = require;
r2('testa');

// 不允许 require 一个变量，以下代码依赖运行时，无法解析出具体依赖
let m = 'testa';
require(m);
```

1. 小程序环境比较特殊，一些全局变量（如 window 对象）和构造器（如 Function 构造器）是无法使用的。

### 发布流程

发布 npm 包的流程简述如下：

1. 如果还没有 npm 账号，可以到 [npm 官网](https://www.npmjs.com/)注册一个 npm 账号。

2. 在本地登录 npm 账号，在本地执行：
```text
npm adduser
```
或者
```text
npm login
```

1. 在已完成编写的 npm 包根目录下执行：
```text
npm publish
```
到此，npm 包就成功发布到 npm 平台了。

> tips：一些开发者在开发过程中可能修改过 npm 的源，所以当进行登录或发布时需要注意要将源切回 npm 的源。

## 原理介绍

为了帮助大家更好的理解发布 npm 包中提到的各种要求，这里简单介绍一下原理：

1. 首先 node_modules 目录不会参与编译、上传和打包中，所以小程序想要使用 npm 包必须走一遍“构建 npm”的过程，在每一份 miniprogramRoot 内开发者声明的 package.json 的最外层的 node_modules 的同级目录下会生成一个 miniprogram_npm 目录，里面会存放构建打包后的 npm 包，也就是小程序真正使用的 npm 包。

2. 构建打包分为两种：小程序 npm 包会直接拷贝构建文件生成目录下的所有文件到 miniprogram_npm 中；其他 npm 包则会从入口 js 文件开始走一遍依赖分析和打包过程（类似 webpack）。

3. 寻找 npm 包的过程和 npm 的实现类似，从依赖 npm 包的文件所在目录开始逐层往外找，直到找到可用的 npm 包或是小程序根目录为止。

下面简单介绍下构建打包前后的目录情况，构建之前的结构：
```text
|--node_modules
|    |--testComp // 小程序 npm 包
|    |    |--package.json
|    |    |--src
|    |    |--miniprogram_dist
|    |         |-index.js
|    |         |-index.json
|    |         |-index.wxss
|    |         |-index.wxml
|    |--testa // 其他 npm 包
|         |--package.json
|         |--lib
|         |    |--entry.js
|         |--node_modules
|              |--testb
|                   |--package.json
|                   |--main.js
|--pages
|--app.js
|--app.wxss
|--app.json
|--project.config.js
```
构建之后的结构：
```text
|--node_modules
|--miniprogram_npm
|    |--testComp // 小程序 npm 包
|    |    |-index.js
|    |    |-index.json
|    |    |-index.wxss
|    |    |-index.wxml
|    |--testa // 其他 npm 包
|         |--index.js // 打包后的文件
|         |--miniprogram_npm
|              |--testb
|                   |--index.js // 打包后的文件
|                   |--index.js.map
|--pages
|--app.js
|--app.wxss
|--app.json
|--project.config.js
```
> tips：打包生成的代码在同级目录下会生成 source map 文件，方便进行逆向调试。

## js 模块示例

以下为官方提供的 js 模块，可以参考并使用：

- [sm-crypto](https://github.com/wechat-miniprogram/sm-crypto)

## 自定义组件相关示例

请查阅[开发第三方自定义组件](../framework/custom-component/trdparty.html)文档。

## Tips

从 1.03.2006302 (或 1.03.2006302) 开始，我们提供了两种构建 npm 的方式：

### 默认的构建 npm 方式

默认情况下，在 miniprogramRoot 内正确配置了 package.json 并执行 `npm install` 之后，其构建 npm 的结果是，为每一个 package.json 对应的 node_modules 构建一份 miniprogram_npm，并放置在对应 package.json 所在目录的子目录中。参考 [demo](https://developers.weixin.qq.com/s/BnRGwumq7riq)

#### 构建 npm 前
```text
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   │   ├── 略
│   ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内
│   ├── package.json
│   └── sub_package
│       ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内
│       ├── package.json
│       └── sub_package_page
├── node_modules // 不被默认方式构建 npm，因为它不在 miniprogramRoot 内
├── package.json
└── project.config.json // 其中存在配置 `"miniprogramRoot": "./miniprogram"`
```

#### 构建 npm 后
```text
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   │   ├── 略
│   ├── miniprogram_npm
│   ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内 --> 同级的 miniprogram_npm 是这份 node_modules 的构建结果
│   ├── package.json
│   └── sub_package
│       ├── miniprogram_npm
│       ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内 --> 同级的 miniprogram_npm 是这份 node_modules 的构建结果
│       ├── package.json
│       └── sub_package_page
├── node_modules // 不被默认方式构建 npm，因为它不在 miniprogramRoot 内 --> 它并没有对应的 miniprogram_npm 生成
├── package.json
└── project.config.json // 其中存在配置 `"miniprogramRoot": "./miniprogram"`
```

### 自定义 node_modules 和 miniprogram_npm 位置的构建 npm 方式

与 “默认的构建 npm 方式” 不一样，此种方式需要开发者在 project.config.json 中指定 node_modules 的位置 和目标 miniprogram_npm 的位置。参考[demo](https://developers.weixin.qq.com/s/bRSGiumy7ti2)

#### 使用方法

- 配置 project.config.json 的 `setting.packNpmManually`为 `true`，开启自定义 node_modules 和 miniprogram_npm 位置的构建 npm 方式

- 配置 project.config.json 的 `setting.packNpmRelationList`项，指定 `packageJsonPath`和 `miniprogramNpmDistDir`的位置

其中 `packNpmRelationList` 的格式为
```text
packNpmRelationList: Array<{
  "packageJsonPath": string,
  "miniprogramNpmDistDir": string
}>
```

- packageJsonPath 表示 node_modules 源对应的 package.json

- miniprogramNpmDistDir 表示 node_modules 的构建结果目标位置

#### 构建 npm 前
```text
.
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   ├── sitemap.json
│   └── sub_package
│       └── sub_package_page
├── project.config.json
├── src_node_modules_1
│   ├── node_modules
│   └── package.json
└── src_node_modules_2
    ├── node_modules
    └── package.json
```
其中 project.config.json 存在配置
```text
"setting": {
  "packNpmManually": true,
  "packNpmRelationList": [
    {
      "packageJsonPath": "./src_node_modules_1/package.json",
      "miniprogramNpmDistDir": "./miniprogram/"
    },
    {
      "packageJsonPath": "./src_node_modules_2/package.json",
      "miniprogramNpmDistDir": "./miniprogram/sub_package"
    }
  ]
}
```

#### 构建 npm 后
```text
.
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   ├── miniprogram_npm // 由 src_node_modules_1/node_modules 构建得到
│   ├── sitemap.json
│   └── sub_package
│       ├── miniprogram_npm // 由 src_node_modules_2/node_modules 构建得到
│       └── sub_package_page
├── project.config.json
├── src_node_modules_1
│   ├── node_modules
│   └── package.json
└── src_node_modules_2
    ├── node_modules
    └── package.json
```

### miniprogram_npm 组件寻址顺序

页面配置文件（如：pages/index/index.json）中使用 `usingComponents`
```json
{
  "usingComponents": {
    "a": "a"
  }
}
```
其寻址顺序为
```js
[
  // 先寻址相对路径
  "pages/index/a",
  "pages/index/a/index",
  // 再尝试寻址 miniprogram_npm 下的组件
  "pages/index/miniprogram_npm/a",
  "pages/index/miniprogram_npm/a/index",
  // 再尝试其父层级中的 miniprogram_npm 目录
  "pages/miniprogram_npm/a",
  "pages/miniprogram_npm/a/index",
  "miniprogram_npm/a",
  "miniprogram_npm/a/index"
]
```
tips

> 1.06.2307172 之前的工具寻址顺序会优先寻找 a/index，再寻找 a/a，最后才轮到 a，这不太符合认知。建议对于组件是 a/index 和 a/a 的这种情况，或者同时存在 a 和 a/index 的情况，usingComponents 需要直接显示的写明 "a/index" 和 "a/a"，而不是只写 "a"。

## 代码示例
```text
npm install
```
```text
npm install
```
```js
const myPackage = require('packageName')
const packageOther = require('packageName/other')
```
```js
const myPackage = require('packageName')
const packageOther = require('packageName/other')
```
```json
{
  "usingComponents": {
    "myPackage": "packageName",
    "package-other": "packageName/other"
  }
}
```
```json
{
  "usingComponents": {
    "myPackage": "packageName",
    "package-other": "packageName/other"
  }
}
```
```json
{
  "name": "miniprogram-custom-component",
  "version": "1.0.0",

  "description": "",
  "miniprogram": "dist",
  "devDependencies": {},
  "dependencies": {}
}
```
```json
{
  "name": "miniprogram-custom-component",
  "version": "1.0.0",

  "description": "",
  "miniprogram": "dist",
  "devDependencies": {},
  "dependencies": {}
}
```
```js
const addon = require('./addon.node'); // 不支持！
const http = require('http'); // 不支持！
```
```js
const addon = require('./addon.node'); // 不支持！
const http = require('http'); // 不支持！
```
```js
// 不允许将 require 赋值给其他变量后再使用，以下代码不会去解析出具体依赖
let r;
r = require;
r('testa');

let r2 = require;
r2('testa');

// 不允许 require 一个变量，以下代码依赖运行时，无法解析出具体依赖
let m = 'testa';
require(m);
```
```js
// 不允许将 require 赋值给其他变量后再使用，以下代码不会去解析出具体依赖
let r;
r = require;
r('testa');

let r2 = require;
r2('testa');

// 不允许 require 一个变量，以下代码依赖运行时，无法解析出具体依赖
let m = 'testa';
require(m);
```
```text
npm adduser
```
```text
npm adduser
```
```text
npm login
```
```text
npm login
```
```text
npm publish
```
```text
npm publish
```
```text
|--node_modules
|    |--testComp // 小程序 npm 包
|    |    |--package.json
|    |    |--src
|    |    |--miniprogram_dist
|    |         |-index.js
|    |         |-index.json
|    |         |-index.wxss
|    |         |-index.wxml
|    |--testa // 其他 npm 包
|         |--package.json
|         |--lib
|         |    |--entry.js
|         |--node_modules
|              |--testb
|                   |--package.json
|                   |--main.js
|--pages
|--app.js
|--app.wxss
|--app.json
|--project.config.js
```
```text
|--node_modules
|    |--testComp // 小程序 npm 包
|    |    |--package.json
|    |    |--src
|    |    |--miniprogram_dist
|    |         |-index.js
|    |         |-index.json
|    |         |-index.wxss
|    |         |-index.wxml
|    |--testa // 其他 npm 包
|         |--package.json
|         |--lib
|         |    |--entry.js
|         |--node_modules
|              |--testb
|                   |--package.json
|                   |--main.js
|--pages
|--app.js
|--app.wxss
|--app.json
|--project.config.js
```
```text
|--node_modules
|--miniprogram_npm
|    |--testComp // 小程序 npm 包
|    |    |-index.js
|    |    |-index.json
|    |    |-index.wxss
|    |    |-index.wxml
|    |--testa // 其他 npm 包
|         |--index.js // 打包后的文件
|         |--miniprogram_npm
|              |--testb
|                   |--index.js // 打包后的文件
|                   |--index.js.map
|--pages
|--app.js
|--app.wxss
|--app.json
|--project.config.js
```
```text
|--node_modules
|--miniprogram_npm
|    |--testComp // 小程序 npm 包
|    |    |-index.js
|    |    |-index.json
|    |    |-index.wxss
|    |    |-index.wxml
|    |--testa // 其他 npm 包
|         |--index.js // 打包后的文件
|         |--miniprogram_npm
|              |--testb
|                   |--index.js // 打包后的文件
|                   |--index.js.map
|--pages
|--app.js
|--app.wxss
|--app.json
|--project.config.js
```
```text
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   │   ├── 略
│   ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内
│   ├── package.json
│   └── sub_package
│       ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内
│       ├── package.json
│       └── sub_package_page
├── node_modules // 不被默认方式构建 npm，因为它不在 miniprogramRoot 内
├── package.json
└── project.config.json // 其中存在配置 `"miniprogramRoot": "./miniprogram"`
```
```text
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   │   ├── 略
│   ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内
│   ├── package.json
│   └── sub_package
│       ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内
│       ├── package.json
│       └── sub_package_page
├── node_modules // 不被默认方式构建 npm，因为它不在 miniprogramRoot 内
├── package.json
└── project.config.json // 其中存在配置 `"miniprogramRoot": "./miniprogram"`
```
```text
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   │   ├── 略
│   ├── miniprogram_npm
│   ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内 --> 同级的 miniprogram_npm 是这份 node_modules 的构建结果
│   ├── package.json
│   └── sub_package
│       ├── miniprogram_npm
│       ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内 --> 同级的 miniprogram_npm 是这份 node_modules 的构建结果
│       ├── package.json
│       └── sub_package_page
├── node_modules // 不被默认方式构建 npm，因为它不在 miniprogramRoot 内 --> 它并没有对应的 miniprogram_npm 生成
├── package.json
└── project.config.json // 其中存在配置 `"miniprogramRoot": "./miniprogram"`
```
```text
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   │   ├── 略
│   ├── miniprogram_npm
│   ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内 --> 同级的 miniprogram_npm 是这份 node_modules 的构建结果
│   ├── package.json
│   └── sub_package
│       ├── miniprogram_npm
│       ├── node_modules // 可被默认方式构建 npm，因为它在 miniprogramRoot 内 --> 同级的 miniprogram_npm 是这份 node_modules 的构建结果
│       ├── package.json
│       └── sub_package_page
├── node_modules // 不被默认方式构建 npm，因为它不在 miniprogramRoot 内 --> 它并没有对应的 miniprogram_npm 生成
├── package.json
└── project.config.json // 其中存在配置 `"miniprogramRoot": "./miniprogram"`
```
```text
packNpmRelationList: Array<{
  "packageJsonPath": string,
  "miniprogramNpmDistDir": string
}>
```
```text
packNpmRelationList: Array<{
  "packageJsonPath": string,
  "miniprogramNpmDistDir": string
}>
```
```text
.
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   ├── sitemap.json
│   └── sub_package
│       └── sub_package_page
├── project.config.json
├── src_node_modules_1
│   ├── node_modules
│   └── package.json
└── src_node_modules_2
    ├── node_modules
    └── package.json
```
```text
.
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   ├── sitemap.json
│   └── sub_package
│       └── sub_package_page
├── project.config.json
├── src_node_modules_1
│   ├── node_modules
│   └── package.json
└── src_node_modules_2
    ├── node_modules
    └── package.json
```
```text
"setting": {
  "packNpmManually": true,
  "packNpmRelationList": [
    {
      "packageJsonPath": "./src_node_modules_1/package.json",
      "miniprogramNpmDistDir": "./miniprogram/"
    },
    {
      "packageJsonPath": "./src_node_modules_2/package.json",
      "miniprogramNpmDistDir": "./miniprogram/sub_package"
    }
  ]
}
```
```text
"setting": {
  "packNpmManually": true,
  "packNpmRelationList": [
    {
      "packageJsonPath": "./src_node_modules_1/package.json",
      "miniprogramNpmDistDir": "./miniprogram/"
    },
    {
      "packageJsonPath": "./src_node_modules_2/package.json",
      "miniprogramNpmDistDir": "./miniprogram/sub_package"
    }
  ]
}
```
```text
.
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   ├── miniprogram_npm // 由 src_node_modules_1/node_modules 构建得到
│   ├── sitemap.json
│   └── sub_package
│       ├── miniprogram_npm // 由 src_node_modules_2/node_modules 构建得到
│       └── sub_package_page
├── project.config.json
├── src_node_modules_1
│   ├── node_modules
│   └── package.json
└── src_node_modules_2
    ├── node_modules
    └── package.json
```
```text
.
├── miniprogram
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── index
│   ├── miniprogram_npm // 由 src_node_modules_1/node_modules 构建得到
│   ├── sitemap.json
│   └── sub_package
│       ├── miniprogram_npm // 由 src_node_modules_2/node_modules 构建得到
│       └── sub_package_page
├── project.config.json
├── src_node_modules_1
│   ├── node_modules
│   └── package.json
└── src_node_modules_2
    ├── node_modules
    └── package.json
```
```json
{
  "usingComponents": {
    "a": "a"
  }
}
```
```json
{
  "usingComponents": {
    "a": "a"
  }
}
```
```js
[
  // 先寻址相对路径
  "pages/index/a",
  "pages/index/a/index",
  // 再尝试寻址 miniprogram_npm 下的组件
  "pages/index/miniprogram_npm/a",
  "pages/index/miniprogram_npm/a/index",
  // 再尝试其父层级中的 miniprogram_npm 目录
  "pages/miniprogram_npm/a",
  "pages/miniprogram_npm/a/index",
  "miniprogram_npm/a",
  "miniprogram_npm/a/index"
]
```
```js
[
  // 先寻址相对路径
  "pages/index/a",
  "pages/index/a/index",
  // 再尝试寻址 miniprogram_npm 下的组件
  "pages/index/miniprogram_npm/a",
  "pages/index/miniprogram_npm/a/index",
  // 再尝试其父层级中的 miniprogram_npm 目录
  "pages/miniprogram_npm/a",
  "pages/miniprogram_npm/a/index",
  "miniprogram_npm/a",
  "miniprogram_npm/a/index"
]
```
