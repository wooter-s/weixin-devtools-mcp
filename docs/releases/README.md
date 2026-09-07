# Release procedure

## Candidate preparation

0.7.0 is the current unpublished candidate. Check the npm registry before selecting a version; never overwrite a published version. Synchronize package.json, package-lock.json, both READMEs and CHANGELOG. Document breaking arguments/results in the [migration guide](../migration-0.7.md).

Stage only the intended runtime, tests, scripts and workflow files before collecting evidence: the source fingerprint uses Git's file inventory and current file bytes. Preserve unrelated local work. Commit the implementation; generated reports and documentation can be committed afterward without changing the verification-input fingerprint.

## Local validation

Prepare a working [public fixture](../../tests/fixtures/monitoring-app/README.md), set a local `INTEGRATION_APPID` if needed, and run:

```bash
npm run release:validate
npm run release:check
```

The first command runs all required checks, including strict integration and a second public fixture invocation, and writes `docs/releases/vVERSION.json`. It continues collecting independent check results when a check fails. Raw logs are ignored under `artifacts/release-validation/`; review/sanitize anything before sharing. The second command fails unless every mandatory command/scenario passed against the same inputs. Never manually change a failed report to passed.

The successful report records environment versions and a source fingerprint. Commit the report and update CHANGELOG from candidate to the actual publication date only when ready. Replace the candidate notices in both READMEs and migration/Codex guides as part of that release preparation; do not claim a publication before registry confirmation.

## npm authentication

Use npm package settings to add the GitHub Actions trusted publisher:

- Owner: `wooter-s`
- Repository: `weixin-devtools-mcp`
- Workflow: `release.yml`
- Allow direct publish from this workflow.

The workflow uses GitHub-hosted Ubuntu, Node 22 and npm 11, with `id-token: write`. No repository NPM_TOKEN is required. Account authentication/2FA must be completed by the maintainer when requested. Requirements follow [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Publish

After public quality/test runs and local evidence pass, create and push the matching `vVERSION` tag. The workflow rechecks the tag/evidence, runs quality checks, installs the tarball in a temporary directory, exercises all profiles over MCP stdio, and publishes npm. It then verifies registry latest and creates a GitHub Release with the report attached and the reviewed notes from `notes.md`.

Do not push a release tag while real startup or another mandatory scenario is blocked. A working SSH push does not establish npm trusted publisher access.

If npm succeeded but Release creation failed, inspect the published version and use `gh release create` for the same existing tag and notes/report; do not republish. For a broken release, keep history, deprecate the affected version with a factual message, restore latest to a known-good version if appropriate, and publish a corrected version. Restoring 0.6 also requires restoring its client request contract.

## GitHub presentation checklist

- [ ] About: `MCP server for WeChat Mini Program automation, debugging, and testing with Codex and other AI coding agents.`
- [ ] Topics: mcp, wechat, weixin, miniprogram, automation, testing, codex, typescript.
- [ ] Public Tests/Quality runs are green.
- [ ] Private vulnerability reporting is enabled under repository Settings/Security.
- [ ] npm trusted publisher configured and verified by a successful release.
- [ ] Real synthetic-fixture recording and validation evidence attached to Release.

Repository settings and npm authentication are distinct from files committed to Git. Mark these complete only after checking the remote state.
