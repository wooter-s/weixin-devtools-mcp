# 上传小程序SourceMap文件

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/minitest/api_source.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 工具插件 /小程序云测 /API接口文档 /上传SourceMap /

---

# 上传小程序SourceMap文件

##### 简要描述

上传SourceMap后，在跑测中发现JS Error时，平台会尝试用SourceMap对JS Error堆栈进行匹配定位源代码位置信息。

##### 请求URL

- `https://minitest.weixin.qq.com/thirdapi/source_map`

##### 请求方式

- POST

##### 参数

| 参数名 | 必选 | 类型 | 说明 |
| --- | --- | --- | --- |
| token | 是 | string | 可以从页面右上角头像下拉菜单中的 “我的信息”，跳转至我的信息页面，查看“我的Token” |
| group_en_id | 是 | string | 项目英文ID，可在 项目管理/产品管理 页面获取 |
| file | 是 | FileStorage | sourcemap.zip文件 |
| appid | 否 | string | 小程序AppID，服务商项目必传；非服务商项目默认为项目绑定AppID |
| upload_desc | 否 | string | sourcemap上传备注 |

##### 返回示例
```json
{
	"data": null,
	"msg": "upload sourcemap file success",
	"rtn": 0,
	"timestamp": 1614861228.1035924

}
```

##### 备注

示例代码可参考 [文档说明](./api_exe.html) 中的 `接口示例代码(Python3)`

##### 更多参考资料

- [【官方教程】利用SourceMap解析JS Error报错信息](https://developers.weixin.qq.com/community/minihome/article/doc/000666067f8bb83c697e3da3851813)

## 代码示例
```json
{
	"data": null,
	"msg": "upload sourcemap file success",
	"rtn": 0,
	"timestamp": 1614861228.1035924

}
```
```json
{
	"data": null,
	"msg": "upload sourcemap file success",
	"rtn": 0,
	"timestamp": 1614861228.1035924

}
```
