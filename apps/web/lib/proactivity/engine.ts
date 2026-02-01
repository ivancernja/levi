import {
  db,
  events,
  rules,
  suggestions,
  type Event,
  type NewEvent,
  type Rule,
  type EventType,
} from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { correlateEvent, findLinkedEntities } from "./correlator";
import { evaluateSuggestion } from "./evaluator";
import { getBuiltInRulesForEvent, type BuiltInRule } from "./built-in-rules";
import { getSlackClient } from "@/lib/integrations/slack/client";

const SUGGESTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between similar suggestions

export async function ingestEvent(
  workspaceId: string,
  eventData: Omit<NewEvent, "workspaceId" | "id" | "createdAt" | "processed">
): Promise<Event> {
  // Store the event
  const [event] = await db
    .insert(events)
    .values({
      workspaceId,
      ...eventData,
    })
    .returning();

  // Correlate with other entities
  await correlateEvent(workspaceId, event);

  return event;
}

export async function processEvent(eventId: string): Promise<void> {
  // Get the event
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event || event.processed) return;

  try {
    // Find linked entities
    const linkedEntities = await findLinkedEntities(
      event.workspaceId,
      `${event.source}.${event.type.split(".")[1]}`,
      event.externalId
    );

    // Get applicable rules (built-in + user-defined)
    const applicableRules = await getApplicableRules(event.workspaceId, event.type);

    // Evaluate each rule
    for (const rule of applicableRules) {
      // Check cooldown - don't spam similar suggestions
      const recentSuggestion = await db.query.suggestions.findFirst({
        where: and(
          eq(suggestions.workspaceId, event.workspaceId),
          eq(suggestions.ruleId, rule.id)
        ),
      });

      if (recentSuggestion) {
        const timeSince = Date.now() - new Date(recentSuggestion.createdAt).getTime();
        if (timeSince < SUGGESTION_COOLDOWN_MS) {
          continue; // Skip, too recent
        }
      }

      // Evaluate if we should suggest
      const result = await evaluateSuggestion(event.workspaceId, {
        event,
        rule,
        linkedEntities,
      });

      if (result.shouldSuggest && result.confidence >= 60) {
        await createSuggestion(event, rule, result.message, result.actionPayload);
      }

      // Update rule stats
      await db
        .update(rules)
        .set({ timesTriggered: (rule.timesTriggered || 0) + 1 })
        .where(eq(rules.id, rule.id));
    }

    // Mark event as processed
    await db
      .update(events)
      .set({ processed: true })
      .where(eq(events.id, eventId));
  } catch (error) {
    console.error("Error processing event:", error);
  }
}

async function getApplicableRules(
  workspaceId: string,
  eventType: EventType
): Promise<Rule[]> {
  // Get user-defined rules
  const userRules = await db.query.rules.findMany({
    where: and(
      eq(rules.workspaceId, workspaceId),
      eq(rules.trigger, eventType),
      eq(rules.enabled, true)
    ),
  });

  // Get built-in rules and convert to Rule format
  const builtInRules = getBuiltInRulesForEvent(eventType);
  const builtInAsRules: Rule[] = builtInRules.map((r, i) => ({
    id: `builtin-${eventType}-${i}`,
    workspaceId,
    name: r.name,
    description: r.description,
    trigger: r.trigger,
    conditions: r.conditions || null,
    suggestionTemplate: r.suggestionTemplate,
    enabled: true,
    isBuiltIn: true,
    timesTriggered: 0,
    timesAccepted: 0,
    timesDismissed: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  return [...builtInAsRules, ...userRules];
}

async function createSuggestion(
  event: Event,
  rule: Rule,
  message: string,
  actionPayload?: Record<string, unknown>
): Promise<void> {
  // Create suggestion record
  const [suggestion] = await db
    .insert(suggestions)
    .values({
      workspaceId: event.workspaceId,
      ruleId: rule.isBuiltIn ? null : rule.id,
      eventId: event.id,
      message,
      actionType: rule.suggestionTemplate.actionType,
      actionPayload,
    })
    .returning();

  // Post to Slack
  await postSuggestionToSlack(event.workspaceId, suggestion.id, message);
}

async function postSuggestionToSlack(
  workspaceId: string,
  suggestionId: string,
  message: string
): Promise<void> {
  const slack = await getSlackClient(workspaceId);
  if (!slack) return;

  // For now, post to a default channel
  // TODO: make this configurable per workspace
  try {
    const result = await slack.chat.postMessage({
      channel: "#general", // Should be configurable
      text: `💡 ${message}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `💡 ${message}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Yes, do it" },
              style: "primary",
              action_id: `suggestion_accept_${suggestionId}`,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Nah" },
              action_id: `suggestion_dismiss_${suggestionId}`,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Don't ask again" },
              action_id: `suggestion_disable_${suggestionId}`,
            },
          ],
        },
      ],
    });

    // Update suggestion with Slack message info
    await db
      .update(suggestions)
      .set({
        slackChannelId: result.channel,
        slackMessageTs: result.ts,
      })
      .where(eq(suggestions.id, suggestionId));
  } catch (error) {
    console.error("Failed to post suggestion to Slack:", error);
  }
}

// Handle suggestion responses from Slack
export async function handleSuggestionResponse(
  suggestionId: string,
  action: "accept" | "dismiss" | "disable"
): Promise<void> {
  const suggestion = await db.query.suggestions.findFirst({
    where: eq(suggestions.id, suggestionId),
  });

  if (!suggestion) return;

  if (action === "accept") {
    // Create an action from the suggestion
    const { actions: actionsTable } = await import("@/lib/db");
    const { inngest } = await import("@/inngest/client");

    const [newAction] = await db
      .insert(actionsTable)
      .values({
        workspaceId: suggestion.workspaceId,
        type: suggestion.actionType!,
        status: "approved",
        payload: suggestion.actionPayload || {},
        resolvedAt: new Date(),
      })
      .returning();

    // Execute via Inngest
    await inngest.send({
      name: "action/execute",
      data: {
        actionId: newAction.id,
        slackContext: suggestion.slackChannelId
          ? {
              channelId: suggestion.slackChannelId,
              threadTs: suggestion.slackMessageTs,
              workspaceId: suggestion.workspaceId,
            }
          : undefined,
      },
    });

    // Update suggestion and rule stats
    await db
      .update(suggestions)
      .set({ status: "accepted", resolvedAt: new Date() })
      .where(eq(suggestions.id, suggestionId));

    if (suggestion.ruleId) {
      const rule = await db.query.rules.findFirst({
        where: eq(rules.id, suggestion.ruleId),
      });
      if (rule) {
        await db
          .update(rules)
          .set({ timesAccepted: (rule.timesAccepted || 0) + 1 })
          .where(eq(rules.id, suggestion.ruleId));
      }
    }
  } else if (action === "dismiss") {
    await db
      .update(suggestions)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(eq(suggestions.id, suggestionId));

    if (suggestion.ruleId) {
      const rule = await db.query.rules.findFirst({
        where: eq(rules.id, suggestion.ruleId),
      });
      if (rule) {
        await db
          .update(rules)
          .set({ timesDismissed: (rule.timesDismissed || 0) + 1 })
          .where(eq(rules.id, suggestion.ruleId));
      }
    }
  } else if (action === "disable") {
    await db
      .update(suggestions)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(eq(suggestions.id, suggestionId));

    // Disable the rule if it's user-defined
    if (suggestion.ruleId) {
      await db
        .update(rules)
        .set({ enabled: false })
        .where(eq(rules.id, suggestion.ruleId));
    }
    // TODO: For built-in rules, store a "disabled" flag in workspace settings
  }
}

// Let Levi create a rule from natural language
export async function createRuleFromNaturalLanguage(
  workspaceId: string,
  description: string
): Promise<Rule | null> {
  // Get workspace for AI key
  const { workspaces } = await import("@/lib/db");
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  const metadata = workspace?.metadata as { openrouterApiKey?: string; model?: string } | null;
  if (!metadata?.openrouterApiKey) {
    return null;
  }

  const { createOpenRouterClient, DEFAULT_MODEL } = await import("@/lib/ai/client");
  const client = createOpenRouterClient(metadata.openrouterApiKey);

  const prompt = `Convert this natural language rule into a structured rule definition.

User's description: "${description}"

Available event types:
- github.pr.merged, github.pr.opened, github.pr.closed
- github.issue.opened, github.issue.closed, github.push
- linear.issue.created, linear.issue.updated, linear.issue.completed, linear.comment.created
- slack.message, slack.reaction
- notion.page.updated, notion.page.created

Available action types:
- linear.issue.update, linear.issue.create, linear.comment.create
- github.repo.create, github.pr.create, github.issue.create, github.comment.create
- notion.page.update, notion.page.create
- slack.message.send, slack.message.reply

Respond with JSON:
{
  "name": "Short name for the rule",
  "description": "What this rule does",
  "trigger": "event.type",
  "conditions": {
    "linkedEntityExists": { "type": "entity.type" },
    "payloadMatches": { "key": "value" },
    "custom": "any custom condition to evaluate"
  },
  "suggestionTemplate": {
    "actionType": "action.type",
    "message": "casual message with {{variables}}",
    "payloadTemplate": { "key": "{{value}}" }
  }
}`;

  try {
    const response = await client.chat.completions.create({
      model: metadata.model || DEFAULT_MODEL,
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: "You convert natural language rules into structured JSON. Be concise and use casual language for the message.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const ruleData = JSON.parse(jsonMatch[0]);

    // Create the rule
    const [rule] = await db
      .insert(rules)
      .values({
        workspaceId,
        name: ruleData.name,
        description: ruleData.description,
        trigger: ruleData.trigger,
        conditions: ruleData.conditions,
        suggestionTemplate: ruleData.suggestionTemplate,
        enabled: true,
        isBuiltIn: false,
      })
      .returning();

    return rule;
  } catch (error) {
    console.error("Failed to create rule from natural language:", error);
    return null;
  }
}
