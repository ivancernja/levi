import { createOpenRouterClient, DEFAULT_MODEL } from "./client";
import { SYSTEM_PROMPT, buildContextPrompt } from "./prompts";
import { AGENT_TOOLS } from "./tools";
import { getRelevantContext, getRecentMessages } from "@/lib/context/manager";
import { db, integrations, workspaces, actions } from "@/lib/db";
import { eq, desc, and } from "drizzle-orm";
import type { ActionType, WorkspaceMetadata } from "@/lib/db/schema";
import { searchLinearIssues, listLinearIssues, getLinearActiveCycle, getLinearIssue } from "@/lib/integrations/linear/client";
import {
  listGitHubRepos,
  searchGitHubIssues,
  getGitHubIssue,
  getGitHubPR,
  listGitHubPRs,
  getGitHubRepoFiles,
  getGitHubFileContent,
} from "@/lib/integrations/github/client";
import {
  searchNotionPages,
  getNotionPage,
  listNotionDatabases,
  getNotionDatabaseItems,
} from "@/lib/integrations/notion/client";
import {
  getMCPToolsForAgent,
  executeMCPTool,
  parseMCPToolName,
} from "@/lib/mcp/discovery";
import {
  gatherContext,
  formatGatheredContext,
  hasGatheredContent,
} from "@/lib/context/gatherer";
import { rememberPerson, rememberRepo } from "@/lib/context/knowledge";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

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

// Read tools that should be executed immediately and results fed back
const READ_TOOLS = [
  // Linear
  "search_linear_issues",
  "list_linear_issues",
  "get_linear_sprint",
  "get_linear_issue",
  // GitHub
  "list_github_repos",
  "search_github_issues",
  "get_github_issue",
  "get_github_pr",
  "list_github_prs",
  "get_github_repo_files",
  "get_github_file_content",
  // Notion
  "search_notion_pages",
  "get_notion_page",
  "list_notion_databases",
  "get_notion_database_items",
  // Learning
  "learn_rule",
  "remember_person",
  "remember_repo",
];

export async function processMessage(
  input: ProcessMessageInput
): Promise<ProcessMessageResult> {
  const { workspaceId, conversationId, content, channelContext } = input;

  // Get workspace with settings
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  const metadata = workspace?.metadata as WorkspaceMetadata | null;

  const model = metadata?.model || DEFAULT_MODEL;
  const apiKey = metadata?.openrouterApiKey;
  const workspaceKnowledge = metadata?.knowledge;

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

  // Get recent actions (what Levi has done recently)
  const recentActions = await db.query.actions.findMany({
    where: eq(actions.workspaceId, workspaceId),
    orderBy: [desc(actions.createdAt)],
    limit: 10,
  });

  // Get MCP tools (if any configured)
  const { tools: mcpTools, mcpToolNames } = await getMCPToolsForAgent(workspaceId);

  // Combine built-in tools with MCP tools
  const allTools: ChatCompletionTool[] = [...AGENT_TOOLS, ...mcpTools];

  // Gather rich context from integrations based on user message
  const gatheredContext = await gatherContext(workspaceId, content, {
    maxLinearIssues: 3,
    maxGitHubItems: 3,
    maxNotionPages: 2,
  });
  const gatheredContextText = hasGatheredContent(gatheredContext)
    ? formatGatheredContext(gatheredContext)
    : "";

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
    recentActions: recentActions.map((a) => ({
      type: a.type,
      status: a.status,
      payload: a.payload as Record<string, unknown>,
      result: a.result as Record<string, unknown> | null,
      createdAt: a.createdAt,
    })),
    channelContext,
    mcpServers: mcpTools.length > 0
      ? mcpTools.map((t) => t.function.name.replace(/^mcp_[^_]+_/, "")).slice(0, 10)
      : undefined,
    gatheredContext: gatheredContextText || undefined,
    workspaceKnowledge,
  });

  // Build initial messages
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT + contextPrompt,
    },
    {
      role: "user",
      content,
    },
  ];

  // Multi-turn loop to handle read tools
  // Need enough turns for: search/list -> get files -> read content -> propose action
  const MAX_TURNS = 10;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await openrouter.chat.completions.create({
      model,
      max_tokens: 4096,
      messages,
      tools: allTools.length > 0 ? allTools : undefined,
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // Add assistant message to history
    messages.push(assistantMessage as ChatCompletionMessageParam);

    // Check if we have tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      let hasReadTools = false;
      const actions: ProposedAction[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        // Check if it's an MCP tool
        if (mcpToolNames.includes(toolName)) {
          // MCP tools are always read-only for now
          hasReadTools = true;
          const result = await executeMCPTool(toolName, toolArgs);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        } else if (READ_TOOLS.includes(toolName)) {
          // Execute read tool and add result to messages
          hasReadTools = true;
          const result = await executeReadTool(workspaceId, toolName, toolArgs);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        } else {
          // Propose action for write tools
          const action = toolCallToAction(toolName, toolArgs);
          if (action) {
            actions.push(action);
          }
          // Add a fake tool result so the model knows it was "accepted"
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ status: "proposed", message: "Action proposed for user approval" }),
          });
        }
      }

      // If we only have write tools (actions), return them
      if (!hasReadTools && actions.length > 0) {
        const reply = assistantMessage.content || generateReplyFromActions(actions);
        return { reply, actions };
      }

      // If we have read tools, continue the loop to let AI process results
      if (hasReadTools) {
        continue;
      }
    }

    // No tool calls or finished processing - return the response
    const reply = assistantMessage.content || "";
    return { reply, actions: [] };
  }

  // Max turns reached - this usually means the request needed too many lookups
  return {
    reply: "I ran out of steps trying to complete this. Could you be more specific? For example, include the full repo name (owner/repo) or the exact file path.",
    actions: []
  };
}

async function executeReadTool(
  workspaceId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    // Linear tools
    case "search_linear_issues": {
      const results = await searchLinearIssues(
        workspaceId,
        args.query as string,
        (args.limit as number) || 10
      );
      return { issues: results };
    }
    case "list_linear_issues": {
      const results = await listLinearIssues(workspaceId, {
        limit: (args.limit as number) || 10,
        teamKey: args.teamKey as string | undefined,
      });
      return { issues: results };
    }
    case "get_linear_sprint": {
      const results = await getLinearActiveCycle(workspaceId);
      if (results.length === 0) {
        return { message: "No active sprint/cycle found, or no issues in the current sprint." };
      }
      return { sprint_issues: results };
    }
    case "get_linear_issue": {
      const issue = await getLinearIssue(workspaceId, args.issueId as string);
      return issue || { error: "Issue not found" };
    }

    // GitHub tools
    case "list_github_repos": {
      const repos = await listGitHubRepos(workspaceId, {
        query: args.query as string | undefined,
        limit: (args.limit as number) || 30,
      });
      return { repos };
    }
    case "search_github_issues": {
      const issues = await searchGitHubIssues(workspaceId, args.query as string, {
        repo: args.repo as string | undefined,
        state: args.state as "open" | "closed" | "all" | undefined,
        limit: (args.limit as number) || 10,
      });
      return { issues };
    }
    case "get_github_issue": {
      const issue = await getGitHubIssue(
        workspaceId,
        args.owner as string,
        args.repo as string,
        args.issueNumber as number
      );
      return issue || { error: "Issue not found" };
    }
    case "get_github_pr": {
      const pr = await getGitHubPR(
        workspaceId,
        args.owner as string,
        args.repo as string,
        args.prNumber as number
      );
      return pr || { error: "PR not found" };
    }
    case "list_github_prs": {
      const prs = await listGitHubPRs(
        workspaceId,
        args.owner as string,
        args.repo as string,
        {
          state: args.state as "open" | "closed" | "all" | undefined,
          limit: (args.limit as number) || 10,
        }
      );
      return { prs };
    }
    case "get_github_repo_files": {
      const files = await getGitHubRepoFiles(
        workspaceId,
        args.owner as string,
        args.repo as string,
        (args.path as string) || ""
      );
      return { files };
    }
    case "get_github_file_content": {
      const content = await getGitHubFileContent(
        workspaceId,
        args.owner as string,
        args.repo as string,
        args.path as string
      );
      return content || { error: "File not found" };
    }

    // Notion tools
    case "search_notion_pages": {
      const pages = await searchNotionPages(workspaceId, args.query as string, {
        filter: args.filter as "page" | "database" | undefined,
        limit: (args.limit as number) || 10,
      });
      return { pages };
    }
    case "get_notion_page": {
      const page = await getNotionPage(workspaceId, args.pageId as string, {
        includeContent: args.includeContent !== false,
      });
      return page || { error: "Page not found" };
    }
    case "list_notion_databases": {
      const databases = await listNotionDatabases(
        workspaceId,
        (args.limit as number) || 10
      );
      return { databases };
    }
    case "get_notion_database_items": {
      const items = await getNotionDatabaseItems(
        workspaceId,
        args.databaseId as string,
        {
          limit: (args.limit as number) || 50,
        }
      );
      return { items };
    }

    // Learning
    case "learn_rule": {
      const { createRuleFromNaturalLanguage } = await import("@/lib/proactivity/engine");
      const rule = await createRuleFromNaturalLanguage(
        workspaceId,
        args.description as string
      );
      if (rule) {
        return {
          success: true,
          message: `learned! i'll now ${rule.name.toLowerCase()} when ${rule.trigger} happens.`,
          rule: {
            name: rule.name,
            trigger: rule.trigger,
            description: rule.description,
          },
        };
      }
      return { success: false, error: "couldn't learn that rule, maybe try rephrasing?" };
    }

    case "remember_person": {
      const result = await rememberPerson(workspaceId, {
        shortName: args.shortName as string,
        fullName: args.fullName as string | undefined,
        github: args.github as string | undefined,
        linear: args.linear as string | undefined,
        role: args.role as string | undefined,
        notes: args.notes as string | undefined,
      });
      return result;
    }

    case "remember_repo": {
      const result = await rememberRepo(
        workspaceId,
        args.shortcut as string,
        args.fullName as string
      );
      return result;
    }

    default:
      return { error: "Unknown tool" };
  }
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

    case "propose_github_repo_create":
      return {
        type: "github.repo.create",
        payload: input,
        preview: {
          name: input.name,
          description: input.description,
          isPrivate: input.isPrivate || false,
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

    case "propose_github_pr_with_files":
      return {
        type: "github.pr.create_with_files",
        payload: input,
        preview: {
          repo: input.repo,
          title: input.title,
          body: input.body,
          files: (input.files as Array<{ path: string }>)?.map(f => f.path) || [],
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

    case "propose_code_generation":
      return {
        type: "code.generate",
        payload: input,
        preview: {
          repoName: input.repoName,
          description: input.description,
          specs: input.specs,
          framework: input.framework || "nextjs",
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
      case "github.pr.create_with_files": {
        const fileCount = (action.preview.files as string[] | undefined)?.length || 0;
        return `I'll create a PR with ${fileCount} file(s): "${action.preview.title}".`;
      }
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
