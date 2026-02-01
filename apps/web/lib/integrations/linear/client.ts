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
