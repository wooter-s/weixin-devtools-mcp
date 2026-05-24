# 工具插件 / 小程序云测 / 自动化测试 / 智能化Monkey扩展

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/minitest/customize_monkey.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 工具插件 /小程序云测 /自动化测试 /智能化Monkey扩展 /

---

## 智能化Monkey扩展

> 为了方便大家快速上手，本节文档的 视频教程 已上架微信学堂

智能化Monkey提供了智能化的算法帮助用户自动遍历，部分用户在此基础上可能有进阶需求，如：

- 小程序需要进行一些指定操作才能显示，如需要登录输入用户名密码后，才能正常访问小程序内容

- 希望可以遍历指定的页面，提升测试页面覆盖率

- 希望在指定的页面中，尽量多点击指定页面的元素，如测试页面稳定性

为了满足用户的不同需求，云测服务对智能化Monkey进行了扩展，主要包括：

- **前置操作**：支持用户配置Monkey前置步骤，在跑测Monkey前会执行指定操作

- **指定页面**：支持配置多个Path+Query，在前置步骤操作结束后，直接拉起指定页面

- **不同模式**：支持两种后继模式，满足不同用户需求

扩展后，Monkey的执行的流程如图所示：

1、 任务是否有前置操作，如有前置操作，先执行前置操作

2、 任务是否配置了指定页面列表，如有指定，在前置操作（如有）执行完成后，会先依次用 path+query 拉起页面列表

3、 根据配置的后继模式，开始智能化探索

4、智能化探索完成，任务结束，收集并上报结果，生成测试报告

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/monkey_customize_flow.c5d834ba.png)

## 使用流程

### 1、新建测试计划

用户打开云测插件后，可以点击左侧的`测试用例管理` => `测试计划`，进入测试计划页面

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/customize_monkey.dda132f9.png)

点击右上角`新建测试计划`，在测试计划窗口中，根据项目需求配置扩展信息，主要有以下几种：

##### 前置步骤

云测服务支持用户配置Monkey前置步骤。目前支持两种方式指定前置步骤

- Minium：需要编写Minium脚本，上传到云测中，然后再选择执行的Case。具体可参考 [自定义测试](./minium.html)

- 录制回放：需要在开发者工具上先录制前置步骤，同步到云测中，然后再选择执行的Case。具体可参考 [录制回放](./replay.html)

配置成功后，在智能化Monkey测试开始前，**先执行指定的前置步骤Case**，执行成功后再继续往后执行。

> 特别建议：用户可以先用录制回放或者自定义测试先执行下前置步骤用例，确认执行成功再配置前置步骤，方便排查问题

若执行失败，云测服务支持用户自主选择是`中断跑测`还是`继续跑测`。

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/customize_monkey_create_plan_new_1.02dc08f7.png)

##### 配置指定页面，选择Monkey模式

云测服务支持用户配置多个指定页面和参数，在前置步骤（若有）执行完成后，会直接打开配置的页面，检查是否存在JsError或者黑白屏等异常情况。

遍历完指定页面后，平台支持两种自定义模式：

- **自由探索**：继续原来智能化探索逻辑，优先寻找未遍历过的页面

- **重点覆盖**：重回指定的页面继续点击，尽量多点击指定页面的元素

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/customize_monkey_create_plan_new_2.22d539df.png)

### 2、创建测试任务

进入云测服务后，在页面的右上方点击 **新建任务**，测试类型选择 **Monkey**，选择对应的自定义Monkey测试计划创建新的任务即可。
特别提醒：**前置步骤耗时会计入测试时长中**，比如最长测试时长20分钟，前置步骤执行10分钟，智能化Monkey继续执行10分钟。

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/customize_monkey_create_task_new.d338e425.png)

### 3、查看报告

如果配置了前置步骤，在测试报告中会给出前置步骤执行结果，并且在设备详细报告的用例执行结果中，用`前置步骤`Tab显示前置步骤执行情况

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/customize_monkey_report.e22babe2.png)

## 更多参考资料

- [【视频教程】智能化Monkey扩展](https://developers.weixin.qq.com/community/business/doc/000624b2c6cbe0c5f2cf4091b5600d)

## 需要帮助

如果你任何建议或需求，欢迎前往 [需要帮助](./help.html) 页面，扫码加入云测官方企微群，联系群主反馈。
