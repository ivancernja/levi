import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces, workspaceMembers } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { WorkspaceMetadata, WorkspaceKnowledge } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, knowledge } = await request.json();

    if (!workspaceId || !knowledge) {
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
    const existingKnowledge = existingMetadata.knowledge || {};

    // Merge the new knowledge with existing
    const updatedKnowledge: WorkspaceKnowledge = {
      ...existingKnowledge,
    };

    // Only update fields that are provided
    if (knowledge.people !== undefined) {
      updatedKnowledge.people = knowledge.people;
    }
    if (knowledge.repos !== undefined) {
      updatedKnowledge.repos = knowledge.repos;
    }
    if (knowledge.projects !== undefined) {
      updatedKnowledge.projects = knowledge.projects;
    }
    if (knowledge.notes !== undefined) {
      updatedKnowledge.notes = knowledge.notes;
    }

    // Update workspace metadata
    await db
      .update(workspaces)
      .set({
        metadata: {
          ...existingMetadata,
          knowledge: updatedKnowledge,
        },
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving workspace knowledge:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
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

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    const metadata = (workspace?.metadata || {}) as WorkspaceMetadata;
    const knowledge = metadata.knowledge || {};

    return NextResponse.json({ knowledge });
  } catch (error) {
    console.error("Error fetching workspace knowledge:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
