import { generateAndPushCode } from "./client";
import { getGitHubIntegration } from "@/lib/integrations/github/client";
import type { ActionResult } from "@/lib/actions/executor";

export async function executeCodeGeneration(
  workspaceId: string,
  payload: Record<string, unknown>
): Promise<ActionResult> {
  // Get GitHub credentials
  const githubIntegration = await getGitHubIntegration(workspaceId);
  if (!githubIntegration) {
    return { success: false, error: "GitHub not connected" };
  }

  const repoName = payload.repoName as string;
  const description = payload.description as string;
  const specs = payload.specs as string;

  // Get GitHub username from integration
  const githubUsername = githubIntegration.externalName;
  if (!githubUsername) {
    return { success: false, error: "GitHub username not found" };
  }

  try {
    const result = await generateAndPushCode({
      repoName,
      description,
      specs,
      githubToken: githubIntegration.accessToken,
      githubUsername,
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
