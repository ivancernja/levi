import { NextRequest, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/integrations/slack/verify";
import { getSlackClient, findWorkspaceBySlackTeam } from "@/lib/integrations/slack/client";
import { executeAction } from "@/lib/actions/executor";
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

  const threadTs = payload.message.thread_ts || payload.message.ts;

  // Update action status to approved
  await db
    .update(actions)
    .set({
      status: "approved",
      resolvedAt: new Date(),
    })
    .where(eq(actions.id, actionId));

  // Post progress update
  const progressMsg = await slack.chat.postMessage({
    channel: payload.channel.id,
    thread_ts: threadTs,
    text: getProgressMessage(action.type as string, "started"),
  });

  // Create progress callback for multi-step actions
  const onProgress = async (message: string) => {
    if (progressMsg.ts) {
      await slack.chat.postMessage({
        channel: payload.channel.id,
        thread_ts: threadTs,
        text: message,
      });
    }
  };

  // Execute the action
  try {
    const result = await executeAction(action, onProgress);

    // Update action with result
    await db
      .update(actions)
      .set({
        status: "executed",
        result: result.data,
        executedAt: new Date(),
      })
      .where(eq(actions.id, actionId));

    // Update progress message
    if (progressMsg.ts) {
      await slack.chat.update({
        channel: payload.channel.id,
        ts: progressMsg.ts,
        text: getProgressMessage(action.type as string, "done", result.url),
      });
    }
  } catch (error) {
    // Update action as failed
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(actions)
      .set({
        status: "failed",
        error: errorMsg,
      })
      .where(eq(actions.id, actionId));

    // Update progress message with error
    if (progressMsg.ts) {
      await slack.chat.update({
        channel: payload.channel.id,
        ts: progressMsg.ts,
        text: `:x: failed: ${errorMsg}`,
      });
    }
  }
}

function getProgressMessage(actionType: string, status: "started" | "done", url?: string): string {
  const actionNames: Record<string, string> = {
    "linear.issue.create": "creating linear issue",
    "linear.issue.update": "updating linear issue",
    "github.repo.create": "creating github repo",
    "github.pr.create": "drafting PR",
    "github.issue.create": "creating github issue",
    "notion.page.create": "creating notion page",
    "notion.page.update": "updating notion page",
    "slack.message.send": "sending message",
    "code.generate": "generating code & pushing to github",
  };

  const name = actionNames[actionType] || actionType;

  if (status === "started") {
    return `:hourglass_flowing_sand: ${name}...`;
  }

  if (url) {
    return `:white_check_mark: done - <${url}|view>`;
  }
  return `:white_check_mark: done`;
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
