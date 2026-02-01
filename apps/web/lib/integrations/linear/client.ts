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
    // If query is empty or very generic, list recent issues instead
    if (!query || query.trim().length < 2) {
      return listLinearIssues(workspaceId, { limit });
    }

    const issues = await linear.issueSearch({ query, first: limit });
    const results = [];
    for (const issue of issues.nodes.slice(0, limit)) {
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

export async function listLinearIssues(
  workspaceId: string,
  options: {
    limit?: number;
    state?: "active" | "backlog" | "completed" | "canceled";
    teamKey?: string;
  } = {}
): Promise<Array<{ id: string; identifier: string; title: string; description?: string; state: string; priority: number }>> {
  const linear = await getLinearClient(workspaceId);
  if (!linear) return [];

  const { limit = 10 } = options;

  try {
    // Get recent issues sorted by updated time
    const issues = await linear.issues({
      first: limit,
      orderBy: "updatedAt" as any,
    });

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
    console.error("Linear list issues error:", error);
    return [];
  }
}

export async function getLinearActiveCycle(
  workspaceId: string
): Promise<Array<{ id: string; identifier: string; title: string; state: string; priority: number }>> {
  const linear = await getLinearClient(workspaceId);
  if (!linear) return [];

  try {
    // Get active cycles across all teams
    const teams = await linear.teams();
    const results = [];

    for (const team of teams.nodes) {
      const activeCycle = await team.activeCycle;
      if (activeCycle) {
        const issues = await activeCycle.issues({ first: 50 });
        for (const issue of issues.nodes) {
          const state = await issue.state;
          results.push({
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            state: state?.name || "Unknown",
            priority: issue.priority,
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Linear get active cycle error:", error);
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
