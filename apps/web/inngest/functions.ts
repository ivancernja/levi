import { inngest } from "./client";
import { executeAction } from "@/lib/actions/executor";
import { db, actions, type Action } from "@/lib/db";
import { eq } from "drizzle-orm";

export const executeActionFunction = inngest.createFunction(
  { id: "execute-action", retries: 2 },
  { event: "action/execute" },
  async ({ event, step }) => {
    const { actionId } = event.data as { actionId: string };

    // Get and execute in a single step to avoid serialization issues
    const result = await step.run("execute-action", async () => {
      const action = await db.query.actions.findFirst({
        where: eq(actions.id, actionId),
      });

      if (!action) {
        throw new Error(`Action ${actionId} not found`);
      }

      return executeAction(action as Action);
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
      } else {
        await db
          .update(actions)
          .set({
            status: "failed",
            error: result.error,
          })
          .where(eq(actions.id, actionId));
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

export const functions = [executeActionFunction, indexMessageFunction];
