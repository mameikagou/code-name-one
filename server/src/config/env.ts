/**
 * @file 环境变量校验与类型安全配置
 *
 * 设计意图：启动时用 Zod 一次性校验所有环境变量，
 * 校验失败则打印清晰错误信息并 exit(1)，避免运行时才发现配置缺失。
 *
 * 使用方式：
 *   import { env } from "./config/env";
 *   console.log(env.PORT); // number, 类型安全
 */

import { z } from "zod";

// ============================================================
// 环境变量 Schema
// ============================================================

const envSchema = z.object({
  /** HTTP 服务端口 */
  PORT: z
    .string()
    .default("3000")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),

  /** SQLite 数据库文件路径（相对于项目根目录） */
  DB_PATH: z.string().default("data/code-name-one.db"),

  /** 日志级别 */
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /** 运行环境 */
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

// ============================================================
// 导出类型
// ============================================================

export type Env = z.infer<typeof envSchema>;

// ============================================================
// 校验并导出
// ============================================================

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Environment variable validation failed:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

/** 类型安全的环境变量对象，启动时一次性校验 */
export const env: Env = validateEnv();
