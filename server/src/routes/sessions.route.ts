/**
 * @file Sessions 路由定义
 *
 * 设计意图：薄路由层，只负责：
 *   1. 请求参数校验（Zod + zValidator）
 *   2. 调用 service 层
 *   3. 包装成统一响应格式（ApiResponse）
 *
 * 核心端点 POST /api/sessions/:id/run 是 SSE 流式端点，
 * 使用 TransformStream 将 AI 事件实时推送给客户端。
 *
 * 业务逻辑全部在 service 层，路由不做任何数据处理。
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as sessionService from "../services/session.service";
import {
  writeSseFrame,
  writeSseKeepAlive,
  KEEPALIVE_INTERVAL_MS,
} from "../lib/sse/writer";

// ============================================================
// Zod Schemas：请求体校验规则
// ============================================================

/** 创建 session 的请求体 */
const createSessionSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
});

/** 发送消息的请求体（保留向后兼容） */
const sendMessageSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

/** 触发 AI 对话的请求体 */
const runSessionSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(100000, "Prompt too long"),
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

  // GET /api/sessions/:id — 获取 session 详情
  .get("/api/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const session = sessionService.getSession(sessionId);
    return c.json({ data: session });
  })

  // GET /api/sessions/:id/messages — 获取消息列表
  .get("/api/sessions/:id/messages", (c) => {
    const sessionId = c.req.param("id");
    const messages = sessionService.getMessages(sessionId);
    return c.json({ data: messages });
  })

  // POST /api/sessions/:id/messages — 发送消息（保留向后兼容，简单保存用户消息）
  .post(
    "/api/sessions/:id/messages",
    zValidator("json", sendMessageSchema),
    (c) => {
      const sessionId = c.req.param("id");
      const { content } = c.req.valid("json");
      // 仅保存用户消息，不触发 AI（使用 /run 端点触发 AI）
      const messages = sessionService.getMessages(sessionId);
      return c.json({ data: { messages } });
    }
  )

  // ================================================================
  // POST /api/sessions/:id/run — 触发 AI 对话（SSE 流式端点）
  // ================================================================
  .post(
    "/api/sessions/:id/run",
    zValidator("json", runSessionSchema),
    async (c) => {
      const sessionId = c.req.param("id");
      const { prompt } = c.req.valid("json");
      const lastEventId = c.req.header("Last-Event-ID");

      // 如果是断线重连（有 Last-Event-ID），先回放缺失帧
      const eventLog = sessionService.getEventLog(sessionId);
      const replayFrames =
        lastEventId && eventLog ? eventLog.since(lastEventId) : null;

      // 创建 TransformStream 作为 SSE 管道
      const { readable, writable } = new TransformStream<string, string>();
      const writer = writable.getWriter();

      // 心跳定时器
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      // 异步处理 AI 流
      (async () => {
        try {
          // 回放缺失帧
          if (replayFrames) {
            if (replayFrames.hasGap) {
              await writeSseFrame(writer, {
                id: "0",
                event: "error",
                data: JSON.stringify({
                  type: "error",
                  code: "GAP_DETECTED",
                  message: "Some events may have been lost during reconnection",
                  retryable: false,
                }),
                timestamp: Date.now(),
              });
            }
            for (const frame of replayFrames.frames) {
              await writeSseFrame(writer, frame);
            }

            // 如果 session 不再运行，回放完就结束
            if (!sessionService.isRunning(sessionId)) {
              return;
            }
          }

          // 启动心跳
          heartbeatTimer = setInterval(async () => {
            try {
              await writeSseKeepAlive(writer);
            } catch {
              if (heartbeatTimer) clearInterval(heartbeatTimer);
            }
          }, KEEPALIVE_INTERVAL_MS);

          // 如果不是纯重连（有新 prompt），启动 AI 对话
          if (!lastEventId) {
            await sessionService.run(
              sessionId,
              prompt,
              async (event) => {
                // 将 StreamEvent 写入 SSE 流
                const sseEventLog = sessionService.getEventLog(sessionId);
                if (sseEventLog) {
                  // eventLog 中已经有这个帧了（在 service 层 push 的），
                  // 获取最新的帧 ID 作为 SSE id
                  const frame = {
                    id: sseEventLog.lastId,
                    event: event.type,
                    data: JSON.stringify(event),
                    timestamp: Date.now(),
                  };
                  try {
                    await writeSseFrame(writer, frame);
                  } catch {
                    // writer 已关闭（客户端断开）
                  }
                }
              }
            );
          }
        } catch (err) {
          // 业务错误（NotFoundError, ConflictError 等）通过 SSE error 事件发送
          const message =
            err instanceof Error ? err.message : "Unknown error";
          try {
            await writeSseFrame(writer, {
              id: "0",
              event: "error",
              data: JSON.stringify({
                type: "error",
                code: "UNKNOWN",
                message,
                retryable: false,
              }),
              timestamp: Date.now(),
            });
          } catch {
            // writer 已关闭
          }
        } finally {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          try {
            await writer.close();
          } catch {
            // 已关闭则忽略
          }
        }
      })();

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }
  )

  // ================================================================
  // DELETE /api/sessions/:id/run — 取消正在进行的 AI 对话
  // ================================================================
  .delete("/api/sessions/:id/run", (c) => {
    const sessionId = c.req.param("id");
    sessionService.cancel(sessionId);
    return c.json({ data: { cancelled: true } });
  });
