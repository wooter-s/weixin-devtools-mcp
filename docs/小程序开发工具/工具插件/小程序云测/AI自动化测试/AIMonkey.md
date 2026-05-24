# AIMonkey

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/minitest/ai_monkey.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 工具插件 /小程序云测 /AI自动化测试 /AIMonkey /

---

# AIMonkey

AIMonkey主要依托大模型能力，重构原来的智能化Monkey测试。对比原来的智能化Monkey，主要优势是：

- **可以回放Monkey过程**：执行完成后会自动生成本次操作的Minium代码，你也可以把它上传到云测作为Minium用例再次执行，回放本次Monkey过程

- **鸿蒙操作系统，只支持AIMonkey模式**。对于鸿蒙操作系统，即使页面选择智能化Monkey，云测会自动切换到AIMonkey模式

- 利用大模型能力驱动测试，更加贴近人类感知

请注意：AIMonkey是纯大模型驱动，不支持原来智能化Monkey的拓展能力，如不支持配置前置步骤

# 快速开始

### 1. 在提交任务时，选择AIMonkey测试计划

在“测试任务”页面，新建任务时，在Monkey测试类型的测试计划中，选择“AIMonkey”

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/ai_monkey_create_plan.90f11074.png)

### 2. 查看报告

AIMonkey的报告和原来智能化Monkey基本一致，只是在用例结果页面，会多出一个“自动生成用例”的Tab

你可以下载代码，然后自行上传为Minium用例，在云测使用[Minium任务](./minium.html)回放本次执行过程

![图片](https://res.wx.qq.com/wxdoc/dist/assets/img/ai_monkey_report.e497a028.png)

# 需要帮助

如果你任何建议或需求，欢迎前往 [需要帮助](./help.html) 页面，扫码加入云测官方企微群，联系群主反馈。
