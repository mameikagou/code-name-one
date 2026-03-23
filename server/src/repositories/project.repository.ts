/**
 * @file Project 数据访问层
 *
 * 设计意图：纯函数式 repository，负责 projects 表的 CRUD 操作。
 * 与 session.repository 对称，不使用 class。
 *
 * projects 表的 path 字段有 UNIQUE 约束，创建时需注意冲突。
 */

import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { projects, type Provider } from "../db/schema";

// ============================================================
// 类型定义
// ============================================================

/** projects 表的完整行类型 */
type Project = typeof projects.$inferSelect;

/** 创建 project 所需的输入参数 */
interface CreateProjectInput {
  name: string;
  path: string;
  provider?: Provider;
  model?: string;
}

/** 更新 project 的可选字段 */
interface UpdateProjectInput {
  name?: string;
  path?: string;
  provider?: Provider;
  model?: string | null;
}

// ============================================================
// Repository 函数
// ============================================================

/**
 * 查询所有项目
 *
 * @returns 按 updatedAt DESC 排序的项目列表
 */
export function findAll(): Project[] {
  return db
    .select()
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .all();
}

/**
 * 根据 ID 查询单个项目
 *
 * @param id - 项目 ID
 * @returns 项目对象或 undefined（未找到时）
 */
export function findById(id: string): Project | undefined {
  return db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .get();
}

/**
 * 根据文件系统路径查询项目
 *
 * path 有 UNIQUE 约束，最多返回一个结果。
 *
 * @param path - 项目在文件系统中的绝对路径
 * @returns 项目对象或 undefined（未找到时）
 */
export function findByPath(path: string): Project | undefined {
  return db
    .select()
    .from(projects)
    .where(eq(projects.path, path))
    .get();
}

/**
 * 创建新项目
 *
 * @param data - 包含 name、path、可选 provider 和 model 的创建参数
 * @returns 新创建的项目对象
 */
export function create(data: CreateProjectInput): Project {
  const id = nanoid();

  db.insert(projects)
    .values({
      id,
      name: data.name,
      path: data.path,
      provider: data.provider,
      model: data.model,
    })
    .run();

  const created = findById(id);
  if (!created) {
    throw new Error(`Failed to retrieve project after insert: ${id}`);
  }
  return created;
}

/**
 * 更新项目信息
 *
 * 只更新传入的字段，同时更新 updatedAt。
 *
 * @param id - 项目 ID
 * @param data - 需要更新的字段
 * @returns 更新后的项目对象或 undefined（项目不存在时）
 */
export function update(
  id: string,
  data: UpdateProjectInput
): Project | undefined {
  db.update(projects)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .run();

  return findById(id);
}

/**
 * 删除项目
 *
 * 由于 sessions 表有 CASCADE 外键，删除项目会级联删除所有关联的 sessions 和 messages。
 *
 * @param id - 项目 ID
 */
export function remove(id: string): void {
  db.delete(projects).where(eq(projects.id, id)).run();
}
