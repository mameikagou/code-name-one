/**
 * @file Preference 数据访问层（KV 存储）
 *
 * 设计意图：preferences 表是一个简单的 key-value 存储，
 * 用于持久化用户偏好设置（主题、默认 provider 等）。
 *
 * key 作为 PK，set 操作使用 upsert 语义（存在则更新，不存在则插入）。
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { preferences } from "../db/schema";

// ============================================================
// Repository 函数
// ============================================================

/**
 * 获取指定 key 的偏好值
 *
 * @param key - 偏好键名（如 "theme:mode"、"default:provider"）
 * @returns 反序列化后的值，未找到则返回 undefined
 */
export function get<T>(key: string): T | undefined {
  const row = db
    .select()
    .from(preferences)
    .where(eq(preferences.key, key))
    .get();

  if (!row) {
    return undefined;
  }

  // value 列使用 { mode: "json" }，Drizzle 自动处理序列化/反序列化
  return row.value as T;
}

/**
 * 设置偏好值（upsert 语义）
 *
 * 如果 key 已存在则更新 value 和 updatedAt，否则插入新行。
 *
 * @param key - 偏好键名
 * @param value - 要存储的值（会被 JSON 序列化）
 */
export function set<T>(key: string, value: T): void {
  db.insert(preferences)
    .values({
      key,
      value: value as unknown,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: preferences.key,
      set: {
        value: value as unknown,
        updatedAt: new Date(),
      },
    })
    .run();
}

/**
 * 删除指定 key 的偏好
 *
 * 静默操作：key 不存在时不报错。
 *
 * @param key - 偏好键名
 */
export function remove(key: string): void {
  db.delete(preferences).where(eq(preferences.key, key)).run();
}

/**
 * 获取所有偏好设置
 *
 * @returns key-value 对象
 */
export function getAll(): Record<string, unknown> {
  const rows = db.select().from(preferences).all();

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
