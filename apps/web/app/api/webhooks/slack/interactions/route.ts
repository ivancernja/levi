import { NextRequest, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/integrations/slack/verify";
import { getSlackClient, findWorkspaceBySlackTeam } from "@/lib/integrations/slack/client";
import { buildConfirmationBlocks } from "@/lib/integrations/slack/blocks";
import { executeAction } from "@/lib/actions/executor";
import { db, actions } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const payloadStr = formData.get("payload") as string;

  if (!payloadStr) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  // Verify request (we need to reconstruct the body for verification)
  const body = `payload=${encodeURIComponent(payloadStr)}`;
  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const signature = request.headers.get("x-slack-signature") || "";

  if (
    !verifySlackRequest(
      process.env.SLACK_SIGNING_SECRET!,
      signature,
      timestamp,
      body
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(payloadStr);

  if (payload.type === "block_actions") {
    for (const slackAction of payload.actions) {
      const actionId = slackAction.action_id as string;

      if (actionId.startsWith("action_approve_")) {
        const id = actionId.replace("action_approve_", "");
        await handleApprove(payload, id);
      } else if (actionId.startsWith("action_reject_")) {
        const id = actionId.replace("action_reject_", "");
        await handleReject(payload, id);
      } else if (actionId.startsWith("action_view_")) {
        // View changes - could open a modal
        const id = actionId.replace("action_view_", "");
        await handleViewChanges(payload, id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleApprove(
  payload: {
    team: { id: string };
    user: { id: string };
    channel: { id: string };
    message: { ts: string; thread_ts?: string };
  },
  actionId: string
) {
  const workspace = await findWorkspaceBySlackTeam(payload.team.id);
  if (!workspace) return;

  const slack = await getSlackClient(workspace.id);
  if (!slack) return;

  // Get the action
  const action = await db.query.actions.findFirst({
    where: eq(actions.id, actionId),
  });

  if (!action || action.status !== "pending") {
    return;
  }

  // Update action status to approved
  await db
    .update(actions)
    .set({
      status: "approved",
      resolvedAt: new Date(),
    })
    .where(eq(actions.id, actionId));

  // Execute the action
  try {
    const result = await executeAction(action);

    // Update action with result
    await db
      .update(actions)
      .set({
        status: "executed",
        result: result.data,
        executedAt: new Date(),
      })
      .where(eq(actions.id, actionId));

    // Post confirmation
    const blocks = buildConfirmationBlocks(action, true, result.url);

    await slack.chat.postMessage({
      channel: payload.channel.id,
      thread_ts: payload.message.thread_ts || payload.message.ts,
      text: "Done.",
      blocks,
    });
  } catch (error) {
    // Update action as failed
    await db
      .update(actions)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(actions.id, actionId));

    const blocks = buildConfirmationBlocks(action, false);

    await slack.chat.postMessage({
      channel: payload.channel.id,
      thread_ts: payload.message.thread_ts || payload.message.ts,
      text: "Failed to execute action.",
      blocks,
    });
  }
}

async function handleReject(
  payload: {
    team: { id: string };
    user: { id: string };
    channel: { id: string };
    message: { ts: string };
  },
  actionId: string
) {
  const workspace = await findWorkspaceBySlackTeam(payload.team.id);
  if (!workspace) return;

  // Update action status
  await db
    .update(actions)
    .set({
      status: "rejected",
      resolvedAt: new Date(),
    })
    .where(eq(actions.id, actionId));

  // Could post a confirmation, but probably not necessary
}

async function handleViewChanges(
  payload: {
    team: { id: string };
    trigger_id: string;
  },
  actionId: string
) {
  const workspace = await findWorkspaceBySlackTeam(payload.team.id);
  if (!workspace) return;

  const slack = await getSlackClient(workspace.id);
  if (!slack) return;

  const action = await db.query.actions.findFirst({
    where: eq(actions.id, actionId),
  });

  if (!action) return;

  // Open a modal with the full changes
  await slack.views.open({
    trigger_id: payload.trigger_id,
    view: {
      type: "modal",
      title: {
        type: "plain_text",
        text: "Action Details",
      },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Type:* ${action.type}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Payload:*\n\`\`\`${JSON.stringify(action.payload, null, 2)}\`\`\``,
          },
        },
      ],
    },
  });
}
