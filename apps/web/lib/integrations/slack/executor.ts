import { getSlackClient } from "./client";
import type { ActionResult } from "@/lib/actions/executor";

export async function executeSlackAction(
  workspaceId: string,
  type: "slack.message.send" | "slack.message.reply",
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const slack = await getSlackClient(workspaceId);
  if (!slack) {
    return { success: false, error: "Slack not connected" };
  }

  try {
    if (type === "slack.message.send") {
      const result = await slack.chat.postMessage({
        channel: payload.channel as string,
        text: payload.message as string,
      });

      return {
        success: true,
        data: { ts: result.ts, channel: result.channel },
        url: `https://slack.com/app_redirect?channel=${result.channel}&message_ts=${result.ts}`,
      };
    }

    if (type === "slack.message.reply") {
      const result = await slack.chat.postMessage({
        channel: payload.channel as string,
        text: payload.message as string,
        thread_ts: payload.threadTs as string,
      });

      return {
        success: true,
        data: { ts: result.ts, channel: result.channel },
      };
    }

    return { success: false, error: "Unknown Slack action type" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Slack API error",
    };
  }
}
