# 1Password MCP Broker

A security-first, policy-gated MCP credential broker for **opaque, purpose-bound** handoffs.

> **Milestone 0 notice:** this repository currently contains only a synthetic,
> fake-backend MCP prototype. It does **not** connect to 1Password, read vaults,
> reveal credentials, write items, or forward real secrets.

`1password-mcp-broker` is not a generic 1Password wrapper. Its intended role is
an authority boundary between an MCP caller and narrowly approved credential
capabilities. A future secret-consuming operation must be explicitly designed
for one approved purpose and destination; it must not become caller-directed
vault/item/field access or a generic forwarding proxy.

This project is independent and is not affiliated with, sponsored by, or
endorsed by 1Password.

## What M0 provides

M0 establishes the smallest runnable security boundary:

- stdio-only MCP server;
- strict TypeScript and runtime schemas on Node.js 24.19.0 LTS;
- deny-by-default capability manifest;
- `capability_status`, which reports only enabled non-secret capabilities;
- optional, policy-gated synthetic metadata discovery;
- strict empty input schemas: undeclared caller arguments are rejected;
- schema projection that prevents undeclared backend fields from entering tool
  output;
- value-free audit event shapes; and
- fake in-memory provider fixtures only.

## Explicitly absent

M0 does **not** include:

- any real 1Password desktop, SDK, CLI, service-account, vault, item, or field
  integration;
- plaintext secret return, generated-secret return, or secret forwarding;
- writes, archival/deletion, moves, permissions, or administrative operations;
- shell execution, generic script runners, arbitrary HTTP, or generic filesystem
  access;
- caller-selected provider, vault, item, field, path, URL, endpoint, clipboard,
  or paste operations; or
- HTTP transport, persistent services, or an administrative UI.

## Development

Requirements:

- Node.js `24.19.0` (pinned in `.node-version`)
- npm `11.17.0` or a compatible npm supplied with that Node release

```sh
npm ci
npm test
npm run typecheck
npm run build
```

To run the synthetic stdio server locally after a build:

```sh
npm start
```

The server communicates exclusively through standard input/output. Do not place
secret values, 1Password tokens, vault/item identifiers, secret references, or
production metadata in local fixtures, command arguments, test output, or logs.

## Security model

Start with [the threat model](docs/threat-model.md) and
[ADR 0001](docs/adr/0001-typescript-and-m0-credential-broker.md).

The essential rule is: **default deny, narrow authority, and no plaintext secret
return to the MCP caller.** Every new capability must be independently gated,
covered by synthetic tests, and reviewed as a new authority boundary.

## Roadmap

Before a real backend or any credential-consuming handoff, the project requires:

1. deterministic CI and release supply-chain controls;
2. a concrete fixed-purpose workflow and policy configuration format;
3. an ADR, threat-model update, rollback design, and independent security review
   for the selected backend; and
4. explicit human approval for the capability.

The currently proposed first workflow is a policy-defined HTTPS
Authorization-header handoff for an authorization probe. It remains design-only
until its caller-identity, policy-provisioning, provider, egress, and review
gates are met; see [ADR 0002](docs/adr/0002-fixed-https-authorization-handoff.md)
and [the handoff design](docs/designs/fixed-https-handoff.md).

Write, destructive, permission, document-ingestion, desktop-auth,
service-account, and general-purpose HTTP capabilities are all separately gated
future work.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Development follows GitHub Flow: branch
from current `main`, verify and review a focused change, then merge it back to
`main`. Never submit credentials, secret material, real identifiers, or
production data.

## Security reporting

See [SECURITY.md](SECURITY.md). Do not disclose vulnerabilities through public
issues or include sensitive details in a report.

## License

[MIT](LICENSE).
