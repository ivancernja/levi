import { db, messages } from "@/lib/db";
import { eq, sql, desc } from "drizzle-orm";

// Use Anthropic's embedding model via Voyage (or OpenAI's for now)
// For simplicity, we'll use a placeholder that you can swap out
// In production, use voyage-3 or text-embedding-3-small

export async function generateEmbedding(text: string): Promise<number[]> {
  // Option 1: Use OpenAI embeddings (most common)
  // You'd need to add openai to dependencies
  /*
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
  */

  // Option 2: Use Voyage AI (Anthropic's recommended)
  /*
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voyage-3",
      input: text,
    }),
  });
  const data = await response.json();
  return data.data[0].embedding;
  */

  // For now, return a mock embedding (replace with real implementation)
  // This generates a deterministic but meaningless embedding based on text hash
  const hash = simpleHash(text);
  const embedding = new Array(1536).fill(0).map((_, i) => {
    const seed = hash + i;
    return (Math.sin(seed) + 1) / 2 - 0.5;
  });
  return embedding;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}

export async function storeMessageWithEmbedding(
  messageId: string,
  content: string
): Promise<void> {
  const embedding = await generateEmbedding(content);

  await db
    .update(messages)
    .set({
      embedding,
    })
    .where(eq(messages.id, messageId));
}

export async function searchSimilarMessages(
  workspaceId: string,
  query: string,
  limit: number = 5
): Promise<
  Array<{
    id: string;
    content: string;
    source: string;
    similarity: number;
  }>
> {
  const queryEmbedding = await generateEmbedding(query);

  // Use pgvector's cosine distance operator
  // Note: This requires the pgvector extension to be enabled
  const results = await db.execute(sql`
    SELECT
      m.id,
      m.content,
      c.source,
      1 - (m.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.workspace_id = ${workspaceId}
      AND m.embedding IS NOT NULL
    ORDER BY m.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${limit}
  `);

  return results.rows as Array<{
    id: string;
    content: string;
    source: string;
    similarity: number;
  }>;
}
