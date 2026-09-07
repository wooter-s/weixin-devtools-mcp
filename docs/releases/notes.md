WeChat DevTools MCP 0.7.0 introduces explicit connection targets, scoped ref/path element addressing, and schemaVersion 2.0 result envelopes. This is a breaking upgrade from 0.6: update client arguments and result handling using the migration guide.

The release adds an English entry point with a complete Chinese guide, Codex setup and reproducible demo instructions, a public native fixture, cross-platform Node CI, production-source coverage and tarball MCP checks. Native and Mpx runtime verification are reported separately.

Validation: see the attached version-specific JSON for commands, environment, required native scenarios and source fingerprint. Public CI provides the Node/OS matrix and coverage artifacts. Synthetic measurements and older reports do not establish this version's native acceptance.

Migration: https://github.com/wooter-s/weixin-devtools-mcp/blob/main/docs/migration-0.7.md

Recovery: restore a known-good pinned version together with that version's client arguments; retain released history and publish a patch for regressions.
