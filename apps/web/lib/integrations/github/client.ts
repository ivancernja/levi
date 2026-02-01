import { Octokit } from "@octokit/rest";
import { db, integrations } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function getGitHubClient(
  workspaceId: string
): Promise<Octokit | null> {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "github")
    ),
  });

  if (!integration) {
    return null;
  }

  return new Octokit({
    auth: integration.accessToken,
  });
}

export async function getGitHubIntegration(workspaceId: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "github")
    ),
  });
}

export async function findWorkspaceByGitHubInstallation(installationId: string) {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.type, "github"),
      eq(integrations.externalId, installationId)
    ),
    with: {
      workspace: true,
    },
  });

  return integration?.workspace;
}

export async function listGitHubRepos(
  workspaceId: string,
  options: {
    limit?: number;
    query?: string;
  } = {}
): Promise<Array<{ name: string; fullName: string; description?: string; url: string; isPrivate: boolean }>> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return [];

  const { limit = 30, query } = options;

  try {
    // If there's a query, search for matching repos
    if (query) {
      // First get all user's repos and filter locally for better matching
      const repos = await github.repos.listForAuthenticatedUser({
        per_page: 100,
        sort: "updated",
      });

      const queryLower = query.toLowerCase();
      const matches = repos.data
        .filter(repo =>
          repo.name.toLowerCase().includes(queryLower) ||
          repo.full_name.toLowerCase().includes(queryLower) ||
          repo.description?.toLowerCase().includes(queryLower)
        )
        .slice(0, limit);

      return matches.map(repo => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || undefined,
        url: repo.html_url,
        isPrivate: repo.private,
      }));
    }

    // No query - just list recent repos
    const repos = await github.repos.listForAuthenticatedUser({
      per_page: limit,
      sort: "updated",
    });

    return repos.data.map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || undefined,
      url: repo.html_url,
      isPrivate: repo.private,
    }));
  } catch (error) {
    console.error("GitHub list repos error:", error);
    return [];
  }
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: string | null;
  labels: string[];
  assignees: string[];
  comments: number;
}

export interface GitHubIssueSearchResult {
  number: number;
  title: string;
  body: string | null;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: string | null;
  labels: string[];
  assignees: string[];
  comments: number;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  author: string | null;
  labels: string[];
  assignees: string[];
  reviewers: string[];
  draft: boolean;
  mergeable: boolean | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  headBranch: string;
  baseBranch: string;
  comments: Array<{
    author: string | null;
    body: string;
    createdAt: string;
  }>;
  reviews: Array<{
    author: string | null;
    state: string;
    body: string | null;
    submittedAt: string | null;
  }>;
}

export interface GitHubFile {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  url: string;
}

export async function searchGitHubIssues(
  workspaceId: string,
  query: string,
  options: {
    repo?: string;
    state?: "open" | "closed" | "all";
    limit?: number;
  } = {}
): Promise<GitHubIssueSearchResult[]> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return [];

  const { repo, state = "all", limit = 10 } = options;

  try {
    // Build search query
    let searchQuery = query;
    if (repo) {
      searchQuery += ` repo:${repo}`;
    }
    searchQuery += " is:issue";
    if (state !== "all") {
      searchQuery += ` state:${state}`;
    }

    const response = await github.search.issuesAndPullRequests({
      q: searchQuery,
      per_page: limit,
      sort: "updated",
      order: "desc",
    });

    return response.data.items
      .filter(item => !item.pull_request)
      .map(issue => ({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? null,
        state: issue.state,
        url: issue.html_url,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        author: issue.user?.login || null,
        labels: issue.labels.map(l => (typeof l === "string" ? l : l.name || "")),
        assignees: issue.assignees?.map(a => a.login) || [],
        comments: issue.comments,
      }));
  } catch (error) {
    console.error("GitHub search issues error:", error);
    return [];
  }
}

export async function getGitHubIssue(
  workspaceId: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubIssue | null> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return null;

  try {
    const { data: issue } = await github.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? null,
      state: issue.state,
      url: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      author: issue.user?.login || null,
      labels: issue.labels.map(l => (typeof l === "string" ? l : l.name || "")),
      assignees: issue.assignees?.map(a => a.login) || [],
      comments: issue.comments,
    };
  } catch (error) {
    console.error("GitHub get issue error:", error);
    return null;
  }
}

export async function getGitHubPR(
  workspaceId: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPR | null> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return null;

  try {
    const [prResponse, commentsResponse, reviewsResponse] = await Promise.all([
      github.pulls.get({ owner, repo, pull_number: prNumber }),
      github.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 50 }),
      github.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 50 }),
    ]);

    const pr = prResponse.data;

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      url: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at,
      author: pr.user?.login || null,
      labels: pr.labels.map(l => l.name || ""),
      assignees: pr.assignees?.map(a => a.login) || [],
      reviewers: pr.requested_reviewers?.map(r => r.login) || [],
      draft: pr.draft || false,
      mergeable: pr.mergeable,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      comments: commentsResponse.data.map(c => ({
        author: c.user?.login || null,
        body: c.body || "",
        createdAt: c.created_at,
      })),
      reviews: reviewsResponse.data.map(r => ({
        author: r.user?.login || null,
        state: r.state,
        body: r.body,
        submittedAt: r.submitted_at || null,
      })),
    };
  } catch (error) {
    console.error("GitHub get PR error:", error);
    return null;
  }
}

export async function listGitHubPRs(
  workspaceId: string,
  owner: string,
  repo: string,
  options: {
    state?: "open" | "closed" | "all";
    limit?: number;
  } = {}
): Promise<Array<Omit<GitHubPR, "comments" | "reviews">>> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return [];

  const { state = "open", limit = 10 } = options;

  try {
    const response = await github.pulls.list({
      owner,
      repo,
      state,
      per_page: limit,
      sort: "updated",
      direction: "desc",
    });

    return response.data.map(pr => ({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      url: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at,
      author: pr.user?.login || null,
      labels: pr.labels.map(l => l.name || ""),
      assignees: pr.assignees?.map(a => a.login) || [],
      reviewers: pr.requested_reviewers?.map(r => r.login) || [],
      draft: pr.draft || false,
      mergeable: null, // Not available in list endpoint
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
    }));
  } catch (error) {
    console.error("GitHub list PRs error:", error);
    return [];
  }
}

export async function getGitHubRepoFiles(
  workspaceId: string,
  owner: string,
  repo: string,
  path: string = ""
): Promise<GitHubFile[]> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return [];

  try {
    const response = await github.repos.getContent({
      owner,
      repo,
      path,
    });

    // If it's a single file, return it as array
    if (!Array.isArray(response.data)) {
      const file = response.data;
      const fileType = file.type as string;
      if (fileType === "file" || fileType === "dir") {
        return [{
          name: file.name,
          path: file.path,
          type: fileType as "file" | "dir",
          size: file.size,
          url: file.html_url || "",
        }];
      }
      return [];
    }

    return response.data
      .filter((item): item is typeof item & { type: "file" | "dir" } =>
        item.type === "file" || item.type === "dir"
      )
      .map(item => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
        url: item.html_url || "",
      }));
  } catch (error) {
    console.error("GitHub get repo files error:", error);
    return [];
  }
}

export async function getGitHubFileContent(
  workspaceId: string,
  owner: string,
  repo: string,
  path: string
): Promise<{ content: string; encoding: string } | null> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return null;

  try {
    const response = await github.repos.getContent({
      owner,
      repo,
      path,
    });

    if (Array.isArray(response.data) || response.data.type !== "file") {
      return null;
    }

    // Content is base64 encoded
    const content = Buffer.from(response.data.content, "base64").toString("utf-8");
    return { content, encoding: "utf-8" };
  } catch (error) {
    console.error("GitHub get file content error:", error);
    return null;
  }
}

export async function createGitHubBranch(
  workspaceId: string,
  owner: string,
  repo: string,
  branchName: string,
  fromBranch: string = "main"
): Promise<{ success: boolean; sha?: string; error?: string }> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return { success: false, error: "GitHub not connected" };

  try {
    // Get the SHA of the source branch
    const { data: refData } = await github.git.getRef({
      owner,
      repo,
      ref: `heads/${fromBranch}`,
    });

    // Create new branch
    await github.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });

    return { success: true, sha: refData.object.sha };
  } catch (error) {
    console.error("GitHub create branch error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create branch",
    };
  }
}

export async function createOrUpdateGitHubFile(
  workspaceId: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string
): Promise<{ success: boolean; sha?: string; error?: string }> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return { success: false, error: "GitHub not connected" };

  try {
    // Check if file exists to get its SHA (needed for updates)
    let existingSha: string | undefined;
    try {
      const { data } = await github.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });
      if (!Array.isArray(data) && data.type === "file") {
        existingSha = data.sha;
      }
    } catch {
      // File doesn't exist, that's fine for creation
    }

    const { data } = await github.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString("base64"),
      branch,
      sha: existingSha,
    });

    return { success: true, sha: data.commit.sha };
  } catch (error) {
    console.error("GitHub create/update file error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create/update file",
    };
  }
}

export async function getDefaultBranch(
  workspaceId: string,
  owner: string,
  repo: string
): Promise<string> {
  const github = await getGitHubClient(workspaceId);
  if (!github) return "main";

  try {
    const { data } = await github.repos.get({ owner, repo });
    return data.default_branch;
  } catch {
    return "main";
  }
}
