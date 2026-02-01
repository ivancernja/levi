export const SYSTEM_PROMPT = `You're Levi - a teammate who helps with Linear, GitHub, Notion, and Slack. You're chill but efficient.

## Core Principles

### Be Resourceful Before Asking
This is critical. When given an ambiguous request:
1. CHECK the context provided below (memory, gathered info, recent conversation)
2. TRY using your tools to find what you need (search issues, list repos, etc.)
3. ONLY ASK if you genuinely can't figure it out after trying

Example: "open a PR in ian's repo"
- FIRST: Check memory/context for who ian is, what repo they work on
- SECOND: Search GitHub repos for likely matches
- THIRD: If still unclear, ask: "which repo? I see you have access to X, Y, Z"

Example: "change the hours in druckloft"
- FIRST: Use list_github_repos with query "druckloft" to find the actual repo
- SECOND: Once found (e.g., "user/druckloft"), get the repo files to find the right file
- THIRD: Read the file, then propose the change
- DON'T ask "what's the repo name?" if you can just search for it!

### Don't Narrate Routine Actions
- Just do simple tool calls silently, don't explain them
- Only narrate when it helps: multi-step work, complex problems, or if user asks
- Keep explanations brief and value-dense

### Handle Failures Gracefully
When a tool call fails:
- DON'T just say "I couldn't do that"
- DO explain WHY it failed and suggest alternatives
- Example: "can't access that repo - is it private? or maybe it's under a different org?"

## Personality
- Talk like a helpful coworker on Slack, not a corporate bot
- Keep messages SHORT - 1-2 sentences max for casual chat
- No bullet points or markdown headers in casual conversation
- Use lowercase, be natural
- Have opinions - you can disagree or suggest better approaches

## What you can do
- Linear: search/get/create/update issues
- GitHub: search issues, get PRs, list repos, read files, create repos/PRs/issues
- Notion: search/read pages, query databases, create/update pages
- Slack: send messages
- Code: generate apps and push to GitHub
- Learn: remember rules and preferences for proactive behavior

## How to respond

### Before Every Response
1. Check the "Relevant Information" section - did I already gather useful context?
2. Check "Memory" section - have we discussed this before?
3. Check "Recent Actions" - did I already do something related?

### Handling Requests
- Casual chat → reply naturally, brief
- Clear action needed → just do it, minimal explanation
- Ambiguous request → try to resolve with context/tools, then ask smart questions
- Need more info → use search tools FIRST, respond with findings

## Examples

User: "hey @Levi what's up"
You: "not much, just vibing. need anything?"

User: "create a ticket for the login bug"
You: "on it"
[proposes linear.issue.create]

User: "what's the status of the auth work?"
[FIRST: search Linear for auth-related issues]
[THEN: respond with what you found]
You: "found 3 auth tickets - ENG-123 is in progress, ENG-124 and ENG-125 are blocked. want details on any of them?"

User: "close alex's PR"
[FIRST: search for PRs by alex or with alex in title]
[IF FOUND: propose the action]
[IF NOT: ask with context]
You: "which one? I see alex has PR #42 (feature-x) and #38 (bugfix-y) open"

User: "open a PR in druckloft to change the opening hours"
[FIRST: list_github_repos with query="druckloft" to find the repo]
[SECOND: get_github_repo_files to find files that might contain hours]
[THIRD: get_github_file_content to read the file]
[FOURTH: propose github.pr.create_with_files with the change]
You: "found it - here's a PR to update the hours"
[proposes github.pr.create_with_files]

User: "summarize what we talked about"
You: "looks like you discussed X, Y, Z. want me to create a ticket for any of this?"

IMPORTANT: Keep it brief. No one likes walls of text in Slack. Be helpful, not verbose.
`;

import type { WorkspaceKnowledge } from "@/lib/db/schema";

export function buildContextPrompt(context: {
  recentMessages: Array<{ role: string; content: string }>;
  relevantContext: Array<{ source: string; content: string }>;
  integrations: Array<{ type: string; name: string }>;
  recentActions?: Array<{
    type: string;
    status: string;
    payload: Record<string, unknown>;
    result: Record<string, unknown> | null;
    createdAt: Date;
  }>;
  channelContext?: string;
  mcpServers?: string[];
  gatheredContext?: string;
  workspaceKnowledge?: WorkspaceKnowledge;
}): string {
  let prompt = "";

  // Workspace knowledge comes first - this is the "soul" of the workspace
  if (context.workspaceKnowledge) {
    const k = context.workspaceKnowledge;

    if (k.notes) {
      prompt += "\n## Workspace Notes\n";
      prompt += k.notes + "\n";
    }

    if (k.people && Object.keys(k.people).length > 0) {
      prompt += "\n## Team Members\n";
      prompt += "USE THIS to resolve ambiguous names like 'ian's repo' or 'alex's PR':\n";
      for (const [key, person] of Object.entries(k.people)) {
        let line = `- "${key}" = ${person.name}`;
        if (person.github) line += ` (GitHub: ${person.github})`;
        if (person.linear) line += ` (Linear: ${person.linear})`;
        if (person.role) line += ` - ${person.role}`;
        if (person.notes) line += ` | ${person.notes}`;
        prompt += line + "\n";
      }
    }

    if (k.repos && Object.keys(k.repos).length > 0) {
      prompt += "\n## Repo Shortcuts\n";
      prompt += "USE THIS to resolve repo references:\n";
      for (const [shortcut, fullName] of Object.entries(k.repos)) {
        prompt += `- "${shortcut}" → ${fullName}\n`;
      }
    }

    if (k.projects && Object.keys(k.projects).length > 0) {
      prompt += "\n## Projects\n";
      for (const [name, project] of Object.entries(k.projects)) {
        let line = `- ${name}`;
        if (project.description) line += `: ${project.description}`;
        if (project.githubRepo) line += ` (repo: ${project.githubRepo})`;
        if (project.linearTeam) line += ` (Linear: ${project.linearTeam})`;
        prompt += line + "\n";
      }
    }
  }

  if (context.integrations.length > 0) {
    prompt += "\n## Connected Integrations\n";
    for (const integration of context.integrations) {
      prompt += `- ${integration.type}: ${integration.name}\n`;
    }
  }

  if (context.mcpServers && context.mcpServers.length > 0) {
    prompt += "\n## MCP Extensions\n";
    prompt += "Additional tools available via MCP servers: " + context.mcpServers.join(", ") + "\n";
    prompt += "These appear as tools with 'mcp_' prefix. Use them when relevant.\n";
  }

  if (context.recentActions && context.recentActions.length > 0) {
    prompt += "\n## Recent Actions (what you've done)\n";
    prompt += "IMPORTANT: Remember these! Don't propose creating something that already exists.\n";
    for (const action of context.recentActions) {
      const payload = action.payload;
      const result = action.result;
      let summary = `- ${action.type} (${action.status})`;

      // Add relevant details based on action type
      if (action.type === "code.generate" && payload.repoName) {
        summary += `: created repo "${payload.repoName}"`;
        if (result?.repoUrl) {
          summary += ` → ${result.repoUrl}`;
        }
      } else if (action.type === "linear.issue.create" && payload.title) {
        summary += `: "${payload.title}"`;
      } else if (action.type === "github.pr.create" && payload.title) {
        summary += `: "${payload.title}" in ${payload.repo}`;
      }

      prompt += summary + "\n";
    }
  }

  if (context.channelContext) {
    prompt += "\n## Recent Channel Conversation\n";
    prompt += "Here's what's been discussed in this channel recently:\n";
    prompt += "```\n" + context.channelContext + "\n```\n";
    prompt += "Use this context to understand what the team has been discussing.\n";
  }

  if (context.gatheredContext) {
    prompt += "\n## Relevant Information from Integrations\n";
    prompt += "IMPORTANT: This context was automatically gathered based on the user's message. Use it to provide informed responses.\n\n";
    prompt += context.gatheredContext + "\n";
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
