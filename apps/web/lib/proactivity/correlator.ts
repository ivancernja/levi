import { db, eventLinks, type EventType, type NewEvent } from "@/lib/db";
import { eq, and } from "drizzle-orm";

// Patterns to extract references from text
const LINEAR_ISSUE_PATTERN = /\b([A-Z]+-\d+)\b/g;
const GITHUB_PR_PATTERN = /#(\d+)/g;
const GITHUB_BRANCH_PATTERN = /(?:feat|fix|chore|docs)\/([A-Z]+-\d+)/i;

interface ExtractedReference {
  type: string;
  id: string;
  linkType: "references" | "closes" | "related";
  confidence: number;
}

export function extractReferences(
  eventType: EventType,
  payload: Record<string, unknown>
): ExtractedReference[] {
  const refs: ExtractedReference[] = [];

  // Extract from PR title, body, branch name
  if (eventType.startsWith("github.pr")) {
    const title = (payload.title as string) || "";
    const body = (payload.body as string) || "";
    const branch = (payload.branch as string) || "";

    // Check branch name for Linear issue
    const branchMatch = branch.match(GITHUB_BRANCH_PATTERN);
    if (branchMatch) {
      refs.push({
        type: "linear.issue",
        id: branchMatch[1].toUpperCase(),
        linkType: "closes",
        confidence: 90,
      });
    }

    // Check title/body for Linear issues
    const titleMatches = title.match(LINEAR_ISSUE_PATTERN) || [];
    const bodyMatches = body.match(LINEAR_ISSUE_PATTERN) || [];

    for (const match of [...new Set([...titleMatches, ...bodyMatches])]) {
      // Don't duplicate if already found in branch
      if (!refs.some(r => r.id === match)) {
        refs.push({
          type: "linear.issue",
          id: match,
          linkType: title.toLowerCase().includes("closes") || title.toLowerCase().includes("fixes")
            ? "closes"
            : "references",
          confidence: 80,
        });
      }
    }
  }

  // Extract from Linear comments
  if (eventType.startsWith("linear.")) {
    const body = (payload.body as string) || (payload.description as string) || "";

    // Look for GitHub PR references
    const prMatches = body.match(GITHUB_PR_PATTERN) || [];
    for (const match of prMatches) {
      refs.push({
        type: "github.pr",
        id: match.replace("#", ""),
        linkType: "references",
        confidence: 70,
      });
    }
  }

  // Extract from Slack messages
  if (eventType === "slack.message") {
    const text = (payload.text as string) || "";

    // Linear issues
    const linearMatches = text.match(LINEAR_ISSUE_PATTERN) || [];
    for (const match of linearMatches) {
      refs.push({
        type: "linear.issue",
        id: match,
        linkType: "references",
        confidence: 60,
      });
    }

    // GitHub PRs
    const prMatches = text.match(GITHUB_PR_PATTERN) || [];
    for (const match of prMatches) {
      refs.push({
        type: "github.pr",
        id: match.replace("#", ""),
        linkType: "references",
        confidence: 60,
      });
    }
  }

  return refs;
}

export async function correlateEvent(
  workspaceId: string,
  event: NewEvent
): Promise<void> {
  const refs = extractReferences(event.type, event.payload);

  // Store links
  for (const ref of refs) {
    // Check if link already exists
    const existing = await db.query.eventLinks.findFirst({
      where: and(
        eq(eventLinks.workspaceId, workspaceId),
        eq(eventLinks.sourceType, `${event.source}.${event.type.split(".")[1]}`),
        eq(eventLinks.sourceId, event.externalId),
        eq(eventLinks.targetType, ref.type),
        eq(eventLinks.targetId, ref.id)
      ),
    });

    if (!existing) {
      await db.insert(eventLinks).values({
        workspaceId,
        sourceType: `${event.source}.${event.type.split(".")[1]}`,
        sourceId: event.externalId,
        targetType: ref.type,
        targetId: ref.id,
        linkType: ref.linkType,
        confidence: ref.confidence,
      });
    }
  }
}

export async function findLinkedEntities(
  workspaceId: string,
  entityType: string,
  entityId: string
): Promise<Array<{ type: string; id: string; linkType: string }>> {
  // Find where this entity is the source
  const asSource = await db.query.eventLinks.findMany({
    where: and(
      eq(eventLinks.workspaceId, workspaceId),
      eq(eventLinks.sourceType, entityType),
      eq(eventLinks.sourceId, entityId)
    ),
  });

  // Find where this entity is the target
  const asTarget = await db.query.eventLinks.findMany({
    where: and(
      eq(eventLinks.workspaceId, workspaceId),
      eq(eventLinks.targetType, entityType),
      eq(eventLinks.targetId, entityId)
    ),
  });

  return [
    ...asSource.map(l => ({ type: l.targetType, id: l.targetId, linkType: l.linkType })),
    ...asTarget.map(l => ({ type: l.sourceType, id: l.sourceId, linkType: l.linkType })),
  ];
}
