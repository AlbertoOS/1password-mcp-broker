# ADR 0001: TypeScript and a deny-by-default credential broker for M0

- **Status:** Accepted
- **Date:** 2026-08-14
- **Decision scope:** Initial public implementation only; no live credential integration

## Context

This project is intended to make agent access to 1Password-backed capabilities safer, not to provide a general-purpose vault wrapper. Two public reference projects informed this decision:

- [`CakeRepository/1Password-MCP`](https://github.com/CakeRepository/1Password-MCP), reviewed at commit `0af317b99f01bead3c291b274b4be16d326e7286`.
- [`gambadio/onepassword-agent-mcp`](https://github.com/gambadio/onepassword-agent-mcp), reviewed at commit `08f0aae7270ae2f8827d85c859c2a204102a4612`.

The first exposes broad vault CRUD and a generic `op_run` capability that accepts caller-selected commands, working directories, environment variables, and optional shells. Although it attempts output redaction and supports an optional vault allow-list, that is a large authority boundary for an agent-facing server.

The second is deliberately narrower: it uses a dedicated vault, encrypted handles, local approvals, site checks, and clipboard-based use without returning plaintext to the agent. Its desktop CLI integration can nevertheless hold broader 1Password authority than the application-level policy, and clipboard/paste remain sensitive OS-level effects. Its broader administration and item-management capabilities are intentionally outside this project's M0.

Neither implementation is copied by this repository. The comparison is limited to observable architecture and behavior.

## Decision

M0 uses **TypeScript on an active Node LTS**, the official MCP TypeScript SDK, TypeScript strict mode, and explicit runtime schemas.

M0 is a **stdio-only, fake-backend-only credential broker** with synthetic fixtures. It registers a minimal metadata-only surface:

1. `capability_status` — reports the effective non-secret policy profile and registered capability names.
2. A constrained metadata-discovery operation backed only by a fake provider and configured policy.

The design denies any operation that is invalid, ambiguous, unapproved, or outside the registered capability manifest.

The following are explicitly absent from M0:

- plaintext secret reveal or generated-secret return;
- real 1Password desktop, SDK, CLI, or service-account access;
- writes, archive/delete, moves, or permission changes;
- command execution, generic script runners, arbitrary HTTP, or arbitrary filesystem access;
- caller-selected provider identity, vault/item/field selectors, paths, URLs, or endpoints;
- HTTP transport, persistent services, local admin UI, clipboard, and paste.

## Why TypeScript

TypeScript is not intrinsically safer than Rust or Python. Security here comes from the capability boundary, policy checks, authentication, schema validation, safe logs, and the verification evidence—not from language selection alone.

TypeScript is the M0 choice because:

- the official MCP TypeScript SDK offers the most direct, maintained protocol path;
- strict TypeScript plus a runtime schema library can make untrusted MCP inputs explicit and validated at the boundary;
- both reviewed references are TypeScript, which improves comparison and migration of concepts without copying implementation;
- Node has straightforward package distribution for an eventual open-source MCP package.

Rust remains a viable future implementation choice if the project gains maintainers with Rust expertise and a demonstrably maintained MCP stack. Its memory safety and native deployment properties do not remove the need for the authority controls above.

Python is viable for a narrow local implementation, but has no decisive protocol or 1Password integration advantage for this project. It would need compensating runtime validation and dependency discipline while increasing divergence from the strongest current MCP SDK path.

## Consequences

### Positive

- M0 can prove policy, schema, audit, and redaction invariants without handling real credentials.
- The first public artifact remains small enough to independently review.
- Later integrations become separate, gated adapters rather than implicit feature additions.

### Costs and risks

- M0 is not yet useful with a real 1Password account.
- A TypeScript runtime remains subject to Node dependency supply-chain risk; lockfiles, pinned CI actions, provenance, and dependency review are release gates.
- Metadata can still be sensitive. M0 must constrain and minimize it, and audit events must be structured and value-free.

## Verification requirements

Every later capability must add synthetic tests proving:

1. malformed input is rejected before provider access;
2. an unapproved request is denied and emits only a safe audit event;
3. an approved request returns only its declared metadata schema;
4. secret-like synthetic values cannot occur in responses, errors, logs, audit events, or fixtures;
5. the complete registered tool list matches the enabled capability manifest.

A real backend, any secret-consuming handoff, authenticated loopback HTTP, document ingestion, writes, destructive actions, and permission changes each require a separate ADR, threat-model update, rollback design, independent review, and explicit approval.

## Alternatives rejected for M0

- **Generic 1Password wrapper:** too much implicit authority and too many hard-to-audit tool combinations.
- **Generic `op`/shell runner:** execution, working-directory, environment, and output authority cannot be safely inferred from a caller request.
- **Rust first:** not justified without a maintained MCP SDK and contributor capacity; it would delay evidence for the more important policy boundary.
- **Python first:** practical, but not preferable for the current MCP ecosystem and runtime-schema needs.
- **Loopback HTTP first:** adds caller authentication, browser-origin, session, and service-lifecycle concerns before M0 needs them.
