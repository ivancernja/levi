import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  boolean,
  integer,
  vector,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// Auth Tables (Better Auth compatible)
// ============================================================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Workspace Tables
// ============================================================================

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  description?: string;
}

export interface WorkspaceKnowledge {
  // Team knowledge - who's who, what they work on
  people?: Record<string, {
    name: string;
    github?: string;
    linear?: string;
    role?: string;
    notes?: string;
  }>;
  // Repo shortcuts - "the api" → "org/api-server"
  repos?: Record<string, string>;
  // Project context
  projects?: Record<string, {
    description?: string;
    linearTeam?: string;
    githubRepo?: string;
  }>;
  // Custom notes (like SOUL.md)
  notes?: string;
}

export interface WorkspaceMetadata {
  model?: string; // OpenRouter model ID e.g. "anthropic/claude-sonnet-4"
  openrouterApiKey?: string; // User's own OpenRouter API key
  mcpServers?: MCPServerConfig[]; // MCP servers for custom integrations
  knowledge?: WorkspaceKnowledge; // Team knowledge and shortcuts
}

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  image: text("image"),
  // Workspace settings
  metadata: jsonb("metadata").$type<WorkspaceMetadata>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner, admin, member
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })]
);

// ============================================================================
// Integration Tables
// ============================================================================

export type IntegrationType = "slack" | "linear" | "github" | "notion";

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<IntegrationType>(),
    // OAuth tokens (encrypted in production)
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at"),
    // Integration-specific data
    externalId: text("external_id"), // e.g., Slack team ID, Linear org ID
    externalName: text("external_name"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("integrations_workspace_type_idx").on(
      table.workspaceId,
      table.type
    ),
  ]
);

// ============================================================================
// Conversation Tables
// ============================================================================

export type ConversationSource = "slack" | "linear" | "github" | "notion";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    source: text("source").notNull().$type<ConversationSource>(),
    // External identifiers
    externalId: text("external_id").notNull(), // e.g., Slack channel+thread, Linear issue ID
    externalUrl: text("external_url"),
    title: text("title"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("conversations_workspace_source_idx").on(
      table.workspaceId,
      table.source
    ),
    index("conversations_external_id_idx").on(table.externalId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    // Who sent it
    authorType: text("author_type").notNull().$type<"user" | "bot">(),
    authorId: text("author_id"), // external user ID or 'levi'
    authorName: text("author_name"),
    // Content
    content: text("content").notNull(),
    // Vector embedding for semantic search (1536 dimensions for OpenAI, 1024 for Anthropic)
    embedding: vector("embedding", { dimensions: 1536 }),
    // External reference
    externalId: text("external_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId),
    index("messages_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================================
// Action Tables
// ============================================================================

export type ActionType =
  | "linear.issue.update"
  | "linear.issue.create"
  | "linear.comment.create"
  | "github.repo.create"
  | "github.pr.create"
  | "github.issue.create"
  | "github.comment.create"
  | "notion.page.update"
  | "notion.page.create"
  | "slack.message.send"
  | "slack.message.reply"
  | "code.generate";

export type ActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull().$type<ActionType>(),
    status: text("status").notNull().default("pending").$type<ActionStatus>(),
    // What the action will do
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    // Preview data for the action card
    preview: jsonb("preview").$type<Record<string, unknown>>(),
    // Who approved/rejected
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at"),
    // Execution result
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    executedAt: timestamp("executed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("actions_workspace_status_idx").on(table.workspaceId, table.status),
    index("actions_message_idx").on(table.messageId),
  ]
);

// ============================================================================
// Relations
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  workspaceMembers: many(workspaceMembers),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  integrations: many(integrations),
  conversations: many(conversations),
  actions: many(actions),
}));

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
  })
);

export const integrationsRelations = relations(integrations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [integrations.workspaceId],
    references: [workspaces.id],
  }),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [conversations.workspaceId],
      references: [workspaces.id],
    }),
    messages: many(messages),
  })
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  actions: many(actions),
}));

export const actionsRelations = relations(actions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [actions.workspaceId],
    references: [workspaces.id],
  }),
  message: one(messages, {
    fields: [actions.messageId],
    references: [messages.id],
  }),
  resolvedByUser: one(users, {
    fields: [actions.resolvedBy],
    references: [users.id],
  }),
}));

// ============================================================================
// Event Stream Tables (for proactivity)
// ============================================================================

export type EventType =
  // GitHub
  | "github.pr.merged"
  | "github.pr.opened"
  | "github.pr.closed"
  | "github.issue.opened"
  | "github.issue.closed"
  | "github.push"
  // Linear
  | "linear.issue.created"
  | "linear.issue.updated"
  | "linear.issue.completed"
  | "linear.comment.created"
  // Slack
  | "slack.message"
  | "slack.reaction"
  // Notion
  | "notion.page.updated"
  | "notion.page.created";

// All events from all integrations
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<EventType>(),
    source: text("source").notNull().$type<IntegrationType>(),
    // External reference
    externalId: text("external_id").notNull(), // e.g., PR number, issue ID
    externalUrl: text("external_url"),
    // Event payload
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    // Actor who triggered the event
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    // Processing status
    processed: boolean("processed").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("events_workspace_type_idx").on(table.workspaceId, table.type),
    index("events_workspace_processed_idx").on(table.workspaceId, table.processed),
    index("events_created_at_idx").on(table.createdAt),
  ]
);

// Links between entities across tools (PR X relates to Issue Y)
export const eventLinks = pgTable(
  "event_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Source entity
    sourceType: text("source_type").notNull(), // "github.pr", "linear.issue", etc.
    sourceId: text("source_id").notNull(),
    // Target entity
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    // How they're linked
    linkType: text("link_type").notNull(), // "references", "closes", "related"
    confidence: integer("confidence").default(100), // 0-100, for AI-detected links
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("event_links_source_idx").on(table.sourceType, table.sourceId),
    index("event_links_target_idx").on(table.targetType, table.targetId),
  ]
);

// ============================================================================
// Proactivity Rules (agent-generated + user-defined)
// ============================================================================

export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Human-readable description
    name: text("name").notNull(),
    description: text("description"),
    // Rule definition
    trigger: text("trigger").notNull().$type<EventType>(), // What event triggers this
    conditions: jsonb("conditions").$type<{
      // Conditions that must be true
      linkedEntityExists?: { type: string; status?: string };
      actorIs?: string[];
      payloadMatches?: Record<string, unknown>;
      custom?: string; // AI-evaluatable condition
    }>(),
    // What to suggest
    suggestionTemplate: jsonb("suggestion_template").notNull().$type<{
      actionType: ActionType;
      message: string; // Template with {{variables}}
      payloadTemplate: Record<string, unknown>;
    }>(),
    // Rule settings
    enabled: boolean("enabled").default(true),
    isBuiltIn: boolean("is_built_in").default(false), // System rules vs user-created
    // Stats for learning
    timesTriggered: integer("times_triggered").default(0),
    timesAccepted: integer("times_accepted").default(0),
    timesDismissed: integer("times_dismissed").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("rules_workspace_enabled_idx").on(table.workspaceId, table.enabled),
    index("rules_trigger_idx").on(table.trigger),
  ]
);

// Proactive suggestions sent to users
export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    // The suggestion
    message: text("message").notNull(),
    actionType: text("action_type").$type<ActionType>(),
    actionPayload: jsonb("action_payload").$type<Record<string, unknown>>(),
    // Delivery
    slackChannelId: text("slack_channel_id"),
    slackMessageTs: text("slack_message_ts"),
    // Status
    status: text("status").notNull().default("pending").$type<
      "pending" | "accepted" | "dismissed" | "expired"
    >(),
    // Feedback
    dismissReason: text("dismiss_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    index("suggestions_workspace_status_idx").on(table.workspaceId, table.status),
  ]
);

// ============================================================================
// Event/Rule Relations
// ============================================================================

export const eventsRelations = relations(events, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [events.workspaceId],
    references: [workspaces.id],
  }),
}));

export const rulesRelations = relations(rules, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [rules.workspaceId],
    references: [workspaces.id],
  }),
  suggestions: many(suggestions),
}));

export const suggestionsRelations = relations(suggestions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [suggestions.workspaceId],
    references: [workspaces.id],
  }),
  rule: one(rules, {
    fields: [suggestions.ruleId],
    references: [rules.id],
  }),
  event: one(events, {
    fields: [suggestions.eventId],
    references: [events.id],
  }),
}));

// ============================================================================
// Types
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventLink = typeof eventLinks.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
export type Suggestion = typeof suggestions.$inferSelect;
export type NewSuggestion = typeof suggestions.$inferInsert;
