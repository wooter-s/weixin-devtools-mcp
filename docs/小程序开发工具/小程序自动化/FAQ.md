# FAQ

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/faq.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 小程序自动化 /FAQ /

---

# FAQ

> 怎么操作系统原生组件，如用户授权、位置选择等？

用户授权框等系统组件不提供方法获取和操作，请在执行自动化测试前确保已手工对所需权限进行授权。

位置选择等调用 wx 对象接口触发的原生界面组件，可以直接使用 `miniProgram.mockWxMethod` 指定返回结果。

> Node.js 脚本执行完为什么不会退出？

请确保在测试执行完毕后调用 `miniProgram.close` 或者 `miniProgram.disconnect` 断开与工具的连接。

> 怎么在一台机器上登录多个账号测试？

可以使用工具的多账号调试功能，配合自动化的 miniProgram.testAccounts 来达到目的。

> 怎么在多个机器上的工具登录相同账号运行测试？

利用 miniProgram.getTicket 接口可以获取到当前工具的登录票据，然后就可以使用该票据在其它机器上登录工具。票据具体怎么从机器上同步到另一台机器上，需要开发者自行维护。
