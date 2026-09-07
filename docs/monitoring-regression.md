# 网络与日志监听修复及能力回归

本文保留 2026-09-05 的历史结果。F1–F4、L1 的后续修复及最新矩阵见 [检测问题回归报告](detected-issues-regression.md)。

验证日期：2026-09-05。生产修复限于网络采集与日志采集；其他发现只记录。保留开始本轮前已有工作区改动，未修改 `playground/wx`，未手改构建产物。

## 交付与验证结论

- 网络：通过 evaluate 安装 wx 三种网络方法和当前应用 `$xfetch.requestAdapter` 的包装，保存/恢复属性描述符。直接返回原生任务/Promise，透传回调参数、上下文和异常；两层采集共享内部请求标识。安装幂等、部分失败回滚、迟到操作隔离、失败恢复重试及第三方替换保护均有运行时测试。
- 日志：独立包装 console，使用最多 1000 条的事件队列和单调序号同步；不订阅 SDK console 事件，不重复调用 `App.enableLog`。异常单独监听，列表/详情/诊断读取、导航分段、停止及断开前同步。相同文本的多次调用分别保留。
- 公开接口：31 工具、2 资源，minimal/core/full 为 10/20/31；工具参数、默认 profile、`schemaVersion: "2.0"` 信封不变。

质量门禁：生产类型检查、测试类型检查、467 项单元测试、改动文件 ESLint、构建、脚本语法与文档 UTF-8 检查通过。严格全量集成 **58 通过、2 失败（共 60）**；失败是独立 project 启动和完整 stdio 能力矩阵。最终单独运行 stdio 矩阵仍按预期以非零退出码保留未修复问题及环境阻塞，不能据此宣称全量通过。

证据：[逐场景结果 JSON](../tasks/monitoring-regression/capability-cases.json)、[红灯用例、质量门禁、启动失败及清理原始输出](../tasks/monitoring-regression/evidence.txt)。逐场景结果与质量门禁计数含义不同：已有集成测试中的空结果/允许异常不作为以下能力通过的依据。

## 两项修复的真实业务对照

通过官方 MCP SDK `Client` + `StdioClientTransport` 调用构建后的 `build/server.js`，连接实际业务 DevTools。验收读取 MCP 列表、详情、信封及实际业务结果，不以直接调用 handler 或读取采集缓存替代。

| 对照项目 | 结果 |
| --- | --- |
| 未监听、监听中、停止后：request 成功、连接失败、超时、abort | 通过；每次仅一次 success 或 fail，随后一次 complete；参数数量、结果对象关系、上下文一致 |
| 原生任务对象能力 | 通过；三阶段 abort、headers、progress 方法保持；abort 实际中止请求。运行时单测另验证对象身份及回调异常原样传播 |
| 上传内容 | 通过；本地 HTTP 服务确认 multipart 包含完整 UTF-8 文件和 formData |
| 下载内容 | 通过；使用文件系统读取返回路径，内容与服务端一致 |
| Mpx requestAdapter 成功、失败、取消 | 通过；三阶段结果一致，取消保留 `__CANCEL__`；单测另验证原 Promise 对象身份 |
| 监听去重 | 通过；6 次原生调用 + 3 次 Mpx 调用恰好 9 条记录；停止后确实执行请求，新增记录为 0 |
| 日志重连 | 通过；连续 5 次重连，每轮同文本打印两次均为 2 条，重复读取不增量复制 |
| 日志类型与异常 | 通过；log/warn/error、info/debug/dir/assert 及异步异常；分页、类型过滤和详情检查通过 |
| 导航日志历史 | 通过；导航前日志在历史中恰好一条，当前分段不再包含，旧 msgid 仍能查询 |
| 停止与清空 | 通过；监听状态更新、队列清空、停止恢复、迟到读隔离和本地服务清理有验证 |

限制：当前应用的 `requestAdapter` 被覆盖；其他新建 XFetch 实例、queue adapter、未实现的 console 方法不计入本轮覆盖。队列有界，长时间不读取会淘汰旧记录。网络采集不对 HTTP 状态码重新解释业务 success/fail。

## 31 个工具与 2 个资源矩阵

“通过”仅表示表中明确列出的分支。夹具不具备时标记环境阻塞，不将缺少元素导致的异常当作负向断言通过。

| 工具 / 资源 | 状态 | 已验证与限制 |
| --- | --- | --- |
| connect_devtools | 发现缺陷 | wsEndpoint 成功；browserUrl 使用受控 `/json/version` 指向真实 DevTools 成功；project、discover 失败，见 F1/F2 |
| reconnect_devtools | 通过 | 无参复用连接参数；连续重连 5 次及日志检查。有参完整替换由单元测试覆盖，真实分支未覆盖 |
| disconnect_devtools | 通过 | disconnected 状态、监听停止和 transport 关闭 |
| get_connection_status | 通过 | refreshHealth、连接/断开状态与监听状态 |
| get_current_page | 通过 | 实际业务页面与结构化结果 |
| get_page_snapshot | 通过 | 真实页面非空快照与 observation；独立嵌套组件夹具被环境阻塞 |
| find_elements | 通过 | 真实 text 元素、数量和 opaque ref；嵌套夹具分支阻塞 |
| wait_for | 通过 | 真实元素等待成功、缺失 target 超时；消失/可见性变化分支未覆盖 |
| click | 环境阻塞 | 可控计数器夹具不在已编译业务包中；独立工程运行时不可用 |
| input_text | 环境阻塞 | 替换/追加/清空回归代码已提供；运行页面没有可控 input，未假定成功 |
| get_value | 发现缺陷 | 实际 class 属性回读通过；导航后旧 ref 错误码差异，见 F4 |
| set_form_control | 环境阻塞 | 独立 switch/slider/picker 夹具不可用，正向控件验收未完成 |
| assert_text | 通过 | 真实文本精确匹配与故意不匹配；失败 partialData.passed=false |
| assert_attribute | 通过 | 真实 class 正向/负向断言 |
| assert_state | 通过 | enabled 正向/负向断言；checked/focused 等其他状态未覆盖 |
| navigate_to | 通过 | 真实已有 home 路由及页面变化；磁盘新增夹具路径尚未编译 |
| navigate_back | 通过 | 导航后返回之前真实页面；嵌套夹具场景阻塞 |
| switch_tab | 环境阻塞 | 非 tab 路径失败分支通过；真实 tabBar 成功切换被独立工程阻塞 |
| relaunch | 通过 | 重新启动并回到原业务路由 |
| evaluate_script | 发现缺陷 | 同步、Promise、抛错/拒绝分支通过；命名 async 函数失败，见 F3 |
| list_console_messages | 通过 | 日志类型、异常、分页、过滤、相同文本、重复同步、5 次重连及导航历史 |
| get_console_message | 通过 | 重连每轮的详情和导航后稳定 msgid |
| list_network_requests | 通过 | 实际 9 请求唯一记录、URL 过滤、停止后的零新增（请求确实执行） |
| get_network_request | 通过 | 真实采集请求详情 |
| stop_network_monitoring | 通过 | 恢复后业务语义对照与状态 |
| clear_network_requests | 通过 | 本地/远端清空后再读为零，且清空前已有实际记录 |
| screenshot | 通过 | 非空 PNG 字节与签名 |
| diagnose_connection | 通过 | 真实项目路径、依赖及监听诊断输出 |
| check_environment | 通过 | 实际依赖加载、连接与环境诊断 |
| debug_page_elements | 通过 | 显式 view 选择器返回非零元素。通配符等策略的 SDK 限制另记 L1，不算那些策略通过 |
| debug_connection_flow | 通过 | dryRun 报告与状态快照；实际连接分支未覆盖，project 启动问题独立保留 |
| weixin://connection/status | 通过 | 两资源列表、连接/断开、profile/category 及监听状态 |
| weixin://page/snapshot | 通过 | 非空 scopes 和 edges 字段；多组件边界场景被夹具阻塞 |

## 未修复发现与最小复现

### F1 — project 启动失败

调用 `connect_devtools`，参数如下（替换为仓库绝对路径）：

```json
{"target":{"kind":"project","projectPath":"/repo/tests/fixtures/monitoring-app","cliPath":"/Applications/wechatwebdevtools.app/Contents/MacOS/cli","autoPort":9431},"timeoutMs":15000,"healthCheck":false}
```

实际：launch 报 `Cannot read properties of undefined (reading 'split')`；随后 connect 报端口已占用且无法验证归属，返回 `CONNECTION_FAILED`。独立端点初期能返回 `Tool.getInfo.version=2.02.2607271`，但没有 SDKVersion；DevTools 日志另有 `routeTo appLaunch timeout`。CLI trust-project、重新打开和本地临时使用已有 AppID 后仍不可用；夹具配置已恢复 touristappid。

影响：新工程无法通过该环境完成 project 链路，阻塞控件和 tabBar 验收。根因尚未归因于 MCP 或 DevTools，本轮不修改启动代码。已有 wsEndpoint 成功不能抵消这一失败。

### F2 — discover 无法发现实际可连接端点

同一环境中 `connect_devtools({target:{kind:"wsEndpoint",endpoint:"ws://127.0.0.1:9420"},healthCheck:false})` 成功，而 `connect_devtools({target:{kind:"discover"},timeoutMs:5000,healthCheck:false})` 返回“未检测到可用的微信开发者工具自动化端口”。

影响：自动发现不可用，显式端点可继续工作。浏览器地址分支已用受控发现服务加真实 DevTools 验证；不代表本机 IDE 原生提供 `/json/version`。

### F3 — 命名 async 函数声明失败

```json
{"function":"async function test() { await Promise.resolve(); return 42; }"}
```

`evaluate_script` 返回 `DEVTOOLS_OPERATION_FAILED`：`await is only valid in async functions and the top level bodies of modules`。普通函数返回 Promise，以及 `(...args) => (async function ...)(...args)` 包装可执行。影响：工具描述允许函数声明，但此命名 async 形式不可用；本轮只在测试 Harness 使用可执行形式，不更改生产脚本工具。

### F4 — 导航后旧 ref 的错误码差异

先以 `find_elements({locator:{kind:"selector",value:"text"}})` 获取实际 ref；`navigate_to({url:"/pages/home/index"})` 后，用旧 ref 调用 `get_value`。实际为 `ELEMENT_NOT_FOUND`，回归预期为 `STALE_ELEMENT`。

影响：客户端无法根据错误码区分已过期引用和从未存在的元素。记录为契约差异，未修改 ref/页面状态实现。

### L1 — 诊断选择器限制

`debug_page_elements({testAllStrategies:true})` 中 `*`、`body *`、`html *`、`page > *`、`[data-*]`、`[wx:*]` 被 SDK 转换后遭拒；具体 `view/text/button` 查询能返回元素。该工具如实输出这些失败；验收只将具体有效选择器判为通过，不将捕获异常视作通配策略成功。

## 夹具与清理

- 独立夹具位于 [tests/fixtures/monitoring-app](../tests/fixtures/monitoring-app/)，包含 tabBar、input/textarea、switch/slider/picker、条件节点和组件边界。当前本机运行时初始化受 F1 阻塞。
- `playground/wx` 原有 `pages/mcp-fixture/index` 在磁盘存在，但运行中的包返回 page not found；未修改业务工程或借此伪装点击/输入验收成功。
- 正常完成的矩阵客户端均验证 disconnected 状态后关闭 transport；临时 HTTP server 关闭，临时上传/下载文件在 finally 中删除。清理脚本再次验证 console/network 的 active=false、patches=0、临时文件=0。
- 独立夹具 DevTools 项目已关闭，9431 无监听；保留用户原有 9420 DevTools 和应用管理的 MCP 进程。

复跑命令见 [Testing Guide](testing-guide.md)。清理复核可运行 `node tests/manual/monitoring/cleanup.mjs`。完整矩阵保留失败退出码；修复本轮范围外的问题或恢复夹具环境后才能达成全绿。若需回滚，仅撤销本轮 Collector、runtime、Context 同步接入及相应测试文档增量，然后执行 `npm run build`，不要重置用户其他改动。
