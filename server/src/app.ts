/**
 * @file Hono 应用工厂
 *
 * 设计意图：将应用创建逻辑封装为工厂函数 createApp()，
 * 使 index.ts 保持极简，同时方便测试时创建独立的 app 实例。
 *
 * 组装顺序：
 *   1. 中间件（logger）
 *   2. 健康检查端点
 *   3. 业务路由（registerRoutes）
 *   4. 全局错误处理（onError）
 */

import { Hono } from "hono";
import { logger } from "./middleware/logger";
import { errorHandler } from "./middleware/error-handler";
import { registerRoutes } from "./routes";

/**
 * 创建并配置 Hono 应用实例
 *
 * @returns 完整配置的 Hono app，可直接用于 Bun.serve 或测试
 */
export function createApp(): Hono {
  const app = new Hono();

  // 1. 请求日志：记录每个请求的方法、路径、状态码和耗时
  app.use(logger);

  // 2. 健康检查：供运维和前端检测服务可用性
  app.get("/api/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // 3. 业务路由：sessions、messages 等
  registerRoutes(app);

  // 4. 全局错误处理：必须在所有路由注册之后
  app.onError(errorHandler);

  return app;
}
