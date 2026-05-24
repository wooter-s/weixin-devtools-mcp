# 开发辅助 / CPU Profile 支持

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/profile.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 开发辅助 /CPU Profile 支持 /

---

为方便开发者在开发小游戏过程中进行cpu/memory信息分析，微信开发者工具优化了加载cpuprofile文件流程。

### 运行环境

- 下载并安装 1.02.1911192 或以上版本的开发者工具， [下载地址](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。

### 加载profile文件流程

开发者可以通过预览->右上角胶囊按钮->开发调试->Start CPUProfile 开始记录cpuprofile信息

开发者可以通过预览->右上角胶囊按钮->开发调试->Stop CPUProfile 结束记录cpuprofile信息

结束后，会自动导出一份cpuprofile文件到手机中。

打开微信开发者工具，在devtools里打开JavaScript Profiler面板，点击load。

选择通过电脑连接的Andriod设备上传。

选择设备并选择对应的文件。

确定后在profiler面板里点击左侧载入的文件即可查看信息。

在载入Andriod设备的cpuprofile文件时，同时会在工具本地进行存储，本地有cpuprofile文件的情况下，可以直接选择通过本地目录上传，将本地的cpuprofile文件载入到工具的profiler中

### 注意事项

1. 请确定PC上安装了Andriod调试工具ADB、手机驱动、打开USB调试功能并授权

2. 请确认Andriod手机上已安装微信6.5.10以上客户端版本

3. 选择设备后，该设备中的调试文件将被同步至本地目录中

4. 如设备连接了PC，却搜索不到设备，请确认在终端运行adb devices能显示出已经连接的设备
