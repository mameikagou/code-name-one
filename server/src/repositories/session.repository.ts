/**
 * @file Session 数据访问层
 *
 * 设计意图：纯函数式 repository，不使用 class。
 * 每个函数直接操作 drizzle 的 db 实例，返回类型安全的结果。
 *
 * 所有数据库读写都集中在 repository 层，service 层不直接操作 db。
 */

import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { sessions, type SessionStatus } from "../db/schema";

// ============================================================
// 类型定义：从 drizzle schema 推导，确保与表结构一致
// ============================================================

/** sessions 表的完整行类型 */
type Session = typeof sessions.$inferSelect;

/** 创建 session 所需的输入参数 */
interface CreateSessionInput {
  title: string;
  projectId: string;
}

// ============================================================
// Repository 函数
// ============================================================

/**
 * 查询所有 sessions，支持按 projectId 过滤
 *
 * @param projectId - 可选的项目 ID，传入则只返回该项目的 sessions
 * @returns 按 createdAt DESC 排序的 session 列表
 */
export function findAll(projectId?: string): Session[] {
  if (projectId) {
    return db
      .select()
      .from(sessions)
      .where(eq(sessions.projectId, projectId))
      .orderBy(desc(sessions.createdAt))
      .all();
  }

  return db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.createdAt))
    .all();
}

/**
 * 根据 ID 查询单个 session
 *
 * @param id - session ID
 * @returns session 对象或 null（未找到时）
 */
export function findById(id: string): Session | undefined {
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();
}

/**
 * 创建新 session
 *
 * 自动生成 nanoid 作为主键，status 默认 "active"（由 schema 定义）。
 *
 * @param data - 包含 title 和 projectId 的创建参数
 * @returns 新创建的 session 对象
 */
export function create(data: CreateSessionInput): Session {
  const id = nanoid();

  db.insert(sessions)
    .values({
      id,
      title: data.title,
      projectId: data.projectId,
    })
    .run();

  // 插入后立即查询返回完整对象（包含默认值）
  // 注意：这里用 ! 断言是安全的，因为刚刚成功插入
  const created = findById(id);
  if (!created) {
    throw new Error(`Failed to retrieve session after insert: ${id}`);
  }
  return created;
}

/**
 * 更新 session 状态
 *
 * 同时更新 updatedAt 为当前时间戳。
 *
 * @param id - session ID
 * @param status - 新状态
 */
export function updateStatus(id: string, status: SessionStatus): void {
  db.update(sessions)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, id))
    .run();
}
