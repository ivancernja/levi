import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { verifySlackRequest } from "@/lib/integrations/slack/verify";
import { getSlackClient, findWorkspaceBySlackTeam } from "@/lib/integrations/slack/client";
import { inngest } from "@/inngest/client";
import { db, actions } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  // Read raw body for signature verification
  const body = await request.text();
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
    console.error("Slack signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the URL-encoded body
  const params = new URLSearchParams(body);
  const payloadStr = params.get("payload");

  if (!payloadStr) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  if (payload.type === "block_actions") {
    for (const slackAction of payload.actions) {
      const actionId = slackAction.action_id as string;

      if (actionId.startsWith("action_approve_")) {
        const id = actionId.replace("action_approve_", "");
        // Use waitUntil to keep function alive after response
        waitUntil(handleApprove(payload, id).catch(console.error));
      } else if (actionId.startsWith("action_reject_")) {
        const id = actionId.replace("action_reject_", "");
        waitUntil(handleReject(payload, id).catch(console.error));
      } else if (actionId.startsWith("action_view_")) {
        const id = actionId.replace("action_view_", "");
        waitUntil(handleViewChanges(payload, id).catch(console.error));
      } else if (actionId.startsWith("suggestion_accept_")) {
        const id = actionId.replace("suggestion_accept_", "");
        waitUntil(handleSuggestionResponse(payload, id, "accept").catch(console.error));
      } else if (actionId.startsWith("suggestion_dismiss_")) {
        const id = actionId.replace("suggestion_dismiss_", "");
        waitUntil(handleSuggestionResponse(payload, id, "dismiss").catch(console.error));
      } else if (actionId.startsWith("suggestion_disable_")) {
        const id = actionId.replace("suggestion_disable_", "");
        waitUntil(handleSuggestionResponse(payload, id, "disable").catch(console.error));
      }
    }
  }

  // Respond immediately to avoid Slack's 3s timeout
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

  // Get the action
  const action = await db.query.actions.findFirst({
    where: eq(actions.id, actionId),
  });

  if (!action || action.status !== "pending") {
    return;
  }

  const threadTs = payload.message.thread_ts || payload.message.ts;

  // Update action status to approved
  await db
    .update(actions)
    .set({
      status: "approved",
      resolvedAt: new Date(),
    })
    .where(eq(actions.id, actionId));

  // Send to Inngest for background execution with Slack context
  await inngest.send({
    name: "action/execute",
    data: {
      actionId,
      slackContext: {
        channelId: payload.channel.id,
        threadTs,
        workspaceId: workspace.id,
      },
    },
  });
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

async function handleSuggestionResponse(
  payload: {
    team: { id: string };
    channel: { id: string };
    message: { ts: string };
  },
  suggestionId: string,
  action: "accept" | "dismiss" | "disable"
) {
  const workspace = await findWorkspaceBySlackTeam(payload.team.id);
  if (!workspace) return;

  const { handleSuggestionResponse: processSuggestion } = await import(
    "@/lib/proactivity/engine"
  );

  await processSuggestion(suggestionId, action);

  // Update the Slack message to show the response
  const slack = await getSlackClient(workspace.id);
  if (!slack) return;

  const emoji = action === "accept" ? "✅" : action === "dismiss" ? "👍" : "🔕";
  const text =
    action === "accept"
      ? "on it!"
      : action === "dismiss"
        ? "got it, nevermind"
        : "won't ask again";

  try {
    await slack.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      text: `${emoji} ${text}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${emoji} ${text}`,
          },
        },
      ],
    });
  } catch (error) {
    console.error("Failed to update suggestion message:", error);
  }
}
