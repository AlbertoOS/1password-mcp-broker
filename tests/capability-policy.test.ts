import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { CapabilityPolicy } from "../src/capability-policy.js";
import { FakeMetadataBackend } from "../src/fake-metadata-backend.js";
import { InMemoryAuditSink, type AuditSink } from "../src/audit.js";
import { createMcpServer } from "../src/server.js";

test("capability status exposes only explicitly enabled capability names", () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status"],
  });

  assert.deepEqual(policy.status(), {
    enabledCapabilities: ["capability.status"],
  });
});

test("capability policy rejects an unknown capability before it can be enabled", () => {
  assert.throws(
    () => CapabilityPolicy.fromManifest({ enabledCapabilities: ["vault.write"] }),
    /unknown capability/i,
  );
});

test("capability policy rejects duplicate capabilities", () => {
  assert.throws(
    () =>
      CapabilityPolicy.fromManifest({
        enabledCapabilities: ["capability.status", "capability.status"],
      }),
    /duplicate capability/i,
  );
});

test("MCP registers and serves only the policy-approved status tool", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status"],
  });
  const server = createMcpServer(policy);
  const client = new Client({ name: "broker-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ["capability_status"]);

  const result = await client.callTool({ name: "capability_status", arguments: {} });
  assert.deepEqual(result.structuredContent, {
    enabledCapabilities: ["capability.status"],
  });

  const rejected = await client.callTool({
    name: "capability_status",
    arguments: { vault: "caller-controlled-selector" },
  });
  assert.equal(rejected.isError, true);

  await Promise.all([client.close(), server.close()]);
});

test("capability status remains consistent with the complete registered tool set", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const server = createMcpServer(policy);
  const client = new Client({ name: "broker-registration-consistency-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const status = await client.callTool({ name: "capability_status", arguments: {} });
  const { tools } = await client.listTools();

  assert.deepEqual(status.structuredContent, {
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  assert.deepEqual(tools.map((tool) => tool.name), [
    "capability_status",
    "list_approved_metadata",
  ]);

  await Promise.all([client.close(), server.close()]);
});

test("stdio entrypoint exposes the capability status tool", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    stderr: "pipe",
  });
  const client = new Client({ name: "broker-stdio-test-client", version: "0.0.0" });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), ["capability_status"]);
  } finally {
    await client.close();
  }
});

test("metadata discovery is registered only when its capability is enabled", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const backend = new FakeMetadataBackend([
    { id: "fixture-001", label: "Example integration", category: "api-credential" },
  ]);
  const server = createMcpServer(policy, backend);
  const client = new Client({ name: "broker-metadata-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ["capability_status", "list_approved_metadata"]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.deepEqual(result.structuredContent, {
    records: [{ id: "fixture-001", label: "Example integration", category: "api-credential" }],
  });

  const rejected = await client.callTool({
    name: "list_approved_metadata",
    arguments: { item: "caller-controlled-selector" },
  });
  assert.equal(rejected.isError, true);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery rejects an oversized backend response", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const audit = new InMemoryAuditSink();
  const backend = new FakeMetadataBackend(
    Array.from({ length: 101 }, (_, index) => ({
      id: `fixture-${index}`,
      label: "Example integration",
      category: "api-credential",
    })),
  );
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-oversized-metadata-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Approved metadata is unavailable." }]);
  assert.equal(result.structuredContent, undefined);
  assert.deepEqual(audit.events(), [{ tool: "list_approved_metadata", outcome: "blocked" }]);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery rejects an overlong backend label", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const audit = new InMemoryAuditSink();
  const backend = new FakeMetadataBackend([
    { id: "fixture-006", label: "x".repeat(257), category: "api-credential" },
  ]);
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-overlong-label-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Approved metadata is unavailable." }]);
  assert.equal(result.structuredContent, undefined);
  assert.deepEqual(audit.events(), [{ tool: "list_approved_metadata", outcome: "blocked" }]);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery accepts records at every response limit", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const audit = new InMemoryAuditSink();
  const boundedRecord = {
    id: "i".repeat(128),
    label: "l".repeat(256),
    category: "c".repeat(64),
  };
  const backend = new FakeMetadataBackend(Array.from({ length: 100 }, () => boundedRecord));
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-metadata-boundary-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, { records: Array.from({ length: 100 }, () => boundedRecord) });
  assert.deepEqual(audit.events(), [
    { tool: "list_approved_metadata", outcome: "allowed", recordCount: 100 },
  ]);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery rejects an overlong backend id", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const audit = new InMemoryAuditSink();
  const rejectedId = "i".repeat(129);
  const backend = new FakeMetadataBackend([
    { id: rejectedId, label: "Example integration", category: "api-credential" },
  ]);
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-overlong-id-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Approved metadata is unavailable." }]);
  assert.equal(result.structuredContent, undefined);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(rejectedId));
  assert.deepEqual(audit.events(), [{ tool: "list_approved_metadata", outcome: "blocked" }]);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery rejects an overlong backend category", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const audit = new InMemoryAuditSink();
  const rejectedCategory = "c".repeat(65);
  const backend = new FakeMetadataBackend([
    { id: "fixture-007", label: "Example integration", category: rejectedCategory },
  ]);
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-overlong-category-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Approved metadata is unavailable." }]);
  assert.equal(result.structuredContent, undefined);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(rejectedCategory));
  assert.deepEqual(audit.events(), [{ tool: "list_approved_metadata", outcome: "blocked" }]);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery strips undeclared fields from a backend response", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const backend = {
    listApprovedMetadata: () => [
      {
        id: "fixture-002",
        label: "Example integration",
        category: "api-credential",
        concealedValue: "synthetic-secret-must-not-cross-the-tool-boundary",
      },
    ],
  } as unknown as FakeMetadataBackend;
  const server = createMcpServer(policy, backend);
  const client = new Client({ name: "broker-redaction-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.deepEqual(result.structuredContent, {
    records: [{ id: "fixture-002", label: "Example integration", category: "api-credential" }],
  });

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery sanitizes backend failures before they cross MCP", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const audit = new InMemoryAuditSink();
  const backend = {
    listApprovedMetadata: () => {
      throw new Error("synthetic-secret-must-not-cross-the-error-boundary");
    },
  } as unknown as FakeMetadataBackend;
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-error-redaction-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Approved metadata is unavailable." }]);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret-must-not-cross-the-error-boundary/);
  assert.deepEqual(audit.events(), [{ tool: "list_approved_metadata", outcome: "blocked" }]);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery sanitizes schema-validation failures before they cross MCP", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const audit = new InMemoryAuditSink();
  const backend = {
    listApprovedMetadata: () => [
      {
        id: "fixture-005",
        label: "Example integration",
        category: 42,
        concealedValue: "synthetic-secret-must-not-cross-the-schema-error-boundary",
      },
    ],
  } as unknown as FakeMetadataBackend;
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-schema-error-redaction-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Approved metadata is unavailable." }]);
  assert.equal(result.structuredContent, undefined);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret-must-not-cross-the-schema-error-boundary/);
  assert.deepEqual(audit.events(), [{ tool: "list_approved_metadata", outcome: "blocked" }]);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery sanitizes an audit failure after approved metadata", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const backend = new FakeMetadataBackend([
    { id: "fixture-004", label: "Example integration", category: "api-credential" },
  ]);
  const audit: AuditSink = {
    record: () => {
      throw new Error("synthetic-audit-secret-must-not-cross-the-allowed-boundary");
    },
  };
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-allowed-audit-error-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Approved metadata is unavailable." }]);
  assert.equal(result.structuredContent, undefined);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-audit-secret-must-not-cross-the-allowed-boundary/);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery sanitizes an audit failure after backend rejection", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const backend = {
    listApprovedMetadata: () => {
      throw new Error("synthetic-backend-secret-must-not-cross-the-blocked-boundary");
    },
  } as unknown as FakeMetadataBackend;
  const audit: AuditSink = {
    record: () => {
      throw new Error("synthetic-audit-secret-must-not-cross-the-blocked-boundary");
    },
  };
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-blocked-audit-error-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "list_approved_metadata", arguments: {} });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Approved metadata is unavailable." }]);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-(backend|audit)-secret-must-not-cross-the-blocked-boundary/);

  await Promise.all([client.close(), server.close()]);
});

test("capability status records only a safe audit event", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status"],
  });
  const audit = new InMemoryAuditSink();
  const server = createMcpServer(policy, new FakeMetadataBackend([]), audit);
  const client = new Client({ name: "broker-audit-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  await client.callTool({ name: "capability_status", arguments: {} });

  assert.deepEqual(audit.events(), [{ tool: "capability_status", outcome: "allowed" }]);

  await Promise.all([client.close(), server.close()]);
});

test("capability status sanitizes an audit failure before it crosses MCP", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status"],
  });
  const audit: AuditSink = {
    record: () => {
      throw new Error("synthetic-capability-status-audit-secret-must-not-cross");
    },
  };
  const server = createMcpServer(policy, new FakeMetadataBackend([]), audit);
  const client = new Client({ name: "broker-status-audit-error-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: "capability_status", arguments: {} });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Capability status is unavailable." }]);
  assert.equal(result.structuredContent, undefined);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-capability-status-audit-secret-must-not-cross/);

  await Promise.all([client.close(), server.close()]);
});

test("metadata discovery audit event contains no backend values", async () => {
  const policy = CapabilityPolicy.fromManifest({
    enabledCapabilities: ["capability.status", "metadata.discovery"],
  });
  const audit = new InMemoryAuditSink();
  const backend = {
    listApprovedMetadata: () => [
      {
        id: "fixture-003",
        label: "Example integration",
        category: "api-credential",
        concealedValue: "synthetic-secret-must-not-cross-the-audit-boundary",
      },
    ],
  } as unknown as FakeMetadataBackend;
  const server = createMcpServer(policy, backend, audit);
  const client = new Client({ name: "broker-metadata-audit-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  await client.callTool({ name: "list_approved_metadata", arguments: {} });

  assert.deepEqual(audit.events(), [
    { tool: "list_approved_metadata", outcome: "allowed", recordCount: 1 },
  ]);

  await Promise.all([client.close(), server.close()]);
});
