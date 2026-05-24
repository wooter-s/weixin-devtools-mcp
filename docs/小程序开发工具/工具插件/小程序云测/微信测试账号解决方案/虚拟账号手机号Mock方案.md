# Mock流程

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/minitest/phone_mock.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 工具插件 /小程序云测 /微信测试账号解决方案 /虚拟账号手机号Mock方案 /

---

虚拟账号绑定的手机号并非真实手机号，对于部分需要手机号验证的小程序，**优先考虑使用真实账号测试**解决手机验证码问题，具体可以参考 [使用真实账号测试](./mock_real_account.html)

如果确实需要虚拟账号支持，可以通过小程序的代码中增加Mock手机号的逻辑，实现通过手机号验证的功能。

虚拟账号Mock手机号具体流程如下：

# Mock流程

1. 小程序获取手机号信息 `code`/ `encryptedData`

2. 解密后得到明文的手机号信息 `purePhoneNumber`

3. 手机号属于虚拟测试号绑定手机号（12066600001, 12066600002, 12066600003, 12066600004），则替换成需要mock的手机号码

# 新版本Mock示例

> 从基础库 2.21.2 开始，对获取手机号的接口进行了安全升级，以下是新版本接口的mock指南

1. 通过 `<button open-type="getPhoneNumber" bindgetphonenumber="getPhoneNumber"></button>`绑定的 `getPhoneNumber`方法获取到 `code`

### 通过业务后台Mock手机号

1. **业务后台**通过服务接口 [phonenumber.getPhoneNumber HTTPS 调用](https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/phonenumber/phonenumber.getPhoneNumber.html#HTTPS-%E8%B0%83%E7%94%A8)消费 `code`获取到手机号信息 `phone_info`

2. 获取到的手机号信息 `phone_info.purePhoneNumber`在[12066600001, 12066600002...]中的，替换成业务需要的手机号，如 `13400000001`

### 通过云服务Mock手机号

1. 云函数中调用 `wx-server-sdk`的 [openapi.phonenumber.getPhoneNumber接口](https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/phonenumber/phonenumber.getPhoneNumber.html#%E4%BA%91%E8%B0%83%E7%94%A8)，通过 `code`获取手机号信息 `phoneInfo`

2. 获取到的手机号信息 `phoneInfo.purePhoneNumber`在[12066600001, 12066600002...]中的，替换成业务需要的手机号，如 `13400000001`

3. 代码示例
```text
// 云函数 getPhoneNumber
// getPhoneNumber/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 获取phoneNumber云函数入口函数
exports.main = async (event, context) => {
  const res = await cloud.openapi.phonenumber.getPhoneNumber({
    code: event.code
  })
  if (["12066600001", "12066600002"].indexOf(res.phoneInfo.purePhoneNumber) > -1) {
    const mockPhoneInfo = {
      countryCode: "86",
      phoneNumber: "13400000001",
      purePhoneNumber: "13400000001",
      watermark: res.phoneInfo.watermark
    }
    return mockPhoneInfo
  }
  return res.phoneInfo
}
```
```text
// 小程序
// getPhoneNumber.wxml
<button open-type="getPhoneNumber" bindgetphonenumber="getPhoneNumber"></button>

// getPhoneNumber.js
Page({
    async getPhoneNumber(res) {
      const result = await wx.cloud.callFunction({
        name: 'getPhoneNumber',
        data: {
          code: res.detail.code
        }
      })
      console.log("phone info is:", result.result)
    }
})
```

# 旧版本Mock示例

> 对于基础库小于 2.21.2 的旧版本的兼容方案

1. 通过 `<button open-type="getPhoneNumber" bindgetphonenumber="getPhoneNumber"></button>`绑定的 `getPhoneNumber`方法获取到加密的手机信息 `encryptedData`, `iv`, `cloudID`

### 通过业务后台Mock手机号

1. **业务后台**通过 [加密数据解密算法](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#%E5%8A%A0%E5%AF%86%E6%95%B0%E6%8D%AE%E8%A7%A3%E5%AF%86%E7%AE%97%E6%B3%95)解密出手机号信息 `phone_info`

2. 获取到的手机号信息 `phone_info.purePhoneNumber`在[12066600001, 12066600002...]中的，替换成业务需要的手机号，如 `13400000001`

### 通过云服务Mock手机号

1. 云函数中调用 `wx-server-sdk`的 [getOpenData接口](https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/cloudbase/cloudbase.getOpenData.html#%E4%BA%91%E8%B0%83%E7%94%A8)，通过 `cloudID`获取手机号信息 `phoneInfo`

2. 获取到的手机号信息 `phoneInfo.purePhoneNumber`在[12066600001, 12066600002...]中的，替换成业务需要的手机号，如 `13400000001`

3. 代码示例
```text
// 云函数 getOpenData
// getOpenData/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 获取openId云函数入口函数
exports.main = async (event, context) => {
  const res = await cloud.getOpenData({
    list: event.openData.list
  })
  for (let item of res.list) {
    if (item.data && item.data.purePhoneNumber && ["12066600001", "12066600002"].indexOf(item.data.purePhoneNumber) > -1) {
      // 获取手机号的请求且是测试号
      const mockPhoneInfo = {
        countryCode: "86",
        phoneNumber: "13400000001",
        purePhoneNumber: "13400000001",
        watermark: item.data.watermark
      }
      item.data = mockPhoneInfo
    }
  }
  return res.list
}
```
```text
// 小程序
// getPhoneNumber.wxml
<button open-type="getPhoneNumber" bindgetphonenumber="getPhoneNumber"></button>

// getPhoneNumber.js
Page({
    async getPhoneNumber(res) {
      const result = await wx.cloud.callFunction({
        name: 'getOpenData',
        data: {
          openData: {
            list: [res.detail.cloudID]
          }
        }
      })
      console.log("phone info is:", result.result[0].data)
    }
})
```
若需Mock虚拟账号定位或请求Request信息，可参考 [虚拟账号配置Mock信息](./mock_account.html)

## 代码示例
```text
// 云函数 getPhoneNumber
// getPhoneNumber/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 获取phoneNumber云函数入口函数
exports.main = async (event, context) => {
  const res = await cloud.openapi.phonenumber.getPhoneNumber({
    code: event.code
  })
  if (["12066600001", "12066600002"].indexOf(res.phoneInfo.purePhoneNumber) > -1) {
    const mockPhoneInfo = {
      countryCode: "86",
      phoneNumber: "13400000001",
      purePhoneNumber: "13400000001",
      watermark: res.phoneInfo.watermark
    }
    return mockPhoneInfo
  }
  return res.phoneInfo
}
```
```text
// 云函数 getPhoneNumber
// getPhoneNumber/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 获取phoneNumber云函数入口函数
exports.main = async (event, context) => {
  const res = await cloud.openapi.phonenumber.getPhoneNumber({
    code: event.code
  })
  if (["12066600001", "12066600002"].indexOf(res.phoneInfo.purePhoneNumber) > -1) {
    const mockPhoneInfo = {
      countryCode: "86",
      phoneNumber: "13400000001",
      purePhoneNumber: "13400000001",
      watermark: res.phoneInfo.watermark
    }
    return mockPhoneInfo
  }
  return res.phoneInfo
}
```
```text
// 小程序
// getPhoneNumber.wxml
<button open-type="getPhoneNumber" bindgetphonenumber="getPhoneNumber"></button>

// getPhoneNumber.js
Page({
    async getPhoneNumber(res) {
      const result = await wx.cloud.callFunction({
        name: 'getPhoneNumber',
        data: {
          code: res.detail.code
        }
      })
      console.log("phone info is:", result.result)
    }
})
```
```text
// 小程序
// getPhoneNumber.wxml
<button open-type="getPhoneNumber" bindgetphonenumber="getPhoneNumber"></button>

// getPhoneNumber.js
Page({
    async getPhoneNumber(res) {
      const result = await wx.cloud.callFunction({
        name: 'getPhoneNumber',
        data: {
          code: res.detail.code
        }
      })
      console.log("phone info is:", result.result)
    }
})
```
```text
// 云函数 getOpenData
// getOpenData/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 获取openId云函数入口函数
exports.main = async (event, context) => {
  const res = await cloud.getOpenData({
    list: event.openData.list
  })
  for (let item of res.list) {
    if (item.data && item.data.purePhoneNumber && ["12066600001", "12066600002"].indexOf(item.data.purePhoneNumber) > -1) {
      // 获取手机号的请求且是测试号
      const mockPhoneInfo = {
        countryCode: "86",
        phoneNumber: "13400000001",
        purePhoneNumber: "13400000001",
        watermark: item.data.watermark
      }
      item.data = mockPhoneInfo
    }
  }
  return res.list
}
```
```text
// 云函数 getOpenData
// getOpenData/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 获取openId云函数入口函数
exports.main = async (event, context) => {
  const res = await cloud.getOpenData({
    list: event.openData.list
  })
  for (let item of res.list) {
    if (item.data && item.data.purePhoneNumber && ["12066600001", "12066600002"].indexOf(item.data.purePhoneNumber) > -1) {
      // 获取手机号的请求且是测试号
      const mockPhoneInfo = {
        countryCode: "86",
        phoneNumber: "13400000001",
        purePhoneNumber: "13400000001",
        watermark: item.data.watermark
      }
      item.data = mockPhoneInfo
    }
  }
  return res.list
}
```
```text
// 小程序
// getPhoneNumber.wxml
<button open-type="getPhoneNumber" bindgetphonenumber="getPhoneNumber"></button>

// getPhoneNumber.js
Page({
    async getPhoneNumber(res) {
      const result = await wx.cloud.callFunction({
        name: 'getOpenData',
        data: {
          openData: {
            list: [res.detail.cloudID]
          }
        }
      })
      console.log("phone info is:", result.result[0].data)
    }
})
```
```text
// 小程序
// getPhoneNumber.wxml
<button open-type="getPhoneNumber" bindgetphonenumber="getPhoneNumber"></button>

// getPhoneNumber.js
Page({
    async getPhoneNumber(res) {
      const result = await wx.cloud.callFunction({
        name: 'getOpenData',
        data: {
          openData: {
            list: [res.detail.cloudID]
          }
        }
      })
      console.log("phone info is:", result.result[0].data)
    }
})
```
