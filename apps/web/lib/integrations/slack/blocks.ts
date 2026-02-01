import type { KnownBlock, Button, SectionBlock } from "@slack/web-api";
import type { Action, ActionType } from "@/lib/db/schema";

interface ActionCardConfig {
  icon: string;
  title: string;
  color: string;
}

const ACTION_CONFIGS: Record<ActionType, ActionCardConfig> = {
  "linear.issue.update": {
    icon: ":pencil2:",
    title: "Update Linear Issue",
    color: "#5E6AD2",
  },
  "linear.issue.create": {
    icon: ":memo:",
    title: "Create Linear Issue",
    color: "#5E6AD2",
  },
  "linear.comment.create": {
    icon: ":speech_balloon:",
    title: "Add Linear Comment",
    color: "#5E6AD2",
  },
  "github.repo.create": {
    icon: ":file_folder:",
    title: "Create GitHub Repository",
    color: "#238636",
  },
  "github.pr.create": {
    icon: ":git-merge:",
    title: "Draft Pull Request",
    color: "#238636",
  },
  "github.pr.create_with_files": {
    icon: ":git-merge:",
    title: "Create PR with Files",
    color: "#238636",
  },
  "github.branch.create": {
    icon: ":twisted_rightwards_arrows:",
    title: "Create Branch",
    color: "#238636",
  },
  "github.file.create": {
    icon: ":page_facing_up:",
    title: "Create File",
    color: "#238636",
  },
  "github.issue.create": {
    icon: ":bug:",
    title: "Create GitHub Issue",
    color: "#238636",
  },
  "github.comment.create": {
    icon: ":speech_balloon:",
    title: "Add GitHub Comment",
    color: "#238636",
  },
  "notion.page.update": {
    icon: ":page_facing_up:",
    title: "Update Notion Page",
    color: "#000000",
  },
  "notion.page.create": {
    icon: ":page_facing_up:",
    title: "Create Notion Page",
    color: "#000000",
  },
  "slack.message.send": {
    icon: ":envelope:",
    title: "Send Slack Message",
    color: "#4A154B",
  },
  "slack.message.reply": {
    icon: ":left_speech_bubble:",
    title: "Reply in Thread",
    color: "#4A154B",
  },
  "code.generate": {
    icon: ":rocket:",
    title: "Generate & Push Code",
    color: "#6366F1",
  },
};

export function buildActionCard(action: Action): KnownBlock[] {
  const config = ACTION_CONFIGS[action.type as ActionType];
  const preview = action.preview as Record<string, unknown> | null;

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${config.icon} *${config.title}*`,
      },
    } as SectionBlock,
  ];

  // Add preview content based on action type
  if (preview) {
    if (action.type === "linear.issue.create") {
      const title = preview.title as string;
      const description = preview.description as string;
      const teamKey = preview.teamKey as string;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${title}*`,
        },
      } as SectionBlock);

      if (description) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: description.slice(0, 500) + (description.length > 500 ? "..." : ""),
          },
        } as SectionBlock);
      }

      if (teamKey) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Team: \`${teamKey}\``,
            },
          ],
        });
      }
    } else if (action.type === "linear.issue.update") {
      const issueId = preview.issueId as string;
      const title = preview.title as string;
      const description = preview.description as string;
      const changes = preview.changes as Record<string, unknown>;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${issueId}*\n${title}`,
        },
      } as SectionBlock);

      if (description) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: description,
          },
        } as SectionBlock);
      }

      if (changes) {
        const changesList = Object.entries(changes)
          .map(([key, value]) => `• *${key}:* ${value}`)
          .join("\n");
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Changes:\n${changesList}`,
            },
          ],
        });
      }
    } else if (action.type === "github.repo.create") {
      const name = preview.name as string;
      const description = preview.description as string;
      const isPrivate = preview.isPrivate as boolean;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${name}*${isPrivate ? " (private)" : ""}`,
        },
      } as SectionBlock);

      if (description) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: description,
          },
        } as SectionBlock);
      }
    } else if (action.type === "github.issue.create") {
      const title = preview.title as string;
      const body = preview.body as string;
      const repo = preview.repo as string;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${title}*`,
        },
      } as SectionBlock);

      if (body) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: body.slice(0, 500) + (body.length > 500 ? "..." : ""),
          },
        } as SectionBlock);
      }

      if (repo) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Repository: \`${repo}\``,
            },
          ],
        });
      }
    } else if (action.type === "github.pr.create" || action.type === "github.pr.create_with_files") {
      const title = preview.title as string;
      const body = preview.body as string;
      const repo = preview.repo as string;
      const files = preview.files as string[] | undefined;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${title}*\n\n${body || "_No description_"}`,
        },
      } as SectionBlock);

      if (files && files.length > 0) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Files: ${files.slice(0, 5).map(f => `\`${f}\``).join(", ")}${files.length > 5 ? ` +${files.length - 5} more` : ""}`,
            },
          ],
        });
      }

      if (repo) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Repository: \`${repo}\``,
            },
          ],
        });
      }
    } else if (action.type === "notion.page.update") {
      const pageTitle = preview.pageTitle as string;
      const instructions = preview.instructions as string;
      const content = preview.content as string;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Agent instructions:*\n${instructions}`,
        },
      } as SectionBlock);

      if (pageTitle) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${pageTitle}*`,
          },
        } as SectionBlock);
      }

      if (content) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: content.slice(0, 500) + (content.length > 500 ? "..." : ""),
          },
        } as SectionBlock);
      }
    } else if (action.type === "code.generate") {
      const repoName = preview.repoName as string;
      const description = preview.description as string;
      const specs = preview.specs as string;
      const framework = preview.framework as string;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Repository:* \`${repoName}\`\n*Framework:* ${framework || "nextjs"}`,
        },
      } as SectionBlock);

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Description:*\n${description}`,
        },
      } as SectionBlock);

      if (specs) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Specs:*\n${specs.slice(0, 500)}${specs.length > 500 ? "..." : ""}`,
          },
        } as SectionBlock);
      }

      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: ":warning: This will create a new GitHub repo and push generated code",
          },
        ],
      });
    } else if (action.type === "notion.page.create") {
      const title = preview.title as string;
      const content = preview.content as string;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${title}*`,
        },
      } as SectionBlock);

      if (content) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: content.slice(0, 500) + (content.length > 500 ? "..." : ""),
          },
        } as SectionBlock);
      }
    } else if (
      action.type === "slack.message.send" ||
      action.type === "slack.message.reply"
    ) {
      const channel = preview.channel as string;
      const message = preview.message as string;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: message,
        },
      } as SectionBlock);

      if (channel) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Channel: <#${channel}>`,
            },
          ],
        });
      }
    }
  }

  // Add action buttons
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "View changes",
        },
        action_id: `action_view_${action.id}`,
      } as Button,
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Reject",
        },
        style: "danger",
        action_id: `action_reject_${action.id}`,
      } as Button,
      {
        type: "button",
        text: {
          type: "plain_text",
          text: getApproveButtonText(action.type as ActionType),
        },
        style: "primary",
        action_id: `action_approve_${action.id}`,
      } as Button,
    ],
  });

  return blocks;
}

function getApproveButtonText(type: ActionType): string {
  switch (type) {
    case "linear.issue.update":
      return "Update issue";
    case "linear.issue.create":
      return "Create issue";
    case "github.repo.create":
      return "Create repo";
    case "github.pr.create":
    case "github.pr.create_with_files":
      return "Create PR";
    case "github.branch.create":
      return "Create branch";
    case "github.file.create":
      return "Create file";
    case "github.issue.create":
      return "Create issue";
    case "notion.page.update":
      return "Accept";
    case "notion.page.create":
      return "Create page";
    case "slack.message.send":
    case "slack.message.reply":
      return "Send";
    case "code.generate":
      return "Generate code";
    default:
      return "Approve";
  }
}

export function buildReplyBlocks(text: string, actions: Action[]): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text,
      },
    } as SectionBlock,
  ];

  // Add divider before action cards
  if (actions.length > 0) {
    blocks.push({ type: "divider" });
  }

  // Add each action card
  for (const action of actions) {
    blocks.push(...buildActionCard(action));
    blocks.push({ type: "divider" });
  }

  return blocks;
}

export function buildConfirmationBlocks(
  action: Action,
  success: boolean,
  resultUrl?: string
): KnownBlock[] {
  const config = ACTION_CONFIGS[action.type as ActionType];
  const status = success ? "Done" : "Failed";
  const emoji = success ? ":white_check_mark:" : ":x:";

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} ${status}. ${config.title}`,
      },
    } as SectionBlock,
  ];

  if (resultUrl) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${resultUrl}|View in ${action.type.split(".")[0]}>`,
        },
      ],
    });
  }

  return blocks;
}
