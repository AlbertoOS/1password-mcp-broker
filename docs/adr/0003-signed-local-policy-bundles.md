# ADR 0003: Signed, locally provisioned operation policy bundles

- **Status:** Proposed
- **Date:** 2026-08-14
- **Decision scope:** Future policy configuration and provisioning; no live policy loader in M0

## Context

ADR 0002 proposes a fixed HTTPS Authorization-header handoff selected by an
operation alias. That boundary is safe only if the alias-to-destination,
credential-source, caller-authorization, and egress rules cannot be assembled
or changed by the MCP caller.

A plain mutable configuration file in a convenient project directory is not an
adequate authority boundary. An attacker who can modify policy or its trust key
can redirect a credential-bearing request. A remotely fetched policy would add
bootstrap, replay, transport, and availability authority that the first live
capability does not need.

## Proposed decision

The first live policy mechanism will use a **signed, locally provisioned policy
bundle**, a fixed public verification-key source outside the mutable policy
bundle, and a trusted durable activation ledger outside both policy and staging
roots.

The broker loads a bundle only when all of these conditions hold:

1. trusted launch or immutable installation configuration names the canonical
   policy root, staging root, activation-ledger store, and either (a) the exact
   Ed25519 public-key bytes or (b) a public-key fingerprint plus a named,
   immutable OS/installation key source that resolves those exact bytes;
2. the broker opens configured roots once using descriptor-relative, no-follow
   operations and traverses every component via held directory descriptors;
3. policy and detached signature are opened as regular, unlinked files through
   those descriptors, are owned by the expected account, and have restrictive
   modes; changed device/inode/metadata, symlink, hardlink, or type state is
   rejected;
4. strict size-bounded policy and signature bytes are read exactly once through
   held descriptors, and those exact bytes—not a path reread—are signature
   verified, parsed, and installed into a newly created bundle directory;
5. the JSON schema is strict, has no duplicate keys, and policy semantics pass
   validation; and
6. the policy revision is strictly greater than the durable high-water mark,
   unless the submitted signed bytes have the same recorded full bundle digest and
   are therefore an idempotent re-apply. A lower revision is allowed only through
   a separately authenticated, explicitly audited rollback authorization.

The broker must never accept a verification key from a policy bundle, signature
metadata, candidate/staging tree, environment variable, network response, or
MCP input.

The policy contains only operation metadata and source aliases. It contains no
secret values, access tokens, private keys, secret references, real test
fixtures, or embedded trust keys.

Policy fetching, policy mutation through MCP, policy mutation through an HTTP
admin interface, automatic remote key rotation, and automatic rollback are not
part of this decision.

## Provisioning lifecycle

A future privileged local operator workflow will be explicit and two-phase:

1. **Prepare:** assemble a policy bundle and detached signature under one
   operator-approved staging root, outside the active policy root.
2. **Preview:** acquire no-follow descriptor handles, verify the exact bounded
   bytes against the immutable key source, validate semantics, calculate the full
   bundle digest, compare it with the trusted durable ledger, and show only a
   short display fingerprint plus a redacted operation summary. This makes no
   active change.
3. **Apply:** acquire the transaction-wide exclusive trusted-ledger lock and
   compare-and-swap the expected ledger generation. Require an explicit apply
   flag and local authorization; create and fsync a durable
   `prepared-activation` record containing transaction ID, prior state (or
   explicit `null` for first activation), target revision/digest, and expected
   ledger generation. Install only the already verified bytes into a newly
   created restrictive directory, fsync files and parent directories, atomically
   switch the active directory reference, and fsync the active-selector parent.
4. **Read back:** reopen the activated files through the production no-follow
   descriptor path and require the exact target digest. On success, atomically
   commit the ledger's active revision/digest and retained-bundle index, clear
   the pending transaction, fsync the trusted ledger and its parent, then release
   the lock. On failure, durably transition the journal to `abort-intent` and
   fsync it before attempting to restore prior active state.
5. **Rollback:** use the same serialized transaction protocol and require a
   separate authenticated, expiring, single-use rollback authorization bound to
   the broker installation, current ledger generation, target revision, and
   target full digest. Durably consume its authorization ID when preparing the
   transaction and retain the high-water mark rather than lowering it.

Startup acquires the exclusive ledger lock and performs deterministic recovery
before exposing any secret-consuming capability. With no pending journal, it
reopens the active bundle through the no-follow production path and requires its
revision/full digest to equal the trusted ledger's active state. With a
`prepared-activation` journal, it finalizes only when the target digest matches,
aborts only when the prior digest matches (or when explicit null-prior state has
no active selector), or disables the capability if neither trusted state matches.
With an `abort-intent` journal, it restores the prior selector (or no selector
for null prior) if needed, fsyncs that selector parent, and only then clears the
journal. A failed post-switch read-back follows this `abort-intent` recovery
path: it preserves the in-memory last-known-good snapshot and never treats
restoration as automatic rollback. A failed reload likewise preserves the
last-known-good snapshot and emits only a value-free reload-failure audit event.
A startup with no verified policy must expose no secret-consuming capability.

## Digest, ledger, and rollback authorization

The security comparison value is the full 64-byte SHA-512 digest of this exact
binary transcript, in order: the UTF-8 bytes of
`1password-mcp-broker/policy-bundle/v1` followed by exactly one byte `0x00`;
one-byte tag `0x01` plus unsigned 32-bit big-endian constant `1`; tag `0x02`
plus unsigned 32-bit big-endian length plus exact 32-byte Ed25519 public-key
bytes; tag `0x03` plus unsigned 64-bit big-endian length plus exact policy
bytes; and tag `0x04` plus unsigned 64-bit big-endian length plus exact 64-byte
detached-signature bytes. Format constant `1` is
normatively tied to a JSON `schemaVersion` number exactly equal to `1`; any
other number, non-number, or omitted field is rejected after decoding. The full
digest is stored and compared in trusted state; any shortened encoding may appear
in operator/audit output only and must never be used for acceptance, equality,
rollback, or retained-bundle lookup.

For format `1`, the detached signature is exactly 64 bytes and is verified as
Ed25519 over this exact signing input: the UTF-8 bytes of
`1password-mcp-broker/policy-signature/v1` followed by exactly one byte `0x00`,
then unsigned 64-bit big-endian policy-byte length and the exact policy bytes. No signature algorithm
or signing-input negotiation is permitted at runtime.

The trusted activation ledger is protected outside mutable policy/staging roots
and records its own monotonically increasing generation, high-water revision,
active revision/full digest, a durable retained revision-to-full-digest index,
pending transaction details, and consumed rollback-authorization identifiers.
It is updated with a crash-safe journal and fsync discipline through the same
no-follow descriptor rules. Retained directory names are never trusted as
identity; their bytes must re-verify to the ledger's full digest.

A rollback authorization is a detached artifact authenticated by a separately
pinned rollback-authority key source. Its fixed signed payload includes format
version, broker installation identity, authorization ID, issue/expiry times,
current ledger generation and high-water state, target revision/full digest, and
its one permitted state transition. The broker rejects expired, mismatched,
already-consumed, or malformed artifacts and durably records consumption before
the rollback can switch the active reference.

## Policy semantics

Each operation must bind exactly one:

- stable non-secret operation alias;
- future authenticated caller authorization rule;
- HTTPS-only normalized destination origin, method, and exact path;
- source alias resolved by a future provider adapter;
- fixed Authorization-header rule and fixed non-secret header allowlist;
- public-address-only DNS/connection rule and egress constraint;
- timeout, concurrency, and rate limit;
- enabled/disabled state; and
- non-secret audit label.

The schema rejects duplicate aliases, unknown fields, HTTP, IP literals,
userinfo, fragments, caller templates, query/body fields for the authorization
probe operation, redirects, caller-selected proxy/TLS configuration, and any
secret-bearing value.

## Consequences

### Positive

- The MCP caller chooses only from a reviewed operation set.
- A policy signature is meaningful because the verifying public key is outside
  the mutable policy directory.
- Preview/apply/read-back makes authority changes inspectable and reversible.
- A strict policy creates a testable seam before provider or network integration.

### Costs and risks

- Signing-key custody and pinned-key rotation become operational responsibilities.
- File ownership, mode, and atomic-update behavior differ across platforms and
  require careful implementation and fixture tests.
- A signed policy cannot compensate for an overly broad operation schema or a
  compromised configured destination.
- This design does not solve caller authentication; live handoff remains blocked
  until a separate caller-identity decision is accepted.

## Architecture-review gates

An independent architecture review found unresolved blockers in trusted-state
rollback resistance, ledger transaction representation, locking semantics,
preview-to-apply binding, selector format, complete no-follow coverage,
rollback-authorization canonicalization and trusted time, startup admission,
parser/Ed25519 profiles, MCP/operator separation, and platform support. The
full public-safe record is [the policy-provisioning architecture review](../reviews/2026-08-14-policy-provisioning-architecture-review.md).

These are implementation blockers. This ADR remains **Proposed** and does not
authorize a loader, provider adapter, live handoff, or secret-consuming
capability until they have concrete, testable, platform-scoped resolutions and
fresh independent review. Maintainers have explicitly deferred the platform,
rollback-resistant trust-anchor, and privileged-local-administration/backup-
restore assumptions; M0/public-artifact work may continue, but all live policy
activation remains blocked.

## Alternatives rejected

- **Unsigned editable configuration:** policy integrity depends only on mutable
  filesystem access.
- **Policy key stored beside the policy:** an attacker who edits the bundle can
  replace both policy and verifier.
- **MCP-managed policy writes:** lets an MCP caller modify the authority it uses.
- **Remote policy fetch first:** adds a remote bootstrap and availability
  dependency before local authority controls are established.
- **Generic environment-variable configuration:** is difficult to audit, easy to
  accidentally log, and cannot express a bounded operation contract safely.
