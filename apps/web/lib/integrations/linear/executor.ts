import { getLinearClient } from "./client";
import type { ActionResult } from "@/lib/actions/executor";

export async function executeLinearAction(
  workspaceId: string,
  type: "linear.issue.update" | "linear.issue.create" | "linear.comment.create",
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const linear = await getLinearClient(workspaceId);
  if (!linear) {
    return { success: false, error: "Linear not connected" };
  }

  try {
    if (type === "linear.issue.update") {
      const issueId = payload.issueId as string;

      // First, find the issue by identifier
      const issues = await linear.issues({
        filter: {
          number: { eq: parseInt(issueId.split("-")[1]) },
        },
      });

      const issue = issues.nodes[0];
      if (!issue) {
        return { success: false, error: `Issue ${issueId} not found` };
      }

      // Build update payload
      const updateData: Record<string, unknown> = {};

      if (payload.title) updateData.title = payload.title;
      if (payload.description) updateData.description = payload.description;

      if (payload.priority) {
        const priorityMap: Record<string, number> = {
          urgent: 1,
          high: 2,
          medium: 3,
          low: 4,
          none: 0,
        };
        updateData.priority = priorityMap[payload.priority as string] ?? 0;
      }

      if (payload.status) {
        // Would need to look up workflow state ID
        // For now, skip status updates
      }

      await issue.update(updateData);

      return {
        success: true,
        data: { issueId: issue.id, identifier: issue.identifier },
        url: issue.url,
      };
    }

    if (type === "linear.issue.create") {
      // Get the team
      let teamId: string | undefined;

      if (payload.teamKey) {
        const teams = await linear.teams({
          filter: { key: { eq: payload.teamKey as string } },
        });
        teamId = teams.nodes[0]?.id;
      }

      if (!teamId) {
        // Get first team
        const teams = await linear.teams();
        teamId = teams.nodes[0]?.id;
      }

      if (!teamId) {
        return { success: false, error: "No team found" };
      }

      const issue = await linear.createIssue({
        teamId,
        title: payload.title as string,
        description: payload.description as string | undefined,
        priority:
          payload.priority === "urgent"
            ? 1
            : payload.priority === "high"
              ? 2
              : payload.priority === "medium"
                ? 3
                : payload.priority === "low"
                  ? 4
                  : 0,
      });

      const createdIssue = await issue.issue;

      return {
        success: true,
        data: { issueId: createdIssue?.id, identifier: createdIssue?.identifier },
        url: createdIssue?.url,
      };
    }

    if (type === "linear.comment.create") {
      const issueId = payload.issueId as string;
      const body = payload.body as string;

      // Find the issue
      const issues = await linear.issues({
        filter: {
          number: { eq: parseInt(issueId.split("-")[1]) },
        },
      });

      const issue = issues.nodes[0];
      if (!issue) {
        return { success: false, error: `Issue ${issueId} not found` };
      }

      await linear.createComment({
        issueId: issue.id,
        body,
      });

      return {
        success: true,
        data: { issueId: issue.id },
        url: issue.url,
      };
    }

    return { success: false, error: "Unknown Linear action type" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Linear API error",
    };
  }
}
