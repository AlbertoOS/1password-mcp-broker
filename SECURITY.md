# Security Policy

## Supported versions

Security fixes are applied to the latest commit on `main` until a versioned
release policy is published. M0 is a fake-backend prototype and is not intended
for real credential access.

## Reporting a vulnerability

Send a private report to [orkan.aos@gmail.com](mailto:orkan.aos@gmail.com).

Do not open a public issue and do not include secret material, credentials,
1Password tokens, vault/item identifiers, secret references, or production data
in a report. If you need an encrypted exchange, request the maintainer's current
public key before sending reproduction details.

When this repository is hosted on GitHub with private vulnerability reporting
enabled, GitHub's **Report a vulnerability** flow is also an accepted private
channel.

A useful report contains only the minimum safe evidence needed to reproduce the
problem:

- affected commit or release version;
- a redacted description of the impact and preconditions;
- synthetic reproduction steps or a minimal proof of concept; and
- recommended remediation, if known.

## Scope priorities

The following are high priority:

- plaintext secret disclosure or secret-like data in tool output, errors, logs,
  audit events, or fixtures;
- bypass of capability policy or strict MCP input validation;
- caller-controlled access to a vault, item, field, command, path, URL, or
  endpoint;
- unintended filesystem, clipboard, shell, network, or desktop authority;
- dependency or release-integrity compromise; and
- unsafe behavior in a future real-provider adapter or handoff sink.

## Safe handling expectations

Do not send real secrets for validation. Maintain synthetic reproductions and
redact potentially identifying metadata. Maintainers should acknowledge a valid
report, establish a private remediation path, verify a fix with synthetic tests,
and publish only a non-sensitive advisory after the issue is resolved.
