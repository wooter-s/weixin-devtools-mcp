# 原生支持 TypeScript

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/compilets.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 开发辅助 /原生支持 TypeScript /

---

# 原生支持 TypeScript

小程序代码包要求代码文件为 wxml / wxss / js / json / wxs。

如果我们希望使用 TypeScript 或 less 去开发小程序，就需要将 ts 文件或 less 文件编译成对应的 js 文件 或 wxss 文件，这个编译过程以前是需要开发者在工具外自行配置。

从[开发者工具](./download.html) 1.05.2109101 以上开始，我们优化工具内置的编译模块，支持以编译插件的形式，扩展编译功能。

使用这种方式有两个好处：

1. 项目内只需要创建 ts 文件即可，无需再生成同名的 js 文件。less 文件同理。

2. 编译流程由开发者工具控制，按需编译，开发体验更好。

## 开始使用

### 旧项目

在 project.config.json 文件中，修改 setting 下的 useCompilerPlugins 字段为 ["typescript"]，即可开启工具内置的 typescript 编译插件。
如需同时开启 less 编译插件，可将该字段修改为 ["typescript", "less"]。
目前支持三个编译插件：typescript、less、sass

### 新建项目

可在创建小程序项目时，选择对应的语言模板。
目前支持的语言模板有

- TypeScript

- TypeScript + Less

- TypeScript + Sass

### TS声明文件更新

从 [开发者工具](./download.html) 1.05.2203032 以上开始，如果是从上述的模板创建的TS项目，遇到小程序相关类型声明过时的情况，可以手动更新。

具体步骤是在编辑器目录树上，找到 `typings/types/wx` 目录，右键，点击「更新声明文件」即可：

## 功能说明

- 目前的 ts 代码转换成 js 代码的逻辑，是由 @babel/plugin-transform-typescript 插件进行处理的，因此在编译过程中，仅仅是移除了ts代码中类型声明等信息。类型错误这类信息，在编译过程是没有提示的，只在编辑器中给予提示的。

- 启用 typescript 编译插件后，js 文件也是支持的，如果存在同名的 ts 和 js 文件，则优先使用 ts 文件。

- 除了普通小程序，小程序插件开发也是支持的。

- miniprogram-ci 从 1.6.1 版本开始，也支持此功能。

### less 使用全局变量

从[开发者工具](./download.html) 1.06.2403132 以上开始，支持 less 直接引用 `app.less` 中声明的变量和方法，编译器会默认为所有的非 `app.less` 文件增加引用
```less
@import (optional, reference) '/app.less';
```

#### 代码示例：
```less
// app.less
@redcolor: red;

.blue {
  color: blue;
}
```
```less
// 页面.less
.red {
  color: @redcolor; // 直接使用 app.less 中定义的变量
}
```
[在开发者工具中预览效果](https://developers.weixin.qq.com/s/YwGNAjml7aPQ)

### sass 使用全局变量

从[开发者工具](./download.html) 1.06.2403132 以上开始，支持 sass 直接引用全局变量和方法，和 less 不同，我们需要新增一个 `global.scss` 文件放置在 `app.scss` 同级，将公共的变量和方法写在 `global.scss` 中，编译器会默认为所有的非 `global.scss` 文件增加引用。
```scss
@use '/global.scss';
```

#### 代码示例：
```scss
// global.scss
$red: red;
```
```scss
// 其他.scss
.red {
  color: global.$red; // 使用 global 中的变量
}
```
[在开发者工具中预览效果](https://developers.weixin.qq.com/s/MtHyJjmE7mPn)

> 注意：尽量不要在 global.scss 写非变量定义和方法定义，否则可能增大代码体积。

## 代码示例
```less
@import (optional, reference) '/app.less';
```
```less
@import (optional, reference) '/app.less';
```
```less
// app.less
@redcolor: red;

.blue {
  color: blue;
}
```
```less
// app.less
@redcolor: red;

.blue {
  color: blue;
}
```
```less
// 页面.less
.red {
  color: @redcolor; // 直接使用 app.less 中定义的变量
}
```
```less
// 页面.less
.red {
  color: @redcolor; // 直接使用 app.less 中定义的变量
}
```
```scss
@use '/global.scss';
```
```scss
@use '/global.scss';
```
```scss
// global.scss
$red: red;
```
```scss
// global.scss
$red: red;
```
```scss
// 其他.scss
.red {
  color: global.$red; // 使用 global 中的变量
}
```
```scss
// 其他.scss
.red {
  color: global.$red; // 使用 global 中的变量
}
```
