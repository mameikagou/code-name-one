/**
 * @file 数据库种子数据
 *
 * 确保启动时存在一个默认项目（当前工作目录对应的项目）。
 * 如果数据库中已存在该 path，跳过创建；否则自动创建。
 */

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./client";
import { projects } from "./schema";
import path from "node:path";

/**
 * 确保默认项目存在
 *
 * 逻辑：
 *   1. 查询 projects 表中 path = process.cwd() 的记录
 *   2. 存在 → 直接返回已有的 id
 *   3. 不存在 → 用 nanoid 创建，名称从 cwd 最后一段目录名取
 *
 * @returns 默认项目的 id
 */
export async function ensureDefaultProject(): Promise<string> {
  const cwd = process.cwd();

  // 查询是否已存在
  const existing = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.path, cwd))
    .get();

  if (existing) {
    return existing.id;
  }

  // 从 cwd 最后一段提取项目名
  // 例如 "/Users/john/projects/my-app" → "my-app"
  const projectName = path.basename(cwd);
  const id = nanoid();

  db.insert(projects)
    .values({
      id,
      name: projectName,
      path: cwd,
    })
    .run();

  console.log(`[SEED] Created default project: "${projectName}" (${id})`);
  return id;
}
