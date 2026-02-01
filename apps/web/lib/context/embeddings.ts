import { db, messages } from "@/lib/db";
import { eq, sql, desc } from "drizzle-orm";
import OpenAI from "openai";

// OpenAI text-embedding-3-small: $0.02/1M tokens, 1536 dimensions
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

// Lazy initialization to avoid errors when API key is not set
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required for embeddings");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // Truncate text if too long (max ~8191 tokens for text-embedding-3-small)
  // Rough estimate: 4 chars per token, so ~32K chars max
  const truncatedText = text.slice(0, 32000);

  const openai = getOpenAIClient();

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncatedText,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Truncate each text
  const truncatedTexts = texts.map(text => text.slice(0, 32000));

  const openai = getOpenAIClient();

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncatedTexts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  // Sort by index to maintain order
  return response.data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding);
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
