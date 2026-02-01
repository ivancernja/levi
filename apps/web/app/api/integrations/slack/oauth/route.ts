import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, integrations, workspaceMembers } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { getBaseURL } from "@/lib/utils/url";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // If no code, redirect to Slack OAuth
  if (!code) {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Get user's workspace (for now, just get the first one)
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

    const scopes = [
      "app_mentions:read",
      "channels:history",
      "channels:read",
      "chat:write",
      "groups:history",
      "groups:read",
      "im:history",
      "im:read",
      "mpim:history",
      "mpim:read",
      "users:read",
      "commands",
    ].join(",");

    const redirectUri = `${getBaseURL()}/api/integrations/slack/oauth`;

    const slackUrl = new URL("https://slack.com/oauth/v2/authorize");
    slackUrl.searchParams.set("client_id", SLACK_CLIENT_ID);
    slackUrl.searchParams.set("scope", scopes);
    slackUrl.searchParams.set("redirect_uri", redirectUri);
    slackUrl.searchParams.set("state", membership.workspaceId);

    return NextResponse.redirect(slackUrl);
  }

  // Handle OAuth callback
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${error}`, request.url)
    );
  }

  // Exchange code for token
  const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code,
      redirect_uri: `${getBaseURL()}/api/integrations/slack/oauth`,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.ok) {
    console.error("Slack OAuth error:", tokenData.error);
    return NextResponse.redirect(
      new URL(
        `/dashboard/integrations?error=${tokenData.error}`,
        request.url
      )
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
      eq(integrations.type, "slack")
    ),
  });

  if (existingIntegration) {
    // Update existing integration
    await db
      .update(integrations)
      .set({
        accessToken: tokenData.access_token,
        externalId: tokenData.team.id,
        externalName: tokenData.team.name,
        metadata: {
          botUserId: tokenData.bot_user_id,
          scope: tokenData.scope,
        },
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, existingIntegration.id));
  } else {
    // Create new integration
    await db.insert(integrations).values({
      workspaceId,
      type: "slack",
      accessToken: tokenData.access_token,
      externalId: tokenData.team.id,
      externalName: tokenData.team.name,
      metadata: {
        botUserId: tokenData.bot_user_id,
        scope: tokenData.scope,
      },
    });
  }

  return NextResponse.redirect(
    new URL("/dashboard/integrations?success=slack", request.url)
  );
}
