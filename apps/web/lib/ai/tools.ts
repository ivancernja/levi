import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "propose_linear_issue_update",
      description:
        "Propose an update to a Linear issue. The user will need to approve before it's executed.",
      parameters: {
        type: "object",
        properties: {
          issueId: {
            type: "string",
            description: "The Linear issue identifier (e.g., 'RD-1733')",
          },
          title: {
            type: "string",
            description: "New title for the issue (optional)",
          },
          description: {
            type: "string",
            description: "New description for the issue (optional)",
          },
          status: {
            type: "string",
            description: "New status (e.g., 'In Progress', 'Done')",
          },
          priority: {
            type: "string",
            enum: ["urgent", "high", "medium", "low", "none"],
            description: "Priority level",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels to add",
          },
          assignee: {
            type: "string",
            description: "Email or name of assignee",
          },
        },
        required: ["issueId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_linear_issue_create",
      description:
        "Propose creating a new Linear issue. The user will need to approve before it's created.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title for the new issue",
          },
          description: {
            type: "string",
            description: "Description for the issue",
          },
          teamKey: {
            type: "string",
            description: "Team key (e.g., 'RD' for R&D)",
          },
          priority: {
            type: "string",
            enum: ["urgent", "high", "medium", "low", "none"],
          },
          labels: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_github_pr",
      description:
        "Propose drafting a GitHub pull request. The user will need to approve before it's created.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository in format 'owner/repo'",
          },
          title: {
            type: "string",
            description: "PR title",
          },
          body: {
            type: "string",
            description: "PR description/body",
          },
          baseBranch: {
            type: "string",
            description: "Base branch (default: main)",
          },
          headBranch: {
            type: "string",
            description: "Head branch with changes",
          },
        },
        required: ["repo", "title", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_github_issue",
      description:
        "Propose creating a GitHub issue. The user will need to approve before it's created.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository in format 'owner/repo'",
          },
          title: {
            type: "string",
            description: "Issue title",
          },
          body: {
            type: "string",
            description: "Issue body",
          },
          labels: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["repo", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_notion_page_update",
      description:
        "Propose updating a Notion page. The user will need to approve before it's updated.",
      parameters: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Notion page ID or URL",
          },
          pageTitle: {
            type: "string",
            description: "Title of the page (for display)",
          },
          instructions: {
            type: "string",
            description: "What changes to make to the page",
          },
          content: {
            type: "string",
            description: "New content to add or replace",
          },
        },
        required: ["pageId", "instructions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_notion_page_create",
      description:
        "Propose creating a new Notion page. The user will need to approve before it's created.",
      parameters: {
        type: "object",
        properties: {
          parentId: {
            type: "string",
            description: "Parent page or database ID",
          },
          title: {
            type: "string",
            description: "Page title",
          },
          content: {
            type: "string",
            description: "Page content in markdown",
          },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_slack_message",
      description:
        "Propose sending a Slack message. The user will need to approve before it's sent.",
      parameters: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            description: "Channel name or ID (e.g., '#general' or 'C123456')",
          },
          message: {
            type: "string",
            description: "Message content (supports Slack markdown)",
          },
        },
        required: ["channel", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_context",
      description:
        "Search for relevant information across all connected integrations (Slack conversations, Linear issues, GitHub PRs, Notion pages).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          sources: {
            type: "array",
            items: {
              type: "string",
              enum: ["slack", "linear", "github", "notion"],
            },
            description: "Limit search to specific sources (optional)",
          },
        },
        required: ["query"],
      },
    },
  },
];

export type ToolName = (typeof AGENT_TOOLS)[number]["function"]["name"];
