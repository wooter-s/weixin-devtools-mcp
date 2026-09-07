# Codex configuration and reproducible demo

This is a runnable walkthrough, not a claim that a successful recording already exists. Real project startup remains a release gate; see [validation](validation.md).

## Configure

Build with `npm ci` and `npm run build`, then register the local source:

```bash
codex mcp add weixin-devtools -- node /absolute/path/to/weixin-devtools-mcp/build/server.js --enable-categories=console,network,debug
codex mcp list
```

In a Codex session, `/mcp` lists active servers. The server uses stdio and starts on the same computer as DevTools. CLI usage follows the [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

After the 0.7.0 npm Release exists, the equivalent pinned command is:

```bash
codex mcp add weixin-devtools -- npx -y weixin-devtools-mcp@0.7.0 --enable-categories=console,network,debug
```

Until then use the source command. For detailed timeout configuration, set `startup_timeout_sec = 20` and `tool_timeout_sec = 90` on the corresponding `[mcp_servers.weixin-devtools]` entry in Codex's config.toml. The project connection itself has a 45-second default budget; an available tool list does not prove the Mini Program runtime is ready.

## Walkthrough and recording script

Prepare the [public fixture](../tests/fixtures/monitoring-app/README.md), including a working test AppID if needed. Start on its Home tab with count 0. Record only the synthetic fixture and Codex task output, without private tabs, credentials, or business payloads.

| Time | Ask Codex to… | Verify |
| --- | --- | --- |
| 0:00–0:30 | Connect to the explicit public fixture project; inspect current page and snapshot | Connected page is `pages/home/index`, scopes/edges returned |
| 0:30–1:00 | Click Increment once and assert the displayed count | Count becomes 1; successful assertion envelope |
| 1:00–1:30 | Replace the input with `hello`, append ` world`, then read it back | Value is `hello world` |
| 1:30–2:00 | Read the text inside the card; navigate to Detail and back | Scoped text is `Scoped content`; route changes correctly |
| 2:00–2:30 | Print `demo-log`, read console messages, then take a screenshot | Message appears once; nonempty PNG |
| 2:30–3:00 | Summarize assertions and disconnect | Disconnected status, no remaining owned collectors |

Representative current tool arguments:

```json
{"target":{"kind":"project","projectPath":"/absolute/path/to/public-fixture"},"timeoutMs":45000}
```

```json
{"target":{"kind":"path","path":[{"kind":"id","value":"increment"}]}}
```

```json
{"target":{"kind":"path","path":[{"kind":"id","value":"count"}]},"text":"1"}
```

The snippets above are arguments for `connect_devtools`, `click`, and `assert_text`, respectively. They are MCP calls, not JavaScript global functions. Check `ok` and `isError`, and use returned observations before subsequent element operations.

## Reproducible repair demonstration

Make a disposable copy of the fixture. In that copy only, change the counter handler from `count + 1` to `count + 2`. Ask Codex: “Reproduce why one Increment click shows 2 instead of 1, fix the handler, and verify the result in the running Mini Program.”

Capture the failing assertion, the one-line source change, DevTools recompilation, and a passing assertion after relaunch. Do not present an edited transcript or a simulated UI as a real run. Restore/delete the disposable copy afterward; the tracked fixture must retain the correct increment behavior.

A successful recording will be attached to the corresponding Release only after startup and all shown assertions actually pass. Text steps remain available if a viewer cannot play the video.
