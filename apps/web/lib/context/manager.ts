import { db, messages, conversations } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { searchSimilarMessages } from "./embeddings";

export async function getRecentMessages(
  conversationId: string,
  limit: number = 10
) {
  return db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [desc(messages.createdAt)],
    limit,
  });
}

export async function getRelevantContext(
  workspaceId: string,
  query: string,
  limit: number = 5
): Promise<Array<{ source: string; content: string; similarity: number }>> {
  try {
    const similar = await searchSimilarMessages(workspaceId, query, limit);
    return similar.map((m) => ({
      source: m.source,
      content: m.content,
      similarity: m.similarity,
    }));
  } catch (error) {
    // If pgvector isn't set up yet, return empty
    console.warn("Semantic search failed, falling back to empty:", error);
    return [];
  }
}

export async function getConversationContext(conversationId: string) {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    with: {
      messages: {
        orderBy: [desc(messages.createdAt)],
        limit: 20,
      },
    },
  });

  return conversation;
}
