import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import crypto from "crypto";
import { db, integrations, type EventType } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { ingestEvent } from "@/lib/proactivity/engine";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("linear-signature") || "";

  // Verify webhook signature
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
  if (webhookSecret) {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("Linear webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(body);

  // Handle the event in the background
  waitUntil(handleLinearEvent(payload).catch(console.error));

  return NextResponse.json({ ok: true });
}

async function handleLinearEvent(payload: {
  action: string;
  type: string;
  organizationId: string;
  data: Record<string, unknown>;
  createdAt: string;
  actor?: { id: string; name: string };
}): Promise<void> {
  const { action, type, organizationId, data, actor } = payload;

  // Find workspace by Linear org ID
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.type, "linear"),
      eq(integrations.externalId, organizationId)
    ),
    with: { workspace: true },
  });

  if (!integration?.workspace) return;

  const workspaceId = integration.workspaceId;

  // Map Linear events to our event types
  let leviEventType: EventType | null = null;
  let eventPayload: Record<string, unknown> = {};
  let externalId = "";
  let externalUrl = "";

  if (type === "Issue") {
    const issue = data as {
      id: string;
      identifier: string;
      title: string;
      description?: string;
      url: string;
      state?: { name: string; type: string };
    };

    externalId = issue.identifier;
    externalUrl = issue.url;
    eventPayload = {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      url: issue.url,
      state: issue.state?.name,
      stateType: issue.state?.type,
    };

    if (action === "create") {
      leviEventType = "linear.issue.created";
    } else if (action === "update") {
      // Check if it was completed
      if (issue.state?.type === "completed") {
        leviEventType = "linear.issue.completed";
      } else {
        leviEventType = "linear.issue.updated";
      }
    }
  } else if (type === "Comment") {
    const comment = data as {
      id: string;
      body: string;
      url: string;
      issue?: { identifier: string };
    };

    externalId = comment.id;
    externalUrl = comment.url;
    eventPayload = {
      id: comment.id,
      body: comment.body,
      url: comment.url,
      issueIdentifier: comment.issue?.identifier,
    };

    if (action === "create") {
      leviEventType = "linear.comment.created";
    }
  }

  if (!leviEventType) return;

  // Ingest the event
  const event = await ingestEvent(workspaceId, {
    type: leviEventType,
    source: "linear",
    externalId,
    externalUrl,
    payload: eventPayload,
    actorId: actor?.id,
    actorName: actor?.name,
  });

  // Send to Inngest for processing
  await inngest.send({
    name: "event/created",
    data: { eventId: event.id },
  });
}
