import {
  searchLinearIssues,
  getLinearIssue,
} from "@/lib/integrations/linear/client";
import {
  searchGitHubIssues,
  getGitHubPR,
  listGitHubPRs,
} from "@/lib/integrations/github/client";
import {
  searchNotionPages,
  getNotionPage,
} from "@/lib/integrations/notion/client";
import { db, integrations } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { IntegrationType } from "@/lib/db/schema";

export interface GatheredContext {
  linearIssues: Array<{
    id: string;
    identifier: string;
    title: string;
    description?: string;
    state: string;
    priority: number;
    labels: string[];
  }>;
  githubPRs: Array<{
    number: number;
    title: string;
    body?: string;
    state: string;
    author?: string;
    additions: number;
    deletions: number;
    reviews?: Array<{ author?: string; state: string; body?: string }>;
  }>;
  githubIssues: Array<{
    number: number;
    title: string;
    body?: string;
    state: string;
    author?: string;
    labels: string[];
  }>;
  notionPages: Array<{
    id: string;
    title: string;
    content?: string;
  }>;
}

// Patterns to detect references in text
const PATTERNS = {
  // Linear: ENG-123, PROJ-456, etc.
  linearIssue: /\b([A-Z]{2,10}-\d+)\b/g,
  // GitHub PR: #123, PR #123, pull/123
  githubPR: /(?:PR\s*#?|pull\/|#)(\d+)\b/gi,
  // GitHub issue: issue #123, issues/123
  githubIssue: /(?:issue\s*#?|issues\/)(\d+)\b/gi,
  // Notion: mentions of page names (less reliable, use semantic search instead)
  notionPageId: /[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
};

async function getConnectedIntegrations(
  workspaceId: string
): Promise<Set<IntegrationType>> {
  const connected = await db.query.integrations.findMany({
    where: eq(integrations.workspaceId, workspaceId),
  });
  return new Set(connected.map((i) => i.type));
}

function extractReferences(text: string): {
  linearIssues: string[];
  githubPRs: number[];
  githubIssues: number[];
  notionPageIds: string[];
} {
  return {
    linearIssues: [...new Set(text.match(PATTERNS.linearIssue) || [])],
    githubPRs: [
      ...new Set(
        [...text.matchAll(PATTERNS.githubPR)].map((m) => parseInt(m[1], 10))
      ),
    ],
    githubIssues: [
      ...new Set(
        [...text.matchAll(PATTERNS.githubIssue)].map((m) => parseInt(m[1], 10))
      ),
    ],
    notionPageIds: [...new Set(text.match(PATTERNS.notionPageId) || [])],
  };
}

export async function gatherContext(
  workspaceId: string,
  userMessage: string,
  options: {
    maxLinearIssues?: number;
    maxGitHubItems?: number;
    maxNotionPages?: number;
    includeRecentPRs?: boolean;
  } = {}
): Promise<GatheredContext> {
  const {
    maxLinearIssues = 3,
    maxGitHubItems = 3,
    maxNotionPages = 2,
    includeRecentPRs = true,
  } = options;

  const connected = await getConnectedIntegrations(workspaceId);
  const refs = extractReferences(userMessage);

  const context: GatheredContext = {
    linearIssues: [],
    githubPRs: [],
    githubIssues: [],
    notionPages: [],
  };

  // Parallel fetch for better performance
  const promises: Promise<void>[] = [];

  // Linear: fetch referenced issues and search for related
  if (connected.has("linear")) {
    // Fetch specific referenced issues
    for (const issueId of refs.linearIssues.slice(0, maxLinearIssues)) {
      promises.push(
        (async () => {
          const issue = await getLinearIssue(workspaceId, issueId);
          if (issue) {
            context.linearIssues.push({
              id: issue.id,
              identifier: issue.identifier,
              title: issue.title,
              description: issue.description,
              state: issue.state,
              priority: issue.priority,
              labels: issue.labels,
            });
          }
        })()
      );
    }

    // If no specific issues mentioned, search for relevant ones
    if (refs.linearIssues.length === 0 && userMessage.length > 10) {
      promises.push(
        (async () => {
          const searchResults = await searchLinearIssues(
            workspaceId,
            userMessage,
            maxLinearIssues
          );
          for (const issue of searchResults) {
            if (!context.linearIssues.some((i) => i.identifier === issue.identifier)) {
              context.linearIssues.push({
                id: issue.id,
                identifier: issue.identifier,
                title: issue.title,
                description: issue.description,
                state: issue.state,
                priority: issue.priority,
                labels: [],
              });
            }
          }
        })()
      );
    }
  }

  // GitHub: fetch referenced PRs/issues and optionally recent PRs
  if (connected.has("github")) {
    // Search for related issues
    if (userMessage.length > 10) {
      promises.push(
        (async () => {
          const searchResults = await searchGitHubIssues(
            workspaceId,
            userMessage,
            { limit: maxGitHubItems }
          );
          for (const issue of searchResults) {
            context.githubIssues.push({
              number: issue.number,
              title: issue.title,
              body: issue.body || undefined,
              state: issue.state,
              author: issue.author || undefined,
              labels: issue.labels,
            });
          }
        })()
      );
    }

    // Note: For specific PR fetching, we'd need repo context
    // This could be improved by storing default repo in workspace settings
  }

  // Notion: search for related pages
  if (connected.has("notion")) {
    // Fetch specific pages by ID
    for (const pageId of refs.notionPageIds.slice(0, maxNotionPages)) {
      promises.push(
        (async () => {
          const page = await getNotionPage(workspaceId, pageId);
          if (page) {
            context.notionPages.push({
              id: page.id,
              title: page.title,
              content: page.content,
            });
          }
        })()
      );
    }

    // Search for related pages
    if (refs.notionPageIds.length === 0 && userMessage.length > 10) {
      promises.push(
        (async () => {
          const searchResults = await searchNotionPages(
            workspaceId,
            userMessage,
            { limit: maxNotionPages }
          );
          for (const page of searchResults) {
            if (!context.notionPages.some((p) => p.id === page.id)) {
              // Fetch full content for top results
              const fullPage = await getNotionPage(workspaceId, page.id);
              if (fullPage) {
                context.notionPages.push({
                  id: fullPage.id,
                  title: fullPage.title,
                  content: fullPage.content,
                });
              }
            }
          }
        })()
      );
    }
  }

  // Wait for all fetches to complete
  await Promise.allSettled(promises);

  return context;
}

const PRIORITY_LABELS: Record<number, string> = {
  0: "No Priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

export function formatGatheredContext(context: GatheredContext): string {
  const parts: string[] = [];

  if (context.linearIssues.length > 0) {
    parts.push("## Related Linear Issues");
    for (const issue of context.linearIssues) {
      const priorityLabel = PRIORITY_LABELS[issue.priority] || "Unknown";
      let issueText = `**${issue.identifier}**: ${issue.title} [${issue.state}] (${priorityLabel})`;
      if (issue.labels.length > 0) {
        issueText += ` [${issue.labels.join(", ")}]`;
      }
      if (issue.description) {
        issueText += `\n${issue.description.slice(0, 300)}${issue.description.length > 300 ? "..." : ""}`;
      }
      parts.push(issueText);
    }
  }

  if (context.githubIssues.length > 0) {
    parts.push("\n## Related GitHub Issues");
    for (const issue of context.githubIssues) {
      let issueText = `**#${issue.number}**: ${issue.title} [${issue.state}]`;
      if (issue.labels.length > 0) {
        issueText += ` (${issue.labels.join(", ")})`;
      }
      if (issue.body) {
        issueText += `\n${issue.body.slice(0, 200)}${issue.body.length > 200 ? "..." : ""}`;
      }
      parts.push(issueText);
    }
  }

  if (context.githubPRs.length > 0) {
    parts.push("\n## Related Pull Requests");
    for (const pr of context.githubPRs) {
      let prText = `**PR #${pr.number}**: ${pr.title} [${pr.state}]`;
      prText += ` (+${pr.additions}/-${pr.deletions})`;
      if (pr.reviews && pr.reviews.length > 0) {
        const approvals = pr.reviews.filter((r) => r.state === "APPROVED").length;
        const changes = pr.reviews.filter(
          (r) => r.state === "CHANGES_REQUESTED"
        ).length;
        if (approvals > 0 || changes > 0) {
          prText += ` [${approvals} approvals, ${changes} change requests]`;
        }
      }
      parts.push(prText);
    }
  }

  if (context.notionPages.length > 0) {
    parts.push("\n## Related Notion Pages");
    for (const page of context.notionPages) {
      let pageText = `**${page.title}**`;
      if (page.content) {
        pageText += `\n${page.content.slice(0, 400)}${page.content.length > 400 ? "..." : ""}`;
      }
      parts.push(pageText);
    }
  }

  return parts.join("\n\n");
}

export function hasGatheredContent(context: GatheredContext): boolean {
  return (
    context.linearIssues.length > 0 ||
    context.githubPRs.length > 0 ||
    context.githubIssues.length > 0 ||
    context.notionPages.length > 0
  );
}
