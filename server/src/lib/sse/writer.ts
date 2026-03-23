/**
 * @file SSE 帧序列化与写入工具
 *
 * 设计意图：封装 SSE 协议的帧格式细节，上层代码只需传入 SseFrame 对象，
 * 无需关心换行符、转义、header 等底层协议要求。
 *
 * SSE 帧格式规范（RFC 8895）：
 *   id: <id>\n
 *   event: <event>\n
 *   data: <data>\n
 *   \n                    ← 空行表示帧结束
 *
 * 关键约束：data 字段必须单行（换行符会被 EventSource 解析为帧边界）
 *
 * 参考：specs/design/sse-protocol.md §7
 */

import type { Context } from "hono";
import type { SseFrame } from "../../types/sse";

// ============================================================
// 常量
// ============================================================

/** 心跳间隔：15 秒 */
export const KEEPALIVE_INTERVAL_MS = 15_000;

// ============================================================
// SSE 工具函数
// ============================================================

/**
 * 设置 SSE 必需的 HTTP 响应头
 *
 * 必须在写入任何数据之前调用，否则 header 无法生效。
 * X-Accel-Buffering: no 防止 Nginx 反向代理缓冲 SSE 流。
 */
export function setSseHeaders(c: Context): void {
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");
}

/**
 * 将 SseFrame 序列化并写入流
 *
 * 输出格式：
 *   id: 42\n
 *   event: content_delta\n
 *   data: {"type":"content_delta","delta":"hello"}\n
 *   \n
 *
 * @param writer - WritableStream 的 writer（从 TransformStream 获取）
 * @param frame - 要写入的 SSE 帧
 */
export async function writeSseFrame(
  writer: WritableStreamDefaultWriter<string>,
  frame: SseFrame
): Promise<void> {
  // 构建帧字符串：每个字段一行，以双换行结束
  let output = `id: ${frame.id}\n`;
  output += `event: ${frame.event}\n`;
  // data 中的换行符必须转为 SSE 多行 data 格式
  // SSE 规范：多行 data 用多个 "data: " 前缀表示
  const lines = frame.data.split("\n");
  for (const line of lines) {
    output += `data: ${line}\n`;
  }
  output += "\n"; // 空行 = 帧结束

  await writer.write(output);
}

/**
 * 写入心跳 comment 帧
 *
 * SSE 规范允许以 ":" 开头的行作为注释，不会触发 EventSource 的 onmessage。
 * 用于保持连接活跃，防止代理超时断开。
 */
export async function writeSseKeepAlive(
  writer: WritableStreamDefaultWriter<string>
): Promise<void> {
  await writer.write(": keepalive\n\n");
}
