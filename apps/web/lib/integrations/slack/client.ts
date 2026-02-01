import { WebClient } from "@slack/web-api";
import { db, integrations } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function getSlackClient(workspaceId: string): Promise<WebClient | null> {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "slack")
    ),
  });

  if (!integration) {
    return null;
  }

  return new WebClient(integration.accessToken);
}

export async function getSlackIntegration(workspaceId: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "slack")
    ),
  });
}

export async function findWorkspaceBySlackTeam(slackTeamId: string) {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.type, "slack"),
      eq(integrations.externalId, slackTeamId)
    ),
    with: {
      workspace: true,
    },
  });

  return integration?.workspace;
}
