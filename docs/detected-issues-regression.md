# 检测问题修复与回归

验证日期：2026-09-06。先补用例并保存旧实现失败，再修生产实现，最后验证。保留原有网络/日志修复、用户已有改动和现有 DevTools 安装；未修改 `playground/wx`，构建产物仅由构建命令生成。

## 修复与复现证据

旧实现定向测试为 **6 失败、91 通过**，失败分别对应下列 F1–F4、L1；实际 MCP 基线也复现了 discover、命名 async 和跨页 ref 问题。初次真实集成还暴露了数字 pageId 的探针兼容问题，另补失败用例后修正。

| 项目 | 复现与修复 | 当前结果 |
| --- | --- | --- |
| F1 项目启动 | 服务已监听但缺少 SDKVersion；旧 SDK 在版本比较中抛 split 异常，后续误报端口冲突。现在由请求级 ProjectStartup 管理 CLI、端口归属与清理，等待版本和页面后才调用 SDK connect；同请求的后续 connect 可复用自有端点 | 受控启动、延迟就绪、CLI 失败、候选与迟到连接清理通过；真实独立工程仍环境阻塞 |
| F2 自动发现 | HTTP 根路径返回 426，但自动化 WebSocket 可连接。现在通过 Tool.getInfo 探测；拒绝普通 HTTP/无关 WebSocket，端口枚举解析兼容 IPv4/IPv6 地址形式 | 真实 discover 通过 |
| F3 命名 async | `async function test() { await Promise.resolve(); return 42; }` 旧实现语法失败。现在普通函数包装完整函数表达式，透传参数、返回 Promise，不在宿主执行用户代码 | 真实返回 42；同步、异步、参数、异常及单次执行测试通过 |
| F4 跨页 ref | 查询 text 后导航，再通过旧 ref get_value；旧实现返回 ELEMENT_NOT_FOUND。现在登记失效 token，共享给元素与作用域根解析 | 真实返回 STALE_ELEMENT；未知 token 返回 ELEMENT_NOT_FOUND |
| L1 诊断策略 | 默认请求通配符及属性通配策略被 SDK 拒绝。移除这些默认项，使用具体组件和支持的组合；自定义选择器仍逐项报告 | 真实默认诊断返回非零 view，且无策略失败 |
| 数字 pageId | 真实 App.getCurrentPage 返回数字 ID，而最初新增探针只接受字符串 | 补测数字（含 0）与字符串 ID，通过真实回归 |

ref 历史最多保存当前连接内最近 10,000 个失效 token，不保留 Element；断开时清空，超过上限后按未知 token 处理。同页稳定地址允许重定位，因此纠正了夹具中“计数变化后稳定 id ref 必须失效”的错误预期。

公开工具名称、参数、31/20/10 个 profile 工具、2 个资源及 `schemaVersion: "2.0"` 均保持不变。内部增加协议探针、请求级启动所有权和失效引用查询。`typecheck:test` 现在也覆盖 integration 目录。

## 验证结果

- `npm run typecheck`、`npm test`（488 项，42 文件）、改动文件 ESLint、`npm run build` 通过。
- `npm run typecheck:test` 通过；另外确认包含 integration 的 128 个 TypeScript 文件无诊断。
- 严格全量集成：**58 通过、2 失败，共 60 项**。失败为独立 project 启动及保留环境阻塞的完整 stdio 矩阵。
- 真实 MCP 使用官方 SDK Client 和 StdioClientTransport 调用构建后的服务，校验完整 `schemaVersion: "2.0"` 结果信封及实际页面/业务结果；未以直接 handler 调用替代验收。
- 网络三阶段成功、失败、超时、abort、上传内容、下载内容、Mpx Promise 成功/失败/取消继续通过。连续 5 次重连，每次相同文本连续打印两次仍恰好两条；导航历史、分页与详情通过。

最新 stdio 矩阵为 **63 通过、16 环境阻塞，共 79 场景，0 个发现缺陷**；补充重连和诊断复用分支后已单独重跑该集成测试，仍因夹具阻塞保留非零退出码。逐场景证据见 [能力结果 JSON](../tasks/detected-issues/final/capability-cases.json)。其计数与集成测试数量不同：一个集成测试会运行多个场景。原始失败及门禁摘要见 [证据文件](../tasks/detected-issues/evidence.txt)。

## 31 个工具与 2 个资源矩阵

“通过”仅代表本表明确列出的分支。缺少夹具的分支仍标记阻塞或未覆盖，不因其他分支通过而宣称全部覆盖。

| 工具 / 资源 | 状态 | 验证与限制 |
| --- | --- | --- |
| connect_devtools | 环境阻塞 | wsEndpoint、browserUrl、discover 通过；project 的真实独立工程未就绪 |
| reconnect_devtools | 通过 | 无参复用及 5 次重连日志；显式 target 替换和遗漏参数恢复默认值另由最新 stdio 场景验证 |
| disconnect_devtools | 通过 | disconnected、监听停止、transport 关闭 |
| get_connection_status | 通过 | 健康刷新、连接/断开与 profile/category、监听状态 |
| get_current_page | 通过 | 真实业务页面及路径 |
| get_page_snapshot | 通过 | 非空业务快照；独立嵌套组件图阻塞 |
| find_elements | 通过 | 真实 text 查询与 usable ref；独立组件查询阻塞 |
| wait_for | 通过 | 元素存在与缺失超时；新增消失、可见性变化用例受夹具阻塞 |
| click | 环境阻塞 | 可控计数器夹具未运行 |
| input_text | 环境阻塞 | 替换/追加/清空的独立夹具未运行 |
| get_value | 通过 | 属性回读和跨页 ref 返回 STALE_ELEMENT；输入值分支阻塞 |
| set_form_control | 环境阻塞 | switch/slider/picker 正向场景阻塞 |
| assert_text | 通过 | 实际文本正向及故意不匹配 |
| assert_attribute | 通过 | 实际 class 正向及故意不匹配 |
| assert_state | 通过 | enabled 正向/负向；其他控件状态未覆盖 |
| navigate_to | 通过 | 已编译 home 路由与页面变化；业务磁盘新增夹具路径未编译 |
| navigate_back | 通过 | 返回原业务页面 |
| switch_tab | 环境阻塞 | 非 tab 路由负向通过；实际 tabBar 正向阻塞 |
| relaunch | 通过 | 重启并恢复原业务路由 |
| evaluate_script | 通过 | 同步、Promise、命名 async、抛错/拒绝 |
| list_console_messages | 通过 | 类型、异常、分页、过滤、相同文本、5 次重连与历史 |
| get_console_message | 通过 | 详情及导航后稳定 msgid |
| list_network_requests | 通过 | 9 条唯一请求、URL 过滤、停止后实际请求不新增记录 |
| get_network_request | 通过 | 真实采集详情 |
| stop_network_monitoring | 通过 | 停止状态及恢复后的业务对照 |
| clear_network_requests | 通过 | 清空前有记录，清空后远端/本地读取为空 |
| screenshot | 通过 | 非空 PNG 与签名 |
| diagnose_connection | 通过 | 真实路径、依赖与监听诊断 |
| check_environment | 通过 | 依赖、连接和环境诊断 |
| debug_page_elements | 通过 | 默认策略与显式 view 均有实际结果，无默认策略失败 |
| debug_connection_flow | 通过 | dryRun 报告；已连接会话的非 dryRun 复用由最新 stdio 场景验证；未连接启动仍受 F1 限制 |
| weixin://connection/status | 通过 | 资源列表、连接/断开与 profile/监听状态 |
| weixin://page/snapshot | 通过 | 非空业务 scopes 与 edges 字段；跨组件 scopes/edges 正向阻塞 |

## 保留的环境阻塞

最小复现：

```json
{"target":{"kind":"project","projectPath":"/repo/tests/fixtures/monitoring-app","cliPath":"/Applications/wechatwebdevtools.app/Contents/MacOS/cli","autoPort":9431},"timeoutMs":15000,"healthCheck":false}
```

当前实际响应为 `CONNECTION_FAILED`，attempt 中为 `CONNECTION_TIMEOUT`，阶段 startup，原因“SDKVersion 缺失，运行时未就绪”。DevTools 2.02.2607271 的 Tool.getInfo 有工具版本而没有 SDKVersion，对应本地日志为 `routeTo appLaunch timeout`。独立夹具与正常业务工程均配置基础库 2.32.2，未找到足以归因并修正的仓库配置差异；未更换 DevTools 安装，也未把诊断改善算作启动成功。

业务包的 `pages/mcp-fixture/index` 虽在磁盘存在，运行中仍返回 page not found。因此控件、tabBar、条件节点与组件作用域的完整验收仍需恢复独立工程运行时；新添测试代码不能算实际通过。

## 复跑与清理

```bash
npm run typecheck
npm test
npm run lint
npm run build
INTEGRATION_WS_ENDPOINT=ws://127.0.0.1:9420 INTEGRATION_CLEANUP_MODE=reuse npm run test:integration
npm run typecheck:test

# 单独运行最新 stdio 矩阵：默认独立 project 启动，不需要手动开启 9431
INTEGRATION_WS_ENDPOINT=ws://127.0.0.1:9420 MONITORING_REPORT_DIR=tasks/detected-issues/final node tests/manual/monitoring/regression.mjs
node tests/manual/monitoring/cleanup.mjs
```

显式设置 `INTEGRATION_FIXTURE_WS_ENDPOINT` 仅复用夹具端点，该分支不能代替 project 启动验收。严格模式对阻塞保留非零退出码。

测试释放 MCP transport、本地 HTTP 服务、临时上传/下载文件及自有包装。清理复核检查 console/network 的 active=false、patches=0、temporaryFiles=0，以及 9431 无监听；保留原有 9420 DevTools 和其他应用管理的进程。回滚仅撤销本轮启动/探针、脚本、诊断、ref 及对应测试文档增量，再运行 build，不能重置整个工作区。
