import { Client } from "@notionhq/client";
import { db, integrations } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function getNotionClient(
  workspaceId: string
): Promise<Client | null> {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "notion")
    ),
  });

  if (!integration) {
    return null;
  }

  return new Client({
    auth: integration.accessToken,
  });
}

export async function getNotionIntegration(workspaceId: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "notion")
    ),
  });
}
