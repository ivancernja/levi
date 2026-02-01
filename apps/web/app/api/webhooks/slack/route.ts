import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { verifySlackRequest } from "@/lib/integrations/slack/verify";
import { findWorkspaceBySlackTeam, getSlackClient, getChannelHistory } from "@/lib/integrations/slack/client";
import { buildReplyBlocks } from "@/lib/integrations/slack/blocks";
import { processMessage } from "@/lib/ai/agent";
import { db, conversations, messages, actions } from "@/lib/db";
import { eq } from "drizzle-orm";

// Random thinking messages for fun
const THINKING_MESSAGES = [
  "hmm let me think...",
  "on it...",
  "thinking...",
  "one sec...",
  "lemme check...",
  "👀",
  "🤔",
];

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

    // Skip bot messages and message_changed events
    if (event.bot_id || event.subtype === "message_changed") {
      return NextResponse.json({ ok: true });
    }

    // Handle app_mention (direct @levi)
    if (event.type === "app_mention") {
      waitUntil(handleMention(payload.team_id, event).catch(console.error));
    }
    // Handle regular messages that mention "levi" (case insensitive)
    else if (event.type === "message" && mentionsLevi(event.text)) {
      waitUntil(handleMention(payload.team_id, event).catch(console.error));
    }
  }

  return NextResponse.json({ ok: true });
}

function mentionsLevi(text: string | undefined): boolean {
  if (!text) return false;
  // Match "levi" as a word (not part of another word like "levitate")
  return /\blevi\b/i.test(text);
}

async function handleMention(
  teamId: string,
  event: {
    channel: string;
    thread_ts?: string;
    ts: string;
    text: string;
    user: string;
  }
) {
  // Deduplicate: check if we already processed this message
  const existingMessage = await db.query.messages.findFirst({
    where: eq(messages.externalId, event.ts),
  });
  if (existingMessage) {
    console.log("Already processed message:", event.ts);
    return;
  }

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

  // Post "thinking" message immediately
  const thinkingMsg = THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
  const thinkingResponse = await slack.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts || event.ts,
    text: thinkingMsg,
  });

  const messageTs = thinkingResponse.ts;

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

  // Fetch recent channel history for context
  const channelHistory = await getChannelHistory(workspace.id, event.channel, 30);
  const channelContext = channelHistory
    .map(m => `${m.user}: ${m.text}`)
    .join("\n");

  // Process with AI agent
  try {
    const result = await processMessage({
      workspaceId: workspace.id,
      conversationId: conversation.id,
      content: event.text,
      userId: event.user,
      channelContext,
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

    // Build blocks for the response
    const blocks = buildReplyBlocks(result.reply, createdActions);

    // Update the "thinking" message with the actual response
    await slack.chat.update({
      channel: event.channel,
      ts: messageTs!,
      text: result.reply,
      blocks,
    });
  } catch (error) {
    console.error("Error processing message:", error);

    // Update the thinking message with error
    await slack.chat.update({
      channel: event.channel,
      ts: messageTs!,
      text: "sorry, something went wrong 😅",
    });
  }
}
