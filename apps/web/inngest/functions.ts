import { inngest } from "./client";
import { executeAction } from "@/lib/actions/executor";
import { db, actions, integrations, type Action } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { WebClient } from "@slack/web-api";

export const executeActionFunction = inngest.createFunction(
  { id: "execute-action", retries: 2 },
  { event: "action/execute" },
  async ({ event, step }) => {
    const { actionId, slackContext } = event.data as {
      actionId: string;
      slackContext?: {
        channelId: string;
        threadTs: string;
        workspaceId: string;
      };
    };

    // Get Slack client if we have context
    let slack: WebClient | null = null;
    if (slackContext) {
      const integration = await db.query.integrations.findFirst({
        where: and(
          eq(integrations.workspaceId, slackContext.workspaceId),
          eq(integrations.type, "slack")
        ),
      });
      if (integration) {
        slack = new WebClient(integration.accessToken);
      }
    }

    const postProgress = async (message: string) => {
      if (slack && slackContext) {
        try {
          await slack.chat.postMessage({
            channel: slackContext.channelId,
            thread_ts: slackContext.threadTs,
            text: message,
          });
        } catch (e) {
          console.error("Failed to post progress:", e);
        }
      }
    };

    // Post starting message
    await postProgress(":hourglass_flowing_sand: working on it...");

    // Get and execute in a single step to avoid serialization issues
    const result = await step.run("execute-action", async () => {
      const action = await db.query.actions.findFirst({
        where: eq(actions.id, actionId),
      });

      if (!action) {
        throw new Error(`Action ${actionId} not found`);
      }

      return executeAction(action as Action, postProgress);
    });

    // Update the action with result
    await step.run("update-action", async () => {
      if (result.success) {
        await db
          .update(actions)
          .set({
            status: "executed",
            result: result.data,
            executedAt: new Date(),
          })
          .where(eq(actions.id, actionId));

        // Post success
        if (result.url) {
          await postProgress(`:white_check_mark: done - <${result.url}|view>`);
        } else {
          await postProgress(`:white_check_mark: done`);
        }
      } else {
        await db
          .update(actions)
          .set({
            status: "failed",
            error: result.error,
          })
          .where(eq(actions.id, actionId));

        await postProgress(`:x: failed: ${result.error}`);
      }
    });

    return result;
  }
);

export const indexMessageFunction = inngest.createFunction(
  { id: "index-message", retries: 1 },
  { event: "message/created" },
  async ({ event, step }) => {
    const { messageId, content } = event.data;

    await step.run("generate-embedding", async () => {
      const { storeMessageWithEmbedding } = await import(
        "@/lib/context/embeddings"
      );
      await storeMessageWithEmbedding(messageId, content);
    });
  }
);

// Process events for proactive suggestions
export const processEventFunction = inngest.createFunction(
  { id: "process-event", retries: 1 },
  { event: "event/created" },
  async ({ event, step }) => {
    const { eventId } = event.data as { eventId: string };

    await step.run("process-event", async () => {
      const { processEvent } = await import("@/lib/proactivity/engine");
      await processEvent(eventId);
    });
  }
);

export const functions = [executeActionFunction, indexMessageFunction, processEventFunction];
