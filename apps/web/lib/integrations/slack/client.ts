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

export async function getChannelHistory(
  workspaceId: string,
  channelId: string,
  limit: number = 50
): Promise<Array<{ user: string; text: string; ts: string }>> {
  const slack = await getSlackClient(workspaceId);
  if (!slack) return [];

  try {
    const result = await slack.conversations.history({
      channel: channelId,
      limit,
    });

    if (!result.messages) return [];

    // Get user info for readable names
    const userIds = [...new Set(result.messages.map(m => m.user).filter(Boolean))] as string[];
    const userMap: Record<string, string> = {};

    for (const userId of userIds) {
      try {
        const userInfo = await slack.users.info({ user: userId });
        userMap[userId] = userInfo.user?.real_name || userInfo.user?.name || userId;
      } catch {
        userMap[userId] = userId;
      }
    }

    return result.messages
      .filter(m => m.text && !m.bot_id) // Filter out bot messages
      .reverse() // Chronological order
      .map(m => ({
        user: userMap[m.user || ""] || "Unknown",
        text: m.text || "",
        ts: m.ts || "",
      }));
  } catch (error) {
    console.error("Failed to fetch channel history:", error);
    return [];
  }
}
