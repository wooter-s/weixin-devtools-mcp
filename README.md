# WeChat DevTools MCP

English | [简体中文](README.zh-CN.md)

Let Codex and other coding agents inspect, interact with, and debug running WeChat Mini Programs through the Model Context Protocol.

[![Version](https://img.shields.io/badge/version-0.7.0-blue.svg)](https://github.com/wooter-s/weixin-devtools-mcp)
[![Tests](https://github.com/wooter-s/weixin-devtools-mcp/actions/workflows/run-tests.yml/badge.svg)](https://github.com/wooter-s/weixin-devtools-mcp/actions/workflows/run-tests.yml)
[![Quality](https://github.com/wooter-s/weixin-devtools-mcp/actions/workflows/presubmit.yml/badge.svg)](https://github.com/wooter-s/weixin-devtools-mcp/actions/workflows/presubmit.yml)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Why this project

A coding agent needs feedback from the running Mini Program to verify its changes. This server exposes scoped page snapshots, element interactions, assertions, navigation, screenshots, console messages, and network requests through a local MCP connection to WeChat DevTools.

- **Explicit connections:** choose a project, WebSocket endpoint, browser URL, or discovery request.
- **Scoped elements:** opaque `ref` tokens and locator `path` segments traverse custom components.
- **Predictable results:** all tools return a `schemaVersion: "2.0"` success/error envelope.
- **Optional collectors:** console and network monitoring start only when their categories are enabled.
- **Small default surface:** core exposes 20 tools; minimal exposes 10; full exposes 31.

## Release status

**The source tree is a 0.7.0 release candidate. npm `latest` is currently 0.6.0.** Use the source configuration below for the 0.7 API until its Release is published. The version badge identifies this source tree, not a completed publication.

0.7 changes connection arguments, element targets, and result envelopes. Read the [0.6 → 0.7 migration guide](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/docs/migration-0.7.md) before upgrading.

## Requirements

- Node.js 22 or newer.
- WeChat DevTools installed, signed in, with CLI service access enabled.
- A Mini Program project that compiles and opens in DevTools.
- An MCP client supporting local stdio, such as Codex or Claude Desktop.

Unit CI covers Linux, Windows, and macOS on Node 22/24. **That does not certify real DevTools operation on all those platforms.** Real runtime verification is performed separately on a maintainer's desktop; see [validation status](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/docs/validation.md).

## Quick start with Codex

Build the source:

```bash
git clone https://github.com/wooter-s/weixin-devtools-mcp.git
cd weixin-devtools-mcp
npm ci
npm run build
```

Register the built server, replacing the absolute path:

```bash
codex mcp add weixin-devtools -- node /absolute/path/to/weixin-devtools-mcp/build/server.js --enable-categories=console,network,debug
```

Run `codex mcp list`, then start a Codex session in your Mini Program project. Open `/mcp` to check availability. Ask:

> Connect to the Mini Program at `/absolute/path/to/project`. Read its page snapshot, identify the visible controls, and report the current page. Use explicit project connection; do not discover another project.

For a self-contained example, use `tests/fixtures/monitoring-app` from this repository. Follow the [fixture setup](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/tests/fixtures/monitoring-app/README.md) first.

For an **already published** npm version, configure `npx -y weixin-devtools-mcp@VERSION` instead of the local Node entry. Do not assume an unpublished source version is available on npm. Detailed [Codex configuration and reproducible demo](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/docs/codex.md) includes the first tool calls and expected results.

### Claude Desktop

Use the same built entry in your client configuration:

```json
{
  "mcpServers": {
    "weixin-devtools-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/weixin-devtools-mcp/build/server.js"]
    }
  }
}
```

## Tool profiles

| Profile/category | Tools and behavior |
| --- | --- |
| `core` (default, 20) | Connection, page snapshots, locating, interactions, assertions, navigation, scripts |
| `minimal` (10) | Reduced tool surface |
| `full` (31) | All tools, including console, network, and debug |
| `console` | List console messages; inspect one message |
| `network` | List/inspect requests; stop monitoring; clear requests |
| `debug` | Screenshots and environment/connection/page diagnostics |

Set `--tools-profile=full`, or add categories with `--enable-categories=console,network,debug`. Disable categories with `--disable-categories=...`. Environment equivalents are `WEIXIN_MCP_TOOLS_PROFILE`, `WEIXIN_MCP_ENABLE_CATEGORIES`, and `WEIXIN_MCP_DISABLE_CATEGORIES`.

Snapshots contain a `scopes`/`edges` graph. Use returned refs without parsing them; refresh observations after page changes. A `path` identifies elements through page/component scopes. See the [public API examples](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/README.zh-CN.md#元素-target-与作用域-path).

## Verification and limitations

```bash
npm run typecheck
npm run typecheck:test
npm test
npm run lint
npm run build
npm run lint:links
npm run test:coverage
npm run test:package
```

Coverage counts all production TypeScript under `src/`. CI retains HTML, JSON, and LCOV reports. Thresholds are 75% statements/functions/lines and 70% branches; we do not claim an unmeasured 80% coverage rate.

Real tests require a working, logged-in DevTools installation:

```bash
npm run test:integration:public
npm run test:integration
```

The public fixture is independent of private business projects. `npm run test:integration:mpx` is a separate, explicitly configured Mpx compatibility check. Native, Mpx, synthetic, and unit results are reported separately. A runtime prerequisite failure is a failure, not a passing skipped test.

**Known release blocker:** independent project startup on the previously tested DevTools 2.02.2607271 reports missing SDKVersion. A recording of a successful end-to-end demo is not yet available. Current evidence and release readiness live in the [validation report](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/docs/validation.md); historical reports retain their original scope.

## Documentation and contributing

- [Codex configuration and demo](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/docs/codex.md)
- [Migration to 0.7](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/docs/migration-0.7.md)
- [Complete Chinese guide](README.zh-CN.md)
- [Integration guide (Chinese)](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/docs/integration-guide.md)
- [Benchmark methodology](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/benchmarks/README.md)
- [Contributing](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/CONTRIBUTING.md)
- [Security and data handling](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/SECURITY.md)
- [Release procedure](https://github.com/wooter-s/weixin-devtools-mcp/blob/main/docs/releases/README.md)

Report reproducible bugs at [GitHub Issues](https://github.com/wooter-s/weixin-devtools-mcp/issues). Contributions from any supported client are welcome; keep AI assistance and human verification accurately attributed.

MIT licensed. Built on [MCP](https://github.com/modelcontextprotocol), [miniprogram-automator](https://www.npmjs.com/package/miniprogram-automator), with architectural inspiration from [chrome-devtools-mcp](https://github.com/tinybirdco/chrome-devtools-mcp).
