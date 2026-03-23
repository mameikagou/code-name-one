/**
 * @file AI Provider 类型定义
 *
 * 设计意图：策略模式的类型基础。所有 AI Provider（Claude/Codex/OpenCode）
 * 必须实现 IAiProvider 接口，通过 ProviderRegistry 统一管理。
 *
 * StreamEvent 联合类型定义了 AI 对话过程中的所有事件类型，
 * 是 SSE 推送和 UI 渲染的核心数据结构。
 *
 * 参考：specs/design/ai-provider-interface.md §2
 */

// ============================================================
// Provider 类型
// ============================================================

/** 支持的 AI Provider 类型 */
export type ProviderType = "codex" | "claude" | "opencode";

/** Provider 错误分类码 */
export type ProviderErrorCode =
  | "CLI_NOT_FOUND"
  | "PROCESS_CRASHED"
  | "PARSE_ERROR"
  | "TIMEOUT"
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "UNKNOWN";

/** AI 对话结束原因 */
export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "cancelled"
  | "error";

// ============================================================
// Token 用量统计
// ============================================================

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens?: number;
  readonly cacheCreationInputTokens?: number;
}

// ============================================================
// StreamEvent 子类型
// ============================================================

/** AI 开始生成响应 */
export interface MessageStartEvent {
  readonly type: "message_start";
  readonly messageId: string;
  readonly model: string;
}

/** 文本增量（最高频事件，每个 token 一帧） */
export interface ContentDeltaEvent {
  readonly type: "content_delta";
  readonly messageId: string;
  readonly delta: string;
}

/** AI 调用工具（bash、read_file 等） */
export interface ToolUseEvent {
  readonly type: "tool_use";
  readonly messageId: string;
  readonly toolUseId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
}

/** 工具执行结果 */
export interface ToolResultEvent {
  readonly type: "tool_result";
  readonly messageId: string;
  readonly toolUseId: string;
  readonly content: string;
  readonly isError: boolean;
}

/** AI 响应完成 */
export interface MessageEndEvent {
  readonly type: "message_end";
  readonly messageId: string;
  readonly stopReason: StopReason;
  readonly usage?: TokenUsage;
}

/** 错误事件 */
export interface ErrorEvent {
  readonly type: "error";
  readonly code: ProviderErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

/** 心跳事件（内部使用，由 SSE writer 直接发送 comment 帧） */
export interface KeepaliveEvent {
  readonly type: "keepalive";
}

/** 会话状态变更 */
export interface SessionStateEvent {
  readonly type: "session_state";
  readonly sessionId: string;
  readonly state: "idle" | "running" | "waiting_tool";
}

// ============================================================
// StreamEvent 联合类型
// ============================================================

export type StreamEvent =
  | MessageStartEvent
  | ContentDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | MessageEndEvent
  | ErrorEvent
  | KeepaliveEvent
  | SessionStateEvent;

// ============================================================
// Provider 运行上下文
// ============================================================

/**
 * 调用 AI Provider 时传入的完整上下文
 *
 * 包含会话信息、工作目录、提示词、中止信号等。
 */
export interface ProviderRunContext {
  /** 会话 ID，用于进程管理 */
  readonly sessionId: string;
  /** AI 对话的工作目录（项目路径） */
  readonly workingDirectory: string;
  /** 用户输入的提示词 */
  readonly prompt: string;
  /** 指定使用的模型（可选，使用 provider 默认值） */
  readonly model?: string;
  /** 系统提示词（可选） */
  readonly systemPrompt?: string;
  /** 允许 AI 使用的工具列表（可选） */
  readonly allowedTools?: readonly string[];
  /** 事件回调：每产生一个 StreamEvent 就调用一次 */
  readonly onEvent: (event: StreamEvent) => void;
  /** 中止信号：取消时 abort，Provider 监听此信号终止子进程 */
  readonly signal: AbortSignal;
}

// ============================================================
// IAiProvider 接口
// ============================================================

/**
 * AI Provider 必须实现的接口
 *
 * 通过策略模式，上层 Service 不关心具体是 Claude/Codex/OpenCode，
 * 只通过此接口统一调用。
 */
export interface IAiProvider {
  /** Provider 类型标识 */
  readonly type: ProviderType;

  /** 检测 CLI 工具是否已安装且可用 */
  isAvailable(): Promise<boolean>;

  /** 返回此 Provider 支持的模型列表 */
  listModels(): Promise<readonly string[]>;

  /**
   * 启动 AI 对话流
   *
   * 重要设计约定：此方法不应 reject Promise。
   * 错误通过 ErrorEvent + MessageEndEvent 传递给 onEvent 回调。
   * Promise 在对话流结束后 resolve（无论成功还是失败）。
   */
  run(ctx: ProviderRunContext): Promise<void>;

  /** 取消指定会话的 AI 进程 */
  cancel(sessionId: string): void;
}

// ============================================================
// 类型守卫
// ============================================================

export function isContentDelta(event: StreamEvent): event is ContentDeltaEvent {
  return event.type === "content_delta";
}

export function isMessageEnd(event: StreamEvent): event is MessageEndEvent {
  return event.type === "message_end";
}

export function isError(event: StreamEvent): event is ErrorEvent {
  return event.type === "error";
}

export function isToolUse(event: StreamEvent): event is ToolUseEvent {
  return event.type === "tool_use";
}
