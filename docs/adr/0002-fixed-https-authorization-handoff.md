# ADR 0002: Fixed HTTPS authorization-header handoff

- **Status:** Proposed
- **Date:** 2026-08-14
- **Decision scope:** First future secret-consuming capability; not implemented in M0

## Context

The broker needs a legitimate future path to consume a credential without
returning plaintext to an MCP caller. A generic HTTP proxy, caller-specified
URL, caller-specified header, arbitrary request body, redirect following, or
provider selector would turn the broker into an exfiltration-capable authority.

The selected first design target is narrower: a policy-defined HTTPS request
where a policy-selected secret becomes a fixed Authorization header, and the
caller receives only a sanitized result.

M0 has no caller authentication, real provider adapter, or network transport.
It therefore cannot safely enable this capability.

## Proposed decision

A future capability, tentatively named `secret.handoff.https`, may execute a
single fixed request chosen only by a policy-defined operation alias.

The first operation class is an **authorization probe**:

- exactly one policy-defined `https` origin, method, and path;
- no caller-supplied URL, host, port, path, query, method, header name, header
  value, body, redirect behavior, proxy setting, or TLS option;
- no request body in the first operation class;
- one policy-selected secret alias resolved only inside the broker;
- one policy-defined Authorization-header format;
- redirects disabled;
- normal TLS certificate and hostname validation required;
- bounded timeout, request size, concurrency, and per-operation rate limit;
- no response body, response headers, raw status code, provider error, or secret
  material returned to the MCP caller; and
- a value-free receipt containing only an operation alias, coarse outcome, and
  broker-generated correlation identifier.

The MCP caller can request a named operation that is already listed by policy.
It cannot create or modify an operation, select its destination, or see its
secret reference.

## Required preconditions

This decision is not approval to implement a live adapter. Before enabling the
capability, all of the following are required:

1. a real caller-authentication and authorization design, because current stdio
   transport does not establish a strong caller identity;
2. a versioned policy schema and a safe provisioning mechanism, as proposed in
   [ADR 0003](0003-signed-local-policy-bundles.md);
3. an approved provider adapter that resolves a policy-selected secret without
   exposing it to MCP output, logs, errors, or persistent state;
4. a direct HTTP client configuration that refuses redirects and cannot inherit
   caller-controlled proxy or TLS overrides;
5. destination-specific egress and DNS controls, including a resolution and
   connection policy that rejects private, loopback, link-local, multicast,
   reserved, and rebinding-prone address targets both before connection and
   across any retry;
6. synthetic tests for success, failure, timeout, redirect, malformed policy,
   undeclared tool arguments, output leakage, audit leakage, and destination
   mismatch;
7. a threat-model update, rollback path, and independent security review; and
8. explicit human approval before any live provider, secret, or destination is
   configured.

## Result contract

The future tool result is intentionally coarse. Its exact public schema must be
validated at the MCP boundary, but it may contain only fields similar to:

```json
{
  "operation": "policy-defined-alias",
  "outcome": "authenticated | rejected | unavailable | blocked",
  "receiptId": "broker-generated-nonsecret-id"
}
```

It must never include a secret, a secret reference, destination URL, response
body, response headers, raw backend error, raw status, or unbounded diagnostic.

## Consequences

### Positive

- A secret can be consumed for one defined purpose without crossing the MCP
  response boundary.
- Destination authority is established by reviewed policy rather than a caller
  request.
- The first use case is easy to exercise with local synthetic HTTP doubles.
- The design offers a narrow base for later independently reviewed operations.

### Costs and risks

- This is still a network authority: a caller allowed to invoke the operation
  can cause a request carrying a credential to its fixed destination.
- A trusted destination can change behavior, and DNS/egress configuration can
  alter where a name resolves. Policy provisioning and network controls are
  security-critical.
- Current stdio transport has no sufficient client-identity boundary for a live
  handoff, so implementation must remain blocked until that issue is resolved.
- Generalizing to request bodies, multiple destinations, custom headers, or
  business actions requires another ADR and review; it is not an extension of
  this decision by default.

## Alternatives rejected

- **Generic HTTP proxy:** makes host, path, header, and body authority too broad.
- **Caller-supplied destination allowlist:** lets the caller assemble authority
  from inputs instead of selecting a reviewed operation.
- **Return the secret to let the caller perform HTTP:** breaks the intended
  plaintext boundary.
- **Local shell or environment-variable injection:** introduces process,
  environment, and command authority that cannot be bounded by this operation.
- **Enable on current M0 stdio alone:** lacks an adequate caller-identity and
  authorization model for live secret use.
