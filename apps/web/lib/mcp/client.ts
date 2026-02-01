import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { MCPServerConfig } from "@/lib/db/schema";

export interface MCPTool {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPClientConnection {
  client: Client;
  transport: SSEClientTransport;
  serverId: string;
  serverName: string;
}

// Cache for active connections
const connectionCache = new Map<string, MCPClientConnection>();

export async function connectToMCPServer(
  config: MCPServerConfig
): Promise<MCPClientConnection | null> {
  // Check cache first
  const cacheKey = `${config.id}:${config.url}`;
  const cached = connectionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const transport = new SSEClientTransport(new URL(config.url));
    const client = new Client({
      name: "levi",
      version: "1.0.0",
    });

    await client.connect(transport);

    const connection: MCPClientConnection = {
      client,
      transport,
      serverId: config.id,
      serverName: config.name,
    };

    connectionCache.set(cacheKey, connection);
    return connection;
  } catch (error) {
    console.error(`Failed to connect to MCP server ${config.name}:`, error);
    return null;
  }
}

export async function disconnectMCPServer(config: MCPServerConfig): Promise<void> {
  const cacheKey = `${config.id}:${config.url}`;
  const connection = connectionCache.get(cacheKey);

  if (connection) {
    try {
      await connection.client.close();
    } catch (error) {
      console.error(`Error closing MCP connection to ${config.name}:`, error);
    }
    connectionCache.delete(cacheKey);
  }
}

export async function disconnectAllMCPServers(): Promise<void> {
  const closePromises = Array.from(connectionCache.values()).map(async (conn) => {
    try {
      await conn.client.close();
    } catch (error) {
      console.error(`Error closing MCP connection:`, error);
    }
  });

  await Promise.all(closePromises);
  connectionCache.clear();
}

export async function listMCPTools(
  connection: MCPClientConnection
): Promise<MCPTool[]> {
  try {
    const result = await connection.client.listTools();

    return result.tools.map((tool: Tool) => ({
      serverId: connection.serverId,
      serverName: connection.serverName,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
  } catch (error) {
    console.error(`Failed to list tools from ${connection.serverName}:`, error);
    return [];
  }
}

export async function callMCPTool(
  connection: MCPClientConnection,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
  try {
    const result = await connection.client.callTool({
      name: toolName,
      arguments: args,
    });

    // Extract content, handling the MCP SDK result structure
    const content = Array.isArray(result.content)
      ? result.content.map((c: unknown) => {
          const item = c as { type: string; text?: string };
          return { type: item.type, text: item.text };
        })
      : [{ type: "text", text: String(result) }];

    return {
      content,
      isError: Boolean(result.isError),
    };
  } catch (error) {
    console.error(`Failed to call tool ${toolName} on ${connection.serverName}:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error calling tool: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export function getMCPConnection(serverId: string): MCPClientConnection | undefined {
  for (const [key, conn] of connectionCache.entries()) {
    if (key.startsWith(`${serverId}:`)) {
      return conn;
    }
  }
  return undefined;
}
