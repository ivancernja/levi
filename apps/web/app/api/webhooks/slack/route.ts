import { NextRequest, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/integrations/slack/verify";
import { findWorkspaceBySlackTeam, getSlackClient } from "@/lib/integrations/slack/client";
import { buildReplyBlocks } from "@/lib/integrations/slack/blocks";
import { processMessage } from "@/lib/ai/agent";
import { db, conversations, messages, actions } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const payload = JSON.parse(body);

  // Handle URL verification challenge FIRST (before signature verification)
  // This is safe because it just echoes back the challenge
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const signature = request.headers.get("x-slack-signature") || "";

  // Verify request is from Slack for all other requests
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

  // Handle events
  if (payload.type === "event_callback") {
    const event = payload.event;

    // Only handle app_mention events (not message events with mentions to avoid duplicates)
    if (event.type === "app_mention") {
      await handleAppMention(payload.team_id, event);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleAppMention(
  teamId: string,
  event: {
    channel: string;
    thread_ts?: string;
    ts: string;
    text: string;
    user: string;
  }
) {
  // Find workspace by Slack team
  const workspace = await findWorkspaceBySlackTeam(teamId);
  if (!workspace) {
    console.error("No workspace found for Slack team:", teamId);
    return;
  }

  // Get Slack client
  const slack = await getSlackClient(workspace.id);
  if (!slack) {
    console.error("No Slack client for workspace:", workspace.id);
    return;
  }

  // Get or create conversation
  const threadTs = event.thread_ts || event.ts;
  const externalId = `${event.channel}:${threadTs}`;

  let conversation = await db.query.conversations.findFirst({
    where: eq(conversations.externalId, externalId),
  });

  if (!conversation) {
    const [newConversation] = await db
      .insert(conversations)
      .values({
        workspaceId: workspace.id,
        source: "slack",
        externalId,
        metadata: {
          channel: event.channel,
          threadTs,
        },
      })
      .returning();
    conversation = newConversation;
  }

  // Store the user message
  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      authorType: "user",
      authorId: event.user,
      content: event.text,
      externalId: event.ts,
      metadata: {
        channel: event.channel,
      },
    })
    .returning();

  // Process with AI agent
  try {
    const result = await processMessage({
      workspaceId: workspace.id,
      conversationId: conversation.id,
      content: event.text,
      userId: event.user,
    });

    // Store proposed actions
    const createdActions = [];
    for (const proposedAction of result.actions) {
      const [action] = await db
        .insert(actions)
        .values({
          workspaceId: workspace.id,
          messageId: userMessage.id,
          type: proposedAction.type,
          payload: proposedAction.payload,
          preview: proposedAction.preview,
        })
        .returning();
      createdActions.push(action);
    }

    // Store bot reply
    await db.insert(messages).values({
      conversationId: conversation.id,
      authorType: "bot",
      authorId: "levi",
      content: result.reply,
      metadata: {
        actions: createdActions.map((a) => a.id),
      },
    });

    // Build and send Slack message with action cards
    const blocks = buildReplyBlocks(result.reply, createdActions);

    await slack.chat.postMessage({
      channel: event.channel,
      text: result.reply,
      blocks,
    });
  } catch (error) {
    console.error("Error processing message:", error);

    await slack.chat.postMessage({
      channel: event.channel,
      text: "Sorry, I encountered an error processing your request.",
    });
  }
}
