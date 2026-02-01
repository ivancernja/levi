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

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  image: text("image"),
  // Workspace settings
  metadata: jsonb("metadata").$type<{
    model?: string; // OpenRouter model ID e.g. "anthropic/claude-sonnet-4"
    openrouterApiKey?: string; // User's own OpenRouter API key
  }>(),
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
