# Migrating from 0.6 to 0.7

0.7.0 is currently a release candidate. Use a source build until npm publishes that version. Package versions and the tool result `schemaVersion` evolve independently.

## Connection requests

Replace flat connection arguments with an explicit target:

```json
{"target":{"kind":"project","projectPath":"/absolute/path/to/project"},"timeoutMs":45000}
```

Other targets are `{ "kind": "wsEndpoint", "endpoint": "ws://127.0.0.1:9420" }`, `{ "kind": "browserUrl", "url": "http://127.0.0.1:9222" }`, or `{ "kind": "discover" }`. A project request tries launch then connect for that project; it does not silently fall back to discovery. Reconnect without arguments reuses the previous request; a new target replaces it rather than merging fields.

## Element targets

A direct 0.6 selector target such as `{"kind":"selector","value":"#name"}` becomes:

```json
{"kind":"path","path":[{"kind":"id","value":"name"}]}
```

A ref target remains opaque: `{"kind":"ref","ref":"<returned-token>"}`. Never parse or persist the token across sessions. A path can enter custom components one segment at a time. Snapshots describe page/component `scopes` and `edges`, not a fabricated global DOM tree.

## Results

Consumers must handle the full `schemaVersion: "2.0"` envelope: `ok`, `code`, `data`, `error`, `partialData`, `observation`, `warnings`, `nextActions`, and `meta`. Failures also set MCP `isError: true`; useful output may remain in partial data or an observation. Do not interpret a nonempty response as success.

The legacy connection and element shapes and schemaVersion 1.0 are not supported. Profile counts remain minimal/core/full = 10/20/31. Test your client with the new shapes before upgrading a pinned production setup.

## Upgrade and recovery

After 0.7 is published, pin `weixin-devtools-mcp@0.7.0` in the MCP server command and restart the client. If you restore 0.6.0, also restore its matching argument/result handling. Downgrading only the executable does not make 0.7 requests compatible.
