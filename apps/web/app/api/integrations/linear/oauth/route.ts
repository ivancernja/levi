import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, integrations, workspaceMembers } from "@/lib/db";
import { eq, and } from "drizzle-orm";

const LINEAR_CLIENT_ID = process.env.LINEAR_CLIENT_ID!;
const LINEAR_CLIENT_SECRET = process.env.LINEAR_CLIENT_SECRET!;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // If no code, redirect to Linear OAuth
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

    const redirectUri = `${process.env.BETTER_AUTH_URL}/api/integrations/linear/oauth`;

    const linearUrl = new URL("https://linear.app/oauth/authorize");
    linearUrl.searchParams.set("client_id", LINEAR_CLIENT_ID);
    linearUrl.searchParams.set("response_type", "code");
    linearUrl.searchParams.set("redirect_uri", redirectUri);
    linearUrl.searchParams.set("scope", "read,write,issues:create,comments:create");
    linearUrl.searchParams.set("state", membership.workspaceId);

    return NextResponse.redirect(linearUrl);
  }

  // Handle OAuth callback
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${error}`, request.url)
    );
  }

  // Exchange code for token
  const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: LINEAR_CLIENT_ID,
      client_secret: LINEAR_CLIENT_SECRET,
      code,
      redirect_uri: `${process.env.BETTER_AUTH_URL}/api/integrations/linear/oauth`,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    console.error("Linear OAuth error:", tokenData.error);
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

  // Get organization info from Linear
  const { LinearClient } = await import("@linear/sdk");
  const linearClient = new LinearClient({ accessToken: tokenData.access_token });
  const org = await linearClient.organization;

  // Check if integration already exists
  const existingIntegration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "linear")
    ),
  });

  if (existingIntegration) {
    await db
      .update(integrations)
      .set({
        accessToken: tokenData.access_token,
        externalId: org.id,
        externalName: org.name,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, existingIntegration.id));
  } else {
    await db.insert(integrations).values({
      workspaceId,
      type: "linear",
      accessToken: tokenData.access_token,
      externalId: org.id,
      externalName: org.name,
      expiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : null,
    });
  }

  return NextResponse.redirect(
    new URL("/dashboard/integrations?success=linear", request.url)
  );
}
