import type { Action, ActionType } from "@/lib/db/schema";
import { executeLinearAction } from "@/lib/integrations/linear/executor";
import { executeGitHubAction } from "@/lib/integrations/github/executor";
import { executeNotionAction } from "@/lib/integrations/notion/executor";
import { executeSlackAction } from "@/lib/integrations/slack/executor";

export interface ActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  url?: string;
  error?: string;
}

export async function executeAction(action: Action): Promise<ActionResult> {
  const type = action.type as ActionType;
  const payload = action.payload as Record<string, unknown>;

  switch (type) {
    case "linear.issue.update":
    case "linear.issue.create":
    case "linear.comment.create":
      return executeLinearAction(action.workspaceId, type, payload);

    case "github.repo.create":
    case "github.pr.create":
    case "github.issue.create":
    case "github.comment.create":
      return executeGitHubAction(action.workspaceId, type, payload);

    case "notion.page.update":
    case "notion.page.create":
      return executeNotionAction(action.workspaceId, type, payload);

    case "slack.message.send":
    case "slack.message.reply":
      return executeSlackAction(action.workspaceId, type, payload);

    default:
      return {
        success: false,
        error: `Unknown action type: ${type}`,
      };
  }
}
