import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CapabilityPolicy } from "./capability-policy.js";
import { createMcpServer } from "./server.js";

const policy = CapabilityPolicy.fromManifest({
  enabledCapabilities: ["capability.status"],
});

const server = createMcpServer(policy);
const transport = new StdioServerTransport(undefined, undefined, {
  maxBufferSize: 1024 * 1024,
});

await server.connect(transport);
