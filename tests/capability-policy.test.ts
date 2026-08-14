import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { CapabilityPolicy } from "../src/capability-policy.js";
import { FakeMetadataBackend } from "../src/fake-metadata-backend.js";
import { InMemoryAuditSink } from "../src/audit.js";
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
