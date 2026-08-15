# M0 independent read-only security review guide

> **Scope boundary:** This guide covers only the current M0 prototype. M0 is a
> stdio-only MCP server using an in-memory fake backend and closed synthetic
> fixtures. It has no real 1Password integration, credentials, secret values,
> HTTP transport, filesystem access, shell execution, clipboard integration, or
> live network operation.

## Purpose

Use this guide to conduct an independent, read-only review of the public M0
artifact. The goal is to verify that the current prototype preserves its narrow
authority boundary and does not accidentally expose a path toward generic
credential access.

A review of M0 is **not** approval for a real provider, secret-consuming handoff,
loopback HTTP transport, policy loader, or any other future capability.

## Safe reviewer setup

1. Work from a clean checkout of the reviewed commit.
2. Use the Node.js version pinned in `.node-version`.
3. Do not add real credentials, vault/item identifiers, production metadata, or
   secret references to fixtures, commands, issue text, or review notes.
4. Do not connect a real 1Password account, install a persistent service, or
   perform a live M0 provider, policy, handoff, or transport request as part of
   review.
5. Dependency preparation and registry audit are separate supply-chain steps,
   not M0 operations. They may contact the configured npm registry and must
   follow the reviewer's network policy.

## Local evidence path

After dependencies are already available from a reviewed source, run the local
repeatable checks:

```sh
npm run verify
npm run package:check
```

## Optional supply-chain checks

A clean dependency installation may contact the configured npm registry:

```sh
npm ci --include=dev --ignore-scripts
```

`npm audit` is a remote, registry-state-dependent advisory lookup rather than
local deterministic evidence. Run it only under the reviewer's network policy:

```sh
npm audit --omit=dev --audit-level=high
```

An audit that is blocked, incomplete, or unavailable is a supply-chain review
gap, not a clean result.

## Review targets

### 1. Authority surface

Confirm that the source and package surface contain only the intended M0
transport and tools:

- standard input/output MCP transport only;
- `capability_status` and conditionally registered `list_approved_metadata`;
- no real provider/1Password SDK or CLI integration;
- no generic command runner, HTTP client/server/proxy, filesystem reader,
  clipboard/paste path, desktop integration, or persistent admin surface; and
- no caller-selected vault, item, field, path, URL, endpoint, provider, proxy,
  TLS, or command input.

### 2. Capability and input controls

Confirm that capability names are allowlisted, unknown and duplicate entries are
rejected, registered tools match effective status, and both MCP tools accept only
strict empty input objects. Test undeclared arguments through an MCP client, not
only by reading schemas.

### 3. Synthetic metadata confinement

Confirm that M0 metadata is limited to private authoritative synthetic fixture
tuples, that exposed fixture views are clones rather than authority-bearing
objects, and that a backend cannot inject arbitrary declared `id`, `label`, or
`category` values. Check that output remains bounded and schema-projected.

### 4. Failure and audit containment

Confirm that backend, validation, and audit-sink failures return fixed generic
MCP errors without structured content or source-derived text. Audit events must
remain limited to fixed tool names, outcomes, and bounded counts; audit failures
must not reveal their exception text.

Use only synthetic sentinel values when probing these paths, and assert that they
do not appear in serialized MCP output, errors, or audit events.

### 5. Packaging and supply chain

Confirm that the package allowlist excludes source fixtures, local plans,
credential/configuration files, and build-time artifacts not needed by users.
Review the lockfile, CI workflow permissions, action pins, install flags, and
publishing/deployment absence. M0 must not need secrets, tokens, OIDC, or
write-capable CI permissions.

## Required negative cases

At minimum, inspect or reproduce synthetic tests for:

- unknown and duplicate capabilities;
- undeclared MCP arguments;
- disabled metadata discovery;
- undeclared backend fields;
- arbitrary declared metadata values and oversized response data;
- backend/schema/audit failures; and
- attempted mutation of a public fixture snapshot.

## Review output

Provide a short report containing:

- reviewed commit identifier and commands actually run;
- confirmed scope and any authority surfaces discovered;
- findings ordered by severity, with synthetic reproduction evidence only;
- residual gaps, including incomplete verification; and
- an explicit statement that M0 review does not authorize future live work.

Report vulnerabilities privately through [SECURITY.md](../../SECURITY.md). Do not
open a public issue or include sensitive material.
