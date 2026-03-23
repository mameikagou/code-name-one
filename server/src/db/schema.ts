/**
 * @file Drizzle ORM Schema -- 数据库的唯一真相源
 *
 * 严格遵循 specs/design/database-schema.md 中的完整定义。
 * 任何表结构变更必须先更新 spec 文档，再同步修改此文件。
 *
 * 4 张核心表：
 *   - projects:    工作区项目
 *   - sessions:    AI 对话会话
 *   - messages:    会话消息记录
 *   - preferences: 用户偏好设置（独立 KV 表）
 */

import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// ============================================================
// 常量定义：枚举值集中管理
// ============================================================

export const PROVIDERS = ["codex", "claude", "opencode"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const MESSAGE_ROLES = ["user", "assistant", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const SESSION_STATUSES = [
  "active",
  "completed",
  "error",
  "cancelled",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

// ============================================================
// projects 表
// ============================================================

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull().unique(),
    provider: text("provider", { enum: PROVIDERS })
      .notNull()
      .default("claude"),
    model: text("model"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (_table) => ({})
);

// ============================================================
// sessions 表
// ============================================================

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    provider: text("provider", { enum: PROVIDERS })
      .notNull()
      .default("claude"),
    model: text("model"),
    status: text("status", { enum: SESSION_STATUSES })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    projectIdIdx: index("sessions_project_id_idx").on(table.projectId),
    statusIdx: index("sessions_status_idx").on(table.status),
    createdAtIdx: index("sessions_created_at_idx").on(table.createdAt),
    projectIdCreatedAtIdx: index("sessions_project_id_created_at_idx").on(
      table.projectId,
      table.createdAt
    ),
  })
);

// ============================================================
// messages 表
// ============================================================

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    role: text("role", { enum: MESSAGE_ROLES }).notNull(),
    content: text("content").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    tokenCount: integer("token_count"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sessionIdIdx: index("messages_session_id_idx").on(table.sessionId),
    createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
    sessionIdCreatedAtIdx: index("messages_session_id_created_at_idx").on(
      table.sessionId,
      table.createdAt
    ),
  })
);

// ============================================================
// preferences 表（独立 KV 存储）
// ============================================================

export const preferences = sqliteTable("preferences", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ============================================================
// 关系定义（Drizzle Relations）
// 启用 db.query.xxx.findMany({ with: { ... } }) 嵌套查询
// ============================================================

export const projectsRelations = relations(projects, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  project: one(projects, {
    fields: [sessions.projectId],
    references: [projects.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
}));

// ============================================================
// 类型别名：从 Schema 推导，供 repository/service 层使用
// ============================================================

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Preference = typeof preferences.$inferSelect;
export type NewPreference = typeof preferences.$inferInsert;
