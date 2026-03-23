/**
 * @file 路由注册中心
 *
 * 设计意图：集中管理所有路由的挂载，app.ts 只需调用一次 registerRoutes。
 * 新增路由模块时，只需在这里 import + route() 即可。
 */

import type { Hono } from "hono";
import { sessionsRoute } from "./sessions.route";

/**
 * 将所有路由挂载到 Hono app 实例上
 *
 * 使用 app.route() 将子路由合并到主 app，
 * 路径前缀由子路由自行定义（如 /api/sessions）。
 *
 * @param app - Hono 应用实例
 */
export function registerRoutes(app: Hono): void {
  // sessions 相关路由（/api/sessions, /api/sessions/:id/messages）
  app.route("/", sessionsRoute);
}
