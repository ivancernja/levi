import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, integrations, workspaceMembers } from "@/lib/db";
import { eq, and } from "drizzle-orm";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // If no code, redirect to GitHub OAuth
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

    const redirectUri = `${process.env.BETTER_AUTH_URL}/api/integrations/github/oauth`;

    const githubUrl = new URL("https://github.com/login/oauth/authorize");
    githubUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
    githubUrl.searchParams.set("redirect_uri", redirectUri);
    githubUrl.searchParams.set("scope", "repo read:user");
    githubUrl.searchParams.set("state", membership.workspaceId);

    return NextResponse.redirect(githubUrl);
  }

  // Handle OAuth callback
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${error}`, request.url)
    );
  }

  // Exchange code for token
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.BETTER_AUTH_URL}/api/integrations/github/oauth`,
      }),
    }
  );

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    console.error("GitHub OAuth error:", tokenData.error);
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

  // Get user info from GitHub
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: tokenData.access_token });
  const user = await octokit.users.getAuthenticated();

  // Check if integration already exists
  const existingIntegration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "github")
    ),
  });

  if (existingIntegration) {
    await db
      .update(integrations)
      .set({
        accessToken: tokenData.access_token,
        externalId: user.data.id.toString(),
        externalName: user.data.login,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, existingIntegration.id));
  } else {
    await db.insert(integrations).values({
      workspaceId,
      type: "github",
      accessToken: tokenData.access_token,
      externalId: user.data.id.toString(),
      externalName: user.data.login,
    });
  }

  return NextResponse.redirect(
    new URL("/dashboard/integrations?success=github", request.url)
  );
}
