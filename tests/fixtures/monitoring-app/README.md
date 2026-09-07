# Public validation Mini Program

This fixture contains only synthetic data: a counter, text inputs, switch/slider/picker, a custom component, two tab pages, a detail page, and a subpackage. It does not require private business source or a backend account.

## Setup

1. Install and sign in to WeChat DevTools. Enable its CLI service access.
2. Open this directory as a Mini Program and verify it compiles. The checked-in AppID is `touristappid`; some DevTools/account combinations reject it. Use a registered **test** AppID you can access in that case.
3. For automated validation, set `INTEGRATION_APPID` locally. The runner writes it only to a disposable copy, never to the tracked fixture. Do not commit your AppID or `project.private.config.json`.
4. From the repository root, run `npm ci`, `npm run build`, and `npm run test:integration:public`.

On macOS the default CLI path is `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`. Set `INTEGRATION_CLI_PATH` if different. The fixture pins basic library 2.32.2; ensure it is installed. `urlCheck: false` permits the synthetic localhost HTTP test server inside this test project.

The public runner copies the fixture, starts a request-owned DevTools project, and closes that project afterward. It never uploads the Mini Program. Do not run multiple real suites concurrently.

## Results

The runner writes `artifacts/native-validation/native.json` and, on success, a fixture screenshot. Set `MONITORING_REPORT_DIR` to change the output directory. Failure or unavailable runtime exits nonzero. A missing SDKVersion is a startup blocker, not proof that element tests passed.

`INTEGRATION_FIXTURE_WS_ENDPOINT` can explicitly reuse an already-open copy of this fixture for diagnosis; that mode does **not** validate project launch and cannot satisfy the release gate.

Use `npm run test:integration` for the strict suite. Mpx checks are separate: set `INTEGRATION_MPX_WS_ENDPOINT` to an actual Mpx runtime and run `npm run test:integration:mpx`.

## Expected interaction

Click `increment`: `count` changes from 0 to 1. Input replace/append/clear updates both control value and page data. `card` exposes the scoped `inside` text. Navigate to `/subpackages/test/pages/detail/index` to verify a public subpackage route. The [Codex walkthrough](../../../docs/codex.md) uses these controls.
