import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { CapabilityPolicy } from "./capability-policy.js";
import { NullAuditSink, type AuditSink } from "./audit.js";
import { FakeMetadataBackend, type MetadataBackend } from "./fake-metadata-backend.js";

const emptyInputSchema = z.object({}).strict();
const capabilityNameSchema = z.enum(["capability.status", "metadata.discovery"]);
const capabilityStatusSchema = z.object({
  enabledCapabilities: z.array(capabilityNameSchema),
});
const metadataDiscoverySchema = z.object({
  records: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      category: z.string(),
    }),
  ),
});

export function createMcpServer(
  policy: CapabilityPolicy,
  metadataBackend: MetadataBackend = new FakeMetadataBackend([]),
  audit: AuditSink = new NullAuditSink(),
): McpServer {
  const server = new McpServer({
    name: "1password-mcp-broker",
    version: "0.0.0-private",
  });

  if (policy.isEnabled("capability.status")) {
    server.registerTool(
      "capability_status",
      {
        title: "Capability Status",
        description: "Report the enabled non-secret broker capabilities.",
        inputSchema: emptyInputSchema,
        outputSchema: capabilityStatusSchema,
        annotations: readOnlyAnnotations,
      },
      () => {
        const { enabledCapabilities } = policy.status();
        audit.record({ tool: "capability_status", outcome: "allowed" });
        return {
          content: [{ type: "text", text: "Capability status returned." }],
          structuredContent: { enabledCapabilities },
        };
      },
    );
  }

  if (policy.isEnabled("metadata.discovery")) {
    server.registerTool(
      "list_approved_metadata",
      {
        title: "List Approved Metadata",
        description: "List policy-approved metadata from the configured backend. Never returns secret values.",
        inputSchema: emptyInputSchema,
        outputSchema: metadataDiscoverySchema,
        annotations: readOnlyAnnotations,
      },
      () => {
        const structuredContent = metadataDiscoverySchema.parse({
          records: metadataBackend.listApprovedMetadata(),
        });
        audit.record({
          tool: "list_approved_metadata",
          outcome: "allowed",
          recordCount: structuredContent.records.length,
        });
        return {
          content: [{ type: "text", text: "Approved metadata returned." }],
          structuredContent,
        };
      },
    );
  }

  return server;
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
