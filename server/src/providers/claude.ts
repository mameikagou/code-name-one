/**
 * @file ClaudeProvider — Claude CLI 集成（MVP 核心）
 *
 * 设计意图：通过 child_process.spawn 调用 Claude CLI，
 * 解析 --output-format stream-json 的 NDJSON 输出。
 *
 * Claude CLI stream-json 输出格式（实测 v2.1.x）：
 *   1. {"type":"system","subtype":"init",...}  — 初始化信息（忽略）
 *   2. {"type":"assistant","message":{...}}     — AI 响应内容
 *   3. {"type":"result","subtype":"success",...} — 完成结果
 *
 * 参考：specs/design/ai-provider-interface.md §5
 */

import { spawn, type ChildProcess, execSync } from "node:child_process";
import { AbstractAiProvider } from "./base";
import type {
  ProviderRunContext,
  StreamEvent,
  TokenUsage,
} from "../types/ai-provider";

// ============================================================
// Claude CLI 输出类型定义（内部使用，不导出）
// ============================================================

/** Claude CLI system init 事件 */
interface ClaudeSystemEvent {
  type: "system";
  subtype: string;
  session_id?: string;
  model?: string;
}

/** Claude CLI assistant 事件中的 content block */
interface ClaudeContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/** Claude CLI assistant 事件 */
interface ClaudeAssistantEvent {
  type: "assistant";
  message: {
    id: string;
    model: string;
    content: ClaudeContentBlock[];
    stop_reason: string | null;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  session_id?: string;
}

/** Claude CLI result 事件 */
interface ClaudeResultEvent {
  type: "result";
  subtype: string;
  is_error: boolean;
  result: string;
  stop_reason?: string;
  session_id?: string;
  duration_ms?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/** Claude CLI 输出事件联合类型 */
type ClaudeOutputEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeResultEvent;

// ============================================================
// ClaudeProvider 实现
// ============================================================

export class ClaudeProvider extends AbstractAiProvider {
  readonly type = "claude" as const;

  /**
   * 已发射过 message_start 的 message ID 集合
   * 防止同一个 message 重复发射 message_start
   */
  private readonly emittedStarts = new Set<string>();

  /**
   * 检测 Claude CLI 是否已安装
   *
   * 通过运行 `claude --version` 检测，5 秒超时。
   */
  async isAvailable(): Promise<boolean> {
    try {
      execSync("claude --version", {
        timeout: 5000,
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 返回 Claude 支持的模型列表
   *
   * 硬编码常用模型，后续可改为从 CLI 动态获取。
   */
  async listModels(): Promise<readonly string[]> {
    return [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ] as const;
  }

  /**
   * 构建并启动 Claude CLI 子进程
   *
   * 命令格式：claude -p --output-format stream-json --verbose [--model X] "prompt"
   */
  protected spawnProcess(ctx: ProviderRunContext): ChildProcess {
    const args: string[] = [
      "-p",                           // print 模式（非交互）
      "--output-format", "stream-json", // NDJSON 流式输出
      "--verbose",                     // stream-json 需要 verbose
    ];

    // 可选：指定模型
    if (ctx.model) {
      args.push("--model", ctx.model);
    }

    // 可选：系统提示词
    if (ctx.systemPrompt) {
      args.push("--system-prompt", ctx.systemPrompt);
    }

    // 可选：允许的工具
    if (ctx.allowedTools && ctx.allowedTools.length > 0) {
      args.push("--allowedTools", ...ctx.allowedTools);
    }

    // 最后是用户提示词
    args.push(ctx.prompt);

    return spawn("claude", args, {
      cwd: ctx.workingDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      // 不继承父进程的 env 中可能干扰的变量
      env: { ...process.env },
    });
  }

  /**
   * 解析 Claude CLI 的 NDJSON 输出行
   *
   * 将 Claude 私有格式映射到通用 StreamEvent 类型。
   */
  protected parseOutput(
    line: string,
    _ctx: ProviderRunContext
  ): StreamEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    let parsed: ClaudeOutputEvent;
    try {
      parsed = JSON.parse(trimmed) as ClaudeOutputEvent;
    } catch {
      // 非 JSON 行（可能是 CLI 的日志输出），静默忽略
      return [];
    }

    const events: StreamEvent[] = [];

    switch (parsed.type) {
      case "system":
        // 系统初始化事件，不需要映射为 StreamEvent
        break;

      case "assistant":
        events.push(...this.parseAssistantEvent(parsed));
        break;

      case "result":
        events.push(...this.parseResultEvent(parsed));
        break;
    }

    return events;
  }

  // ============================================================
  // 内部解析方法
  // ============================================================

  /**
   * 解析 assistant 事件 → MessageStartEvent + ContentDeltaEvent / ToolUseEvent
   */
  private parseAssistantEvent(event: ClaudeAssistantEvent): StreamEvent[] {
    const events: StreamEvent[] = [];
    const messageId = event.message.id;
    const model = event.message.model;

    // 首次见到此 messageId 时发射 message_start
    if (!this.emittedStarts.has(messageId)) {
      this.emittedStarts.add(messageId);
      events.push({
        type: "message_start",
        messageId,
        model,
      });
    }

    // 遍历 content blocks
    for (const block of event.message.content) {
      if (block.type === "text" && block.text) {
        events.push({
          type: "content_delta",
          messageId,
          delta: block.text,
        });
      } else if (block.type === "tool_use" && block.id && block.name) {
        events.push({
          type: "tool_use",
          messageId,
          toolUseId: block.id,
          toolName: block.name,
          input: block.input ?? {},
        });
      }
    }

    return events;
  }

  /**
   * 解析 result 事件 → MessageEndEvent
   */
  private parseResultEvent(event: ClaudeResultEvent): StreamEvent[] {
    const usage: TokenUsage | undefined = event.usage
      ? {
          inputTokens: event.usage.input_tokens,
          outputTokens: event.usage.output_tokens,
          cacheReadInputTokens: event.usage.cache_read_input_tokens,
          cacheCreationInputTokens: event.usage.cache_creation_input_tokens,
        }
      : undefined;

    const stopReason =
      event.is_error
        ? "error" as const
        : event.stop_reason === "end_turn"
          ? "end_turn" as const
          : event.stop_reason === "max_tokens"
            ? "max_tokens" as const
            : "end_turn" as const;

    return [
      {
        type: "message_end",
        messageId: event.session_id ?? "",
        stopReason,
        usage,
      },
    ];
  }
}
