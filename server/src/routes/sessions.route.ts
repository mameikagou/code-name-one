/**
 * @file Sessions 路由定义
 *
 * 设计意图：薄路由层，只负责：
 *   1. 请求参数校验（Zod + zValidator）
 *   2. 调用 service 层
 *   3. 包装成统一响应格式（ApiResponse）
 *
 * 业务逻辑全部在 service 层，路由不做任何数据处理。
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as sessionService from "../services/session.service";

// ============================================================
// Zod Schemas：请求体校验规则
// ============================================================

/** 创建 session 的请求体 */
const createSessionSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
});

/** 发送消息的请求体 */
const sendMessageSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

/** 列表查询的可选参数 */
const listSessionsQuerySchema = z.object({
  projectId: z.string().optional(),
});

// ============================================================
// 路由定义
// ============================================================

export const sessionsRoute = new Hono()

  // GET /api/sessions — 获取 session 列表
  .get(
    "/api/sessions",
    zValidator("query", listSessionsQuerySchema),
    (c) => {
      const { projectId } = c.req.valid("query");
      const sessions = sessionService.listSessions(projectId);
      return c.json({ data: sessions });
    }
  )

  // POST /api/sessions — 创建新 session
  .post(
    "/api/sessions",
    zValidator("json", createSessionSchema),
    async (c) => {
      const { title } = c.req.valid("json");
      const session = await sessionService.createSession(title);
      return c.json({ data: session }, 201);
    }
  )

  // GET /api/sessions/:id/messages — 获取消息列表
  .get("/api/sessions/:id/messages", (c) => {
    const sessionId = c.req.param("id");
    const messages = sessionService.getMessages(sessionId);
    return c.json({ data: messages });
  })

  // POST /api/sessions/:id/messages — 发送消息
  .post(
    "/api/sessions/:id/messages",
    zValidator("json", sendMessageSchema),
    async (c) => {
      const sessionId = c.req.param("id");
      const { content } = c.req.valid("json");
      const result = await sessionService.sendMessage(sessionId, content);
      return c.json({ data: result }, 201);
    }
  );
