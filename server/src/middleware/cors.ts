/**
 * @file CORS 中间件配置
 *
 * 设计意图：集中管理跨域策略，开发环境放行前端 dev server，
 * 生产环境可通过环境变量配置允许的 origin。
 *
 * 必须允许 Last-Event-ID header，否则 SSE 断线重连无法携带。
 */

import { cors } from "hono/cors";
import { env } from "../config/env";

// ============================================================
// 根据环境决定允许的 origin
// ============================================================

const allowedOrigins =
  env.NODE_ENV === "production"
    ? [] // 生产环境：根据实际部署配置
    : ["http://localhost:5173", "http://localhost:5174"]; // Vite dev server

// ============================================================
// 导出 CORS 中间件实例
// ============================================================

export const corsMiddleware = cors({
  origin: allowedOrigins,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "Last-Event-ID", // SSE 断线重连必须
    "Cache-Control",
  ],
  exposeHeaders: [
    "Content-Type",
    "X-Request-Id",
  ],
  maxAge: 86400, // 预检请求缓存 24 小时
});
