# Validation status

## Current release candidate: 0.7.0

The project is not yet declared release-ready. Independent DevTools project startup is a required gate. The CLI rejects `touristappid` for the current account during normal project open; automation also reports missing SDKVersion. A registered local AppID was also tested in a disposable copy; automation still reported missing SDKVersion. No successful demo recording is claimed.

## Implementation verification (2026-09-07)

The local release validation for implementation commit `1ce1cf8` passed production/test typechecks, 495 tests, lint (0 errors / 76 existing warnings), build, bilingual link checks, coverage, and packed-package MCP validation. Coverage: statements/lines 76.98%, branches 75.77%, functions 78.69%.

Both strict native startup attempts failed with missing SDKVersion; dependent interaction cases were explicitly not run. The full integration suites were not executed after their native preflight failed. See the [machine-readable release evidence](releases/v0.7.0.json). It intentionally has `status: failed` and cannot authorize publication. Later CI trigger-only changes do not turn this historical failed report into a current pass.

Normal CLI open rejects the checked-in tourist AppID. A disposable copy using a registered local AppID renders the fixture, but automation Tool.getInfo still returns only the DevTools version without SDKVersion, while App.getCurrentPage can return a page. The installed automator itself requires SDKVersion; bypassing the MCP readiness check would not repair SDK compatibility. No DevTools installation or private business source was changed.

## Separate evidence categories

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| Unit/protocol CI | Contracts, controlled state transitions, packaging and platform-specific Node behavior | Real DevTools startup or real component interaction |
| Source coverage | Executed production TypeScript lines/branches/functions | End-to-end workflow reliability |
| Native fixture report | The explicitly executed desktop scenarios and recorded runtime versions | Other platforms or Mpx compatibility |
| Mpx report | Explicitly configured real `$xfetch` success/failure/cancellation | Native fixture coverage or broad framework support |
| Synthetic benchmarks | Deterministic algorithm regressions and measurements under their stated method | Real-world latency or success rate |

Before implementation, 488 tests passed with source-only coverage of 76.98% statements/lines, 75.75% branches and 78.69% functions. This is a dated baseline (2026-09-07), not a promise that every later commit has identical counts.

Current [quality runs](https://github.com/wooter-s/weixin-devtools-mcp/actions/workflows/presubmit.yml) retain coverage HTML, JSON summary and LCOV. [Test runs](https://github.com/wooter-s/weixin-devtools-mcp/actions/workflows/run-tests.yml) cover the Node/OS matrix. An absent run or a failed job is not a passing badge.

## Reproduce

Run `npm run test:coverage` for all production `src/**/*.ts`; thresholds remain 75% statements/functions/lines and 70% branches. Unexecuted source is included.

Follow the [public fixture setup](../tests/fixtures/monitoring-app/README.md), then run `npm run test:integration:public`. For the complete release gate run `npm run release:validate`; it writes command outcomes and native evidence into the version-specific release JSON and stores raw local logs under ignored `artifacts/`.

The report binds to the production, test, script and CI input fingerprint. Editing those inputs invalidates an earlier pass. The release workflow rejects missing scenarios, failed commands, missing runtime versions, or endpoint-only startup validation.

Historical reports retain their original results: [detected issues](detected-issues-regression.md), [monitoring](monitoring-regression.md), and [synthetic benchmark methodology](../benchmarks/README.md). Their successful branches do not override current blocked scenarios.
