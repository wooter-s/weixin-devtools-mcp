# 代码编辑

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/edit.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 代码编辑

(function () {
  'use strict';

  const SCRIPT_URLs = [
      'https://dldir1.qq.com/WechatWebDev/devPlatform/px.min.js',

      'https://dev.weixin.qq.com/platform-console/proxy/assets/tel/px.min.js',
  ];
  const param = {
      maskMode: 'no-mask', // 隐私策略, all-mask 或 no-mask, 详见：https://dev.weixin.qq.com/docs/analysis/sdk/docs.html
      recordCanvas: false,  // 若要采集canvas, 设为true
      projectId: 'wxef34f91ddab0c534-0HLdQNKAk-dzsFsA', // 项目 ID，需替换为体验分析项目 ID
      iframe: false, // 是否采集 iframe 页面
      console: true, // 是否采集 console 输出的错误日志
      network: true, // 是否采集网络错误
  };
  function loadScript(url) {
      return new Promise((resolve, reject) => {
          const scriptEle = document.createElement('script');
          scriptEle.type = 'text/javascript';
          scriptEle.async = true;
          scriptEle.src = url;
          scriptEle.onload = () => {
              resolve(url);
          };
          scriptEle.onerror = () => {
              reject(new Error('Script load error'));
          };
          document.head.appendChild(scriptEle);
      });
  }
  async function main() {
      try {
          sessionStorage.setItem('wxobs_start_timestamp', String(Date.now()));
          const fastestUrl = await Promise.race(SCRIPT_URLs.map(url => loadScript(url)));
          window.__startPX && window.__startPX(param);
      }
      catch (error) {
          console.error('Error loading scripts:', error);
      }
  }
  main();

})();

  ._toastItem.svelte-95rq8t{width:var(--toastWidth, 16rem);height:var(--toastHeight, auto);min-height:var(--toastMinHeight, 3.5rem);margin:var(--toastMargin, 0 0 .5rem 0);padding:var(--toastPadding, 0);background:var(--toastBackground, rgba(66, 66, 66, .9));color:var(--toastColor, #fff);box-shadow:var( --toastBoxShadow, 0 4px 6px -1px rgba(0, 0, 0, .1), 0 2px 4px -1px rgba(0, 0, 0, .06) );border:var(--toastBorder, none);border-radius:var(--toastBorderRadius, .125rem);position:relative;display:flex;flex-direction:row;align-items:center;overflow:hidden;will-change:transform,opacity;-webkit-tap-highlight-color:transparent}._toastMsg.svelte-95rq8t{padding:var(--toastMsgPadding, .75rem .5rem);flex:1 1 0%}.pe.svelte-95rq8t,._toastMsg.svelte-95rq8t a{pointer-events:auto}._toastBtn.svelte-95rq8t{width:var(--toastBtnWidth, 2rem);height:var(--toastBtnHeight, 100%);cursor:pointer;outline:none}._toastBtn.svelte-95rq8t:after{content:var(--toastBtnContent, "\2715");font:var(--toastBtnFont, 1rem sans-serif);display:flex;align-items:center;justify-content:center}._toastBar.svelte-95rq8t{top:var(--toastBarTop, auto);right:var(--toastBarRight, auto);bottom:var(--toastBarBottom, 0);left:var(--toastBarLeft, 0);height:var(--toastBarHeight, 6px);width:var(--toastBarWidth, 100%);position:absolute;display:block;-webkit-appearance:none;-moz-appearance:none;appearance:none;border:none;background:transparent;pointer-events:none}._toastBar.svelte-95rq8t::-webkit-progress-bar{background:transparent}._toastBar.svelte-95rq8t::-webkit-progress-value{background:var(--toastProgressBackground, var(--toastBarBackground, rgba(33, 150, 243, .75)))}._toastBar.svelte-95rq8t::-moz-progress-bar{background:var(--toastProgressBackground, var(--toastBarBackground, rgba(33, 150, 243, .75)))}._toastContainer.svelte-1u812xz{top:var(--toastContainerTop, 1.5rem);right:var(--toastContainerRight, 2rem);bottom:var(--toastContainerBottom, auto);left:var(--toastContainerLeft, auto);position:fixed;margin:0;padding:0;list-style-type:none;pointer-events:none;z-index:var(--toastContainerZIndex, 9999)}.evdtw-fixed{position:fixed}.evdtw-absolute{position:absolute}.evdtw-relative{position:relative}.evdtw-right-0{right:0}.evdtw-right-2{right:.5rem}.evdtw-top-1{top:.25rem}.evdtw-top-32{top:8rem}.evdtw-m-0{margin:0}.evdtw-mx-auto{margin-left:auto;margin-right:auto}.evdtw-my-0{margin-top:0;margin-bottom:0}.evdtw-mb-1{margin-bottom:.25rem}.evdtw-ml-1{margin-left:.25rem}.evdtw-ml-2{margin-left:.5rem}.evdtw-ml-4{margin-left:1rem}.evdtw-mr-0{margin-right:0}.evdtw-mr-0\.5{margin-right:.125rem}.evdtw-mr-1{margin-right:.25rem}.evdtw-mr-2{margin-right:.5rem}.evdtw-mt-0{margin-top:0}.evdtw-mt-1{margin-top:.25rem}.evdtw-mt-2{margin-top:.5rem}.evdtw-mt-3{margin-top:.75rem}.evdtw-mt-4{margin-top:1rem}.evdtw-inline-block{display:inline-block}.evdtw-flex{display:flex}.evdtw-cursor-pointer{cursor:pointer}.evdtw-select-none{-webkit-user-select:none;-moz-user-select:none;user-select:none}.evdtw-items-center{align-items:center}.evdtw-justify-center{justify-content:center}.evdtw-overflow-auto{overflow:auto}.evdtw-overflow-x-auto{overflow-x:auto}.evdtw-whitespace-nowrap{white-space:nowrap}.evdtw-rounded{border-radius:.25rem}.evdtw-rounded-bl-lg{border-bottom-left-radius:.5rem}.evdtw-rounded-br-lg{border-bottom-right-radius:.5rem}.evdtw-rounded-tl-lg{border-top-left-radius:.5rem}.evdtw-border-r-0{border-right-width:0px}.evdtw-border-t-0{border-top-width:0px}.evdtw-border-solid{border-style:solid}.evdtw-border-gray-200{--tw-border-opacity: 1;border-color:rgb(229 231 235 / var(--tw-border-opacity))}.evdtw-bg-green-500{--tw-bg-opacity: 1;background-color:rgb(34 197 94 / var(--tw-bg-opacity))}.evdtw-bg-red-500{--tw-bg-opacity: 1;background-color:rgb(239 68 68 / var(--tw-bg-opacity))}.evdtw-p-0{padding:0}.evdtw-p-0\.5{padding:.125rem}.evdtw-p-4{padding:1rem}.evdtw-px-4{padding-left:1rem;padding-right:1rem}.evdtw-py-3{padding-top:.75rem;padding-bottom:.75rem}.evdtw-text-sm{font-size:.875rem;line-height:1.25rem}.evdtw-font-semibold{font-weight:600}.evdtw-text-gray-500{--tw-text-opacity: 1;color:rgb(107 114 128 / var(--tw-text-opacity))}.evdtw-text-gray-600{--tw-text-opacity: 1;color:rgb(75 85 99 / var(--tw-text-opacity))}.evdtw-text-green-500{--tw-text-opacity: 1;color:rgb(34 197 94 / var(--tw-text-opacity))}.evdtw-text-red-500{--tw-text-opacity: 1;color:rgb(239 68 68 / var(--tw-text-opacity))}.evdtw-shadow-xl{--tw-shadow: 0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1);--tw-shadow-colored: 0 20px 25px -5px var(--tw-shadow-color), 0 8px 10px -6px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000),var(--tw-ring-shadow, 0 0 #0000),var(--tw-shadow)}.wxdonutuo-evd button{display:inline-flex;-webkit-user-select:none;-moz-user-select:none;user-select:none;align-items:center;border-radius:.25rem;border-style:none;--tw-bg-opacity: 1;background-color:rgb(229 231 235 / var(--tw-bg-opacity));padding:.5rem 1rem;font-weight:700;--tw-text-opacity: 1;color:rgb(31 41 55 / var(--tw-text-opacity))}.wxdonutuo-evd button:hover{cursor:pointer;--tw-bg-opacity: 1;background-color:rgb(209 213 219 / var(--tw-bg-opacity))}.wxdonutuo-evd button{transition-property:background-color,border-color,color,fill,stroke,opacity,box-shadow,transform;transition-duration:.2s}.wxdonutuo-evd button.small{padding:.25rem .5rem;font-size:.75rem;line-height:1rem}.wxdonutuo-evd button.primary{--tw-text-opacity: 1;color:rgb(255 255 255 / var(--tw-text-opacity));background-color:#fa9d3b}.wxdonutuo-evd button.primary:hover{background-color:#f98e1d}.wxdonutuo-evd button.primary:active{background-color:#d36f05}.wxdonutuo-evd button.disabled{cursor:not-allowed;opacity:.4}.wxdonutuo-evd button.disabled:hover{--tw-bg-opacity: 1;background-color:rgb(229 231 235 / var(--tw-bg-opacity))}.wxdonutuo-evd p{margin:0}.wxdonutuo-evd input.input{display:inline-block;height:2rem;width:100%;min-width:0px;border-radius:.25rem;border-style:solid;--tw-border-opacity: 1;border-color:rgb(209 213 219 / var(--tw-border-opacity));padding:0;outline-style:solid;outline-width:2px;outline-offset:2px;outline-color:transparent;box-sizing:border-box;border-width:1px;-webkit-padding-start:.5rem;padding-inline-start:.5rem;-webkit-padding-end:.5rem;padding-inline-end:.5rem;transition-property:background-color,border-color,color,fill,stroke,opacity,box-shadow,transform;transition-duration:.2s}.wxdonutuo-evd input.input:hover{--tw-border-opacity: 1;border-color:rgb(156 163 175 / var(--tw-border-opacity))}.wxdonutuo-evd input.input:focus-visible{border-color:#fa9d3b;box-shadow:0 0 0 1px #fa9d3b}.wxdonutuo-evd .u-blur-bg-white{background-color:#ffffffb3;-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px)}.hover\:evdtw-text-gray-800:hover{--tw-text-opacity: 1;color:rgb(31 41 55 / var(--tw-text-opacity))}.wxdonutuo-evd-element-definition-element-item-tag.svelte-yjl7xq{border-color:transparent;border-width:1px}.wxdonutuo-evd-element-definition-element-item-tag.svelte-yjl7xq:hover{border-color:#aeaeae}.wxdonutuo-evd-element-definition-element-item-tag.disabled.svelte-yjl7xq:hover{border-color:transparent}.wxdonutuo-evd-element-definition.svelte-rxdag6{height:100%;width:100%}.wxdonutuo-evd-element-definition-panel.svelte-1ebxu79{border-left-width:1px;border-top-width:1px;border-bottom-width:1px;transition-property:transform,top,left,right,bottom;transition-duration:.2s}.wxdonutuo-evd-web-control-panel.svelte-dervj7.svelte-dervj7{border-left-width:1px;border-right-width:1px;border-bottom-width:1px;transition-property:transform,top,left,right,bottom;transition-duration:.2s;background-image:linear-gradient(197.77deg,rgba(250,157,59,.06) -1.72%,rgba(250,157,59,0) 39.24%);background-position:top 0 right 0;background-repeat:no-repeat}.wxdonutuo-evd-web-control-panel.svelte-dervj7 .wxdonutuo-evd-web-control-panel-bg.svelte-dervj7{background-image:url(https://dev.weixin.qq.com/console/src/assets/icons/login-bg-shading.svg);background-position:top 0 right 0;background-repeat:no-repeat;background-size:25%}.wxdonutuo-evd-web-control-panel-position-top-left.svelte-dervj7.svelte-dervj7{top:0;left:0}.wxdonutuo-evd-web-control-panel-position-top-center.svelte-dervj7.svelte-dervj7{top:0;left:50%;transform:translate(-50%)}.wxdonutuo-evd-web-control-panel-position-top-right.svelte-dervj7.svelte-dervj7{top:0;right:0}.wxdonutuo-evd-web-control-panel-status-pending.svelte-dervj7.svelte-dervj7{font-size:.875rem;line-height:1.25rem;font-weight:600;--tw-text-opacity:1;color:rgb(107 114 128 / var(--tw-text-opacity))}.wxdonutuo-evd-web-control-panel-status-success.svelte-dervj7.svelte-dervj7{font-size:.875rem;line-height:1.25rem;font-weight:600;--tw-text-opacity:1;color:rgb(34 197 94 / var(--tw-text-opacity))}.wxdonutuo-evd-web-control-panel-status-success.svelte-dervj7.svelte-dervj7:before{content:"";display:inline-block;border-radius:9999px;--tw-bg-opacity:1;background-color:rgb(34 197 94 / var(--tw-bg-opacity));width:4px;height:4px;transform:translateY(-50%);margin-right:4px}.wxdonutuo-evd-web-control-panel-status-error.svelte-dervj7.svelte-dervj7{font-size:.875rem;line-height:1.25rem;font-weight:600;--tw-text-opacity:1;color:rgb(239 68 68 / var(--tw-text-opacity))}.wxdonutuo-evd-web-control-panel.svelte-dervj7 button.selecting.svelte-dervj7{--tw-bg-opacity:1;background-color:rgb(56 189 248 / var(--tw-bg-opacity))}.wxdonutuo-evd-web-control-panel.svelte-dervj7 button.danger.svelte-dervj7:hover{--tw-bg-opacity:1;background-color:rgb(239 68 68 / var(--tw-bg-opacity));--tw-text-opacity:1;color:rgb(255 255 255 / var(--tw-text-opacity))}.wxdonutuo-evd.svelte-sonyp4{--toastContainerZIndex:99999}

      小程序
  小程序

  小游戏

  公众号

  服务号

  开放平台

  企业微信

  微信支付

  视频号

  微信小店

  智能对话

  腾讯小微

  教育平台

  开发

  介绍

  设计

  运营

  数据

  安全

  社区

  学堂
   取消  查看更多  在小程序下暂无结果，查看其它业务相关内容 >
          指南

          框架

          组件

          API

          服务端
            平台能力
            行业能力

            商业能力

            多端能力

            服务市场

            城市服务

            付费能力

            拓展能力

          工具
            云服务
            云开发

            云托管

          更新日志
             开发
  开发

  介绍

  设计

  运营

  数据

  安全
    中文EN 取消  工具
      概览

      界面

      启动页

      主界面

      菜单栏

      工具栏

      工具栏管理

      模拟器

      独立窗口

      项目页卡

      基本信息

      本地设置

      项目设置

      设置

      通用设置

      云同步设置

      外观设置

      快捷键设置

      编辑设置

      代理设置

      安全设置

      项目配置文件

      代码编辑

      文件格式

      文件类型

      自动补全

      TypeScript 支持

      Git 状态展示

      编辑器扩展

      小程序调试

      模拟器

      自定义编译

      自定义预处理

      前后台切换

      调试工具

      Wxml Panel

      Sources Panel

      AppData Panel

      Storage Panel

      Network Panel

      Console Panel

      Sensor Panel

      自动预览
         Source Map
      特殊场景调试

      真机调试

      真机调试2.0

      真机调试性能工具

      多账号调试

      周期性数据调试

      数据预拉取调试

      事件模拟

      开发模式

      第三方平台代开发

      小程序插件开发

      企业微信小程序开发

      PC 小程序开发

      多端应用开发

      开发辅助

      测试号

      小程序助手

      版本管理

      微信开发者·代码管理

      命令行调用

      HTTP 调用

      npm 支持

      代码片段

      代码编译

      文档搜索

      CPU Profile 支持

      API Mock

      miniprogram-ci

      miniprogram-mp-ci

      音视频处理

      骨架屏

      代码热重载

      可视化编辑

      可视化展示第三方组件库

      代码静态依赖分析

      局部编译

      原生支持 TypeScript

      其他开发资源

      小程序自动化

      快速开始

      脚本示例

      真机自动化

      API

      Automator

      MiniProgram

      Page

      Element

      常用示例

      录制回放

      快速开始

      用例管理

      命令行调用

      FAQ

      更新日志

      工具插件

      代码质量扫描

      体验评分

      搜索回调调试

      sourceMap 匹配调试

      代码加固

      接口漏洞扫描

      无障碍访问

      单页模板

      小程序云测

      小程序云测简介

      快速开始

      需要帮助

      自动化测试

      智能化Monkey

      智能化Monkey扩展

      快速Monkey

      录制回放

      自定义测试

      上传自定义用例指引

      图片对比能力

      AI自动化测试

      AIMonkey

      AI自定义测试

      性能测试

      启动性能分析

      运行时性能分析

      小程序质检

      压力测试

      弱网络测试

      微信测试账号解决方案

      使用虚拟账号测试

      虚拟账号配置Mock信息

      虚拟账号手机号Mock方案

      使用真实账号测试

      购买云测

      购买额外时长

      购买专有云

      API接口文档

      接口说明

      测试账号

      测试任务

      质检任务

      测试计划

      测试用例

      图片对比

      上传SourceMap

      获取机型列表

      其他说明

      使用开发中版提测指引

      任务结束通知配置

      每周免费测试

      常见问题

      测试任务耗时说明

      云测常见问题

      智能化Monkey常见问题

      录制回放常见问题

      更新日志

      API 实现差异

      下载

      稳定版更新日志

      预发布版更新日志

      开发版更新日志
          编辑区可以对当前项目进行代码编写和文件的添加、删除以及重命名等基本操作。 # 文件格式 因 iOS 下仅支持 UTF8 编码格式，最新版本的开发者工具会在上传代码时候对代码文件做一次编码格式校验。 # 文件支持 工具目前提供了 5 种文件的编辑：wxml、wxss、js、json、wxs 以及图片文件的预览。 # 文件操作 新建页面有两种方式 在目录树上右键，选择新建 Page，将自动生成页面所需要的 wxml、wxss、js、json 在 app.json 的 pages 字段，添加需要新建的页面的路径，将会自动生成该页面所需要的文件 # 自动保存 编辑代码后，工具会自动帮助用户保存当前的代码编辑状态，直接关闭工具或者切换到别的项目，并不会丢失已经编辑的文件状态，但需要注意的是，只有用户主动保存文件，修改内容才会真实的写到硬盘上。 如果设置中开启了 “修改文件时自动保存”（设置-编辑设置-修改文件自动保存），工具在修改文件时会自动保存到硬盘中，无需手动保存的效果。 设置中开启 “编译时自动保存所有文件”（设置-编译设置-编译时自动保存所有文件），在点击编译时自动保存所有文件的效果。 # 实时预览 如果设置中开启了 “文件保存时自动编译小程序”（设置-编辑设置-保存时自动编译小程序），那么当 wxml、wxss、js、json 文件修改时，可以通过模拟器实时预览编辑的情况： 注意：如果同时开启了 ”修改文件时自动保存“ 的设置，编译动作会有一定的延迟，来避免频繁的编译，手动点击编译按钮将立即编译。 # 自动补全 同大部分编辑器一样，工具提供了较为完善的自动补全 js 文件编辑会帮助开发补全所有的 API 及相关的注释解释，并提供代码模板支持 wxml 文件编辑会帮助开发者直接写出相关的标签和标签中的属性 json 文件编辑会帮助开发者补全相关的配置，并给出实时的提示 js 补全  代码模板支持  json 补全  wxml 补全  # TypeScript 支持 如果项目需要使用 TypeScript 语言开发，开发者工具在创建项目选择快速启动模板时，提供了使用 TypeScript 语言的 QuickStart 项目，可以选择创建此项目并进行后续开发。 如果你使用的是 1.05.2108130 之前的版本，要构建并使用 TypeScript 项目，可能需要安装 npm。通过配置编译前的预置命令，可以实现在编译前运行 tsc 以将其编译到 js 文件。

从 1.05.2109101 版本开始，我们优化了对 TypeScript 项目的编译支持，详细请查看 如需配置 TypeScript 编译选项，请参考 tsconfig.json 的配置。 注：小程序仅支持运行 JS 文件，因此所有的 TS 文件都默认不会被打包上传。 # Git 状态展示 如果所在的小程序工程目录（project.config.json 所在目录）存在 Git 仓库，编辑器可以展示目前的 Git 状态。 # 目录树 如图所示，当某些文件存在变动时，目录树的文件右侧将展示相应的图标来表明这一状态。当某一处于收起状态的目录下存在有变动的文件时，此目录的右侧亦会展示一个圆点图标表明此情况。 文件图标状态的含义如下：  图标 含义 U 文件未追踪（Untracked） A 新文件（Added, Staged） M 文件有修改（Modified） +M 文件有修改（Modified, Staged） C 文件有冲突（Conflict） D 文件被删除（Deleted）文件夹目录图标状态的含义如下： 图标 含义 小红点 目录下至少存在一个删除状态的文件 小橙点 目录下至少存在一个冲突状态的文件 小蓝点 目录下至少存在一个未追踪状态的文件 小绿点 目录下至少存在一个修改状态的文件如果某一文件存在修改（Modified），可以右键点击此文件，并选择 “与上一版本比较”，则可以查看当前工作区文件与 HEAD 版本的比较。   # 文件编辑 存在 Git 仓库时，状态栏会展示此 Git 仓库目前的分支信息。例如，下图表明目前 Git 仓库处于 v2 分支。  同时，编辑文件内容时，将会在所编辑代码左侧实时显示相对于上一版本内容的比较。  样式说明如下： 文件夹目录图标状态的含义如下： 样式 含义 蓝色线条 此处的代码有变动 绿色线条 此处的代码是新增的 红色三角箭头 此处有代码被删除# Windows 风格回车设置 如需忽略 Windows 风格的回车符，可以前往 “设置” - “编辑”，并勾选 “Git 比较文件内容时，忽略 Windows 风格回车符”。 勾选后，在编辑文件进行内容比较时，所有 Windows 风格的回车符将被当作 Unix 风格的回车符对待。  The translations are provided by WeChat Translation and are for reference only. In case of any inconsistency and discrepancy between the Chinese version and the English version, the Chinese version shall prevail.Incorrect translation. Tap to report.      关于腾讯 文档中心 辟谣中心 客服中心 Copyright © 2012-2026 Tencent. All Rights Reserved.  复制 问题反馈  反馈

---

编辑区可以对当前项目进行代码编写和文件的添加、删除以及重命名等基本操作。

## 文件格式

因 iOS 下仅支持 **UTF8** 编码格式，最新版本的开发者工具会在上传代码时候对代码文件做一次编码格式校验。

## 文件支持

工具目前提供了 5 种文件的编辑：`wxml`、`wxss`、`js`、`json`、`wxs` 以及图片文件的预览。

## 文件操作

新建页面有两种方式

1. 在目录树上右键，选择新建 Page，将自动生成页面所需要的 `wxml`、`wxss`、`js`、`json`

2. 在 app.json 的 pages 字段，添加需要新建的页面的路径，将会自动生成该页面所需要的文件

## 自动保存

编辑代码后，工具会自动帮助用户保存当前的代码编辑状态，直接关闭工具或者切换到别的项目，并不会丢失已经编辑的文件状态，但需要注意的是，只有用户主动保存文件，修改内容才会真实的写到硬盘上。

如果设置中开启了 “修改文件时自动保存”（设置-编辑设置-修改文件自动保存），工具在修改文件时会自动保存到硬盘中，无需手动保存的效果。

设置中开启 “编译时自动保存所有文件”（设置-编译设置-编译时自动保存所有文件），在点击编译时自动保存所有文件的效果。

## 实时预览

如果设置中开启了 “文件保存时自动编译小程序”（设置-编辑设置-保存时自动编译小程序），那么当 `wxml`、`wxss`、`js`、`json` 文件修改时，可以通过模拟器实时预览编辑的情况：

**注意：如果同时开启了 ”修改文件时自动保存“ 的设置，编译动作会有一定的延迟，来避免频繁的编译，手动点击编译按钮将立即编译。**

## 自动补全

同大部分编辑器一样，工具提供了较为完善的自动补全

- js 文件编辑会帮助开发补全所有的 API 及相关的注释解释，并提供代码模板支持

- wxml 文件编辑会帮助开发者直接写出相关的标签和标签中的属性

- json 文件编辑会帮助开发者补全相关的配置，并给出实时的提示

js 补全

代码模板支持

json 补全

wxml 补全

## TypeScript 支持

如果项目需要使用 TypeScript 语言开发，开发者工具在创建项目选择快速启动模板时，提供了使用 TypeScript 语言的 QuickStart 项目，可以选择创建此项目并进行后续开发。

> 如果你使用的是 1.05.2108130 之前的版本，要构建并使用 TypeScript 项目，可能需要安装 npm。通过配置编译前的预置命令，可以实现在编译前运行 tsc 以将其编译到 js 文件。

> 从 1.05.2109101 版本开始，我们优化了对 TypeScript 项目的编译支持，详细请查看

如需配置 TypeScript 编译选项，请参考 [tsconfig.json](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html) 的配置。

> 注：小程序仅支持运行 JS 文件，因此所有的 TS 文件都默认不会被打包上传。

## Git 状态展示

如果所在的小程序工程目录（`project.config.json` 所在目录）存在 Git 仓库，编辑器可以展示目前的 Git 状态。

### 目录树

如图所示，当某些文件存在变动时，目录树的文件右侧将展示相应的图标来表明这一状态。当某一处于收起状态的目录下存在有变动的文件时，此目录的右侧亦会展示一个圆点图标表明此情况。

文件图标状态的含义如下：

| 图标 | 含义 |
| --- | --- |
| U | 文件未追踪（Untracked） |
| A | 新文件（Added, Staged） |
| M | 文件有修改（Modified） |
| +M | 文件有修改（Modified, Staged） |
| C | 文件有冲突（Conflict） |
| D | 文件被删除（Deleted） |

文件夹目录图标状态的含义如下：

| 图标 | 含义 |
| --- | --- |
| 小红点 | 目录下至少存在一个删除状态的文件 |
| 小橙点 | 目录下至少存在一个冲突状态的文件 |
| 小蓝点 | 目录下至少存在一个未追踪状态的文件 |
| 小绿点 | 目录下至少存在一个修改状态的文件 |

如果某一文件存在修改（Modified），可以右键点击此文件，并选择 “与上一版本比较”，则可以查看当前工作区文件与 HEAD 版本的比较。

### 文件编辑

存在 Git 仓库时，状态栏会展示此 Git 仓库目前的分支信息。例如，下图表明目前 Git 仓库处于 `v2` 分支。

同时，编辑文件内容时，将会在所编辑代码左侧实时显示相对于上一版本内容的比较。

样式说明如下：

文件夹目录图标状态的含义如下：

| 样式 | 含义 |
| --- | --- |
| 蓝色线条 | 此处的代码有变动 |
| 绿色线条 | 此处的代码是新增的 |
| 红色三角箭头 | 此处有代码被删除 |

### Windows 风格回车设置

如需忽略 Windows 风格的回车符，可以前往 “设置” - “编辑”，并勾选 “Git 比较文件内容时，忽略 Windows 风格回车符”。

勾选后，在编辑文件进行内容比较时，所有 Windows 风格的回车符将被当作 Unix 风格的回车符对待。
