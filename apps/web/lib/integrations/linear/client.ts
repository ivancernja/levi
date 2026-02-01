import { LinearClient } from "@linear/sdk";
import { db, integrations } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function getLinearClient(
  workspaceId: string
): Promise<LinearClient | null> {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "linear")
    ),
  });

  if (!integration) {
    return null;
  }

  return new LinearClient({
    accessToken: integration.accessToken,
  });
}

export async function getLinearIntegration(workspaceId: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "linear")
    ),
  });
}

export async function findWorkspaceByLinearOrg(linearOrgId: string) {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.type, "linear"),
      eq(integrations.externalId, linearOrgId)
    ),
    with: {
      workspace: true,
    },
  });

  return integration?.workspace;
}

export async function searchLinearIssues(
  workspaceId: string,
  query: string,
  limit: number = 10
): Promise<Array<{ id: string; identifier: string; title: string; description?: string; state: string; priority: number }>> {
  const linear = await getLinearClient(workspaceId);
  if (!linear) return [];

  try {
    const issues = await linear.issueSearch({ query });
    const results = [];
    for (const issue of issues.nodes) {
      const state = await issue.state;
      results.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description || undefined,
        state: state?.name || "Unknown",
        priority: issue.priority,
      });
    }
    return results;
  } catch (error) {
    console.error("Linear search error:", error);
    return [];
  }
}

export async function getLinearIssue(
  workspaceId: string,
  issueId: string
): Promise<{ id: string; identifier: string; title: string; description?: string; state: string; priority: number; labels: string[] } | null> {
  const linear = await getLinearClient(workspaceId);
  if (!linear) return null;

  try {
    const issue = await linear.issue(issueId);
    const state = await issue.state;
    const labels = await issue.labels();
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || undefined,
      state: state?.name || "Unknown",
      priority: issue.priority,
      labels: labels.nodes.map(l => l.name),
    };
  } catch (error) {
    console.error("Linear get issue error:", error);
    return null;
  }
}
