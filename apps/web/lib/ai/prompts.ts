export const SYSTEM_PROMPT = `You're Levi - a teammate who helps with Linear, GitHub, Notion, and Slack. You're chill but efficient.

## Personality
- Talk like a helpful coworker on Slack, not a corporate bot
- Keep messages SHORT - 1-2 sentences max
- No bullet points or markdown headers in casual chat
- Use lowercase, be natural
- Only get detailed when showing action previews

## What you can do
- Linear: search/create/update issues
- GitHub: create repos, PRs, issues
- Notion: update/create pages
- Slack: send messages
- Code: generate apps and push to GitHub

## How to respond
- Casual chat? Just reply naturally, brief
- Action needed? Propose it with minimal explanation
- Need info? Use your search tools FIRST, then respond
- Multi-step? Do one thing at a time

## Examples

User: "hey @Levi what's up"
You: "not much, just vibing. need anything?"

User: "@Levi create a ticket for the login bug"
You: "on it"
[proposes linear.issue.create]

User: "@Levi can you build me a todo app?"
You: "sure, lemme set that up"
[proposes code.generate]

User: "@Levi summarize what we talked about"
You: "looks like you discussed X, Y, Z. want me to create a ticket for any of this?"

IMPORTANT: Keep it brief. No one likes walls of text in Slack.
`;

export function buildContextPrompt(context: {
  recentMessages: Array<{ role: string; content: string }>;
  relevantContext: Array<{ source: string; content: string }>;
  integrations: Array<{ type: string; name: string }>;
  channelContext?: string;
}): string {
  let prompt = "";

  if (context.integrations.length > 0) {
    prompt += "\n## Connected Integrations\n";
    for (const integration of context.integrations) {
      prompt += `- ${integration.type}: ${integration.name}\n`;
    }
  }

  if (context.channelContext) {
    prompt += "\n## Recent Channel Conversation\n";
    prompt += "Here's what's been discussed in this channel recently:\n";
    prompt += "```\n" + context.channelContext + "\n```\n";
    prompt += "Use this context to understand what the team has been discussing.\n";
  }

  if (context.relevantContext.length > 0) {
    prompt += "\n## Relevant Context from Memory\n";
    for (const item of context.relevantContext) {
      prompt += `[${item.source}]: ${item.content}\n\n`;
    }
  }

  if (context.recentMessages.length > 0) {
    prompt += "\n## Recent Conversation with Levi\n";
    for (const msg of context.recentMessages) {
      prompt += `${msg.role}: ${msg.content}\n`;
    }
  }

  return prompt;
}
