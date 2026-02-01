import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces, workspaceMembers } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { RECOMMENDED_MODELS } from "@/lib/ai/client";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await params;

  // Verify user is a member of the workspace
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, session.user.id)
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Only owners and admins can change settings
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { model, openrouterApiKey } = body;

  // Validate model is in recommended list (or allow any for flexibility)
  if (model) {
    const isRecommended = RECOMMENDED_MODELS.some((m) => m.id === model);
    if (!isRecommended) {
      // Allow custom models but log a warning
      console.warn(`Custom model selected: ${model}`);
    }
  }

  // Validate API key format if provided
  if (openrouterApiKey && !openrouterApiKey.startsWith("sk-or-")) {
    return NextResponse.json(
      { error: "Invalid OpenRouter API key format" },
      { status: 400 }
    );
  }

  // Get current workspace
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Update metadata
  const currentMetadata = (workspace.metadata as Record<string, unknown>) || {};
  const newMetadata = { ...currentMetadata };

  if (model !== undefined) {
    newMetadata.model = model;
  }
  if (openrouterApiKey !== undefined) {
    newMetadata.openrouterApiKey = openrouterApiKey;
  }

  await db
    .update(workspaces)
    .set({
      metadata: newMetadata,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  return NextResponse.json({ success: true });
}
