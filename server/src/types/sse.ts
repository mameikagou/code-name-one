/**
 * @file SSE 相关类型定义
 *
 * 设计意图：SSE（Server-Sent Events）通信的基础数据结构。
 * SseFrame 是写入 SSE 流的最小单元，SinceResult 用于断线重连回放。
 *
 * 参考：specs/design/sse-protocol.md §4
 */

// ============================================================
// SSE 帧：写入流的最小单元
// ============================================================

/**
 * 一个 SSE 帧，对应 HTTP 响应中的一段：
 *   id: <id>
 *   event: <event>
 *   data: <data>
 *   \n
 */
export interface SseFrame {
  /** 单调递增的帧 ID（字符串化的数字），用于 Last-Event-ID */
  readonly id: string;
  /** 事件类型名称（如 "content_delta"、"message_end"） */
  readonly event: string;
  /** JSON 序列化后的数据字符串 */
  readonly data: string;
  /** 帧创建时间戳（ms） */
  readonly timestamp: number;
}

// ============================================================
// 断线重连回放结果
// ============================================================

/**
 * BufferedEventLog.since() 的返回类型
 */
export interface SinceResult {
  /** 从 sinceId 之后的所有缓冲帧，按 id 升序 */
  readonly frames: readonly SseFrame[];
  /**
   * 是否存在帧缺失（环形缓冲区溢出导致部分帧被覆盖）
   * true 表示客户端可能丢失了部分事件，需要做全量刷新
   */
  readonly hasGap: boolean;
}
