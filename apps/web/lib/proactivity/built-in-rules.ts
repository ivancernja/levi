import type { EventType, ActionType } from "@/lib/db";

export interface BuiltInRule {
  name: string;
  description: string;
  trigger: EventType;
  conditions?: {
    linkedEntityExists?: { type: string; status?: string };
    actorIs?: string[];
    payloadMatches?: Record<string, unknown>;
    custom?: string;
  };
  suggestionTemplate: {
    actionType: ActionType;
    message: string;
    payloadTemplate: Record<string, unknown>;
  };
}

export const BUILT_IN_RULES: BuiltInRule[] = [
  // PR merged → suggest closing Linear issue
  {
    name: "Close Linear issue on PR merge",
    description: "When a PR is merged that references a Linear issue, suggest marking the issue as done",
    trigger: "github.pr.merged",
    conditions: {
      linkedEntityExists: { type: "linear.issue" },
    },
    suggestionTemplate: {
      actionType: "linear.issue.update",
      message: "PR merged! should i mark {{linked.issue.id}} as done?",
      payloadTemplate: {
        issueId: "{{linked.issue.id}}",
        status: "done",
      },
    },
  },

  // Linear issue completed → suggest Slack update
  {
    name: "Announce completed issue",
    description: "When a Linear issue is marked done, suggest posting an update to Slack",
    trigger: "linear.issue.completed",
    conditions: {},
    suggestionTemplate: {
      actionType: "slack.message.send",
      message: "{{event.identifier}} is done! want me to let the team know?",
      payloadTemplate: {
        text: "✅ {{event.identifier}}: {{event.title}} is complete",
      },
    },
  },

  // GitHub issue opened → suggest Linear issue
  {
    name: "Create Linear issue from GitHub",
    description: "When a GitHub issue is opened, suggest creating a corresponding Linear issue",
    trigger: "github.issue.opened",
    conditions: {},
    suggestionTemplate: {
      actionType: "linear.issue.create",
      message: "new github issue: {{event.title}}. want me to create a linear ticket?",
      payloadTemplate: {
        title: "{{event.title}}",
        description: "From GitHub: {{event.url}}\n\n{{event.body}}",
      },
    },
  },

  // Long Slack discussion → suggest creating issue
  {
    name: "Create issue from discussion",
    description: "When there's an active discussion about a problem, suggest creating a tracking issue",
    trigger: "slack.message",
    conditions: {
      custom: "message contains problem indicators (bug, issue, broken, fix, etc.) and thread has 5+ messages",
    },
    suggestionTemplate: {
      actionType: "linear.issue.create",
      message: "looks like you're discussing an issue. want me to create a linear ticket to track it?",
      payloadTemplate: {
        title: "{{event.summary}}",
        description: "From Slack discussion:\n{{event.context}}",
      },
    },
  },

  // PR opened → suggest notifying in Slack
  {
    name: "Notify PR ready for review",
    description: "When a PR is opened, suggest notifying the team in Slack",
    trigger: "github.pr.opened",
    conditions: {},
    suggestionTemplate: {
      actionType: "slack.message.send",
      message: "PR #{{event.number}} is up. want me to ping the team for review?",
      payloadTemplate: {
        text: "🔍 PR ready for review: {{event.title}}\n{{event.url}}",
      },
    },
  },

  // Notion page updated → suggest Slack summary
  {
    name: "Share Notion update",
    description: "When an important Notion page is updated, suggest sharing in Slack",
    trigger: "notion.page.updated",
    conditions: {},
    suggestionTemplate: {
      actionType: "slack.message.send",
      message: "{{event.title}} was updated. should i share a summary in slack?",
      payloadTemplate: {
        text: "📝 Updated: {{event.title}}\n{{event.url}}",
      },
    },
  },
];

// Get rules for a specific event type
export function getBuiltInRulesForEvent(eventType: EventType): BuiltInRule[] {
  return BUILT_IN_RULES.filter(rule => rule.trigger === eventType);
}
