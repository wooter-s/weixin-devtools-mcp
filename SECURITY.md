# Security and data handling

This local stdio server controls a connected WeChat DevTools project. `evaluate_script` executes code in the Mini Program runtime; interaction and navigation tools change its state. Connect only to a project you intend to control and review the MCP client's tool permissions.

Console and network collectors may expose application logs, request URLs, headers, and bodies to the MCP client. They are disabled unless their categories are enabled. Use the public fixture with synthetic data for reports and demos; inspect and redact outputs before sharing them. Do not expose the DevTools automation port to an untrusted network.

## Reporting vulnerabilities

Use the repository's private vulnerability reporting entry under **Security → Report a vulnerability**, if available. If that entry is unavailable, open an issue asking the maintainer for a private reporting channel without including exploit details, credentials, or private data. Private reporting setup is tracked in the release checklist; do not assume it is enabled.

Security fixes target the current release. We do not promise a fixed response time or support for every historical version.
