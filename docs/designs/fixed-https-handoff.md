# Fixed HTTPS Handoff Design

> **Design only.** This document specifies a future capability boundary. M0 has
> no real provider, secret, network request, or authenticated caller and must
> not implement or configure this flow.

## Purpose

The first secret-consuming operation is a policy-defined authorization probe:

the broker resolves one policy-selected credential in memory, injects it into a
fixed Authorization header for one policy-selected HTTPS request, discards it,
and returns a coarse result. The MCP caller never receives the credential or a
reusable reference to it.

## Authority model

```text
MCP caller
  │ operation alias only
  ▼
Authenticated broker authorization (future prerequisite)
  │ approved alias only
  ▼
Versioned operation policy
  ├── fixed HTTPS origin + method + path
  ├── fixed Authorization-header template
  ├── provider secret alias (not visible to caller)
  └── timeout / rate / egress constraints
  ▼
Provider adapter resolves secret in broker memory (future)
  ▼
Direct HTTPS client, redirects disabled (future)
  ▼
Fixed destination
  ▼
Sanitized result + value-free audit receipt
```

No edge in this flow is caller-selectable except the choice among already
approved operation aliases.

## First operation contract

The operation is deliberately non-generic:

| Property | First operation rule |
| --- | --- |
| Scheme | HTTPS only. |
| Destination | One policy-defined normalized origin. No IP literal, user-info, custom proxy, or caller selector. DNS resolution and connection must reject loopback, private, link-local, multicast, reserved, and rebinding-prone targets. |
| Method and path | Exactly policy-defined. |
| Query | Absent unless a later ADR defines a fixed query template. |
| Request body | None. |
| Authorization header | Header name and format fixed by policy; secret supplied only by broker. |
| Other headers | Fixed minimal allowlist owned by policy. |
| Redirects | Refused, not followed. |
| TLS | Certificate and hostname validation required; caller cannot override. |
| Timeout | Policy-bounded and finite. |
| Response | Coarse outcome only; discard body and headers. |
| Retry | Disabled by default. A future retry policy must be idempotency-aware. |

The initial action should be an identity or authorization probe, not a business
mutation. A later operation that changes remote state is a separate capability
with separate approval.

## Tool input and output

A future MCP tool may accept only this strict shape:

```json
{ "operation": "approved-operation-alias" }
```

It must reject every undeclared property, including host, URL, path, method,
headers, body, provider, vault, item, field, secret reference, proxy, timeout,
or TLS configuration.

The result must use a strict, non-secret shape:

```json
{
  "operation": "approved-operation-alias",
  "outcome": "authenticated | rejected | unavailable | blocked",
  "receiptId": "broker-generated-nonsecret-id"
}
```

`outcome` intentionally maps raw HTTP and provider failures into coarse classes.
No remote response body, remote headers, raw status code, hostname, URL, or
exception message crosses the MCP tool boundary.

## Policy requirements

A later versioned policy format must bind one operation alias to:

- a normalized destination origin, method, and path;
- an allowed credential source alias;
- a fixed authorization-header construction rule;
- a caller-authorization rule;
- timeout, concurrency, and per-operation rate limits;
- an explicit egress/DNS trust rule;
- a disabled/enabled state; and
- a non-secret audit label.

The policy file must not store secret values. It must reject unknown fields,
duplicate aliases, relative or malformed destinations, HTTP, redirects, query
or body templates not approved for the operation class, and caller-provided
network overrides.

## Runtime safeguards

The future implementation must:

1. authenticate and authorize the caller before provider resolution;
2. validate the operation alias against a loaded, immutable policy snapshot;
3. resolve only the policy-bound secret source in broker memory;
4. construct only policy-owned request components;
5. use a direct HTTPS client with redirects disabled, no caller-provided proxy
   or TLS configuration, and a DNS/connection policy that rejects loopback,
   private, link-local, multicast, reserved, and rebinding-prone addresses
   before connecting and on any retry;
6. enforce request timeout, body-size limit, concurrency limit, and rate limit;
7. discard secret material, response body, and response headers as early as
   possible;
8. map results to a coarse public outcome;
9. emit only a value-free audit receipt; and
10. fail closed when policy, caller identity, provider access, destination,
    transport, or output validation is uncertain.

## Audit receipt

A durable audit event may contain only safe operational fields such as:

```json
{
  "operation": "approved-operation-alias",
  "outcome": "authenticated | rejected | unavailable | blocked",
  "receiptId": "broker-generated-nonsecret-id",
  "latencyBucket": "under-1s | under-5s | over-5s"
}
```

It must not contain request arguments, destination values, credential aliases,
secret references, headers, bodies, response values, raw error text, or a raw
stack trace.

## Test strategy

All initial tests use a local synthetic HTTPS double and synthetic secret
sentinel. Required negative tests include:

- undeclared MCP input is rejected before policy lookup;
- unknown, disabled, and duplicate operation aliases are rejected;
- caller authorization fails before secret resolution;
- HTTP, redirect, invalid certificate, timeout, prohibited resolved address,
  DNS-rebinding, and DNS/egress-policy failures return only a coarse outcome;
- response body, headers, raw status, exception text, and synthetic secret
  sentinel do not occur in tool output, audit events, or logs;
- fixed destination, method, path, and header template cannot be overridden;
- concurrency and rate limits fail closed; and
- disablement takes effect without needing secret rotation.

## Implementation blockers

Implementation remains blocked until maintainers provide:

1. a real caller-authentication boundary;
2. a reviewed policy-provisioning design;
3. a selected live provider adapter and its least-privilege permissions;
4. destination-specific egress and DNS controls;
5. a rollback/disablement procedure; and
6. independent security review plus explicit approval for a live configuration.
