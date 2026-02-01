import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, integrations, workspaceMembers } from "@/lib/db";
import { eq, and } from "drizzle-orm";

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID!;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET!;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // If no code, redirect to Notion OAuth
  if (!code) {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Get user's workspace
    const membership = await db.query.workspaceMembers.findFirst({
      where: eq(workspaceMembers.userId, session.user.id),
      with: {
        workspace: true,
      },
    });

    if (!membership) {
      return NextResponse.redirect(
        new URL("/dashboard?error=no_workspace", request.url)
      );
    }

    const redirectUri = `${process.env.BETTER_AUTH_URL}/api/integrations/notion/oauth`;

    const notionUrl = new URL("https://api.notion.com/v1/oauth/authorize");
    notionUrl.searchParams.set("client_id", NOTION_CLIENT_ID);
    notionUrl.searchParams.set("response_type", "code");
    notionUrl.searchParams.set("owner", "user");
    notionUrl.searchParams.set("redirect_uri", redirectUri);
    notionUrl.searchParams.set("state", membership.workspaceId);

    return NextResponse.redirect(notionUrl);
  }

  // Handle OAuth callback
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${error}`, request.url)
    );
  }

  // Exchange code for token
  const credentials = Buffer.from(
    `${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`
  ).toString("base64");

  const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.BETTER_AUTH_URL}/api/integrations/notion/oauth`,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    console.error("Notion OAuth error:", tokenData.error);
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${tokenData.error}`, request.url)
    );
  }

  const workspaceId = state;
  if (!workspaceId) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations?error=invalid_state", request.url)
    );
  }

  // Check if integration already exists
  const existingIntegration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "notion")
    ),
  });

  if (existingIntegration) {
    await db
      .update(integrations)
      .set({
        accessToken: tokenData.access_token,
        externalId: tokenData.workspace_id,
        externalName: tokenData.workspace_name,
        metadata: {
          botId: tokenData.bot_id,
          owner: tokenData.owner,
        },
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, existingIntegration.id));
  } else {
    await db.insert(integrations).values({
      workspaceId,
      type: "notion",
      accessToken: tokenData.access_token,
      externalId: tokenData.workspace_id,
      externalName: tokenData.workspace_name,
      metadata: {
        botId: tokenData.bot_id,
        owner: tokenData.owner,
      },
    });
  }

  return NextResponse.redirect(
    new URL("/dashboard/integrations?success=notion", request.url)
  );
}
