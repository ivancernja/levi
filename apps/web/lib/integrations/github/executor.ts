import {
  getGitHubClient,
  createGitHubBranch,
  createOrUpdateGitHubFile,
  getDefaultBranch,
} from "./client";
import type { ActionResult } from "@/lib/actions/executor";

export type GitHubActionType =
  | "github.repo.create"
  | "github.pr.create"
  | "github.pr.create_with_files"
  | "github.issue.create"
  | "github.comment.create"
  | "github.branch.create"
  | "github.file.create";

export async function executeGitHubAction(
  workspaceId: string,
  type: GitHubActionType,
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

    if (type === "github.branch.create") {
      const branchName = payload.branchName as string;
      const fromBranch = (payload.fromBranch as string) || await getDefaultBranch(workspaceId, owner, repo);

      const result = await createGitHubBranch(workspaceId, owner, repo, branchName, fromBranch);

      if (!result.success) {
        return { success: false, error: result.error || "Failed to create branch" };
      }

      return {
        success: true,
        data: { branchName, sha: result.sha },
      };
    }

    if (type === "github.file.create") {
      const path = payload.path as string;
      const content = payload.content as string;
      const message = (payload.message as string) || `Add ${path}`;
      const branch = (payload.branch as string) || await getDefaultBranch(workspaceId, owner, repo);

      const result = await createOrUpdateGitHubFile(
        workspaceId,
        owner,
        repo,
        path,
        content,
        message,
        branch
      );

      if (!result.success) {
        return { success: false, error: result.error || "Failed to create file" };
      }

      return {
        success: true,
        data: { path, sha: result.sha },
      };
    }

    // Combined action: create branch, commit files, create PR
    if (type === "github.pr.create_with_files") {
      const title = payload.title as string;
      const body = payload.body as string;
      const files = payload.files as Array<{ path: string; content: string }>;
      const branchName = (payload.branchName as string) ||
        `levi/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${Date.now()}`;
      const baseBranch = (payload.baseBranch as string) || await getDefaultBranch(workspaceId, owner, repo);

      // Step 1: Create branch from base
      const branchResult = await createGitHubBranch(workspaceId, owner, repo, branchName, baseBranch);
      if (!branchResult.success) {
        return {
          success: false,
          error: `Failed to create branch: ${branchResult.error}`,
        };
      }

      // Step 2: Commit all files to the new branch
      for (const file of files) {
        const fileResult = await createOrUpdateGitHubFile(
          workspaceId,
          owner,
          repo,
          file.path,
          file.content,
          `Add ${file.path}`,
          branchName
        );

        if (!fileResult.success) {
          return {
            success: false,
            error: `Failed to create file ${file.path}: ${fileResult.error}`,
          };
        }
      }

      // Step 3: Create the PR
      const prResult = await github.pulls.create({
        owner,
        repo,
        title,
        body,
        head: branchName,
        base: baseBranch,
        draft: true,
      });

      return {
        success: true,
        data: {
          number: prResult.data.number,
          url: prResult.data.html_url,
          branch: branchName,
        },
        url: prResult.data.html_url,
      };
    }

    if (type === "github.pr.create") {
      const headBranch = payload.headBranch as string;
      const baseBranch = (payload.baseBranch as string) || await getDefaultBranch(workspaceId, owner, repo);

      // First check if the branch exists
      try {
        await github.git.getRef({
          owner,
          repo,
          ref: `heads/${headBranch}`,
        });
      } catch {
        return {
          success: false,
          error: `Branch '${headBranch}' does not exist. Use github.pr.create_with_files to create a branch with files and a PR in one action.`,
        };
      }

      const result = await github.pulls.create({
        owner,
        repo,
        title: payload.title as string,
        body: payload.body as string,
        head: headBranch,
        base: baseBranch,
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
