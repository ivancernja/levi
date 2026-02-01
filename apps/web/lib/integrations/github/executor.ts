import { getGitHubClient } from "./client";
import type { ActionResult } from "@/lib/actions/executor";

export async function executeGitHubAction(
  workspaceId: string,
  type: "github.repo.create" | "github.pr.create" | "github.issue.create" | "github.comment.create",
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const github = await getGitHubClient(workspaceId);
  if (!github) {
    return { success: false, error: "GitHub not connected" };
  }

  try {
    // Handle repo creation first (doesn't need owner/repo split)
    if (type === "github.repo.create") {
      const result = await github.repos.createForAuthenticatedUser({
        name: payload.name as string,
        description: payload.description as string | undefined,
        private: payload.isPrivate as boolean | undefined,
        auto_init: true, // Initialize with README
      });

      return {
        success: true,
        data: {
          name: result.data.name,
          fullName: result.data.full_name,
          url: result.data.html_url,
        },
        url: result.data.html_url,
      };
    }

    const [owner, repo] = (payload.repo as string).split("/");

    if (type === "github.pr.create") {
      const result = await github.pulls.create({
        owner,
        repo,
        title: payload.title as string,
        body: payload.body as string,
        head: payload.headBranch as string,
        base: (payload.baseBranch as string) || "main",
        draft: true, // Always create as draft for review
      });

      return {
        success: true,
        data: {
          number: result.data.number,
          url: result.data.html_url,
        },
        url: result.data.html_url,
      };
    }

    if (type === "github.issue.create") {
      const result = await github.issues.create({
        owner,
        repo,
        title: payload.title as string,
        body: payload.body as string,
        labels: payload.labels as string[] | undefined,
      });

      return {
        success: true,
        data: {
          number: result.data.number,
          url: result.data.html_url,
        },
        url: result.data.html_url,
      };
    }

    if (type === "github.comment.create") {
      const issueNumber = payload.issueNumber as number;
      const body = payload.body as string;

      const result = await github.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });

      return {
        success: true,
        data: {
          id: result.data.id,
          url: result.data.html_url,
        },
        url: result.data.html_url,
      };
    }

    return { success: false, error: "Unknown GitHub action type" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "GitHub API error",
    };
  }
}
