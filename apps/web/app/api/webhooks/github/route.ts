import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import crypto from "crypto";
import { db, integrations, type EventType } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { ingestEvent } from "@/lib/proactivity/engine";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256") || "";
  const event = request.headers.get("x-github-event") || "";

  // Verify webhook signature
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (webhookSecret) {
    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex")}`;

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      console.error("GitHub webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(body);

  // Handle the event in the background
  waitUntil(handleGitHubEvent(event, payload).catch(console.error));

  return NextResponse.json({ ok: true });
}

async function handleGitHubEvent(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Find workspace by GitHub installation/repo
  const installationId = (payload.installation as { id: number })?.id;
  const repoFullName = (payload.repository as { full_name: string })?.full_name;

  if (!installationId && !repoFullName) return;

  // Find the workspace with this GitHub integration
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.type, "github"),
      // Match by installation ID or repo name in metadata
      installationId
        ? eq(integrations.externalId, String(installationId))
        : undefined
    ),
    with: { workspace: true },
  });

  if (!integration?.workspace) return;

  const workspaceId = integration.workspaceId;

  // Map GitHub events to our event types
  let leviEventType: EventType | null = null;
  let eventPayload: Record<string, unknown> = {};
  let externalId = "";
  let externalUrl = "";
  let actorId = "";
  let actorName = "";

  const sender = payload.sender as { login: string; id: number } | undefined;
  if (sender) {
    actorId = String(sender.id);
    actorName = sender.login;
  }

  if (eventType === "pull_request") {
    const action = payload.action as string;
    const pr = payload.pull_request as {
      number: number;
      title: string;
      body: string;
      html_url: string;
      head: { ref: string };
      merged: boolean;
    };

    externalId = `${repoFullName}#${pr.number}`;
    externalUrl = pr.html_url;
    eventPayload = {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      url: pr.html_url,
      branch: pr.head.ref,
      repo: repoFullName,
    };

    if (action === "opened") {
      leviEventType = "github.pr.opened";
    } else if (action === "closed" && pr.merged) {
      leviEventType = "github.pr.merged";
    } else if (action === "closed") {
      leviEventType = "github.pr.closed";
    }
  } else if (eventType === "issues") {
    const action = payload.action as string;
    const issue = payload.issue as {
      number: number;
      title: string;
      body: string;
      html_url: string;
    };

    externalId = `${repoFullName}#${issue.number}`;
    externalUrl = issue.html_url;
    eventPayload = {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
      repo: repoFullName,
    };

    if (action === "opened") {
      leviEventType = "github.issue.opened";
    } else if (action === "closed") {
      leviEventType = "github.issue.closed";
    }
  } else if (eventType === "push") {
    const commits = payload.commits as Array<{ id: string; message: string }> | undefined;
    const ref = payload.ref as string;

    if (commits && commits.length > 0) {
      externalId = commits[0].id;
      eventPayload = {
        ref,
        commits: commits.map((c) => ({ id: c.id, message: c.message })),
        repo: repoFullName,
      };
      leviEventType = "github.push";
    }
  }

  if (!leviEventType) return;

  // Ingest the event
  const event = await ingestEvent(workspaceId, {
    type: leviEventType,
    source: "github",
    externalId,
    externalUrl,
    payload: eventPayload,
    actorId,
    actorName,
  });

  // Send to Inngest for processing
  await inngest.send({
    name: "event/created",
    data: { eventId: event.id },
  });
}
