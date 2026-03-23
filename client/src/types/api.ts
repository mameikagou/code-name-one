/**
 * @file API 类型定义
 *
 * 与后端 API 响应结构对齐的 TypeScript 类型。
 * 这些类型是前后端的"契约"，修改时必须同步两端。
 */

/** 统一成功响应包装 */
export interface ApiResponse<T> {
  data: T;
}

/** 统一错误响应 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/** 会话（对应后端 sessions 表） */
export interface Session {
  id: string;
  projectId: string;
  title: string;
  provider: string;
  model: string | null;
  status: "active" | "completed" | "error" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

/** 消息（对应后端 messages 表） */
export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  metadata: Record<string, unknown> | null;
  tokenCount: number | null;
  createdAt: string;
}

/** POST /api/sessions/:id/messages 的响应 */
export interface SendMessageResponse {
  userMessage: Message;
  assistantMessage: Message;
}
