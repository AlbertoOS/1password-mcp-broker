# M0 Threat Model

## Status and scope

This document covers only the M0 prototype:

- a local MCP server over standard input/output;
- a fake in-memory metadata backend with synthetic fixtures;
- read-only `capability_status` and optional `list_approved_metadata` tools;
- a fixed, in-process capability manifest; and
- a value-free audit-sink interface.

M0 has no real 1Password integration, no credential-bearing backend, and no
secret-consuming handoff. This is not a production threat model for a future
adapter.

## Security objectives

1. **Default deny:** only a known, explicitly enabled capability may register a
   tool.
2. **No caller-selected authority:** callers cannot select a provider, vault,
   item, field, command, file, path, URL, endpoint, or consumer.
3. **No plaintext secret boundary:** M0 must not return, log, or store secret
   values.
4. **Closed output schema:** tool output contains only fields declared by its
   runtime schema.
5. **Value-free audit shape:** audit events identify a permitted tool and
   outcome, plus a bounded count where needed; they do not include arguments,
   metadata values, secret values, or backend errors.
6. **Fail closed on malformed requests:** unknown capabilities, duplicate
   manifest entries, and undeclared tool arguments must be rejected.

## Assets

Even in M0, protect these assets:

| Asset | Why it matters |
| --- | --- |
| Capability manifest | Determines the MCP authority surface. |
| Tool schemas and registration | Must not widen callers' choices or outputs. |
| Synthetic fixture isolation | Prevents real credentials or production identifiers from entering development artifacts. |
| Audit event contract | Must remain safe if later connected to durable logging. |
| Dependency lockfile and CI definition | Determine what executes during verification and eventual release. |

A future version will additionally need to protect provider credentials,
plaintext values in process memory, policy configuration, opaque handles,
destination bindings, and release credentials. Those assets are outside M0.

## Trust boundaries

```text
MCP caller
    │ untrusted tool name and arguments
    ▼
MCP protocol + strict runtime schemas
    │ only registered zero-argument tools
    ▼
Capability policy
    │ only known, unique, explicitly enabled capabilities
    ▼
Fake metadata backend
    │ synthetic records only
    ▼
Schema projection + value-free audit event
    │ declared metadata or fixed event shape only
    ▼
MCP caller / configured audit sink
```

The MCP caller is untrusted for authorization purposes. M0 does not assume that
a caller is benign merely because it can open the local stdio transport.

## Threats and M0 controls

| Threat | M0 control | Verification |
| --- | --- | --- |
| Caller asks for an unregistered tool | Only policy-enabled tools are registered. | MCP tool-list tests. |
| Caller injects a vault/item/field/path/URL selector | Both tools use strict empty-object input schemas. | MCP calls with undeclared arguments must return an error. |
| A manifest silently broadens or misstates authority | Unknown and duplicate capabilities are rejected. | Unit tests for invalid manifests and tool/status consistency. |
| Backend returns an undeclared or secret-like field | Tool response passes through a closed runtime output schema. | Synthetic concealed-field test. |
| Audit sink receives values | Audit type permits only tool, outcome, and bounded count. | Synthetic audit test with concealed backend value. |
| Tool output is treated as a secret delivery channel | M0 has no secret provider or reveal/handoff operation. | Source review and negative-surface checks. |
| Arbitrary operating-system or network authority | No shell runner, HTTP client/server, filesystem, clipboard, or desktop integration is present. | Source review and dependency review. |
| Compromised dependency or CI action | Lockfile, deterministic CI, pinned action revisions, and release review are required before publication. | CI and package verification. |

## Out of scope and residual risk

M0 does not authenticate an MCP caller, persist audit events, or guard a real
credential provider, because it handles neither a credential nor a real
provider. Local execution still has normal development-machine risks:

- a malicious process that can modify the checked-out source can change the
  broker;
- stdio does not prove caller identity;
- synthetic metadata can become sensitive if contributors ignore fixture rules;
- an audit sink implementation outside M0 could violate the value-free contract;
  and
- dependency or CI compromise remains possible without release controls.

M0 is therefore suitable only as an architecture and test boundary, not as a
real credential authority.

## Required gates for future authority

Before a real provider adapter, opaque handoff sink, authenticated loopback
transport, document ingestion, write capability, destructive action, or
permission change, maintainers must complete all of the following:

1. define the exact initiator, consumer, allowed destination, and failure mode;
2. write an ADR and update this threat model;
3. implement a policy that denies by default and cannot accept caller-selected
   unrestricted resources;
4. add synthetic positive and negative tests, including error/audit/output
   leakage checks;
5. define safe disablement and rollback behavior;
6. obtain independent security review; and
7. obtain explicit human approval before connecting a live backend or running a
   real operation.
