# 智能化Monkey测试常见问题

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/minitest/monkey_problem.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 工具插件 /小程序云测 /常见问题 /智能化Monkey常见问题 /

---

# 智能化Monkey测试常见问题

## 如何判断测试是否通过

Monkey测试是采用随机点击的方式来测试小程序的稳定性。当系统跑测结束时，没有发现 黑白屏，JsError，Crash 这些异常情况时，即判断测试通过。

## 什么是Monkey测试的页面覆盖率

页面覆盖率指的是小程序在Monkey测试任务结束后，**测试覆盖的的页面数**在**小程序的所有页面数**中所占比例。

例如某小程序有70个页面，Monkey任务结束后覆盖了35个页面，这时候覆盖率就是50%。

云测服务后台采用自研智能点击策略，利用深度学习算法，智能识别当前可点击元素，提升冒烟测试效率。

当用户第一次跑测时Monkey覆盖率可能较低，随着用户跑测次数增加，后台会智能学习历史经验，提升覆盖率。

## 如何提升Monkey覆盖率

可以通过以下方式，提升智能化Monkey测试覆盖率：

1. 尝试 [Monkey扩展模式](./customize_monkey.html)。在测试计划中，配置 **指定页面**，并选择 **自由探索**模式。这样在Monkey测试开始前，会先拉起所有配置页面，然后再开始后续测试，极大提升覆盖率

2. 增加Monkey测试时长。一般来说，随着Monkey测试时间增加，覆盖率会上升。系统默认Monkey跑测20分钟，用户可以手动调整为更大的时间

3. 增加跑测次数。智能化Monkey后台会记录每次测试的历史经验，然后用来优化下一次跑测的策略选择。一般来说，随着跑测次数增多，覆盖率会逐步上升。

## 如何排查黑白屏问题

根据经验，大部分黑白屏是由于网络加载慢，或者页面有JSError导致。大家可以再页面详情中，查看页面是否存在这些问题。

1. 在Monkey报告总览下方Tab页面，选择“设备列表” => ”查看详情“，进入设备详情页面

2. 在设备详情页面中，如果有黑白屏，会有“黑白屏详情”的Tab，点击进入黑白屏详情。在每个黑白屏的下方，点击对应的页面链接，即可进入页面详情。

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/monkey_problem_white_pic.ac1a0f24.png)

1. 在页面详情中，详细展示了页面的所有截图，页面的体验评分，网络信息，JSError信息等，可综合这些信息判断黑白屏产生的原因。例如下图中，已提示 **页面请求耗时过长**，在网络请求中，将耗时逆序排列，可找到耗时长的请求，进行优化。

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/monkey_problem_page_detail.550459b1.png)

## JSError问题如何定位

首先因云测只能获取到的小程序编译混淆后的js，若要解码，需要这个版本的sourcemap信息

用户可以上传sourcemap文件反解，详细流程可以参考：[【官方教程】利用SourceMap解析JS Error报错信息](https://developers.weixin.qq.com/community/minihome/article/doc/000666067f8bb83c697e3da3851813)

此外开发者可以通过查看console日志的方式定位问题，如下所示

- 在 **开发者工具**中复现，根据测试报告中截图执行的流程复现，关注开发工具面板 `console`中是否有JsError错误信息，根据错误信息解决

- 在 **真机**中复现，仅支持 **体验版及开发版小程序**，在小程序中打开调试，根据测试报告中截图执行的流程复现，在 `vConsloe`中查看JsError错误信息，根据错误信息解决， 注意：线上版小程序没有vConsole调试功能

[查看云测相关问答 >](https://developers.weixin.qq.com/community/minihome/mixflow/2315318279491616771)
[到微信开放社区提问 >](https://developers.weixin.qq.com/community/blog/create/1?blocktype=1&minihome=2315318279491616771&questionCategory=32768)
