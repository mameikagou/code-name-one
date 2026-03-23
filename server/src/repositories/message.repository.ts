/**
 * @file Message 数据访问层
 *
 * 设计意图：纯函数式 repository，负责 messages 表的 CRUD 操作。
 * 与 session.repository 对称，同样不使用 class。
 */

import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { messages, type MessageRole } from "../db/schema";

// ============================================================
// 类型定义
// ============================================================

/** messages 表的完整行类型 */
type Message = typeof messages.$inferSelect;

/** 创建 message 所需的输入参数 */
interface CreateMessageInput {
  sessionId: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Repository 函数
// ============================================================

/**
 * 查询指定 session 下的所有消息
 *
 * @param sessionId - 会话 ID
 * @returns 按 createdAt ASC 排序的消息列表（时间线顺序）
 */
export function findBySessionId(sessionId: string): Message[] {
  return db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt))
    .all();
}

/**
 * 创建新消息
 *
 * @param data - 包含 sessionId、role、content 和可选 metadata 的参数
 * @returns 新创建的消息对象
 */
export function create(data: CreateMessageInput): Message {
  const id = nanoid();

  db.insert(messages)
    .values({
      id,
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
      metadata: data.metadata,
    })
    .run();

  // 插入后查询返回完整对象（包含 createdAt 默认值等）
  const created = db
    .select()
    .from(messages)
    .where(eq(messages.id, id))
    .get();

  if (!created) {
    throw new Error(`Failed to retrieve message after insert: ${id}`);
  }
  return created;
}
