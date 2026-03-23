/**
 * @file Hono 应用工厂
 *
 * 设计意图：将应用创建逻辑封装为工厂函数 createApp()，
 * 使 index.ts 保持极简，同时方便测试时创建独立的 app 实例。
 *
 * 组装顺序：
 *   1. 中间件（cors → logger）
 *   2. 健康检查端点
 *   3. 业务路由（registerRoutes）
 *   4. 全局错误处理（onError）
 */

import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
import { logger } from "./middleware/logger";
import { errorHandler } from "./middleware/error-handler";
import { registerRoutes } from "./routes";
import { BufferedEventLog } from "./lib/sse/event-log";
import {
  writeSseFrame,
  writeSseKeepAlive,
  KEEPALIVE_INTERVAL_MS,
} from "./lib/sse/writer";

/**
 * 创建并配置 Hono 应用实例
 *
 * @returns 完整配置的 Hono app，可直接用于 Bun.serve 或测试
 */
export function createApp(): Hono {
  const app = new Hono();

  // 1. CORS：必须在所有其他中间件之前，处理预检请求
  app.use(corsMiddleware);

  // 2. 请求日志：记录每个请求的方法、路径、状态码和耗时
  app.use(logger);

  // 2. 健康检查：供运维和前端检测服务可用性
  app.get("/api/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // SSE 测试端点：验证帧格式、心跳、断线重连（Phase 3 验收用）
  app.get("/api/sse-test", (c) => {
    const lastEventId = c.req.header("Last-Event-ID");
    const eventLog = new BufferedEventLog();

    const { readable, writable } = new TransformStream<string, string>();
    const writer = writable.getWriter();

    // 异步推送事件
    (async () => {
      try {
        // 如果有 Last-Event-ID，先回放缺失帧
        if (lastEventId) {
          const { frames, hasGap } = eventLog.since(lastEventId);
          if (hasGap) {
            const gapFrame = eventLog.push("error", {
              type: "error",
              message: "Some events may have been lost",
            });
            await writeSseFrame(writer, gapFrame);
          }
          for (const frame of frames) {
            await writeSseFrame(writer, frame);
          }
        }

        // 推送 5 个 content_delta 事件，每秒一个
        for (let i = 0; i < 5; i++) {
          const frame = eventLog.push("content_delta", {
            type: "content_delta",
            messageId: "test-msg-1",
            delta: `Hello chunk ${i + 1} `,
          });
          await writeSseFrame(writer, frame);
          await Bun.sleep(1000);
        }

        // 推送 message_end
        const endFrame = eventLog.push("message_end", {
          type: "message_end",
          messageId: "test-msg-1",
          usage: { inputTokens: 10, outputTokens: 25 },
        });
        await writeSseFrame(writer, endFrame);
      } catch {
        // 客户端断开连接时 write 会失败，静默处理
      } finally {
        try {
          await writer.close();
        } catch {
          // 已关闭则忽略
        }
      }
    })();

    // 心跳定时器
    const heartbeatTimer = setInterval(async () => {
      try {
        await writeSseKeepAlive(writer);
      } catch {
        clearInterval(heartbeatTimer);
      }
    }, KEEPALIVE_INTERVAL_MS);

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  // 3. 业务路由：sessions、messages 等
  registerRoutes(app);

  // 4. 全局错误处理：必须在所有路由注册之后
  app.onError(errorHandler);

  return app;
}
