# 开发辅助 / HTTP 调用

> **来源**: https://developers.weixin.qq.com/miniprogram/dev/devtools/http.html
> **提取时间**: 2026-02-19
> **文档类型**: 小程序
> **导航路径**: 开发辅助 /HTTP 调用 /

---

若需在不依赖开发者工具场景如自身业务工程流水线上进行小程序项目上传、预览，则推荐使用 [miniprogram-ci](./ci.html)

开发者工具提供了命令行与 HTTP 服务两种接口供外部调用，开发者可以通过命令行或 HTTP 请求指示工具进行登录、预览、上传等操作。

## HTTP V2

> 升级说明：自 1.02.202003092 开始，CLI & HTTP 接口升级 v2 版本，在 v2 版本中，旧版命令仍然可以使用，但已废弃并会在未来移除，请使用 v2 命令。v2 版本增加了云开发管理操作支持、优化命令形式、增加细致状态提示、支持长时间命令执行、支持国际化（中英文选择）等。

http 服务在工具启动后自动开启，HTTP 服务端口号在用户目录下记录，可通过检查用户目录、检查用户目录下是否有端口文件及尝试连接来判断工具是否安装/启动。

端口号文件位置：

macOS : `~/Library/Application Support/微信开发者工具/<MD5>/Default/.ide`

Windows :  `~/AppData/Local/微信开发者工具/User Data/<MD5>/Default/.ide`

> 注： MD5 的计算规则：MD5(`${installPath}${nwVersion}`)

> macOS: installPath == "/Applications/wechatwebdevtools.app/Contents/MacOS", nwVersion == '';

> Windoes: installPath == '微信开发者工具.exe 所在的路径', nwVersion 是 installPath 目录下有一个 version 文件（JSON 格式）中 latestNw 的值

## 接口索引

所有接口的 URL 路径前缀都需 `/v2`

| 分类 | 作用 | 接口 |
| --- | --- | --- |
| 登录 | [登录工具](#%E7%99%BB%E5%BD%95%E5%B7%A5%E5%85%B7) | /login |
|  | [是否登录工具](#%E6%98%AF%E5%90%A6%E5%B7%B2%E7%BB%8F%E7%99%BB%E5%BD%95%E5%B7%A5%E5%85%B7) | /islogin |
| 小程序代码 | [预览](#%E9%A2%84%E8%A7%88) | /preview |
|  | [上传代码](#%E4%B8%8A%E4%BC%A0%E4%BB%A3%E7%A0%81) | /upload |
|  | [自动预览](#%E8%87%AA%E5%8A%A8%E9%A2%84%E8%A7%88) | /autopreview |
|  | [构建 npm](#%E6%9E%84%E5%BB%BA-npm) | /buildnpm |
|  | [清除缓存](#%E6%B8%85%E9%99%A4%E5%B7%A5%E5%85%B7%E7%BC%93%E5%AD%98) | /cleancache |
| 工具窗口 | [启动工具](#%E5%90%AF%E5%8A%A8%E5%B7%A5%E5%85%B7) | /open |
|  | [关闭项目窗口](#%E5%85%B3%E9%97%AD%E9%A1%B9%E7%9B%AE%E7%AA%97%E5%8F%A3) | /close |
|  | [关闭工具](#%E5%85%B3%E9%97%AD%E5%B7%A5%E5%85%B7) | /quit |
|  | [重建文件监听](#%E9%87%8D%E5%BB%BA%E6%96%87%E4%BB%B6%E7%9B%91%E5%90%AC) | /resetfileutils |
| 云开发 | [云开发操作](#%E4%BA%91%E5%BC%80%E5%8F%91%E6%93%8D%E4%BD%9C) | /cloud |
|  | [云环境相关操作](#%E4%BA%91%E5%BC%80%E5%8F%91%E6%93%8D%E4%BD%9C) | /cloud/env |
|  | [云函数相关操作](#%E4%BA%91%E5%BC%80%E5%8F%91%E6%93%8D%E4%BD%9C) | /cloud/functions |
|  | [查看云环境列表](#%E6%9F%A5%E7%9C%8B%E4%BA%91%E7%8E%AF%E5%A2%83%E5%88%97%E8%A1%A8) | /cloud/env/list |
|  | [查看云函数列表](#%E6%9F%A5%E7%9C%8B%E4%BA%91%E5%87%BD%E6%95%B0%E5%88%97%E8%A1%A8) | /cloud/functions/list |
|  | [查看云函数信息](#%E6%9F%A5%E7%9C%8B%E4%BA%91%E5%87%BD%E6%95%B0%E4%BF%A1%E6%81%AF) | /cloud/functions/info |
|  | [上传云函数](#%E4%B8%8A%E4%BC%A0%E4%BA%91%E5%87%BD%E6%95%B0) | /cloud/functions/deploy |
|  | [增量上传云函数](#%E5%A2%9E%E9%87%8F%E4%B8%8A%E4%BC%A0%E4%BA%91%E5%87%BD%E6%95%B0) | /cloud/functions/inc-deploy |
|  | [下载云函数](#%E4%B8%8B%E8%BD%BD%E4%BA%91%E5%87%BD%E6%95%B0) | /cloud/functions/download |

## 通用项目选项

通用 URL 参数

| 参数 | 说明 |
| --- | --- |
| project | 项目路径 |
| appid | 小程序 AppID 或第三方平台 AppID。如果有提供 project，该选项将忽略 |
| ext-appid | 第三方平台开发时被开发 AppID。如果有提供 project，该选项将忽略 |

## 接口文档

### 登录工具

接口定义：

Path：`/v2/login`

HTTP 方法：GET

| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| qr-format | 否 | 指定登录二维码返回格式，可选值有 image、base64、terminal，默认 image。图片格式为 png |
| qr-output | 否 | 指定文件路径，在文件写入二维码数据。如指定，二维码将被写入指定路径的文件内，如未指定，二维码将作为请求相应体返回 |
| result-output | 否 | 指定输出登录结果文件路径 |

示例：
```bash
# 登录，返回图片格式的二维码

http://127.0.0.1:端口号/v2/login

# 登录，取 base64 格式二维码

http://127.0.0.1:端口号/v2/login?qr-format=base64

# 登录，取 base64 格式二维码，并写入 /Users/username/logincode.txt

http://127.0.0.1:端口号/v2/login?qr-format=base64&qr-output=%2FUsers%2Fusername%2Flogincode.txt

# 登录，并写入登录结果到 /Users/username/loginresult.json

http://127.0.0.1:端口号/v2/login?result-output=%2FUsers%2Fusername%2Floginresult.json
```

### 是否已经登录工具

接口定义：

Path：`/v2/islogin`

HTTP 方法：GET

示例
```bash
http://127.0.0.1:端口号/v2/islogin
```

### 预览

接口定义：

URL：`/v2/preview`

HTTP 方法：GET

| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| project | 是 | 预览指定路径中的项目。如项目已打开，自动刷新项目。如项目未创建，自动创建并预览项目 |
| qr-format | 否 | 指定登录二维码返回格式，可选值有 image、base64、terminal，默认 image。图片格式为 png |
| qr-output | 否 | 指定文件路径，在文件中写入二维码数据。如指定，二维码将被写入指定路径的文件内，如未指定，二维码将作为请求相应体返回 |
| info-output | 否 | 指定后，会将本次预览的额外信息以 json 格式输出至指定路径，如代码包大小、分包大小信息。 |
| compile-condition | 否 | 指定自定义编译条件，值为 json 字符串，条件可指定两个字段，`pathName` 表示打开的页面，不填表示首页，`query` 表示页面参数 |

示例：
```bash
# 预览路径为 /Users/username/demo 的项目，返回图片格式的二维码

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo

# 预览路径为 /Users/username/demo 的项目，返回 base64 格式的二维码

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&qr-format=base64

# 预览路径为 /Users/username/demo 的项目，返回 base64 格式的二维码，并写入 /Users/username/logincode.txt

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&qr-format=base64&qr-output=%2FUsers%2Fusername%2Flogincode.txt

# 预览路径为 /Users/username/demo 的项目，返回图片格式的二维码，并将预览信息输出至 /Users/username/info.json

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&info-output=%2Users%2username%2info.json

# 预览路径为 /Users/username/demo 的项目，指定自定义编译条件，启动页为 pages/index/index，参数为 x=1&y=2

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&compile-condition={"pathName":"pages/index/index","query":"a3=1"}
```

### 上传代码

接口定义：

URL：`/v2/upload`

HTTP 方法：GET

| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| project | 是 | 项目路径 |
| version | 是 | 版本号 |
| desc | 否 | 本次上传的版本备注 |
| info-output | 否 | 指定后，会将本次上传的额外信息以 json 格式输出至指定路径，如代码包大小、分包大小信息。 |

示例：
```bash
# 上传路径为 /Users/username/demo 的项目，指定版本号为 v1.0.0

http://127.0.0.1:端口号/v2/upload?project=%2FUsers%2Fusername%2Fdemo&version=v1.0.0

# 上传路径为 /Users/username/demo 的项目，指定版本号为 v1.0.0，并带上备注

http://127.0.0.1:端口号/v2/upload?project=%2FUsers%2Fusername%2Fdemo&version=v1.0.0&desc=test

# 上传路径为 /Users/username/demo 的项目，指定版本号为 v1.0.0，并将上传信息输出至 /Users/username/info.json

http://127.0.0.1:端口号/v2/upload?project=%2FUsers%2Fusername%2Fdemo&version=v1.0.0&info-output=%2Users%2username%2info.json
```

### 自动预览

接口定义：

URL：`/autopreview`

HTTP 方法：GET

| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| project | 是 | 指定路径中的项目。如项目已打开，自动刷新项目。如项目未创建，自动创建并自动预览项目 |
| info-output | 否 | 指定后，会将本次自动预览的额外信息以 json 格式输出至指定路径，如代码包大小、分包大小信息。 |

示例：
```bash
# 自动预览路径为 /Users/username/demo 的项目，返回图片格式的二维码，并将预览信息输出至 /Users/username/info.json

http://127.0.0.1:端口号/v2/autopreview?project=%2FUsers%2Fusername%2Fdemo&info-output=%2Users%2username%2info.json
```

### 构建 npm

接口定义：

URL：`/buildnpm`

HTTP 方法：GET

| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| project | 是 | 项目路径 |
| compile-type | 否 | 编译类型，`miniprogram` (默认) 或 `plugin` |

示例：
```bash
# 构建路径为 /Users/username/demo 的项目

http://127.0.0.1:端口号/v2/buildnpm?project=%2FUsers%2Fusername%2Fdemo&compile-type=miniprogram
```

### 启动工具

接口定义：

URL： `/open`

HTTP 方法: GET

| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| project | 否 | 打开指定路径中的项目。如项目已打开，自动刷新项目。如项目未创建，自动创建并打开项目。如不填，显示工具窗口 |

示例：
```bash
# 打开工具

http://127.0.0.1:端口号/v2/open

# 打开/刷新项目

http://127.0.0.1:端口号/v2/open?project=项目全路径
```
注意：

- 项目路径中必须含正确格式的 project.config.json 且其中有 appid 和 projectname 字段。

- 项目路径需经 URL encode

### 关闭项目窗口

接口定义：

URL：`/close`

HTTP 方法：GET

| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| project | 是 | 指定路径中的项目。 |

示例
```bash
http://127.0.0.1:端口号/v2/close?project=%2FUsers%2Fusername%2Fdemo
```
> 注：关闭项目时，会有弹窗提示是否阻止；如未阻止，将在 3 秒后关闭

### 关闭工具

接口定义：

URL：`/quit`

HTTP 方法：GET

示例
```bash
http://127.0.0.1:端口号/v2/quit
```
> 注：关闭开发者工具时，会有弹窗提示是否阻止；如未阻止，将在 3 秒后关闭

### 重建文件监听

重置工具内部文件缓存，重新监听项目文件。

URL: `/resetfileutils`

HTTP 方法：GET

示例
```bash
http://127.0.0.1:端口号/v2/resetfileutils?project=%2FUsers%2Fusername%2Fdemo
```

### 清除工具缓存

接口定义：

URL：`/cleancache`

HTTP 方法：GET

| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| project | 是 | 预览指定路径中的项目。如项目已打开，自动刷新项目。如项目未创建，自动创建并预览项目 |
| clean | 是 | 指定要清除的缓存类型，可选值有 storage(数据)、file(文件)、seeion(登陆)、auth(授权)、network(网络)、compile(编译)、all(所有) |

示例
```bash
http://127.0.0.1:端口号/v2/cleancache?clean%3Dstorage%26project%3D%2FUsers%2Fxxx%2Fminiprogram-10
```

### 云开发操作

在云开发命令中，除非特殊说明，均可通过指定 `project` 选项或 `appid` （如果是第三方平台则还加上 `ext-appid`）两者二选一的方式进行指定项目。

#### 查看云环境列表
```text
GET /v2/cloud/env/list
```
示例：
```bash
# 通过 project 查看

http://127.0.0.1:端口号/v2/cloud/env/list?project=%2FUsers%2Fusername%2Fdemo

# 通过 appid 查看

http://127.0.0.1:端口号/v2/cloud/env/list?appid=wx1111111111111
```

#### 查看云函数列表
```text
GET /v2/cloud/functions/list
```
| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| env | 是 | 云环境 ID |

示例：
```bash
# 通过 --project 查看环境 test-123 下的线上云函数

http://127.0.0.1:端口号/v2/cloud/?env=test-123&project=%2FUsers%2Fusername%2Fdemo

# 通过 --appid 查看环境 test-123 下的线上云函数

http://127.0.0.1:端口号/v2/cloud/?env=test-123&appid=wx1111111111111
```

#### 查看云函数信息
```text
GET /v2/cloud/functions/info
```
| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| env | 是 | 云环境 ID |
| names | 是 | 云函数名称，多个云函数则以逗号分隔 |

示例：
```bash
# 通过 --project 查看环境 test-123 下的云函数 aaa, bbb 的信息

http://127.0.0.1:端口号/v2/cloud/functions/info?env=test-123&names=aaa,bbb&project=%2FUsers%2Fusername%2Fdemo

# 通过 --appid 查看环境 test-123 下的云函数 aaa, bbb 的信息

http://127.0.0.1:端口号/v2/cloud/functions/list?env=test-123&names=aaa,bbb&appid=wx1111111111111
```

#### 上传云函数
```text
GET /v2/cloud/functions/deploy
```
| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| env | 是 | 云环境 ID |
| names | 否 | 云函数名称，多个云函数则以逗号分隔。将会在 project.config.json 中指定的 "cloudfunctionRoot" 目录下找同名文件夹。若使用，则必须提供 project 选项 |
| paths | 否 | 需要部署的云函数目录路径，多个则以空格分隔。将认为函数目录名即为函数名称。使用该选项则云函数目录组织结构不用遵循必须在 project.config.json "cloudfunctionRoot" 的方式 |
| remote-npm-install | 否 | 云端安装依赖，指定选项后 node_modules 将不会上传 |

示例：
```bash
# 上传云函数根目录下名为 func_a, func_b 的两个云函数至云环境 ENVID，开启云端安装依赖

http://127.0.0.1:端口号/v2/cloud/functions/deploy?env=ENVID&remote-npm-install&names=func_a,func_b&project=%2Faaa%2Fbbb%2Fccc

# 指定绝对路径目录上传，开启云端安装依赖

http://127.0.0.1:端口号/v2/cloud/functions/deploy?env=ENVID&remote-npm-install&paths=%2Fa%2Fb%2Ffunc_a,%2Fx%2Fy%2Ffunc_b&appid=APPID
```

#### 增量上传云函数
```text
GET /v2/cloud/functions/inc-deploy
```
| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| env | 是 | 云环境 ID |
| name | 否 | 需要更新的云函数名，使用该选项则不应使用 path 选项。将会在 project.config.json 中指定的 "cloudfunctionRoot" 目录下找同名文件夹。若使用，则必须提供 project 选项 |
| path | 否 | 云函数目录，使用该选项则不应使用 name 选项。将认为函数目录名即为函数名称。使用该选项则云函数目录组织结构不用遵循必须在 project.config.json "cloudfunctionRoot" 的方式 |
| file | 否 | 需要增量更新的相对文件/目录路径，路径必须是相对云函数目录的路径 |

示例：
```bash
# 增量上传，指定云函数名

http://127.0.0.1:端口号/v2/cloud/functions/inc-deploy?env=ENVID&name=func_a&file=index.js&project=%2Faaa%2Fbbb%2Fccc

# 增量上传，指定云函数路径

http://127.0.0.1:端口号/v2/cloud/functions/inc-deploy?env=ENVID&path=%2Faaa%2Ffunc_a&file=index.js&appid=APPID
```

#### 下载云函数
```text
GET /v2/cloud/functions/download
```
| URL 参数 | 必填 | 说明 |
| --- | --- | --- |
| env | 是 | 云环境 ID |
| name | 否 | 云函数名 |
| path | 否 | 下载后的存放位置 |

示例：
```bash
# 下载云函数 func_a 至 /xxx/yyy 目录

http://127.0.0.1:端口号/v2/cloud/functions/download?env=ENVID&name=func_a&path=%2Fxxx%2Fyyy&appid=APPID
```

## 代码示例
```bash
# 登录，返回图片格式的二维码

http://127.0.0.1:端口号/v2/login

# 登录，取 base64 格式二维码

http://127.0.0.1:端口号/v2/login?qr-format=base64

# 登录，取 base64 格式二维码，并写入 /Users/username/logincode.txt

http://127.0.0.1:端口号/v2/login?qr-format=base64&qr-output=%2FUsers%2Fusername%2Flogincode.txt

# 登录，并写入登录结果到 /Users/username/loginresult.json

http://127.0.0.1:端口号/v2/login?result-output=%2FUsers%2Fusername%2Floginresult.json
```
```bash
# 登录，返回图片格式的二维码

http://127.0.0.1:端口号/v2/login

# 登录，取 base64 格式二维码

http://127.0.0.1:端口号/v2/login?qr-format=base64

# 登录，取 base64 格式二维码，并写入 /Users/username/logincode.txt

http://127.0.0.1:端口号/v2/login?qr-format=base64&qr-output=%2FUsers%2Fusername%2Flogincode.txt

# 登录，并写入登录结果到 /Users/username/loginresult.json

http://127.0.0.1:端口号/v2/login?result-output=%2FUsers%2Fusername%2Floginresult.json
```
```bash
http://127.0.0.1:端口号/v2/islogin
```
```bash
http://127.0.0.1:端口号/v2/islogin
```
```bash
# 预览路径为 /Users/username/demo 的项目，返回图片格式的二维码

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo

# 预览路径为 /Users/username/demo 的项目，返回 base64 格式的二维码

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&qr-format=base64

# 预览路径为 /Users/username/demo 的项目，返回 base64 格式的二维码，并写入 /Users/username/logincode.txt

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&qr-format=base64&qr-output=%2FUsers%2Fusername%2Flogincode.txt

# 预览路径为 /Users/username/demo 的项目，返回图片格式的二维码，并将预览信息输出至 /Users/username/info.json

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&info-output=%2Users%2username%2info.json

# 预览路径为 /Users/username/demo 的项目，指定自定义编译条件，启动页为 pages/index/index，参数为 x=1&y=2

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&compile-condition={"pathName":"pages/index/index","query":"a3=1"}
```
```bash
# 预览路径为 /Users/username/demo 的项目，返回图片格式的二维码

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo

# 预览路径为 /Users/username/demo 的项目，返回 base64 格式的二维码

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&qr-format=base64

# 预览路径为 /Users/username/demo 的项目，返回 base64 格式的二维码，并写入 /Users/username/logincode.txt

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&qr-format=base64&qr-output=%2FUsers%2Fusername%2Flogincode.txt

# 预览路径为 /Users/username/demo 的项目，返回图片格式的二维码，并将预览信息输出至 /Users/username/info.json

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&info-output=%2Users%2username%2info.json

# 预览路径为 /Users/username/demo 的项目，指定自定义编译条件，启动页为 pages/index/index，参数为 x=1&y=2

http://127.0.0.1:端口号/v2/preview?project=%2FUsers%2Fusername%2Fdemo&compile-condition={"pathName":"pages/index/index","query":"a3=1"}
```
```bash
# 上传路径为 /Users/username/demo 的项目，指定版本号为 v1.0.0

http://127.0.0.1:端口号/v2/upload?project=%2FUsers%2Fusername%2Fdemo&version=v1.0.0

# 上传路径为 /Users/username/demo 的项目，指定版本号为 v1.0.0，并带上备注

http://127.0.0.1:端口号/v2/upload?project=%2FUsers%2Fusername%2Fdemo&version=v1.0.0&desc=test

# 上传路径为 /Users/username/demo 的项目，指定版本号为 v1.0.0，并将上传信息输出至 /Users/username/info.json

http://127.0.0.1:端口号/v2/upload?project=%2FUsers%2Fusername%2Fdemo&version=v1.0.0&info-output=%2Users%2username%2info.json
```
```bash
# 上传路径为 /Users/username/demo 的项目，指定版本号为 v1.0.0

http://127.0.0.1:端口号/v2/upload?project=%2FUsers%2Fusername%2Fdemo&version=v1.0.0

# 上传路径为 /Users/username/demo 的项目，指定版本号为 v1.0.0，并带上备注

http://127.0.0.1:端口号/v2/upload?project=%2FUsers%2Fusername%2Fdemo&version=v1.0.0&desc=test

# 上传路径为 /Users/username/demo 的项目，指定版本号为 v1.0.0，并将上传信息输出至 /Users/username/info.json

http://127.0.0.1:端口号/v2/upload?project=%2FUsers%2Fusername%2Fdemo&version=v1.0.0&info-output=%2Users%2username%2info.json
```
```bash
# 自动预览路径为 /Users/username/demo 的项目，返回图片格式的二维码，并将预览信息输出至 /Users/username/info.json

http://127.0.0.1:端口号/v2/autopreview?project=%2FUsers%2Fusername%2Fdemo&info-output=%2Users%2username%2info.json
```
```bash
# 自动预览路径为 /Users/username/demo 的项目，返回图片格式的二维码，并将预览信息输出至 /Users/username/info.json

http://127.0.0.1:端口号/v2/autopreview?project=%2FUsers%2Fusername%2Fdemo&info-output=%2Users%2username%2info.json
```
```bash
# 构建路径为 /Users/username/demo 的项目

http://127.0.0.1:端口号/v2/buildnpm?project=%2FUsers%2Fusername%2Fdemo&compile-type=miniprogram
```
```bash
# 构建路径为 /Users/username/demo 的项目

http://127.0.0.1:端口号/v2/buildnpm?project=%2FUsers%2Fusername%2Fdemo&compile-type=miniprogram
```
```bash
# 打开工具

http://127.0.0.1:端口号/v2/open

# 打开/刷新项目

http://127.0.0.1:端口号/v2/open?project=项目全路径
```
```bash
# 打开工具

http://127.0.0.1:端口号/v2/open

# 打开/刷新项目

http://127.0.0.1:端口号/v2/open?project=项目全路径
```
```bash
http://127.0.0.1:端口号/v2/close?project=%2FUsers%2Fusername%2Fdemo
```
```bash
http://127.0.0.1:端口号/v2/close?project=%2FUsers%2Fusername%2Fdemo
```
```bash
http://127.0.0.1:端口号/v2/quit
```
```bash
http://127.0.0.1:端口号/v2/quit
```
```bash
http://127.0.0.1:端口号/v2/resetfileutils?project=%2FUsers%2Fusername%2Fdemo
```
```bash
http://127.0.0.1:端口号/v2/resetfileutils?project=%2FUsers%2Fusername%2Fdemo
```
```bash
http://127.0.0.1:端口号/v2/cleancache?clean%3Dstorage%26project%3D%2FUsers%2Fxxx%2Fminiprogram-10
```
```bash
http://127.0.0.1:端口号/v2/cleancache?clean%3Dstorage%26project%3D%2FUsers%2Fxxx%2Fminiprogram-10
```
```text
GET /v2/cloud/env/list
```
```text
GET /v2/cloud/env/list
```
```bash
# 通过 project 查看

http://127.0.0.1:端口号/v2/cloud/env/list?project=%2FUsers%2Fusername%2Fdemo

# 通过 appid 查看

http://127.0.0.1:端口号/v2/cloud/env/list?appid=wx1111111111111
```
```bash
# 通过 project 查看

http://127.0.0.1:端口号/v2/cloud/env/list?project=%2FUsers%2Fusername%2Fdemo

# 通过 appid 查看

http://127.0.0.1:端口号/v2/cloud/env/list?appid=wx1111111111111
```
```text
GET /v2/cloud/functions/list
```
```text
GET /v2/cloud/functions/list
```
```bash
# 通过 --project 查看环境 test-123 下的线上云函数

http://127.0.0.1:端口号/v2/cloud/?env=test-123&project=%2FUsers%2Fusername%2Fdemo

# 通过 --appid 查看环境 test-123 下的线上云函数

http://127.0.0.1:端口号/v2/cloud/?env=test-123&appid=wx1111111111111
```
```bash
# 通过 --project 查看环境 test-123 下的线上云函数

http://127.0.0.1:端口号/v2/cloud/?env=test-123&project=%2FUsers%2Fusername%2Fdemo

# 通过 --appid 查看环境 test-123 下的线上云函数

http://127.0.0.1:端口号/v2/cloud/?env=test-123&appid=wx1111111111111
```
```text
GET /v2/cloud/functions/info
```
```text
GET /v2/cloud/functions/info
```
```bash
# 通过 --project 查看环境 test-123 下的云函数 aaa, bbb 的信息

http://127.0.0.1:端口号/v2/cloud/functions/info?env=test-123&names=aaa,bbb&project=%2FUsers%2Fusername%2Fdemo

# 通过 --appid 查看环境 test-123 下的云函数 aaa, bbb 的信息

http://127.0.0.1:端口号/v2/cloud/functions/list?env=test-123&names=aaa,bbb&appid=wx1111111111111
```
```bash
# 通过 --project 查看环境 test-123 下的云函数 aaa, bbb 的信息

http://127.0.0.1:端口号/v2/cloud/functions/info?env=test-123&names=aaa,bbb&project=%2FUsers%2Fusername%2Fdemo

# 通过 --appid 查看环境 test-123 下的云函数 aaa, bbb 的信息

http://127.0.0.1:端口号/v2/cloud/functions/list?env=test-123&names=aaa,bbb&appid=wx1111111111111
```
```text
GET /v2/cloud/functions/deploy
```
```text
GET /v2/cloud/functions/deploy
```
```bash
# 上传云函数根目录下名为 func_a, func_b 的两个云函数至云环境 ENVID，开启云端安装依赖

http://127.0.0.1:端口号/v2/cloud/functions/deploy?env=ENVID&remote-npm-install&names=func_a,func_b&project=%2Faaa%2Fbbb%2Fccc

# 指定绝对路径目录上传，开启云端安装依赖

http://127.0.0.1:端口号/v2/cloud/functions/deploy?env=ENVID&remote-npm-install&paths=%2Fa%2Fb%2Ffunc_a,%2Fx%2Fy%2Ffunc_b&appid=APPID
```
```bash
# 上传云函数根目录下名为 func_a, func_b 的两个云函数至云环境 ENVID，开启云端安装依赖

http://127.0.0.1:端口号/v2/cloud/functions/deploy?env=ENVID&remote-npm-install&names=func_a,func_b&project=%2Faaa%2Fbbb%2Fccc

# 指定绝对路径目录上传，开启云端安装依赖

http://127.0.0.1:端口号/v2/cloud/functions/deploy?env=ENVID&remote-npm-install&paths=%2Fa%2Fb%2Ffunc_a,%2Fx%2Fy%2Ffunc_b&appid=APPID
```
```text
GET /v2/cloud/functions/inc-deploy
```
```text
GET /v2/cloud/functions/inc-deploy
```
```bash
# 增量上传，指定云函数名

http://127.0.0.1:端口号/v2/cloud/functions/inc-deploy?env=ENVID&name=func_a&file=index.js&project=%2Faaa%2Fbbb%2Fccc

# 增量上传，指定云函数路径

http://127.0.0.1:端口号/v2/cloud/functions/inc-deploy?env=ENVID&path=%2Faaa%2Ffunc_a&file=index.js&appid=APPID
```
```bash
# 增量上传，指定云函数名

http://127.0.0.1:端口号/v2/cloud/functions/inc-deploy?env=ENVID&name=func_a&file=index.js&project=%2Faaa%2Fbbb%2Fccc

# 增量上传，指定云函数路径

http://127.0.0.1:端口号/v2/cloud/functions/inc-deploy?env=ENVID&path=%2Faaa%2Ffunc_a&file=index.js&appid=APPID
```
```text
GET /v2/cloud/functions/download
```
```text
GET /v2/cloud/functions/download
```
```bash
# 下载云函数 func_a 至 /xxx/yyy 目录

http://127.0.0.1:端口号/v2/cloud/functions/download?env=ENVID&name=func_a&path=%2Fxxx%2Fyyy&appid=APPID
```
```bash
# 下载云函数 func_a 至 /xxx/yyy 目录

http://127.0.0.1:端口号/v2/cloud/functions/download?env=ENVID&name=func_a&path=%2Fxxx%2Fyyy&appid=APPID
```
