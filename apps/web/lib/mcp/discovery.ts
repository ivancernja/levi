import { db, workspaces } from "@/lib/db";
import type { MCPServerConfig, WorkspaceMetadata } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import {
  connectToMCPServer,
  listMCPTools,
  callMCPTool,
  getMCPConnection,
  type MCPTool,
} from "./client";

export type { MCPServerConfig };

// Cache for discovered tools (per workspace)
const toolCache = new Map<string, { tools: MCPTool[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface WorkspaceMCPConfig {
  servers: MCPServerConfig[];
}

export async function getMCPConfig(workspaceId: string): Promise<WorkspaceMCPConfig | null> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace?.metadata) {
    return null;
  }

  const metadata = workspace.metadata as WorkspaceMetadata;

  if (!metadata.mcpServers || metadata.mcpServers.length === 0) {
    return null;
  }

  return {
    servers: metadata.mcpServers.filter((s) => s.enabled),
  };
}

export async function saveMCPConfig(
  workspaceId: string,
  servers: MCPServerConfig[]
): Promise<void> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  const existingMetadata = (workspace?.metadata || {}) as Record<string, unknown>;

  await db
    .update(workspaces)
    .set({
      metadata: {
        ...existingMetadata,
        mcpServers: servers,
      },
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  // Invalidate cache
  toolCache.delete(workspaceId);
}

export async function discoverMCPTools(workspaceId: string): Promise<MCPTool[]> {
  // Check cache
  const cached = toolCache.get(workspaceId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.tools;
  }

  const config = await getMCPConfig(workspaceId);
  if (!config) {
    return [];
  }

  const allTools: MCPTool[] = [];

  // Connect to all enabled servers in parallel
  const connectionPromises = config.servers.map(async (serverConfig) => {
    const connection = await connectToMCPServer(serverConfig);
    if (connection) {
      const tools = await listMCPTools(connection);
      return tools;
    }
    return [];
  });

  const toolResults = await Promise.all(connectionPromises);
  for (const tools of toolResults) {
    allTools.push(...tools);
  }

  // Update cache
  toolCache.set(workspaceId, { tools: allTools, timestamp: Date.now() });

  return allTools;
}

export function mcpToolToOpenAITool(tool: MCPTool): ChatCompletionTool {
  // Prefix tool name with server ID to avoid conflicts
  const qualifiedName = `mcp_${tool.serverId}_${tool.name}`;

  return {
    type: "function",
    function: {
      name: qualifiedName,
      description: `[MCP: ${tool.serverName}] ${tool.description || tool.name}`,
      parameters: tool.inputSchema,
    },
  };
}

export function parseMCPToolName(qualifiedName: string): {
  serverId: string;
  toolName: string;
} | null {
  const match = qualifiedName.match(/^mcp_([^_]+)_(.+)$/);
  if (!match) {
    return null;
  }
  return {
    serverId: match[1],
    toolName: match[2],
  };
}

export async function executeMCPTool(
  qualifiedName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = parseMCPToolName(qualifiedName);
  if (!parsed) {
    return { error: "Invalid MCP tool name" };
  }

  const connection = getMCPConnection(parsed.serverId);
  if (!connection) {
    return { error: `MCP server ${parsed.serverId} is not connected` };
  }

  const result = await callMCPTool(connection, parsed.toolName, args);

  // Convert MCP result to a simpler format for the AI
  if (result.isError) {
    return { error: result.content.map((c) => ("text" in c ? c.text : "")).join("\n") };
  }

  // Extract text content
  const textContent = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  // Try to parse as JSON if possible
  try {
    return JSON.parse(textContent);
  } catch {
    return { result: textContent };
  }
}

export async function getMCPToolsForAgent(
  workspaceId: string
): Promise<{ tools: ChatCompletionTool[]; mcpToolNames: string[] }> {
  const mcpTools = await discoverMCPTools(workspaceId);

  const tools = mcpTools.map(mcpToolToOpenAITool);
  const mcpToolNames = tools.map((t) => t.function.name);

  return { tools, mcpToolNames };
}

export function invalidateMCPToolCache(workspaceId: string): void {
  toolCache.delete(workspaceId);
}
