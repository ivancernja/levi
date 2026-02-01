import { createOpenRouterClient, DEFAULT_MODEL } from "./client";
import { SYSTEM_PROMPT, buildContextPrompt } from "./prompts";
import { AGENT_TOOLS } from "./tools";
import { getRelevantContext, getRecentMessages } from "@/lib/context/manager";
import { db, integrations, workspaces } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { ActionType } from "@/lib/db/schema";

interface ProcessMessageInput {
  workspaceId: string;
  conversationId: string;
  content: string;
  userId: string;
  channelContext?: string;
}

interface ProposedAction {
  type: ActionType;
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
}

interface ProcessMessageResult {
  reply: string;
  actions: ProposedAction[];
}

export async function processMessage(
  input: ProcessMessageInput
): Promise<ProcessMessageResult> {
  const { workspaceId, conversationId, content, channelContext } = input;

  // Get workspace with settings
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  const metadata = workspace?.metadata as {
    model?: string;
    openrouterApiKey?: string;
  } | null;

  const model = metadata?.model || DEFAULT_MODEL;
  const apiKey = metadata?.openrouterApiKey;

  if (!apiKey) {
    return {
      reply: "Please configure your OpenRouter API key in Settings to use Levi.",
      actions: [],
    };
  }

  // Create client with workspace's API key
  const openrouter = createOpenRouterClient(apiKey);

  // Get workspace integrations
  const workspaceIntegrations = await db.query.integrations.findMany({
    where: eq(integrations.workspaceId, workspaceId),
  });

  // Get recent messages from conversation
  const recentMessages = await getRecentMessages(conversationId, 10);

  // Get relevant context via semantic search
  const relevantContext = await getRelevantContext(workspaceId, content, 5);

  // Build context for the prompt
  const contextPrompt = buildContextPrompt({
    recentMessages: recentMessages.map((m) => ({
      role: m.authorType === "user" ? "User" : "Levi",
      content: m.content,
    })),
    relevantContext: relevantContext.map((c) => ({
      source: c.source,
      content: c.content,
    })),
    integrations: workspaceIntegrations.map((i) => ({
      type: i.type,
      name: i.externalName || i.type,
    })),
    channelContext,
  });

  // Call via OpenRouter
  const response = await openrouter.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT + contextPrompt,
      },
      {
        role: "user",
        content,
      },
    ],
    tools: AGENT_TOOLS,
  });

  // Process response
  const actions: ProposedAction[] = [];
  let reply = "";

  const choice = response.choices[0];
  if (choice.message.content) {
    reply = choice.message.content;
  }

  if (choice.message.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      const action = toolCallToAction(
        toolCall.function.name,
        JSON.parse(toolCall.function.arguments)
      );
      if (action) {
        actions.push(action);
      }
    }
  }

  // If we have tool calls but no reply, generate one
  if (choice.finish_reason === "tool_calls" && !reply) {
    reply = generateReplyFromActions(actions);
  }

  return { reply, actions };
}

function toolCallToAction(
  toolName: string,
  input: Record<string, unknown>
): ProposedAction | null {
  switch (toolName) {
    case "propose_linear_issue_update":
      return {
        type: "linear.issue.update",
        payload: input,
        preview: {
          issueId: input.issueId,
          title: input.title || "Update issue",
          description: input.description,
          changes: Object.fromEntries(
            Object.entries(input).filter(
              ([key]) => key !== "issueId" && input[key] !== undefined
            )
          ),
        },
      };

    case "propose_linear_issue_create":
      return {
        type: "linear.issue.create",
        payload: input,
        preview: {
          title: input.title,
          description: input.description,
          teamKey: input.teamKey,
        },
      };

    case "propose_github_pr":
      return {
        type: "github.pr.create",
        payload: input,
        preview: {
          repo: input.repo,
          title: input.title,
          body: input.body,
          baseBranch: input.baseBranch || "main",
          headBranch: input.headBranch,
        },
      };

    case "propose_github_issue":
      return {
        type: "github.issue.create",
        payload: input,
        preview: {
          repo: input.repo,
          title: input.title,
          body: input.body,
        },
      };

    case "propose_notion_page_update":
      return {
        type: "notion.page.update",
        payload: input,
        preview: {
          pageId: input.pageId,
          pageTitle: input.pageTitle,
          instructions: input.instructions,
          content: input.content,
        },
      };

    case "propose_notion_page_create":
      return {
        type: "notion.page.create",
        payload: input,
        preview: {
          title: input.title,
          content: input.content,
        },
      };

    case "propose_slack_message":
      return {
        type: "slack.message.send",
        payload: input,
        preview: {
          channel: input.channel,
          message: input.message,
        },
      };

    default:
      return null;
  }
}

function generateReplyFromActions(actions: ProposedAction[]): string {
  if (actions.length === 0) {
    return "I'm not sure what action to take. Could you clarify?";
  }

  if (actions.length === 1) {
    const action = actions[0];
    switch (action.type) {
      case "linear.issue.update":
        return `I'll update Linear issue ${action.preview.issueId}.`;
      case "linear.issue.create":
        return `I'll create a new Linear issue: "${action.preview.title}".`;
      case "github.pr.create":
        return `I'll draft a PR: "${action.preview.title}".`;
      case "github.issue.create":
        return `I'll create a GitHub issue: "${action.preview.title}".`;
      case "notion.page.update":
        return `I'll update the Notion page.`;
      case "notion.page.create":
        return `I'll create a new Notion page: "${action.preview.title}".`;
      case "slack.message.send":
        return `I'll send a message to ${action.preview.channel}.`;
      default:
        return "I'll take care of that.";
    }
  }

  return `I'll take ${actions.length} actions for you.`;
}
