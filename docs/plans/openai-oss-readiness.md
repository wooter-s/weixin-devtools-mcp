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

- [ ] A：稳定 CI 与覆盖率，公开 Actions 通过。
- [ ] B：公开夹具与真实 MCP stdio 必测场景通过，冷启动和再次运行验证清理。
- [ ] C：双语文档、Codex 演示、贡献入口与 GitHub 展示完成。
- [ ] D：相同候选源码通过验证后，创建 tag 并完成 npm/Release 发布。

发布门禁：生产与测试类型检查 → 单元测试 → lint → 构建；另执行文档一致性、覆盖率、tarball 安装冒烟和严格真实集成。任何必测场景阻塞均不能标为发布就绪。验证记录包含日期、源码指纹/提交、工具和基础库版本、命令、场景结果与清理状态。

范围约束：31/20/10 工具集合、schemaVersion 2.0、ref/path 公共契约不变；不改用户 playground、无关未跟踪文件或历史署名。不自动替换 DevTools。权限/登录不足时继续独立工作并记录阻塞，不把准备完成当作已经发布。

发布异常：npm 成功而 Release 失败时仅补 Release；不能覆盖已发布版本。必要时将 latest 指回经过验证的旧版，发布修复版本并保留历史。

## 初始检查

生产/测试类型与链接检查通过，lint 0 errors/76 warnings。源码覆盖率限定后 488 tests 通过：statements/lines 76.98%、branches 75.75%、functions 78.69%。既有真实报告存在环境阻塞。GitHub 无公开 CI/Release，npm latest 0.6.0，源码 0.7.0 待发布。

## 实施记录

执行中，最终结果见版本验收报告；未完成项不得提前勾选。
