# Contributing

English and Chinese issues and pull requests are welcome. Start with a reproducible bug or a focused proposal; use the issue templates to include environment details.

## Development

Use Node 22+ and run `npm ci`. `npm run build` generates the executable and static MCP descriptors; never edit `build/` manually.

Before submitting:

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

These checks do not require WeChat DevTools. Lint errors fail validation; existing warnings are recorded separately. Do not run repository-wide formatting to fix unrelated files.

For connection, collectors, navigation, and real element behavior, also follow the [public fixture setup](tests/fixtures/monitoring-app/README.md) and run strict integration tests. Missing runtime prerequisites are not successful tests. Mpx real-runtime compatibility is an explicitly configured separate run.

## Pull requests

Use Conventional Commits, for example `fix: preserve request cancellation callbacks`. Explain the problem, final behavior, meaningful tests, and known limits. Document breaking changes and rollback implications. Preserve unrelated local files.

Update both READMEs when changing installation, versions, public capabilities, or prerequisites. Use [AGENTS.md](AGENTS.md) for the authoritative development rules and refer to source code for actual behavior.

## AI-assisted contributions

Codex, Claude, and other tools are welcome. Describe meaningful assistance in the PR and what you personally checked. Credit real contributors accurately; do not fabricate co-authors or rewrite existing history for attribution. Maintainers remain responsible for reviewing and testing changes.

Do not post credentials, private Mini Program source, production payloads, or personal user data in issues or recordings. Use the public fixture and synthetic data.
