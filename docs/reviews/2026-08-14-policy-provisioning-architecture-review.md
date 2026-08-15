# Architecture review: signed local policy provisioning

- **Date:** 2026-08-14
- **Scope:** Proposed ADR 0003 and its supporting signed-local-policy-bundle
  design
- **Status:** Open blockers; not implementation approval
- **Implementation impact:** M0 remains fake-backend-only and must not load
  policy, consume secrets, connect to a provider, or make live network requests.

## Purpose

This is a public-safe record of the configured independent architecture review
of the proposed local policy-provisioning authority. It records review findings,
not accepted implementation decisions. A future design revision must resolve
these blockers, define platform-specific guarantees, and receive fresh review
before any live capability is considered.

## Current disposition

Maintainers defer selection of the first platform, rollback-resistant trust
anchor, and privileged-local-administration/backup-restore threat assumptions.
Accordingly, ADR 0003 remains **Proposed** and no policy loader, activation
ledger, provider adapter, live HTTPS handoff, or secret-consuming capability may
be implemented. M0 and public-artifact work may continue without resolving this
decision.

## Required resolution areas

### 1. Anchor trusted state against rollback

A ledger outside the policy and staging roots can still be replaced by a
privileged local actor or restored from backup. The design must either bind its
generation/high-water state to a rollback-resistant external anchor (such as a
suitable platform-backed monotonic facility), or explicitly scope out local
privilege, backup restore, and trusted-state-root rollback. Missing, corrupt, or
regressed anchor state must disable secret-consuming capability.

### 2. Define one durable ledger-record protocol

Specify a bounded, versioned ledger record and its complete same-filesystem
write protocol: create a restrictive temporary record, write complete next
state, fsync it, atomically replace the prior record, and fsync the ledger
directory. Define integrity/corruption detection, recovery of temporary or
previous records, size limits, and generation-overflow behavior. Rollback
authorization consumption must be durable in the prepared rollback state and
remain permanent after failed apply, abort, and recovery. The design must also
state whether ledger integrity relies on protected OS ownership/service isolation
or cryptographic authentication rooted outside ledger storage.

### 3. Define lock and compare-and-swap primitives

A replaceable ledger record cannot itself serve as the lock object. Define a
stable, descriptor-opened, no-follow lock object outside replaceable records;
hold it across read, prepare, selector switch, read-back, commit/abort, and
startup recovery. Generation CAS is mandatory. Lock acquisition/loss ambiguity,
stale-lock ambiguity, or CAS failure must fail closed. Network/shared filesystems
are unsupported unless separately designed and tested.

### 4. Bind preview approval to apply safely

A preview cannot retain trusted descriptors, decoded policy, or validation
results during human approval. Preview must emit a receipt bound to full bundle
digest, verification-key identity, candidate format/version, and observed ledger
generation. Apply must reacquire the stable lock, require expected generation and
the approved receipt, reopen and fully revalidate the candidate, and require its
full digest to match the receipt.

### 5. Specify the active-selector representation

Define one selector representation rather than leaving “atomically switch”
abstract. A restrictive regular selector record containing a retained-bundle ID
and full digest should be evaluated in preference to a mutable symlink. Define
its exact format, ownership, mode, link-count requirements, descriptor-relative
open/replace sequence, parent-directory fsync, containment within the retained
root, and mandatory full-digest reverification.

### 6. Apply no-follow traversal to every mutable state root

The transaction-wide held-descriptor/no-follow invariant must cover policy,
staging, retained, selector, ledger, lock, journal, and recovery roots. Define
expected ownership, mode, type, link count, device/inode stability, and
post-open validation for every file and directory class.

### 7. Canonically sign rollback authorizations

Define a versioned binary rollback-authorization transcript: exact domain bytes
and terminator, tags, order, field widths/endian encoding, string encoding and
bounds, broker installation identity, signer/key identity, authorization ID,
transition type, current generation/active/high-water state, target state, and
issue/not-before/expiry time. Pin its signer outside mutable state and reject
unsupported versions, malformed/noncanonical values, excess fields, and wrong
lengths before a journal mutation.

### 8. Define a trusted-time model

Authorization expiry is not a security control if the local clock can move
backward. Require a protected/trusted clock model, or persist a conservative
maximum authorization-validation time and reject backward, unavailable, or
implausible time. If neither is feasible, document expiry as non-authoritative
and retain generation binding, explicit authorization, and permanent single-use
consumption as the relevant controls.

### 9. Make startup admission complete

Digest equality alone does not make capability enablement safe. Every startup
and recovery path must use one admission predicate: descriptor-relative no-follow
reopen; ownership/type/link/mode/inode checks; full-digest recomputation;
Ed25519 verification; strict decode; schema and semantic validation; revision
comparison; and exact ledger/index agreement. Any disagreement disables
secret-consuming capability.

### 10. Specify parsing and Ed25519 verification profiles

Define valid UTF-8, duplicate-key rejection at every depth, maximum nesting,
array/string/total-byte limits, unknown-field behavior, and exact integer forms
for security-relevant values. Reject unsafe numeric representations and avoid
post-verification silent canonicalization. Name an Ed25519 verification profile
that rejects malformed/noncanonical encodings, small-order cases, and
compatibility/prehash/context fallbacks.

### 11. Prove MCP/operator authority separation

No MCP tool, request field, session identity, inherited environment, network
input, or MCP-launched process may select a candidate or retained bundle,
initiate provisioning/recovery, submit rollback authorization, choose trust
roots/keys, or alter handoff destination, source alias, headers, provider, TLS,
or proxy behavior. Until a separately reviewed authenticated operator boundary
exists, provisioning must remain outside the MCP server process or be disabled.

### 12. Constrain the first platform/filesystem support matrix

Document the initially supported OS/filesystem matrix and required primitives:
descriptor-relative no-follow access, atomic replacement, directory fsync,
durable locking, ownership/mode checks, and crash behavior. Unsupported
platforms/filesystems must reject activation. If the Node runtime cannot provide
the guarantees, a narrowly scoped native component is required rather than
path-based emulation. Require crash-injection and concurrency fixtures for every
write/rename/fsync boundary, ledger/selector swap, malformed-ledger recovery,
authorization replay, lock contention, and time-source failure.

## Acceptance condition

The proposed policy design cannot advance to implementation until each area has
a concrete, testable, platform-scoped resolution; the threat model and ADR are
updated; negative fixtures are defined; and an independent security/architecture
review accepts the revision. This record does not authorize a provider adapter,
actual 1Password access, live HTTPS handoff, or secret consumption.
