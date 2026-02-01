import { Octokit } from "@octokit/rest";
import { db, integrations } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function getGitHubClient(
  workspaceId: string
): Promise<Octokit | null> {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "github")
    ),
  });

  if (!integration) {
    return null;
  }

  return new Octokit({
    auth: integration.accessToken,
  });
}

export async function getGitHubIntegration(workspaceId: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "github")
    ),
  });
}

export async function findWorkspaceByGitHubInstallation(installationId: string) {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.type, "github"),
      eq(integrations.externalId, installationId)
    ),
    with: {
      workspace: true,
    },
  });

  return integration?.workspace;
}

export async function listGitHubRepos(
  workspaceId: string,
  limit: number = 10
): Promise<Array<{ name: string; fullName: string; description?: string; url: string; isPrivate: boolean }>> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return [];

  try {
    const repos = await github.repos.listForAuthenticatedUser({
      per_page: limit,
      sort: "updated",
    });

    return repos.data.map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || undefined,
      url: repo.html_url,
      isPrivate: repo.private,
    }));
  } catch (error) {
    console.error("GitHub list repos error:", error);
    return [];
  }
}
