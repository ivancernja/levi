import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces, workspaceMembers } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, slug } = body;

  if (!name || !slug) {
    return NextResponse.json(
      { error: "Name and slug are required" },
      { status: 400 }
    );
  }

  // Check if slug is already taken
  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, slug),
  });

  if (existing) {
    return NextResponse.json(
      { error: "This workspace URL is already taken" },
      { status: 400 }
    );
  }

  // Create workspace
  const [workspace] = await db
    .insert(workspaces)
    .values({ name, slug })
    .returning();

  // Add user as owner
  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: session.user.id,
    role: "owner",
  });

  return NextResponse.json({ workspace });
}

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspaces
  const memberships = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.userId, session.user.id),
    with: {
      workspace: true,
    },
  });

  return NextResponse.json({
    workspaces: memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
    })),
  });
}
