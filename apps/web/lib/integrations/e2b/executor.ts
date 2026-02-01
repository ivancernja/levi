import { generateAndPushCode, ProgressCallback } from "./client";
import { getGitHubIntegration } from "@/lib/integrations/github/client";
import { db, workspaces } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { ActionResult } from "@/lib/actions/executor";
import { DEFAULT_MODEL } from "@/lib/ai/client";

export async function executeCodeGeneration(
  workspaceId: string,
  payload: Record<string, unknown>,
  onProgress?: ProgressCallback
): Promise<ActionResult> {
  // Get GitHub credentials
  const githubIntegration = await getGitHubIntegration(workspaceId);
  if (!githubIntegration) {
    return { success: false, error: "GitHub not connected" };
  }

  // Get workspace settings for OpenRouter
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  const metadata = workspace?.metadata as {
    model?: string;
    openrouterApiKey?: string;
  } | null;

  if (!metadata?.openrouterApiKey) {
    return { success: false, error: "OpenRouter API key not configured" };
  }

  const repoName = payload.repoName as string;
  const description = payload.description as string;
  const specs = payload.specs as string;
  const framework = (payload.framework as string) || "nextjs";

  const githubUsername = githubIntegration.externalName;
  if (!githubUsername) {
    return { success: false, error: "GitHub username not found" };
  }

  try {
    const result = await generateAndPushCode({
      repoName,
      description,
      specs,
      framework,
      githubToken: githubIntegration.accessToken,
      githubUsername,
      openrouterApiKey: metadata.openrouterApiKey,
      model: metadata.model || DEFAULT_MODEL,
      onProgress,
    });

    if (result.success) {
      return {
        success: true,
        data: {
          repoUrl: result.repoUrl,
          files: result.files,
        },
        url: result.repoUrl,
      };
    } else {
      return {
        success: false,
        error: result.error || "Code generation failed",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
