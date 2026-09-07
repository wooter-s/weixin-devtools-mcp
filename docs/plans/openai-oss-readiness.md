# OpenAI 开源资助申请前优化实施方案

日期：2026-09-07。采用英文首页与完整中文入口；普通检查使用 GitHub 托管 CI，真实 DevTools 在本机验收并公开报告。目标包含 GitHub/npm 正式发布，不包含提交资助申请。

## 六项交付

1. **版本与发布**：统一 package/lockfile/双语文档/tag，提供 0.6→0.7 迁移说明；tarball 安装后通过真实 MCP stdio 冒烟；通过 npm OIDC 发布并核对 registry 与 Release。
2. **公开 CI**：Ubuntu/Windows/macOS × Node 22/24；类型检查、单元测试、lint、文档检查、构建、打包；显式单次覆盖率执行。保留既有警告，不全仓格式化。
3. **公开夹具**：以 tests/fixtures/monitoring-app 为默认工程，去除私有业务路径；覆盖启动、重连、组件作用域、交互、断言、导航、网络、日志、截图、脚本与清理。Mpx 真实验收单独启用，不模拟为通过。
4. **双语与 Codex**：英文首页与完整中文入口互链；源码/已发布配置分开；可重复的 Codex 操作与修复演示，真实录像和文字步骤对应同一版本。
5. **展示与贡献**：英文 About、topics、贡献/安全指南、Bug/功能/PR 模板；保留真实作者署名，不制造 AI 贡献记录。
6. **质量证据**：统计全部 src/**/*.ts，阈值 statements/functions/lines 75%、branches 70%；公开 HTML/JSON/LCOV。分开单元、真实环境、合成、Mpx 结果；保留历史失败报告。

## 批次和验收

- [x] A：稳定 CI 与覆盖率，公开 Actions 通过。
- [ ] B：公开夹具与真实 MCP stdio 必测场景通过，冷启动和再次运行验证清理。
- [ ] C：双语文档、Codex 演示、贡献入口与 GitHub 展示完成。
- [ ] D：相同候选源码通过验证后，创建 tag 并完成 npm/Release 发布。

发布门禁：生产与测试类型检查 → 单元测试 → lint → 构建；另执行文档一致性、覆盖率、tarball 安装冒烟和严格真实集成。任何必测场景阻塞均不能标为发布就绪。验证记录包含日期、源码指纹/提交、工具和基础库版本、命令、场景结果与清理状态。

范围约束：31/20/10 工具集合、schemaVersion 2.0、ref/path 公共契约不变；不改用户 playground、无关未跟踪文件或历史署名。不自动替换 DevTools。权限/登录不足时继续独立工作并记录阻塞，不把准备完成当作已经发布。

发布异常：npm 成功而 Release 失败时仅补 Release；不能覆盖已发布版本。必要时将 latest 指回经过验证的旧版，发布修复版本并保留历史。

## 初始检查

生产/测试类型与链接检查通过，lint 0 errors/76 warnings。源码覆盖率限定后 488 tests 通过：statements/lines 76.98%、branches 75.75%、functions 78.69%。既有真实报告存在环境阻塞。GitHub 无公开 CI/Release，npm latest 0.6.0，源码 0.7.0 待发布。

## 实施记录

实现已提交至 `chore/oss-readiness`。类型、495 项单元/协议测试、lint（0 errors/76 既有 warnings）、构建、双语链接、源码覆盖率和 tarball 三 profile MCP 检查通过。机器验收证据见 [版本报告](../releases/v0.7.0.json)。

真实验收：游客 AppID 被正常 CLI open 拒绝；临时副本使用已有本地 AppID 后可正常渲染，但自动化 Tool.getInfo 仍缺 SDKVersion。严格集成的公开预检失败，后续 suites 未执行；独立 public 验收同样失败。未发布 npm，未制作虚假的成功录像。

外部操作：SSH 分支推送成功；GitHub connector 创建 PR 返回 403；浏览器扩展控制连续超时；原生浏览器页面已确认 GitHub 未登录。npm 本地认证返回 401，Trusted Publisher、About/Topics、私密报告开关尚未确认。为不依赖 PR 权限，Tests/Quality 支持分支 push 触发。

## 最终交付边界

| 六项工作 | 已落地 | 尚未完成 |
| --- | --- | --- |
| 版本与发布 | 迁移说明、tarball 验证、OIDC 工作流、源码指纹发布门禁 | 必测真实验收通过后才能创建 tag、发布 npm/Release；Trusted Publisher 尚未核实 |
| 公开 CI | 六组 OS/Node 矩阵、Quality、公开覆盖率产物；修复干净检出与跨平台问题 | 六组矩阵和 Quality 均已通过 |
| 公开夹具 | monitoring-app 与 benchmark-app、默认公开预检、严格失败退出、独立 Mpx 入口 | 本机 DevTools 缺 SDKVersion，交互矩阵与再次启动的完整验收未通过 |
| 双语与 Codex | 英文默认首页、完整中文入口、双语 Codex 接入、三分钟演示与修复步骤 | 成功的真实演示录像 |
| 展示与贡献 | CONTRIBUTING、SECURITY、Bug/功能/PR 模板、真实 AI 署名规范 | About、Topics、私密漏洞报告开关需要 GitHub 登录与设置权限 |
| 质量证据 | 源码全量覆盖率、公开报告下载入口、失败的真实环境报告、历史证据分类 | 成功的同版本真实验收报告 |

最终代码检查对应 `d5389ab`：[Tests](https://github.com/wooter-s/weixin-devtools-mcp/actions/runs/34079997661)、[Quality](https://github.com/wooter-s/weixin-devtools-mcp/actions/runs/34079997804)。后续文档提交不把历史 native 报告改成成功。测试自有的 DevTools 工程已通过 CLI close 关闭并删除临时副本。

恢复顺序：解决当前 DevTools/automator 的 SDKVersion 兼容问题 → 在相同候选源码运行完整 `npm run release:validate` → 验证 npm Trusted Publisher 与 GitHub 展示设置 → 录制真实演示 → 通过门禁后发布。已准备好的仓库设置文字和发布操作见 [发布指南](../releases/README.md)。
