# 工具插件 / 小程序云测 / 微信测试账号解决方案 / 虚拟账号配置Mock信息

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/minitest/mock_account.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 工具插件 /小程序云测 /微信测试账号解决方案 /虚拟账号配置Mock信息 /

---

云测服务可配置虚拟账号信息，例如定位信息、请求Request

## 虚拟账号配置

虚拟账号的配置在 `项目管理`，`虚拟账号配置` 中配置

## 虚拟账号mock示例

目前支持配置虚拟账号的 **定位**`wx.getLocation(Object object)`的回调信息 及 **请求Request** 信息

例如，配置请求Request规则及回调信息
```json
{
    "rule": ".*/SendMsg\\?.*",
    "success": {"data": "mock result1", "statusCode": 200}
}
```
若需Mock虚拟账号的手机号，可参考 [虚拟账号手机号Mock方案](./phone_mock.html)

## 需要帮助

如果你任何建议或需求，欢迎前往 [需要帮助](./help.html) 页面，扫码加入云测官方企微群，联系群主反馈。

## 代码示例
```json
{
    "rule": ".*/SendMsg\\?.*",
    "success": {"data": "mock result1", "statusCode": 200}
}
```
```json
{
    "rule": ".*/SendMsg\\?.*",
    "success": {"data": "mock result1", "statusCode": 200}
}
```
