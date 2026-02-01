import { createOpenRouterClient, DEFAULT_MODEL } from "@/lib/ai/client";
import { db, workspaces, type Event, type Rule } from "@/lib/db";
import { eq } from "drizzle-orm";
import { findLinkedEntities } from "./correlator";

interface EvaluationContext {
  event: Event;
  rule: Rule;
  linkedEntities: Array<{ type: string; id: string; linkType: string }>;
  recentActivity?: string;
}

interface EvaluationResult {
  shouldSuggest: boolean;
  confidence: number;
  message: string;
  actionPayload?: Record<string, unknown>;
  reason?: string;
}

export async function evaluateSuggestion(
  workspaceId: string,
  context: EvaluationContext
): Promise<EvaluationResult> {
  const { event, rule, linkedEntities } = context;

  // Get workspace settings for AI
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  const metadata = workspace?.metadata as { openrouterApiKey?: string; model?: string } | null;

  // If no AI key, use simple rule-based evaluation
  if (!metadata?.openrouterApiKey) {
    return evaluateWithRules(context);
  }

  // Use AI to evaluate
  const client = createOpenRouterClient(metadata.openrouterApiKey);

  const prompt = `You are evaluating whether to suggest an action to a user based on an event that occurred.

Event:
- Type: ${event.type}
- Payload: ${JSON.stringify(event.payload, null, 2)}
- Actor: ${event.actorName || event.actorId || "unknown"}

Rule that triggered:
- Name: ${rule.name}
- Description: ${rule.description || "none"}
- Conditions: ${JSON.stringify(rule.conditions, null, 2)}
- Suggestion: ${JSON.stringify(rule.suggestionTemplate, null, 2)}

Linked entities found:
${linkedEntities.map(e => `- ${e.type}: ${e.id} (${e.linkType})`).join("\n") || "None"}

${context.recentActivity ? `Recent activity:\n${context.recentActivity}` : ""}

Based on this context, should we suggest the action to the user?

Consider:
1. Is the suggestion actually helpful and relevant?
2. Would it be annoying or obvious to suggest this?
3. Is the confidence high enough to bother the user?
4. Is there any reason NOT to suggest?

Respond with JSON:
{
  "shouldSuggest": true/false,
  "confidence": 0-100,
  "message": "The natural language message to show the user",
  "reason": "Brief explanation of your decision"
}`;

  try {
    const response = await client.chat.completions.create({
      model: metadata.model || DEFAULT_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that decides whether to proactively suggest actions. Be conservative - only suggest when it's clearly helpful. Respond with JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return evaluateWithRules(context);
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return evaluateWithRules(context);
    }

    const result = JSON.parse(jsonMatch[0]) as EvaluationResult;

    // Fill in action payload from rule template
    if (result.shouldSuggest && rule.suggestionTemplate) {
      result.actionPayload = interpolatePayload(
        rule.suggestionTemplate.payloadTemplate,
        event,
        linkedEntities
      );
    }

    return result;
  } catch (error) {
    console.error("AI evaluation failed:", error);
    return evaluateWithRules(context);
  }
}

// Simple rule-based evaluation when AI is not available
function evaluateWithRules(context: EvaluationContext): EvaluationResult {
  const { event, rule, linkedEntities } = context;
  const conditions = rule.conditions;

  // Check if linked entity exists
  if (conditions?.linkedEntityExists) {
    const found = linkedEntities.find(
      e => e.type === conditions.linkedEntityExists?.type
    );
    if (!found) {
      return {
        shouldSuggest: false,
        confidence: 0,
        message: "",
        reason: "Required linked entity not found",
      };
    }
  }

  // Check actor
  if (conditions?.actorIs && event.actorId) {
    if (!conditions.actorIs.includes(event.actorId)) {
      return {
        shouldSuggest: false,
        confidence: 0,
        message: "",
        reason: "Actor not in allowed list",
      };
    }
  }

  // Check payload matches
  if (conditions?.payloadMatches) {
    for (const [key, value] of Object.entries(conditions.payloadMatches)) {
      if (event.payload[key] !== value) {
        return {
          shouldSuggest: false,
          confidence: 0,
          message: "",
          reason: `Payload mismatch: ${key}`,
        };
      }
    }
  }

  // All conditions passed
  const template = rule.suggestionTemplate;
  const message = interpolateMessage(template.message, event, linkedEntities);

  return {
    shouldSuggest: true,
    confidence: 70,
    message,
    actionPayload: interpolatePayload(template.payloadTemplate, event, linkedEntities),
  };
}

function interpolateMessage(
  template: string,
  event: Event,
  linkedEntities: Array<{ type: string; id: string; linkType: string }>
): string {
  let message = template;

  // Replace event variables
  message = message.replace(/\{\{event\.(\w+)\}\}/g, (_, key) => {
    return String(event.payload[key] || event[key as keyof Event] || "");
  });

  // Replace linked entity variables
  message = message.replace(/\{\{linked\.(\w+)\.(\w+)\}\}/g, (_, type, field) => {
    const entity = linkedEntities.find(e => e.type.includes(type));
    if (!entity) return "";
    if (field === "id") return entity.id;
    if (field === "type") return entity.type;
    return "";
  });

  return message;
}

function interpolatePayload(
  template: Record<string, unknown>,
  event: Event,
  linkedEntities: Array<{ type: string; id: string; linkType: string }>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(template)) {
    if (typeof value === "string") {
      result[key] = interpolateMessage(value, event, linkedEntities);
    } else if (typeof value === "object" && value !== null) {
      result[key] = interpolatePayload(
        value as Record<string, unknown>,
        event,
        linkedEntities
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
