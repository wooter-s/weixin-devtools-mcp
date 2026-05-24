# 开发辅助 / API Mock

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/api-mock.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 开发辅助 /API Mock /

---

## API Mock

为了让开发者更方便地开发小程序，开发者工具提供了 API Mock 的能力，可以模拟部分 API 的调用结果。

## 运行环境

- 下载并安装 `1.02.2003062`或以上版本的开发者工具， [下载地址](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。

## 使用方法

### 基础用法

Mock 的入口在工具调试面板顶部的 Tab，点 + 新建规则

规则示例

运行如下代码：
```javascript
wx.request({
  url: 'https://example.com/ajax?dataType=member',
  dataType: 'json',
  success(res) {
    console.log(res)
  }
})
```
将命中上面的规则，得到以下数据：

### 规则优先级

当对一个 API 配置了多个规则时，**靠前的规则，会优先匹配**，当一条规则被命中，后面的规则将不会再被执行。

可以通过拖拽的形式，改变规则的优先顺序，得到想要的 Mock 结果。

### 多层级参数匹配

如果匹配的参数类型不是一个基本类型，而是一个 Object 参数下的某个属性，这时需要用到多层级匹配。

例如：当`wx.request`调用的`data`参数带有一个名为`mock`的属性值为`true`的时候，才通过 Mock 规则返回结果，参数匹配规则应填写：

上述例子中的`wx.request`调用，需要修改成：
```javascript
wx.request({
  url: 'https://example.com/ajax?dataType=member',
  data: {         // \
    mock: true	  // - 添加这三行
  },              // /
  dataType: 'json',
  success(res) {
    console.log(res)
  }
})
```
才能命中此规则。

### 使用数据模板

当需要模拟的数据比较复杂的时候，可以使用数据模板快速生成符合你要求的数据。

> 数据模板的语法采用自开源库 Mock.js，详细的语法可以在该项目文档中查看。

例如：上面的例子，想要返回的 list 包含 10 项不同的数据，可以在“数据生成”中选择“数据模板”，填入如下模板：
```javascript
{
  "data": {
    "list|10": [
      {"id|+1": 1, "name": "@FIRST"}
    ]
  },
  "statusCode": 200,
  "header": {
    "content-type": "application/json; charset=utf-8"
  }
}
```
模板编辑器下方会根据模板实时生成数据预览，方便确认模板的正确性。

重新调用上面的代码，将返回：

### 规则导入导出

当需要与项目中其他成员共享规则时，可以在 Mock 中导出规则配置，再把配置文件发送给其他成员导入即可，操作入口如图：

## 注意事项

- 规则匹配中的正则表达式均不区分大小写；

- `wx.request`中暂时无法使用 `dataType`参数进行匹配；

- 在匹配规则中的参数名中，“.”属于特殊字符，如果要匹配的参数名中包含“.”将无法匹配成功，例如 ```javascript
{
    "propName": {
      "key": "value",
      // 通过 propName.namespace1.key 无法匹配到此参数，应尽量避免这种情况。

      "namespace1.key": "value1"

    }
  }
```
- 蓝牙模块相关的 API，实际调用中需要先调用 `wx.openBluetoothAdapter`进行初始化，但是在 Mock 的规则命中后将没有这些限制，需要注意 - getBLEDeviceServices

- getBLEDeviceCharacteristics

- createBLEConnection

- closeBLEConnection

- writeBLECharacteristicValue

- startBluetoothDevicesDiscovery

- stopBluetoothDevicesDiscovery

- getConnectedBluetoothDevices

- getBluetoothDevices

- getBluetoothAdapterState

- closeBluetoothAdapter

- 目前支持Mock 的 API 列表： - request

- downloadFile

- getLocation

- checkSession

- requestPayment

- startSoterAuthentication

- checkIsSupportSoterAuthentication

- checkIsSoterEnrolledInDevice

- startBeaconDiscovery

- stopBeaconDiscovery

- getBeacons

- startWifi

- stopWifi

- getConnectedWifi

- connectWifi

- getBLEDeviceServices

- getBLEDeviceCharacteristics

- createBLEConnection

- closeBLEConnection

- writeBLECharacteristicValue

- startBluetoothDevicesDiscovery

- stopBluetoothDevicesDiscovery

- openBluetoothAdapter

- getConnectedBluetoothDevices

- getBluetoothDevices

- getBluetoothAdapterState

- closeBluetoothAdapter

- stopHCE

- startHCE

- sendHCEMessage

- getHCEState

- setBackgroundFetchToken

- getBackgroundFetchToken

- getBackgroundFetchData

## 代码示例
```javascript
wx.request({
  url: 'https://example.com/ajax?dataType=member',
  dataType: 'json',
  success(res) {
    console.log(res)
  }
})
```
```javascript
wx.request({
  url: 'https://example.com/ajax?dataType=member',
  dataType: 'json',
  success(res) {
    console.log(res)
  }
})
```
```javascript
wx.request({
  url: 'https://example.com/ajax?dataType=member',
  data: {         // \
    mock: true	  // - 添加这三行
  },              // /
  dataType: 'json',
  success(res) {
    console.log(res)
  }
})
```
```javascript
wx.request({
  url: 'https://example.com/ajax?dataType=member',
  data: {         // \
    mock: true	  // - 添加这三行
  },              // /
  dataType: 'json',
  success(res) {
    console.log(res)
  }
})
```
```javascript
{
  "data": {
    "list|10": [
      {"id|+1": 1, "name": "@FIRST"}
    ]
  },
  "statusCode": 200,
  "header": {
    "content-type": "application/json; charset=utf-8"
  }
}
```
```javascript
{
  "data": {
    "list|10": [
      {"id|+1": 1, "name": "@FIRST"}
    ]
  },
  "statusCode": 200,
  "header": {
    "content-type": "application/json; charset=utf-8"
  }
}
```
```javascript
{
    "propName": {
      "key": "value",
      // 通过 propName.namespace1.key 无法匹配到此参数，应尽量避免这种情况。

      "namespace1.key": "value1"

    }
  }
```
```javascript
{
    "propName": {
      "key": "value",
      // 通过 propName.namespace1.key 无法匹配到此参数，应尽量避免这种情况。

      "namespace1.key": "value1"

    }
  }
```
