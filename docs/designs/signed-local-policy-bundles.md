# Signed Local Policy Bundle Design

> **Design only.** M0 does not load policy bundles, verify signatures, create
> directories, connect to a provider, or make network requests. This design is
> a prerequisite for any future live fixed HTTPS handoff.

## Goals

- Keep credential authority in reviewed operations rather than caller input.
- Permit a local operator to inspect, verify, apply, and roll back policy
  explicitly.
- Ensure policy integrity does not depend on a trust key located beside mutable
  policy content.
- Keep policy values, receipts, and logs free of secret material.
- Fail closed: no verified policy means no secret-consuming operation.

## Trust layout

```text
Broker launch / immutable installation configuration
  ├── canonical policy, staging, and trusted-ledger roots
  └── exact Ed25519 public-key bytes, or fingerprint + named immutable OS key source

Trusted activation ledger (outside policy and staging roots)
  ├── generation, high-water revision, active revision/full bundle digest
  ├── retained revision-to-full-digest index
  ├── pending activation journal
  └── consumed rollback-authorization IDs

Local operator
  └── signs a bounded policy document using an offline/private signing key

Configured policy root (restrictive permissions)
  ├── active/               # atomically selected verified bundle
  │   ├── policy.json
  │   └── policy.json.sig
  └── retained/<revision>-<fingerprint>/  # prior verified bundles
```

The signing private key and real policy bundle are never committed to this
repository. A policy directory may contain sensitive metadata such as operation
labels or destinations, so it is local operational state rather than source
control content.

## Bundle validity

Before accepting a bundle, the broker must verify all of the following without
contacting a provider or destination:

1. launch/installation configuration supplies the exact verification-key bytes,
   or supplies a fingerprint plus the identity of an immutable OS/installation
   key source that returns those bytes; no candidate/bundle/environment/network
   or MCP value may provide a key;
2. configured roots are opened once with descriptor-relative no-follow operations,
   and every traversal uses held directory descriptors rather than re-resolved
   path strings;
3. candidate policy and signature are opened as non-symlinked regular files;
   device, inode, ownership, link count, type, and restrictive mode requirements
   are checked through held descriptors and changed metadata is rejected;
4. strict size-bounded bytes are read exactly once through those descriptors;
   the detached signature, parser, schema validation, and installer all consume
   those same in-memory bytes rather than rereading candidate paths;
5. JSON is decoded once, has no duplicate keys, and passes a strict versioned
   schema with bounded array lengths and string sizes;
6. aliases and operation semantics are unique and valid; and
7. the signed revision is strictly greater than the trusted durable high-water
   revision, except a same-revision bundle may be idempotently re-applied only
   when its recorded full bundle digest is identical. Lower revisions require a
   separately authenticated rollback authorization and do not lower the
   high-water mark.

Any failure rejects the candidate bundle. It must not result in partial policy
activation, provider resolution, network traffic, or a detailed error being
returned to an MCP caller.

## Full bundle digest and trusted ledger

The acceptance/equality value is the full 64-byte SHA-512 digest of this exact
binary transcript, in order: the UTF-8 bytes of
`1password-mcp-broker/policy-bundle/v1` followed by exactly one byte `0x00`;
one-byte tag `0x01` plus unsigned 32-bit big-endian constant `1`; tag `0x02`
plus unsigned 32-bit big-endian length plus exact 32-byte Ed25519 public-key
bytes; tag `0x03` plus unsigned 64-bit big-endian length plus exact policy
bytes; and tag `0x04` plus unsigned 64-bit big-endian length plus exact 64-byte
detached-signature bytes. Format constant `1` is
normatively tied to a JSON `schemaVersion` number exactly equal to `1`; any
other number, non-number, or omitted field is rejected after decoding. The
implementation stores and compares this full digest. A truncated fingerprint is
audit/display-only and is never used for acceptance, idempotence, rollback,
retained-bundle lookup, or recovery.

For format `1`, the detached signature is exactly 64 bytes and is verified as
Ed25519 over this exact signing input: the UTF-8 bytes of
`1password-mcp-broker/policy-signature/v1` followed by exactly one byte `0x00`,
then unsigned 64-bit big-endian policy-byte length and the exact policy bytes. No signature algorithm
or signing-input negotiation is permitted at runtime.

The trusted ledger is outside mutable policy/staging roots and persists:

- monotonically increasing ledger generation;
- high-water revision;
- active revision and full bundle digest;
- retained revision-to-full-digest bindings;
- pending activation transaction state; and
- consumed rollback-authorization IDs.

Ledger and journal records use the same descriptor-relative no-follow, atomic
write, and fsync discipline as bundle activation. A mutable retained directory
name is not trusted: the bundle bytes must be reopened and reverified against
the ledger's full digest before use.

## Schema sketch

This is illustrative only; values are placeholders and not a usable live
configuration.

```json
{
  "schemaVersion": 1,
  "revision": 42,
  "operations": [
    {
      "alias": "example.authorization-probe",
      "enabled": true,
      "callerRule": "future-authenticated-subject-rule",
      "destination": {
        "origin": "https://service.example.invalid",
        "method": "GET",
        "path": "/fixed/probe",
        "addressPolicy": "public-addresses-only"
      },
      "authorization": {
        "headerName": "Authorization",
        "format": "Bearer",
        "sourceAlias": "local-provider-source-alias"
      },
      "limits": {
        "timeoutMs": 3000,
        "maxConcurrent": 1,
        "requestsPerMinute": 5
      },
      "auditLabel": "example-authorization-probe"
    }
  ]
}
```

The first operation class forbids query, body, redirect, custom headers,
endpoint templates, proxy settings, and TLS overrides. `sourceAlias` identifies
only a future broker-local source mapping; it is neither a secret value nor a
provider-specific secret reference.

## Safe provisioning contract

A future provisioning command must be designed as a guarded local operation:

```text
broker policy verify  --bundle-dir <candidate>
broker policy preview --bundle-dir <candidate>
broker policy apply   --bundle-dir <candidate> --expect-revision <n> --apply
broker policy rollback --to-revision <n> --apply
```

The exact command names are not implemented or reserved. Their required safety
properties are:

| Stage | Required behavior |
| --- | --- |
| Verify | Read-only validation through held no-follow descriptors; never writes or connects to provider/network. |
| Preview | Shows revision, short display fingerprint, verification-key fingerprint, aliases, enablement, and a redacted destination classification—not secret source values or raw credential metadata. |
| Apply | Acquires transaction-wide exclusive ledger lock and generation CAS; requires explicit `--apply`; fsyncs prepared journal with prior state (or null), target revision/full digest, and generation; installs verified bytes, fsyncs, switches active selector, fsyncs selector parent, reopens/digest-checks, then commits ledger active/index/high-water and clears journal. |
| Rollback | Uses the same serialization and requires explicit `--apply` plus an unexpired single-use authorization bound to installation identity, current ledger generation/high-water, target revision/full digest, and one transition; its ID is durably consumed before switching. |
| Post-switch read-back failure | Durably writes and fsyncs `abort-intent` before restoration; recovery restores only prior state (or null), fsyncs selector parent, and preserves last-known-good memory snapshot. |
| Startup recovery | Under exclusive lock, with no journal recomputes active digest and requires ledger equality; with prepared journal finalizes only target, aborts only prior/null, and otherwise fails closed; with abort-intent completes prior/null restoration before clearing journal. |

No command should accept a policy document over MCP, standard input, clipboard,
or a caller-selected unrestricted file path. Candidate paths must be constrained
to an operator-approved staging root, with canonicalization and symlink refusal.

## Crash-safe activation and rollback

The trusted ledger is a serialized state machine, not two unrelated files. A
transaction-wide exclusive ledger lock plus durable generation compare-and-swap
covers preview-to-commit, rollback, and startup recovery. Its prepared journal
contains transaction ID, ledger generation, operation kind, prior active
revision/full digest (or explicit null for first activation), target
revision/full digest, and—for rollback—the rollback-authorization ID and full
authorization digest. The journal and parent are fsynced before an
active-reference switch; the target bytes are then re-opened and verified; the
active-selector parent is fsynced; only after that check does a committed ledger
record update active state, retained index, high-water state, and journal removal
in one durable ledger transaction.

If a process crashes, startup takes the exclusive lock and reads the journal
before enabling any operation. Without a journal, it recomputes the active
bundle's full digest and requires exact equality with trusted ledger state. With
a prepared journal, it finalizes only when active bytes match the target full
digest; it aborts only when they match prior full digest or, for null prior,
when no active selector exists. With a durable `abort-intent` journal, it
restores prior/null selector state, fsyncs the selector parent, and then clears
the journal. Any other state is an integrity failure and leaves secret-consuming
capability disabled. This recovery rule keeps durable ledger and active-reference
state coherent without relying on an in-memory snapshot.

A rollback authorization is separately signed by a rollback-authority public key
pinned outside policy/staging roots. Its fixed payload includes format version,
broker installation identity, authorization ID, issue/expiry time, current ledger
generation, high-water revision/full digest, target revision/full digest, and a
single allowed transition. The broker verifies all bindings and durable
single-use consumption before the switch. The trusted retained index, rather
than a directory name, identifies which retained bytes may be reverified as the
target.

## Key lifecycle

- The policy signing private key is held outside the broker host when possible.
- The broker receives exact Ed25519 public-key bytes from immutable launch or
  installation configuration, or resolves them from one named immutable
  OS/installation key source after checking its configured fingerprint.
- It never accepts a verification key, key path, key-source name, or key
  fingerprint from a bundle, signature metadata, staging tree, environment,
  network response, or MCP input.
- Key rotation is an explicit, separately reviewed installation/launch
  configuration change that supports an overlap period and read-back verification.
- A distinct rollback-authority public key, if used, follows the same immutable
  source and explicit rotation rules; policy update cannot introduce either key.
- Signature algorithm, key size, canonical signing input, and rollback-
authorization format must be fixed and versioned before implementation; no
algorithm negotiation occurs at runtime.

## Audit model

A policy event can include only safe fields such as:

```json
{
  "event": "policy-activated | policy-rejected | policy-rollback",
  "revision": 42,
  "bundleFingerprint": "nonsecret-short-fingerprint",
  "outcome": "allowed | blocked"
}
```

It must not include policy document content, paths, destination values, source
aliases, signature bytes, secret references, raw parser errors, or stack traces.

## Required tests before implementation

Use temporary local fixtures and generated test keys only. Required tests cover:

- valid signed bundle activation and read-back;
- tampered content, wrong key, malformed signature, oversized bundle, duplicate
  JSON key, unknown field, and unsupported schema version;
- descriptor-relative no-follow traversal, symlink/path traversal, ownership/mode,
  hardlink, non-regular file, inode/metadata swap, and TOCTTOU attempts;
- proof that signature verification and installation consume identical held-file
  bytes, not a candidate path reread;
- duplicate aliases, malformed origins, HTTP, IP literals, query/body/template,
  and caller-controlled proxy/TLS configuration;
- full domain-separated bundle-digest equality versus audit-display truncation;
- exclusive-lock/generation-CAS contention, selector-parent fsync, normal
  startup active-to-ledger digest equality, initial null-prior activation, and
  crash during every prepared/abort-intent/commit journal stage;
- stale/equal revision behavior, durable high-water and retained-index state
  across restart, explicit single-use authorized rollback, failed post-switch
  read-back restoration, and last-known-good behavior;
- absence of synthetic secret sentinels from preview, error, audit, and MCP
  output; and
- proof that invalid policy causes no provider resolution or network request.

## Implementation blockers

Before implementation, maintainers still need:

1. a caller-authentication ADR compatible with the deployment model;
2. a signed-input format and key-management operational runbook;
3. platform-specific secure-file-operation behavior and fixture tests;
4. an approved future provider adapter with least privilege;
5. destination-specific DNS/egress controls; and
6. independent security review plus explicit approval for any live bundle.
