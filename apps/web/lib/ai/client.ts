import OpenAI from "openai";

export function createOpenRouterClient(apiKey: string): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": process.env.BETTER_AUTH_URL || "http://localhost:3000",
      "X-Title": "Levi",
    },
  });
}

// Default model if workspace hasn't configured one
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

// Recommended models for agent tasks (tool calling, reasoning)
export const RECOMMENDED_MODELS = [
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    description: "Excellent tool calling and reasoning. Recommended for most use cases.",
    tier: "recommended" as const,
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    description: "Latest Claude model with improved capabilities.",
    tier: "recommended" as const,
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "Strong all-around performance with good tool calling.",
    tier: "recommended" as const,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    description: "Faster and cheaper. Good for simpler tasks.",
    tier: "good" as const,
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    provider: "Google",
    description: "Fast and capable. Good balance of speed and quality.",
    tier: "good" as const,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "Meta",
    description: "Open source. Good for self-hosting or cost-sensitive use.",
    tier: "good" as const,
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat",
    provider: "DeepSeek",
    description: "Very cost-effective. Decent tool calling.",
    tier: "budget" as const,
  },
] as const;

export type RecommendedModel = (typeof RECOMMENDED_MODELS)[number];

export function getModelById(id: string): RecommendedModel | undefined {
  return RECOMMENDED_MODELS.find((m) => m.id === id);
}
