import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces, workspaceMembers } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { MCPServerConfig, WorkspaceMetadata } from "@/lib/db/schema";
import { invalidateMCPToolCache } from "@/lib/mcp/discovery";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, servers } = await request.json();

    if (!workspaceId || !Array.isArray(servers)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.userId, session.user.id),
        eq(workspaceMembers.workspaceId, workspaceId)
      ),
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get current workspace metadata
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const existingMetadata = (workspace.metadata || {}) as WorkspaceMetadata;

    // Validate server configs
    const validatedServers: MCPServerConfig[] = servers.map((server: unknown) => {
      const s = server as Record<string, unknown>;
      return {
        id: String(s.id || crypto.randomUUID()),
        name: String(s.name || ""),
        url: String(s.url || ""),
        enabled: Boolean(s.enabled),
        description: s.description ? String(s.description) : undefined,
      };
    });

    // Update workspace metadata
    await db
      .update(workspaces)
      .set({
        metadata: {
          ...existingMetadata,
          mcpServers: validatedServers,
        },
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    // Invalidate tool cache
    invalidateMCPToolCache(workspaceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving MCP servers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
