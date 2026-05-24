# 工具插件 / sourceMap 匹配调试

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/sourcemap.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 工具插件 /sourceMap 匹配调试 /

---

## sourceMap 匹配调试

为方便开发者使用sourceMap文件定位代码问题，增加调试器插件优化sourceMap匹配调试。

## 运行环境

- 下载并安装 `1.03.2012152`或以上版本的开发者工具， [下载地址](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。

### 下载流程

打开微信开发者工具，在菜单栏选择"设置-通用设置-扩展-调试器插件"，进入插件下载页面，添加sourcemap匹配调试插件。添加成功后，即可在调试器使用该插件。

## 使用流程

1. 下载sourceMap文件(可在we分析平台或开发者工具上传成功弹窗下载)

2. 找到发生错误对应的分包，选择分包的map文件

3. 填入目标行列号，点击“匹配按钮” 即可获得匹配结果，并自动定位源代码位置。（开发者工具会按照源行列号，自动定位代码对应位置。若要保证定位准确，开发者需要自行保证代码版本与sourceMap文件相匹配）

显示如下： ![显示](https://res.wx.qq.com/wxdoc/dist/assets/img/sourcemap.8894cb19.png)

## sourcemap 的目录和文件说明

1. **APP**是主包， **FULL**是整包（仅在不支持分包的低版本微信中使用），其他目录是分包。

2. 每个分包下都有对应的 app-service.js.map 文件。

3. 如果是使用了按需注入特性（app.json中配置了lazyCodeLoading），那么每个分包下还会有 appservice.app.js.map（对应分包下非页面的js），和所有页面的 xxx.js.map。

## 如何排查小程序 sourcemap 文件失效

请参考文档[小程序 sourcemap 文件失效原因排查](https://developers.weixin.qq.com/community/minihome/article/doc/0008ee19284d9870524f9df4156013)

## Q&A

### Q: 为啥都是 null？

A: 每个小程序版本都应该对应一个sourcemap文件。 we分析平台那里下载的 sourcemap 是对应线上最新的小程序版本。但运营中心的报错集合了多个小程序版本。拿旧小程序版本的报错信息，和最新版本的 sourcemap，是匹配不出的。开发者工具和ci 上传的时候，会提示下载对应版本的 sourcemap 信息，可以自助保存。

如果版本一致，可以参考上面的[小程序 sourcemap 文件失效原因排查](https://developers.weixin.qq.com/community/minihome/article/doc/0008ee19284d9870524f9df4156013)文档先自助排查一下。

### Q: 怎么确定有没有版本对应上

A: 下载的 sourcemap 中有个 wx 字段，标明了该 sourcemap 文件对应小程序版本号。
