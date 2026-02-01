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
      name: "propose_github_repo_create",
      description:
        "Propose creating a new GitHub repository. The user will need to approve before it's created.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Repository name (e.g., 'my-app')",
          },
          description: {
            type: "string",
            description: "Repository description",
          },
          isPrivate: {
            type: "boolean",
            description: "Whether the repo should be private (default: false)",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_github_pr",
      description:
        "Propose drafting a GitHub pull request. Only use this if the branch already exists with commits. For creating new features, use propose_github_pr_with_files instead.",
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
        required: ["repo", "title", "body", "headBranch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_github_pr_with_files",
      description:
        "Propose creating a PR with new files. This creates a branch, commits files, and opens a PR. Use this to add features, blog posts, or any new code to a repo.",
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
          branchName: {
            type: "string",
            description: "Branch name for the PR (auto-generated if not provided)",
          },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "File path (e.g., 'src/pages/blog.tsx')",
                },
                content: {
                  type: "string",
                  description: "File content",
                },
              },
              required: ["path", "content"],
            },
            description: "Files to create/update in the PR",
          },
        },
        required: ["repo", "title", "body", "files"],
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
      name: "search_linear_issues",
      description:
        "Search for Linear issues by query. Use this to find existing issues before creating or updating them.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (searches title and description)",
          },
          limit: {
            type: "number",
            description: "Max results to return (default: 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_linear_issues",
      description:
        "List recent Linear issues. Use this when asked about 'all issues', 'any issues', or to get an overview of the issue backlog.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max results to return (default: 10)",
          },
          teamKey: {
            type: "string",
            description: "Filter to a specific team (e.g., 'ENG', 'HYP')",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_linear_sprint",
      description:
        "Get issues in the current active sprint/cycle. Use when asked about 'the sprint', 'current cycle', or 'what's in progress'.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_linear_issue",
      description:
        "Get details of a specific Linear issue by ID (e.g., 'ENG-123').",
      parameters: {
        type: "object",
        properties: {
          issueId: {
            type: "string",
            description: "The Linear issue identifier (e.g., 'ENG-123')",
          },
        },
        required: ["issueId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_github_repos",
      description:
        "Search/list GitHub repositories. Use this FIRST when a user mentions a repo by name or nickname to find the full owner/repo. For example, if user says 'druckloft repo', search for 'druckloft' to find the actual repo.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to filter repos by name (e.g., 'druckloft', 'api', 'frontend')",
          },
          limit: {
            type: "number",
            description: "Max repos to return (default: 30)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_github_issues",
      description:
        "Search for GitHub issues across repositories. Can filter by repo and state.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (searches title and body)",
          },
          repo: {
            type: "string",
            description: "Filter to specific repo (format: 'owner/repo')",
          },
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Filter by issue state (default: all)",
          },
          limit: {
            type: "number",
            description: "Max results to return (default: 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_github_issue",
      description:
        "Get details of a specific GitHub issue by repo and issue number.",
      parameters: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner (e.g., 'facebook')",
          },
          repo: {
            type: "string",
            description: "Repository name (e.g., 'react')",
          },
          issueNumber: {
            type: "number",
            description: "Issue number",
          },
        },
        required: ["owner", "repo", "issueNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_github_pr",
      description:
        "Get details of a specific GitHub pull request including comments, reviews, and diff stats.",
      parameters: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner",
          },
          repo: {
            type: "string",
            description: "Repository name",
          },
          prNumber: {
            type: "number",
            description: "Pull request number",
          },
        },
        required: ["owner", "repo", "prNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_github_prs",
      description:
        "List pull requests for a GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner",
          },
          repo: {
            type: "string",
            description: "Repository name",
          },
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Filter by PR state (default: open)",
          },
          limit: {
            type: "number",
            description: "Max results to return (default: 10)",
          },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_github_repo_files",
      description:
        "List files and directories in a GitHub repository path.",
      parameters: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner",
          },
          repo: {
            type: "string",
            description: "Repository name",
          },
          path: {
            type: "string",
            description: "Path within repo (default: root)",
          },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_github_file_content",
      description:
        "Get the contents of a specific file in a GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner",
          },
          repo: {
            type: "string",
            description: "Repository name",
          },
          path: {
            type: "string",
            description: "Full path to the file",
          },
        },
        required: ["owner", "repo", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notion_pages",
      description:
        "Search for Notion pages by query.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          filter: {
            type: "string",
            enum: ["page", "database"],
            description: "Filter to only pages or databases",
          },
          limit: {
            type: "number",
            description: "Max results to return (default: 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_notion_page",
      description:
        "Get a Notion page with its full content.",
      parameters: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Notion page ID or URL",
          },
          includeContent: {
            type: "boolean",
            description: "Whether to fetch full page content (default: true)",
          },
        },
        required: ["pageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_notion_databases",
      description:
        "List Notion databases accessible to the integration.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max results to return (default: 10)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_notion_database_items",
      description:
        "Query items from a Notion database.",
      parameters: {
        type: "object",
        properties: {
          databaseId: {
            type: "string",
            description: "Notion database ID",
          },
          limit: {
            type: "number",
            description: "Max results to return (default: 50)",
          },
        },
        required: ["databaseId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_code_generation",
      description:
        "Propose generating code and pushing it to a new GitHub repository. Use this when asked to build/code/create an app or feature. The user will need to approve before execution.",
      parameters: {
        type: "object",
        properties: {
          repoName: {
            type: "string",
            description: "Name for the new repository (lowercase, no spaces)",
          },
          description: {
            type: "string",
            description: "Short description of what will be built",
          },
          specs: {
            type: "string",
            description: "Detailed specifications for what to build (features, design, tech stack)",
          },
          framework: {
            type: "string",
            enum: ["nextjs", "react", "node", "python"],
            description: "Framework/language to use (default: nextjs)",
          },
        },
        required: ["repoName", "description", "specs"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "learn_rule",
      description:
        "Learn a new proactive behavior rule. Use this when users say things like 'when X happens, do Y' or 'remind me to X when Y' or 'always suggest X after Y'. This teaches Levi to proactively suggest actions based on events.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description:
              "Natural language description of the rule (e.g., 'when a PR is merged, ask if I want to close the related Linear issue')",
          },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_person",
      description:
        "Remember information about a team member. Use when users say things like 'ian's github is @iansmith' or 'alex works on the frontend'. This helps resolve ambiguous references.",
      parameters: {
        type: "object",
        properties: {
          shortName: {
            type: "string",
            description: "Short name or nickname (e.g., 'ian', 'alex')",
          },
          fullName: {
            type: "string",
            description: "Full name if known",
          },
          github: {
            type: "string",
            description: "GitHub username",
          },
          linear: {
            type: "string",
            description: "Linear display name or email",
          },
          role: {
            type: "string",
            description: "Role or what they work on (e.g., 'frontend', 'backend lead')",
          },
          notes: {
            type: "string",
            description: "Any other useful info",
          },
        },
        required: ["shortName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_repo",
      description:
        "Remember a repo shortcut. Use when users refer to repos by nickname like 'the api' or 'frontend'. This helps resolve ambiguous repo references.",
      parameters: {
        type: "object",
        properties: {
          shortcut: {
            type: "string",
            description: "The shortcut/nickname (e.g., 'api', 'frontend', 'the app')",
          },
          fullName: {
            type: "string",
            description: "Full repo name in owner/repo format (e.g., 'myorg/api-server')",
          },
        },
        required: ["shortcut", "fullName"],
      },
    },
  },
];

export type ToolName = (typeof AGENT_TOOLS)[number]["function"]["name"];
