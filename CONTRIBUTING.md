# Contributing

## Scope and safety boundary

This repository is building a credential **broker**, not a generic credential
wrapper. Contributions must preserve its default-deny boundary.

Do not submit:

- credentials, tokens, passwords, private keys, recovery codes, or secret
  references;
- real 1Password vault/item identifiers or production metadata;
- integrations that expose plaintext secrets to an MCP caller;
- arbitrary command execution, HTTP proxying, filesystem access, clipboard or
  paste automation, document ingestion, or caller-selected resource access;
- writes, destructive actions, permission changes, or administrative features
  without a separately approved design; or
- generated dependencies, build outputs, local plans, or environment files.

Use synthetic test data only.

## GitHub Flow

1. Begin from an up-to-date `main` branch.
2. Create a focused branch, such as `feat/policy-format` or
   `docs/threat-model`.
3. Make the smallest complete change, including tests for security invariants.
4. Run the local verification suite:

   ```sh
   npm ci
   npm test
   npm run typecheck
   npm run build
   npm audit --omit=dev --audit-level=high
   ```

5. Request review. Security-sensitive changes require independent review.
6. Open a PR targeting `main` when a GitHub remote is available. Do not merge
   while required checks or reviews are outstanding.

Use Conventional Commits, for example:

```text
feat: add policy manifest parser
fix: reject unapproved capability aliases
docs: clarify synthetic fixture rules
```

## Capability proposals

A proposal that changes authority must include:

- the exact operation, initiator, consumer, and allowed destination;
- why existing read-only metadata behavior is insufficient;
- default-deny policy behavior and invalid-input handling;
- a threat-model update and an ADR where the boundary materially changes;
- synthetic negative and positive tests;
- audit-event fields, explicitly showing no sensitive values; and
- rollback or disablement behavior.

Real provider adapters, credential-consuming handoffs, loopback HTTP, document
ingestion, writes, destructive actions, and permissions require explicit human
approval before implementation.

## Review expectations

Reviewers should reject any change that broadens authority implicitly, accepts
undeclared caller input, leaks values in output/errors/audit logs, or relies on
redaction as the primary control. Prefer removing authority over trying to
sanitize its consequences.
