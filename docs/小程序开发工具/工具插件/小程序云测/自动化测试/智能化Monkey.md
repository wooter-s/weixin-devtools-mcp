# 智能化Monkey

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/minitest/monkey.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 工具插件 /小程序云测 /自动化测试 /智能化Monkey /

---

# 智能化Monkey

> 为了方便大家快速上手，本节文档的 视频教程 已上架微信学堂

智能化Monkey基于微信团队自研的一套智能探索算法，可以自动识别小程序中可操作的节点，建立探索路径，从而实现对小程序页面的智能遍历。

这种模式非常适合页面较少，功能简单的小程序。我们也推荐大多数开发者选用这种模式，来实现零代码、低成本的快速冒烟测试或回归测试。

注意：智能化Monkey只支持安卓和iOS系统，鸿蒙操作系统如果要执行Monkey，请参考 [AIMonkey](./ai_monkey.html) 文档

## 创建Monkey任务

进入云测服务后，在页面的右上方点击 **新建任务**，测试类型选择 **Monkey**，点击**立即创建**即可创建新的任务。

> 云测服务重要更新：现智能化Monkey任务支持用户选择多台安卓或iOS手机一起跑测

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/monkey_new_1.733b5c65.png)

## 查看报告

特别提醒，Monkey任务是否成功，主要是看在设备跑测中，有没有发现JSError，黑白屏，网络请求异常这三种异常情况，如有发现判定该设备测试失败

> 例如任务一共跑测 100 台手机，其中 30 台发现了JSError等异常情况， 5 台因为微信安装失败等原因未能执行跑测。那么任务的整体成功率为 65%

自动化测试任务结束后，会自动在开发者工具通知用户测试结果。用户也可以通过在测试任务页面直接点击**查看报告**按钮进入报告页面。

整体报告页面展示了本次任务的整体情况，主要包括`报告总览`、`问题列表`、`设备列表`、`覆盖页面`、`资源占用`

- 报告总览：报告总览列出了本次测试的 **基本情况**，包括小程序类型，任务耗时等

- 问题列表：展现 **本次测试发现的所有问题**，主要包括JSError、黑白屏、网络请求异常，性能问题和最佳时间建议，点击 `展开详情`会从右侧展开问题详细情况，方便用户快速查看问题

- 设备列表：以 **设备维度**展现本次测试跑测的所有设备信息、测试结果、设备发现的问题，点击 `查看详情`可查看该设备本次跑测的详细信息

- 覆盖页面：以 **页面维度**展现本次Monkey测试覆盖的所有页面，以及每个页面发现的问题

- 资源占用：展现每次设备测试的启动耗时，平均内存和CPU等 **性能数据**信息

详情可参考[Monkey报告示例](https://minitest.weixin.qq.com/cloudtest/share/report_overview?share_token=6d3300327a6f169ae8e935f8c1ec8abf)

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/monkey_new2.ed121de2.png)

## 查看报告详情

点击设备列表或性能数据中`详情`按钮，进入**测试详情**页面。它主要展示了设备本次跑测Monkey的详细信息，包括：

- 运行截图：详细记录了Monkey操作的流程

- 异常检测：如发现有JSError、黑白屏等异常情况，会有Tab显示详细情况。对于JSError，可支持用户上传SourceMap文件反解。详情可参考 [利用SourceMap解析JS Error报错信息](https://developers.weixin.qq.com/community/minihome/article/doc/000666067f8bb83c697e3da3851813)

- 网络请求详情：展示跑测过程中的小程序网络请求信息，如有发现网络请求异常，可在这里查看详细情况。

- 体验评分：通过体验评分展示了真机测试中运行时性能分析，帮助开发者发现并解决性能问题，详情可参考 [运行时性能分析](./audits.html)

- 覆盖页面：展示本设备跑Monkey时覆盖了页面情况，以及发现的问题

- 资源占用：记录了跑测过程中的CPU和内存性能取消，点击曲线点可以看到点前时间截图

- 历史数据：用于对比同一机型跑测过的Monkey任务资源占用情况对比

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/monkey_new4.f507b85f.png)

## 更多参考资料

- [【视频教程】智能化Monkey](https://developers.weixin.qq.com/community/business/doc/00064a987cc490c2fdadc0cdc5c80d)

- [智能化Monkey常见问题](./minitest/monkey_problem.html)

- [【官方教程】利用SourceMap解析JS Error报错信息](https://developers.weixin.qq.com/community/minihome/article/doc/000666067f8bb83c697e3da3851813)

- [Monkey 测试：零代码接入 还不快来试一试？](https://developers.weixin.qq.com/community/minihome/article/doc/000a6a66338fb05f3a5eaa83c5b013)

## 需要帮助

如果你任何建议或需求，欢迎前往 [需要帮助](./help.html) 页面，扫码加入云测官方企微群，联系群主反馈。
