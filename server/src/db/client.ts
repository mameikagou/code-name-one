/**
 * @file 数据库连接与初始化
 *
 * 使用 bun:sqlite 原生驱动 + drizzle-orm 的类型安全 ORM 层。
 *
 * PRAGMA 设置顺序很重要：
 *   1. WAL 模式（必须在任何写操作之前）
 *   2. 外键约束（每次连接都要开）
 *   3. 锁等待超时
 *   4. 同步模式
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// 数据库文件路径：存放在 monorepo 根目录的 data/ 下
// import.meta.dir 指向当前文件所在目录（server/src/db/），向上 3 级到项目根
const PROJECT_ROOT = resolve(import.meta.dir, "..", "..", "..");
const DATA_DIR = resolve(PROJECT_ROOT, "data");
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = resolve(DATA_DIR, "code-name-one.db");

// 创建 SQLite 连接（文件不存在时自动创建）
const sqlite = new Database(DB_PATH, { create: true });

// ============================================================
// PRAGMA 配置：必须在第一次连接时立即设置
// ============================================================

// WAL 模式：写操作写到 WAL 文件，读操作从主文件读，互不阻塞
sqlite.exec("PRAGMA journal_mode = WAL");

// 外键约束：SQLite 默认关闭，每次连接都需显式开启
sqlite.exec("PRAGMA foreign_keys = ON");

// 锁等待超时：数据库被锁定时最多等 5 秒再报错
sqlite.exec("PRAGMA busy_timeout = 5000");

// 同步模式：NORMAL 在 WAL 模式下已足够安全，比 FULL 性能更好
sqlite.exec("PRAGMA synchronous = NORMAL");

// 导出 Drizzle 实例（注入 schema 启用关系查询）
export const db = drizzle(sqlite, { schema });

// 导出原始 sqlite 实例，供需要执行原始 SQL 的场景使用
export { sqlite };
