# AI Provider 统一接口规范

> **文档状态**：草稿 (Draft)
> **版本**：v0.1.0
> **创建日期**：2026-03-23
> **作者**：架构设计团队
> **实现范围**：MVP 阶段仅实现 Claude Provider，Codex / OpenCode 接口预留但不实现。
>
> 本文档是 AI Provider 层的唯一设计源 (Single Source of Truth)。
> **在修改任何 Provider 接口、新增字段、调整类继承关系之前，必须先更新本文档，并经过 Review 确认后再动代码。**

---

## 1. 设计目标

### 1.1 核心问题

本项目需要兼容三种完全不同的 AI CLI 工具：

| CLI 工具 | 通信协议 | 输出格式 |
|----------|----------|----------|
| Claude | `stdio` + stream | 逐行 JSON（NDJSON） |
| Codex | `stdio` + JSON-RPC | JSON-RPC 2.0 request/response |
| OpenCode | 待调研 | 待调研 |

如果不做抽象，上层 Service 就需要写三套完全不同的 `if/else` 分支逻辑，导致：

- 新增一种 CLI 工具时，要同时改 Service 层和处理层，违反开闭原则（OCP）。
- 单元测试无法独立 mock 某一个 Provider，测试链路极长。
- 上层 Session 管理、进度播报、错误重试逻辑无法复用。

### 1.2 解决方案：策略模式（Strategy Pattern）

**大白话类比**：

想象你是一个外卖平台的调度中心。平台上有美团骑手、饿了么骑手、顺丰同城骑手，每家的 App、计费方式、接单协议完全不同。但对"顾客"（Service 层）来说，下单接口永远只有一个：`"给我送到这个地址"`。调度中心负责判断当前该用哪家骑手，然后把任务翻译成那家骑手能听懂的指令。

在本项目中：

```
顾客（Service 层）
    │ 只调用 IAiProvider.run(ctx)
    ▼
调度中心（ProviderRegistry）
    │ 根据 ProviderType 路由到对应 Provider
    ▼
骑手（ClaudeProvider / CodexProvider / OpenCodeProvider）
    │ 各自处理协议差异，统一 emit StreamEvent
    ▼
输出结果（StreamEvent 流）
```

### 1.3 设计约束

1. **上层 Service 零感知底层协议**：Service 层代码不得出现任何 `if (type === "claude")` 分支。
2. **进程生命周期统一管理**：spawn、kill、清理僵尸进程等逻辑必须在基类中实现，子类不得重复。
3. **流式事件类型安全**：所有事件必须通过 TypeScript 联合类型约束，严禁使用 `any`。
4. **可测试性**：每个 Provider 必须可以被独立 mock，不依赖真实 CLI 二进制文件。
5. **可观测性**：每次 spawn、kill、error 必须有结构化日志，便于生产环境排查。

---

## 2. 核心接口定义

> 以下所有类型定义的物理文件路径：`server/src/lib/ai-provider/types.ts`
>
> 该文件必须以 `export` 导出所有类型，供 Service 层和各 Provider 实现使用。

### 2.1 ProviderType

```typescript
/**
 * 支持的 AI CLI Provider 类型。
 * 新增 Provider 时，首先在这里添加字面量类型，
 * TypeScript 编译器会自动在所有 switch/case 处报错，引导你完成所有必要修改。
 */
export type ProviderType = "codex" | "claude" | "opencode";
```

### 2.2 StreamEvent 联合类型

**设计说明**：使用带有 `type` 字段的辨别联合（Discriminated Union），而不是用继承或 enum。原因：

- `type` 字段天然可序列化为 JSON，直接用于 SSE（Server-Sent Events）透传给前端。
- TypeScript 的 `type` 字段收窄（Narrowing）在 `switch (event.type)` 场景下完美工作，无需类型断言。
- 各事件字段完全独立，没有不必要的继承耦合。

```typescript
// ─────────────────────────────────────────────
// 2.2.1  会话开始事件
// 当 Provider 进程成功 spawn、AI 开始处理请求时，emit 此事件。
// ─────────────────────────────────────────────
export interface MessageStartEvent {
  readonly type: "message_start";
  /** 对应 ProviderRunContext.sessionId，用于前端关联正确的会话 */
  readonly sessionId: string;
  /** 实际处理本次请求的 Provider 类型，便于前端展示 "由 Claude 响应" */
  readonly provider: ProviderType;
}

// ─────────────────────────────────────────────
// 2.2.2  内容增量事件（流式输出的核心）
// 每接收到一个文字片段就 emit 一次，前端拼接 delta 形成完整回复。
// ─────────────────────────────────────────────
export interface ContentDeltaEvent {
  readonly type: "content_delta";
  readonly sessionId: string;
  /** 本次增量文本片段，可能为空字符串（心跳保活场景），前端应 append 而非 replace */
  readonly delta: string;
  /**
   * 实际使用的模型 ID，部分 Provider（如 Claude）会在流式响应中动态返回。
   * 首帧可能为 undefined，后续帧补充。
   */
  readonly model?: string;
}

// ─────────────────────────────────────────────
// 2.2.3  工具调用事件
// AI 决定调用工具（如 bash、read_file）时 emit 此事件。
// 前端收到后展示工具调用卡片，等待 ToolResultEvent。
// ─────────────────────────────────────────────
export interface ToolUseEvent {
  readonly type: "tool_use";
  readonly sessionId: string;
  /** 工具名称，如 "bash"、"read_file"、"write_file" */
  readonly toolName: string;
  /**
   * 工具调用的唯一 ID，由 Provider 生成。
   * ToolResultEvent 通过此 ID 与 ToolUseEvent 配对。
   * 同一次会话中，toolCallId 必须唯一。
   */
  readonly toolCallId: string;
  /**
   * 工具调用的输入参数。
   * 使用 Record<string, unknown> 而非 any，强制调用方在使用前进行类型收窄。
   * 具体 Schema 由各 Provider 的工具定义文档约定。
   */
  readonly input: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// 2.2.4  工具执行结果事件
// 工具执行完毕后 emit，让 AI 获得工具输出并继续生成。
// ─────────────────────────────────────────────
export interface ToolResultEvent {
  readonly type: "tool_result";
  readonly sessionId: string;
  /** 与 ToolUseEvent.toolCallId 对应，用于配对 */
  readonly toolCallId: string;
  /** 工具的输出内容，字符串形式（如 stdout、文件内容、JSON 字符串） */
  readonly output: string;
  /** true 表示工具执行失败，前端应以错误样式展示 */
  readonly isError: boolean;
}

// ─────────────────────────────────────────────
// 2.2.5  会话结束事件
// AI 完成全部响应后 emit，携带停止原因和 token 用量。
// ─────────────────────────────────────────────

/**
 * AI 停止生成的原因。
 * - "end_turn"    : 正常完成，AI 主动停止。
 * - "max_tokens"  : 达到 token 上限，响应被截断。
 * - "stop_sequence": 触发了预设的停止序列。
 * - "cancelled"   : 用户主动取消（AbortSignal 触发）。
 * - "error"       : 因错误而停止，配合 ErrorEvent 一起 emit。
 */
export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "cancelled"
  | "error";

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface MessageEndEvent {
  readonly type: "message_end";
  readonly sessionId: string;
  readonly stopReason: StopReason;
  /**
   * Token 用量，部分 Provider 可能不返回（如 OpenCode）。
   * 可选字段，前端展示时需做 undefined 判断。
   */
  readonly usage?: TokenUsage;
}

// ─────────────────────────────────────────────
// 2.2.6  错误事件
// 任何可恢复或不可恢复错误都通过此事件上报。
// 注意：这是"流中的错误通知"，不是 throw Error。
// emit ErrorEvent 后通常紧跟 MessageEndEvent(stopReason: "error")。
// ─────────────────────────────────────────────

/**
 * 错误码枚举。
 * 使用字符串枚举而非数字枚举，便于日志可读和跨系统传递。
 */
export type ProviderErrorCode =
  | "CLI_NOT_FOUND"        // CLI 二进制文件未安装或不在 PATH 中
  | "PROCESS_CRASHED"      // 子进程非正常退出（exit code 非 0）
  | "PARSE_ERROR"          // 输出流解析失败（JSON 格式错误等）
  | "TIMEOUT"              // 请求超时（AbortSignal 触发）
  | "AUTH_ERROR"           // API Key 或认证失败
  | "RATE_LIMIT"           // Provider API 限流
  | "UNKNOWN";             // 未分类错误，需查看 message 详情

export interface ErrorEvent {
  readonly type: "error";
  readonly sessionId: string;
  readonly message: string;
  readonly code: ProviderErrorCode;
}

// ─────────────────────────────────────────────
// 2.2.7  保活事件（心跳）
// 长时间无输出时（如 AI 在思考），Provider 每 N 秒 emit 一次。
// 目的：防止前端连接超时断开（SSE / WebSocket 的保活机制）。
// 注意：此事件无 sessionId，因为它是连接级别的，而非会话级别的。
// ─────────────────────────────────────────────
export interface KeepaliveEvent {
  readonly type: "keepalive";
}

// ─────────────────────────────────────────────
// 2.2.8  StreamEvent 辨别联合类型（最终导出）
// ─────────────────────────────────────────────
export type StreamEvent =
  | MessageStartEvent
  | ContentDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | MessageEndEvent
  | ErrorEvent
  | KeepaliveEvent;
```

### 2.3 ProviderRunContext

```typescript
/**
 * 调用 Provider.run() 时传入的完整上下文。
 *
 * 设计原则：
 * - 使用单一 context 对象而非多个参数，便于后续扩展字段时不破坏调用方签名。
 * - onEvent 是 push 模型（Provider 主动推），而非 pull 模型（Service 轮询）。
 *   这与流式输出的本质一致：AI 产生内容时立即通知，而不是等待 Service 来取。
 * - signal 由 Service 层创建并管理，Provider 层只消费，不负责 AbortController 的生命周期。
 */
export interface ProviderRunContext {
  /**
   * 会话唯一标识符，由 Service 层生成（建议使用 crypto.randomUUID()）。
   * 所有 StreamEvent 都携带此 ID，便于前端多路复用（同时运行多个会话）。
   */
  readonly sessionId: string;

  /**
   * AI 工具执行操作时的工作目录（绝对路径）。
   * 对应 CLI 的 --cwd 参数或 spawn 的 cwd 选项。
   * 必须是已存在的目录，Service 层负责验证。
   */
  readonly workingDirectory: string;

  /**
   * 用户输入的完整 prompt。
   * Provider 负责将其转换为对应 CLI 的参数格式。
   */
  readonly prompt: string;

  /**
   * 指定模型 ID，如 "claude-opus-4-5"、"claude-sonnet-4-5"。
   * 若为 undefined，使用 Provider 的默认模型。
   */
  readonly model?: string;

  /**
   * 系统提示词，用于定制 AI 行为（如约束 AI 只做代码相关任务）。
   * 若为 undefined，使用 Provider CLI 的默认系统提示。
   */
  readonly systemPrompt?: string;

  /**
   * 允许 AI 调用的工具白名单。
   * 若为 undefined，使用 Provider 默认的工具集。
   * 若为空数组 []，禁止 AI 调用任何工具（纯对话模式）。
   */
  readonly allowedTools?: string[];

  /**
   * 事件回调，每产生一个 StreamEvent 立即调用。
   * 注意：此回调可能被高频调用（每个 token 一次），实现必须轻量，不得有阻塞 I/O。
   * Service 层的实现通常是：将事件写入 SSE 流或 WebSocket 队列。
   */
  readonly onEvent: (event: StreamEvent) => void;

  /**
   * 取消信号，由 Service 层的 AbortController 提供。
   * Provider 必须监听此信号，在触发时执行 SIGTERM → SIGKILL 两阶段清理。
   * 参考：https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
   */
  readonly signal: AbortSignal;
}
```

### 2.4 IAiProvider 接口

```typescript
/**
 * 所有 AI Provider 必须实现的核心接口。
 *
 * 这是系统中最重要的抽象契约。
 * Service 层只依赖此接口，永远不 import 具体的 ClaudeProvider、CodexProvider 等。
 */
export interface IAiProvider {
  /**
   * Provider 类型标识，只读。
   * 用于 ProviderRegistry 的路由和日志标记。
   */
  readonly type: ProviderType;

  /**
   * 检查对应的 CLI 工具是否已安装并可用。
   *
   * 实现方式：执行 `which claude` 或 `claude --version`，捕获错误返回 false。
   * 注意：此方法应有 5 秒超时，避免 which 命令因网络映射盘等原因挂住。
   *
   * @returns true 表示 CLI 已安装可用，false 表示未安装。
   */
  isAvailable(): Promise<boolean>;

  /**
   * 列出此 Provider 支持的模型 ID 列表。
   *
   * 实现方式：调用 CLI 的 model list 子命令，或返回硬编码的已知模型列表。
   * 若 CLI 不支持此功能，可返回空数组 []，调用方应降级处理。
   *
   * @returns 模型 ID 字符串数组，如 ["claude-opus-4-5", "claude-sonnet-4-5"]。
   */
  listModels(): Promise<string[]>;

  /**
   * 执行 AI 会话的核心方法。
   *
   * 此方法的生命周期：
   * 1. spawn 子进程，传入 ctx 中的参数。
   * 2. 监听 stdout，逐行/逐帧解析输出为 StreamEvent，通过 ctx.onEvent 上报。
   * 3. 监听 ctx.signal，取消时 SIGTERM → 等待 2.5s → SIGKILL。
   * 4. 进程退出后，emit MessageEndEvent，清理 activeProcesses Map。
   * 5. Promise resolve（不管是正常结束还是取消，resolve 而非 reject，错误通过 ErrorEvent 上报）。
   *
   * 为什么 resolve 而非 reject？
   * 因为 AI 会话的"错误"是业务语义上的错误，不是程序逻辑错误。
   * Service 层不需要 try/catch 来处理正常的 AI 错误（如 rate limit），
   * 而是通过 ErrorEvent 和 MessageEndEvent 来感知。
   * 只有真正的编程错误（如无效参数、null dereference）才应该 throw。
   *
   * @param ctx 完整的运行上下文。
   * @throws Error 仅当参数无效或出现编程错误时抛出，正常业务错误通过 ErrorEvent 上报。
   */
  run(ctx: ProviderRunContext): Promise<void>;

  /**
   * 取消指定会话的进行中请求。
   *
   * 此方法是幂等的：对已结束或不存在的 sessionId 调用，静默忽略。
   * 实现通常是向 activeProcesses Map 中找到对应进程并发送 SIGTERM。
   *
   * 注意：更推荐的取消方式是通过 ProviderRunContext.signal（AbortSignal），
   * cancel() 方法作为兜底，用于 Service 层需要强制终止而无法传递 signal 的场景。
   *
   * @param sessionId 要取消的会话 ID。
   */
  cancel(sessionId: string): void;
}
```

---

## 3. AbstractAiProvider 基类设计

> 物理文件路径：`server/src/lib/ai-provider/abstract-provider.ts`

### 3.1 为什么用抽象类而非纯接口

这是一个典型的"接口 vs 抽象类"的架构决策点：

**纯接口的问题**：进程生命周期管理（spawn、SIGTERM、SIGKILL、清理 Map、记录日志）对所有 Provider 完全一致。如果用纯接口，每个 Provider 都要重复实现这 80 行代码，不仅是代码冗余，更致命的是：三份实现意味着三处可能出现 Bug，修复时也要改三处。

**抽象类的优势**：基类实现所有共享逻辑，子类只需实现两个抽象方法：
- `spawnProcess(ctx)`: 告诉基类"怎么启动你的 CLI 进程"（各 Provider 的参数不同）
- `parseOutput(chunk)`: 告诉基类"怎么把这行输出转换成 StreamEvent"（各 Provider 协议不同）

这是模板方法模式（Template Method Pattern）与策略模式的组合应用。

### 3.2 完整基类定义

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { logger } from "../logger"; // 结构化日志工具，项目统一使用

import type {
  IAiProvider,
  ProviderRunContext,
  ProviderType,
  StreamEvent,
  ProviderErrorCode,
} from "./types";

/**
 * 所有 AI Provider 的抽象基类。
 *
 * 基类职责（Template Method 模式）：
 * - 进程 spawn 与生命周期管理
 * - AbortSignal 监听与两阶段终止（SIGTERM → SIGKILL）
 * - readline 流式读取与错误处理
 * - 结构化日志记录
 * - activeProcesses Map 的维护与清理
 *
 * 子类职责（需要 override 的抽象方法）：
 * - spawnProcess(): 提供具体的 CLI 命令和参数
 * - parseOutput(): 将原始输出行解析为 StreamEvent[]
 */
export abstract class AbstractAiProvider implements IAiProvider {
  abstract readonly type: ProviderType;

  /**
   * 活跃进程表：sessionId → ChildProcess。
   * 用于 cancel() 和 signal abort 时快速找到目标进程。
   * 使用 protected 允许子类在特殊情况下访问（如需要直接写 stdin）。
   */
  protected readonly activeProcesses = new Map<string, ChildProcess>();

  /**
   * SIGTERM 后等待进程自然退出的最长时间（毫秒）。
   * 超过此时间则强制发送 SIGKILL。
   * 2500ms 的原因：给 Claude CLI 足够时间保存状态，同时不让用户等待超过 3 秒。
   */
  private static readonly KILL_TIMEOUT_MS = 2500;

  // ─────────────────────────────────────────────────────────────────────────
  // 抽象方法：子类必须实现
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 子类实现：spawn 具体的 CLI 子进程。
   *
   * 实现要求：
   * 1. 必须设置 stdio: ["pipe", "pipe", "pipe"]（让父进程可以读写所有流）。
   * 2. 必须设置 cwd: ctx.workingDirectory。
   * 3. 必须将 ctx.prompt、ctx.model 等参数正确翻译为 CLI 参数。
   * 4. 不得在此方法中 emit 任何事件，基类负责 emit MessageStartEvent。
   *
   * @param ctx 完整运行上下文。
   * @returns 已 spawn 的子进程实例。
   */
  protected abstract spawnProcess(ctx: ProviderRunContext): ChildProcess;

  /**
   * 子类实现：将 stdout 的一行原始文本解析为 StreamEvent 列表。
   *
   * 设计要点：
   * - 返回数组而非单个事件，因为部分 Provider（如 Codex JSON-RPC）的一行可能对应多个事件。
   * - 解析失败时返回 [] 并记录日志，不得 throw（基类会处理 stderr 上的致命错误）。
   * - 解析出的事件应正确填充 sessionId（从 ctx 中获取）。
   *
   * @param chunk 从 stdout 读取的一行文本（已去除行尾 \n）。
   * @param ctx 完整运行上下文（用于获取 sessionId 等信息）。
   * @returns 解析出的 StreamEvent 列表，解析失败返回空数组。
   */
  protected abstract parseOutput(
    chunk: string,
    ctx: ProviderRunContext
  ): StreamEvent[];

  // ─────────────────────────────────────────────────────────────────────────
  // 公共方法：IAiProvider 接口的默认实现
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 核心执行方法，由基类统一实现。
   * 子类不应 override 此方法，所有差异通过 spawnProcess 和 parseOutput 注入。
   */
  async run(ctx: ProviderRunContext): Promise<void> {
    const { sessionId, signal, onEvent } = ctx;

    // 防御性检查：如果 signal 在调用 run() 之前就已经 abort，直接返回。
    // 不 emit 任何事件，因为 Service 层主动取消时自己知道发生了什么。
    if (signal.aborted) {
      logger.warn({ sessionId, provider: this.type }, "run() called with already-aborted signal, skipping");
      return;
    }

    logger.info(
      { sessionId, provider: this.type, cwd: ctx.workingDirectory },
      "Spawning provider process"
    );

    // 1. 让子类启动具体的进程
    const process = this.spawnProcess(ctx);
    this.activeProcesses.set(sessionId, process);

    // 2. 通知上层：AI 开始处理了
    onEvent({ type: "message_start", sessionId, provider: this.type });

    // 用 Promise 包裹进程的完整生命周期，确保 run() 在进程结束前不会 resolve。
    return new Promise<void>((resolve) => {
      let stderrBuffer = "";

      // ───────────────────────────────────────────────────────────────────
      // 3. 监听 stdout：readline 逐行读取，交给 parseOutput 解析
      // 使用 readline 而不是 on("data") 的原因：
      // data 事件的 chunk 大小由内核决定，可能跨行，readline 自动处理行边界。
      // ───────────────────────────────────────────────────────────────────
      const rl = createInterface({
        input: process.stdout!,
        crlfDelay: Infinity, // 兼容 Windows 的 \r\n 行尾
      });

      rl.on("line", (line) => {
        // 忽略空行（部分 CLI 会输出空行分隔块）
        if (line.trim() === "") return;

        const events = this.parseOutput(line, ctx);
        for (const event of events) {
          onEvent(event);
        }
      });

      // ───────────────────────────────────────────────────────────────────
      // 4. 监听 stderr：缓冲所有错误输出，进程退出时一并处理
      // 不在 data 事件中立即 emit ErrorEvent，因为 stderr 的内容可能跨多个 data chunk，
      // 且部分 CLI（如 Claude）会把进度信息也输出到 stderr，进程退出码才是真正的错误判断依据。
      // ───────────────────────────────────────────────────────────────────
      process.stderr?.on("data", (chunk: Buffer) => {
        stderrBuffer += chunk.toString("utf-8");
      });

      // ───────────────────────────────────────────────────────────────────
      // 5. 监听 AbortSignal：用户/Service 层主动取消
      // ───────────────────────────────────────────────────────────────────
      const abortHandler = (): void => {
        logger.info({ sessionId, provider: this.type }, "AbortSignal triggered, initiating graceful shutdown");
        this.terminateProcess(sessionId);
      };

      // 使用 { once: true } 确保 handler 只触发一次，避免内存泄漏
      signal.addEventListener("abort", abortHandler, { once: true });

      // ───────────────────────────────────────────────────────────────────
      // 6. 监听进程退出：清理所有资源，emit 结束事件
      // ───────────────────────────────────────────────────────────────────
      process.on("close", (exitCode, signalName) => {
        // 无论如何，先清理资源，防止内存泄漏
        signal.removeEventListener("abort", abortHandler);
        rl.close();
        this.activeProcesses.delete(sessionId);

        logger.info(
          { sessionId, provider: this.type, exitCode, signal: signalName },
          "Provider process closed"
        );

        // 根据退出情况，决定 emit 什么事件
        if (signal.aborted) {
          // 用户主动取消，不算错误
          onEvent({ type: "message_end", sessionId, stopReason: "cancelled" });
        } else if (exitCode !== 0) {
          // 进程异常退出
          const errorMessage = stderrBuffer.trim() || `Process exited with code ${exitCode}`;
          logger.error({ sessionId, provider: this.type, exitCode, stderr: stderrBuffer }, "Provider process crashed");

          onEvent({
            type: "error",
            sessionId,
            message: errorMessage,
            code: this.classifyExitError(exitCode, stderrBuffer),
          });
          onEvent({ type: "message_end", sessionId, stopReason: "error" });
        }
        // 注意：正常退出（exitCode === 0）的 MessageEndEvent 应由 parseOutput 解析流中的结束标记来 emit，
        // 而不是在这里 emit。这样可以携带 usage 等信息。
        // 如果子类的 parseOutput 没有 emit MessageEndEvent（即协议中没有明确的结束标记），
        // 子类应 override 此处逻辑（但通常不需要）。

        resolve(); // 告诉 run() 的调用方：整个生命周期结束了
      });

      // 兜底：如果进程 spawn 失败（如找不到二进制文件）
      process.on("error", (err) => {
        logger.error({ sessionId, provider: this.type, err }, "Failed to spawn provider process");

        const code: ProviderErrorCode = err.message.includes("ENOENT")
          ? "CLI_NOT_FOUND"
          : "UNKNOWN";

        onEvent({ type: "error", sessionId, message: err.message, code });
        onEvent({ type: "message_end", sessionId, stopReason: "error" });

        signal.removeEventListener("abort", abortHandler);
        this.activeProcesses.delete(sessionId);
        resolve();
      });
    });
  }

  /**
   * 实现 IAiProvider.cancel()：向指定会话的进程发送终止信号。
   * 此方法是幂等的，对不存在的 sessionId 静默忽略。
   */
  cancel(sessionId: string): void {
    if (!this.activeProcesses.has(sessionId)) {
      logger.warn({ sessionId, provider: this.type }, "cancel() called for non-existent session, ignoring");
      return;
    }
    logger.info({ sessionId, provider: this.type }, "cancel() invoked manually");
    this.terminateProcess(sessionId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 私有方法：两阶段进程终止
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 两阶段进程终止：SIGTERM（优雅关闭）→ 2.5s 超时 → SIGKILL（强制杀死）。
   *
   * 为什么两阶段？
   * SIGTERM 让进程有机会做清理工作（如保存 session 状态、刷新缓冲区）。
   * 但如果进程卡住了（死锁、等待网络），我们不能无限等待，SIGKILL 是最后手段。
   *
   * @param sessionId 要终止的会话 ID。
   */
  private terminateProcess(sessionId: string): void {
    const process = this.activeProcesses.get(sessionId);
    if (!process || process.killed) return;

    logger.info({ sessionId, provider: this.type }, "Sending SIGTERM to process");
    process.kill("SIGTERM");

    const killTimer = setTimeout(() => {
      // 超时后再次检查进程是否还活着（SIGTERM 可能已经生效）
      if (!process.killed) {
        logger.warn({ sessionId, provider: this.type }, "Process did not exit after SIGTERM, sending SIGKILL");
        process.kill("SIGKILL");
      }
    }, AbstractAiProvider.KILL_TIMEOUT_MS);

    // unref() 确保 killTimer 不会阻止 Node.js 进程退出。
    // 如果整个应用准备退出，我们不希望因为这个定时器而无法退出。
    killTimer.unref();
  }

  /**
   * 根据退出码和 stderr 内容推断错误类型。
   * 子类可以 override 此方法以支持 Provider 特定的错误码映射。
   *
   * @param exitCode 进程退出码，null 表示被信号终止。
   * @param stderr 捕获的 stderr 内容。
   * @returns 对应的 ProviderErrorCode。
   */
  protected classifyExitError(
    exitCode: number | null,
    stderr: string
  ): ProviderErrorCode {
    if (exitCode === 127) return "CLI_NOT_FOUND"; // shell 找不到命令
    if (stderr.toLowerCase().includes("auth") || stderr.toLowerCase().includes("api key")) {
      return "AUTH_ERROR";
    }
    if (stderr.toLowerCase().includes("rate limit") || stderr.toLowerCase().includes("429")) {
      return "RATE_LIMIT";
    }
    if (exitCode !== null && exitCode !== 0) return "PROCESS_CRASHED";
    return "UNKNOWN";
  }
}
```

---

## 4. ProviderRegistry 设计

> 物理文件路径：`server/src/lib/ai-provider/registry.ts`

### 4.1 设计说明

ProviderRegistry 是策略模式的"工厂 + 路由器"。它：

1. 在构造时注册所有已知 Provider 实例。
2. 提供 `get(type)` 方法，让 Service 层通过 ProviderType 字符串拿到对应实例。
3. 提供 `getAvailable()` 方法，并发检测所有 CLI 是否可用（用于前端 provider 选择 UI）。
4. 作为单例导出，避免多次实例化 Provider（Provider 实例持有 activeProcesses Map，必须单例）。

### 4.2 完整实现

```typescript
import type { IAiProvider, ProviderType } from "./types";
import { ClaudeProvider } from "./providers/claude-provider";
// import { CodexProvider } from "./providers/codex-provider";   // MVP 阶段注释掉
// import { OpenCodeProvider } from "./providers/opencode-provider"; // MVP 阶段注释掉
import { logger } from "../logger";

/**
 * ProviderRegistry：所有 AI Provider 的注册中心。
 *
 * 使用方式（Service 层）：
 * ```typescript
 * import { providerRegistry } from "../lib/ai-provider/registry";
 *
 * const provider = providerRegistry.get("claude");
 * await provider.run(ctx);
 * ```
 */
export class ProviderRegistry {
  /**
   * 内部注册表：type → Provider 实例。
   * 使用 Map 而非对象字面量，原因：
   * 1. Map 的 key 可以是任意类型（虽然这里是字符串，但语义更清晰）。
   * 2. Map.has() 比 in 操作符更直观。
   * 3. 便于遍历（getAvailable 中需要遍历所有 Provider）。
   */
  private readonly providers: Map<ProviderType, IAiProvider>;

  constructor() {
    this.providers = new Map<ProviderType, IAiProvider>();

    // ── 在这里注册所有 Provider ──────────────────────────────────────────
    // 新增 Provider 时，只需在此处添加一行，其他代码零改动。
    this.register(new ClaudeProvider());
    // this.register(new CodexProvider());      // TODO: Codex Provider 实现后取消注释
    // this.register(new OpenCodeProvider());   // TODO: OpenCode Provider 实现后取消注释
    // ────────────────────────────────────────────────────────────────────
  }

  /**
   * 注册一个 Provider 实例。
   * private 方法，防止外部在运行时动态注册（保持注册表的确定性）。
   */
  private register(provider: IAiProvider): void {
    if (this.providers.has(provider.type)) {
      // 重复注册通常是编程错误（如不小心 new 了两次），应该在开发阶段就发现。
      throw new Error(`Provider "${provider.type}" is already registered. Check for duplicate registration in ProviderRegistry constructor.`);
    }
    this.providers.set(provider.type, provider);
    logger.debug({ providerType: provider.type }, "Provider registered");
  }

  /**
   * 获取指定类型的 Provider 实例。
   *
   * @param type Provider 类型。
   * @returns 对应的 IAiProvider 实例。
   * @throws Error 如果请求的 Provider 未注册（通常是编程错误或配置问题）。
   */
  get(type: ProviderType): IAiProvider {
    const provider = this.providers.get(type);
    if (provider === undefined) {
      // 走到这里说明：
      // 1. ProviderType 联合类型中有这个值，但 registry 里没注册（漏注册）。
      // 2. 或者：调用方传入了不合法的字符串（运行时校验漏洞，Service 层应在上游过滤）。
      throw new Error(
        `Provider "${type}" is not registered. ` +
        `If this is a new provider, add it to ProviderRegistry constructor. ` +
        `Registered providers: [${[...this.providers.keys()].join(", ")}]`
      );
    }
    return provider;
  }

  /**
   * 并发检测所有已注册 Provider 的可用性。
   *
   * 使用 Promise.allSettled 而非 Promise.all，原因：
   * 单个 Provider 的 isAvailable() 失败（如 CLI 未安装导致超时），不应影响其他 Provider 的检测。
   *
   * @returns 所有可用的 ProviderType 列表（CLI 已安装且可正常运行）。
   */
  async getAvailable(): Promise<ProviderType[]> {
    const entries = [...this.providers.entries()];

    const results = await Promise.allSettled(
      entries.map(async ([type, provider]) => {
        const available = await provider.isAvailable();
        return { type, available };
      })
    );

    const availableTypes: ProviderType[] = [];

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.available) {
        availableTypes.push(result.value.type);
      } else if (result.status === "rejected") {
        // isAvailable() 不应该 throw，但防御性处理
        logger.warn({ error: result.reason }, "isAvailable() threw unexpectedly");
      }
    }

    logger.info({ availableProviders: availableTypes }, "Provider availability check complete");
    return availableTypes;
  }

  /**
   * 列出所有已注册的 Provider 类型（无论是否可用）。
   * 用于调试和管理 API。
   */
  listRegistered(): ProviderType[] {
    return [...this.providers.keys()];
  }
}

/**
 * 单例导出。
 * 整个应用共享同一个 ProviderRegistry 实例，确保 activeProcesses Map 的一致性。
 *
 * 注意：不使用 class static 方法实现单例（反模式），而是模块级别的常量。
 * 模块级单例在 Node.js 中天然是单例（模块缓存机制），更简洁。
 */
export const providerRegistry = new ProviderRegistry();
```

---

## 5. 各 Provider 适配说明

### 5.1 Claude CLI（MVP，完整实现）

> 物理文件路径：`server/src/lib/ai-provider/providers/claude-provider.ts`

#### 5.1.1 调用方式

```bash
# 基础用法（print 模式，流式 JSON 输出）
claude --print --output-format stream-json "你的 prompt"

# 带参数的完整调用
claude \
  --print \
  --output-format stream-json \
  --model claude-sonnet-4-5 \
  --system-prompt "你是一个编程助手" \
  --allowedTools "bash,read_file,write_file" \
  "用户的 prompt 内容"

# 注意：--print 表示非交互模式（single-turn），stdin 不接受追加输入
# cwd 通过 spawn 的 cwd 选项传递，不是 CLI 参数
```

#### 5.1.2 输出格式（NDJSON）

Claude CLI 以 `--output-format stream-json` 启动时，stdout 输出格式为每行一个 JSON 对象：

```jsonc
// 会话开始
{"type":"system","subtype":"init","session_id":"abc123","model":"claude-sonnet-4-5","tools":[...]}

// 文字内容（逐 token 输出）
{"type":"assistant","message":{"content":[{"type":"text","text":"你好"}]}}

// 工具调用
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"call_001","name":"bash","input":{"command":"ls -la"}}]}}

// 工具结果（由 Claude CLI 自动执行并回填）
{"type":"tool","tool_use_id":"call_001","content":"total 16\ndrwxr-xr-x ...","is_error":false}

// 会话结束
{"type":"result","subtype":"success","result":"完整的最终回复","usage":{"input_tokens":150,"output_tokens":80}}
```

#### 5.1.3 关键事件映射

| Claude CLI 输出 `type` | 映射到 StreamEvent |
|----------------------|-------------------|
| `system` (init) | `MessageStartEvent`（已在基类 emit，此处忽略） |
| `assistant` (text content) | `ContentDeltaEvent` |
| `assistant` (tool_use content) | `ToolUseEvent` |
| `tool` | `ToolResultEvent` |
| `result` (success/failure) | `MessageEndEvent` |

#### 5.1.4 实现骨架

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AbstractAiProvider } from "../abstract-provider";
import { logger } from "../../logger";
import type {
  ProviderRunContext,
  ProviderType,
  StreamEvent,
  ProviderErrorCode,
} from "../types";

const execFileAsync = promisify(execFile);

// Claude CLI 原始输出的类型定义（仅覆盖需要处理的类型，其余 unknown 忽略）
// 使用 interface 而非 type alias，因为这是外部数据结构定义，需要可扩展。

interface ClaudeSystemEvent {
  readonly type: "system";
  readonly subtype: "init";
  readonly session_id: string;
  readonly model: string;
}

interface ClaudeAssistantTextContent {
  readonly type: "text";
  readonly text: string;
}

interface ClaudeAssistantToolUseContent {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

type ClaudeAssistantContent =
  | ClaudeAssistantTextContent
  | ClaudeAssistantToolUseContent;

interface ClaudeAssistantEvent {
  readonly type: "assistant";
  readonly message: {
    readonly content: ClaudeAssistantContent[];
    readonly usage?: {
      readonly input_tokens: number;
      readonly output_tokens: number;
    };
  };
}

interface ClaudeToolEvent {
  readonly type: "tool";
  readonly tool_use_id: string;
  readonly content: string;
  readonly is_error: boolean;
}

interface ClaudeResultEvent {
  readonly type: "result";
  readonly subtype: "success" | "error_during_execution" | "error_max_turns";
  readonly result: string;
  readonly usage?: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
}

// Claude CLI 可能输出的所有事件类型联合
type ClaudeOutputEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeToolEvent
  | ClaudeResultEvent;

/**
 * Claude CLI Provider 实现。
 *
 * 依赖：用户系统中已安装 `claude` CLI（Anthropic 官方 CLI 工具）。
 * 安装文档：https://docs.anthropic.com/en/docs/claude-cli
 *
 * 核心实现思路：
 * 1. spawnProcess(): 将 ProviderRunContext 翻译为 claude CLI 参数。
 * 2. parseOutput(): 将 NDJSON 每行解析为 StreamEvent[]。
 */
export class ClaudeProvider extends AbstractAiProvider {
  readonly type: ProviderType = "claude";

  /**
   * 检查 claude CLI 是否已安装。
   * 执行 `claude --version`，成功则返回 true。
   */
  async isAvailable(): Promise<boolean> {
    try {
      // 设置 5 秒超时，防止 which 命令因为网络挂载等原因卡住
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        await execFileAsync("claude", ["--version"], { signal: controller.signal });
        return true;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // ENOENT: 找不到命令；AbortError: 超时；都视为不可用
      logger.debug({ provider: this.type }, "claude CLI not available");
      return false;
    }
  }

  /**
   * 返回已知的 Claude 模型列表。
   * 由于 claude CLI 暂不提供 `claude models` 子命令，返回硬编码列表。
   * TODO: 当 CLI 支持 model listing 时，改为动态获取。
   */
  async listModels(): Promise<string[]> {
    return [
      "claude-opus-4-5",
      "claude-sonnet-4-5",
      "claude-haiku-3-5",
    ];
  }

  /**
   * 构建并 spawn claude CLI 子进程。
   * 将 ProviderRunContext 的字段翻译为 claude 命令行参数。
   */
  protected spawnProcess(ctx: ProviderRunContext): ChildProcess {
    const args: string[] = [
      "--print",                    // 非交互模式
      "--output-format", "stream-json", // 流式 JSON 输出
    ];

    if (ctx.model !== undefined) {
      args.push("--model", ctx.model);
    }

    if (ctx.systemPrompt !== undefined) {
      args.push("--system-prompt", ctx.systemPrompt);
    }

    if (ctx.allowedTools !== undefined && ctx.allowedTools.length > 0) {
      args.push("--allowedTools", ctx.allowedTools.join(","));
    } else if (ctx.allowedTools?.length === 0) {
      // 空数组表示禁用所有工具（纯对话模式）
      args.push("--no-tools");
    }

    // prompt 作为最后一个位置参数
    args.push(ctx.prompt);

    logger.debug(
      { sessionId: ctx.sessionId, provider: this.type, args },
      "Spawning claude process"
    );

    return spawn("claude", args, {
      cwd: ctx.workingDirectory,
      stdio: ["ignore", "pipe", "pipe"], // stdin: 忽略（--print 模式不需要 stdin）
      // env 继承父进程，ANTHROPIC_API_KEY 等凭证由用户配置在环境变量中
      env: process.env,
    });
  }

  /**
   * 将 claude CLI 的一行 NDJSON 输出解析为 StreamEvent[]。
   *
   * 解析失败时记录警告并返回 []，不 throw，
   * 确保单帧解析失败不影响后续帧（流的韧性）。
   */
  protected parseOutput(chunk: string, ctx: ProviderRunContext): StreamEvent[] {
    const { sessionId } = ctx;

    let rawEvent: unknown;
    try {
      rawEvent = JSON.parse(chunk);
    } catch {
      // 非 JSON 行（如 CLI 的 debug 输出），记录并跳过
      logger.warn({ sessionId, provider: this.type, chunk }, "Failed to parse claude output line as JSON");
      return [];
    }

    // 使用类型守卫收窄类型，避免 as any 强转
    if (!isClaudeOutputEvent(rawEvent)) {
      logger.warn({ sessionId, provider: this.type, rawEvent }, "Unknown claude event shape, skipping");
      return [];
    }

    return this.mapClaudeEventToStreamEvents(rawEvent, sessionId);
  }

  /**
   * 将已经类型收窄的 ClaudeOutputEvent 映射为 StreamEvent[]。
   * 抽离为独立方法，便于单元测试（只测 mapping 逻辑，不需要真实进程）。
   */
  private mapClaudeEventToStreamEvents(
    event: ClaudeOutputEvent,
    sessionId: string
  ): StreamEvent[] {
    switch (event.type) {
      case "system":
        // system/init 事件在基类已经 emit 了 MessageStartEvent，这里忽略
        return [];

      case "assistant": {
        const events: StreamEvent[] = [];
        for (const content of event.message.content) {
          if (content.type === "text") {
            events.push({
              type: "content_delta",
              sessionId,
              delta: content.text,
            });
          } else if (content.type === "tool_use") {
            events.push({
              type: "tool_use",
              sessionId,
              toolName: content.name,
              toolCallId: content.id,
              input: content.input,
            });
          }
        }
        return events;
      }

      case "tool":
        return [{
          type: "tool_result",
          sessionId,
          toolCallId: event.tool_use_id,
          output: event.content,
          isError: event.is_error,
        }];

      case "result":
        return [{
          type: "message_end",
          sessionId,
          stopReason: event.subtype === "success" ? "end_turn" : "error",
          usage: event.usage !== undefined
            ? { inputTokens: event.usage.input_tokens, outputTokens: event.usage.output_tokens }
            : undefined,
        }];
    }
  }

  /**
   * Override 基类的错误分类，加入 Claude 特有的错误码识别。
   */
  protected override classifyExitError(
    exitCode: number | null,
    stderr: string
  ): ProviderErrorCode {
    // 优先调用基类的通用逻辑
    const baseCode = super.classifyExitError(exitCode, stderr);
    if (baseCode !== "UNKNOWN") return baseCode;

    // Claude CLI 特有错误
    if (stderr.includes("Invalid API key")) return "AUTH_ERROR";
    if (stderr.includes("overloaded") || exitCode === 529) return "RATE_LIMIT";

    return "UNKNOWN";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 类型守卫：验证 JSON.parse 结果是否符合 ClaudeOutputEvent 结构
// 使用函数守卫而非 as ClaudeOutputEvent，保持类型安全
// ─────────────────────────────────────────────────────────────────────────────

function isClaudeOutputEvent(value: unknown): value is ClaudeOutputEvent {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  const type = obj["type"];

  return (
    type === "system" ||
    type === "assistant" ||
    type === "tool" ||
    type === "result"
  );
}
```

### 5.2 Codex CLI（预留，MVP 阶段不实现）

> 物理文件路径（待实现）：`server/src/lib/ai-provider/providers/codex-provider.ts`

#### 调用方式

```bash
codex app-server
```

#### 通信协议

Codex CLI 使用 JSON-RPC 2.0 over stdio：

- **stdin**：写入 JSON-RPC request（每条消息一行，以 `\n` 结尾）
- **stdout**：读取 JSON-RPC response 和 notification

示例请求：
```jsonc
{"jsonrpc":"2.0","id":1,"method":"session.start","params":{"prompt":"...","model":"..."}}
```

#### 与通用基类的差异点

Codex 的通信是**双向**的（需要向 stdin 写入），而基类目前只处理单向（只读 stdout）。实现 CodexProvider 时，`spawnProcess` 中不应将 stdin 设为 `"ignore"`，而应该保留 `"pipe"`，并在初始化完成后通过 `process.stdin.write()` 发送请求。

需要额外实现 `server/src/lib/process/json-rpc-client.ts`，封装 JSON-RPC 的序列化、ID 生成、请求-响应配对逻辑。

### 5.3 OpenCode CLI（预留，待调研）

> 物理文件路径（待实现）：`server/src/lib/ai-provider/providers/opencode-provider.ts`

当前状态：协议未调研，接口预留。实现前需要：

1. 调研 OpenCode CLI 的 `--help` 和官方文档，确认 stdio 通信协议。
2. 更新本文档的 5.3 节，填写具体的调用方式和事件映射。
3. 实现 `OpenCodeProvider` 类并在 `ProviderRegistry` 中注册。

---

## 6. 错误处理与容错策略

### 6.1 错误分层

| 错误场景 | 处理方式 | 上报机制 |
|----------|----------|----------|
| CLI 工具未安装 | `isAvailable()` 返回 false | 前端 UI 展示"请先安装 Claude CLI" |
| 进程 spawn 失败 (ENOENT) | process `error` 事件 | `ErrorEvent(code: "CLI_NOT_FOUND")` + `MessageEndEvent` |
| 进程崩溃 (exit code ≠ 0) | process `close` 事件 | `ErrorEvent(code: "PROCESS_CRASHED")` + `MessageEndEvent` |
| 单行 JSON 解析失败 | `parseOutput` 捕获，返回 `[]` | logger.warn，继续处理后续行 |
| 用户取消 | AbortSignal → SIGTERM/SIGKILL | `MessageEndEvent(stopReason: "cancelled")` |
| API 认证失败 | exit code + stderr 识别 | `ErrorEvent(code: "AUTH_ERROR")` |
| Rate Limit | exit code + stderr 识别 | `ErrorEvent(code: "RATE_LIMIT")` |

### 6.2 容错关键点

**单帧解析失败不影响整体流**：`parseOutput` 内部 try/catch 所有异常，返回空数组。这保证了即使 CLI 输出了一行非法 JSON（如进度信息混入 stdout），不会导致整个会话崩溃。

**僵尸进程防护**：`activeProcesses.delete(sessionId)` 必须在 `close` 事件和 `error` 事件两处都调用（基类已实现）。如果只在 `close` 中清理，`error` 事件后进程引用会泄漏。

**AbortSignal 事件监听清理**：`signal.removeEventListener("abort", abortHandler)` 必须在 `close` 事件中调用（不管是否取消），否则即使进程结束，abortHandler 的闭包也会持有 `process` 引用，造成内存泄漏。

### 6.3 日志规范

每次 Provider 相关操作必须有结构化日志，字段要求：

```typescript
// spawn 时
logger.info({ sessionId, provider: "claude", cwd }, "Spawning provider process");

// 进程结束时
logger.info({ sessionId, provider: "claude", exitCode, signal }, "Provider process closed");

// 错误时
logger.error({ sessionId, provider: "claude", exitCode, stderr }, "Provider process crashed");

// 取消时
logger.info({ sessionId, provider: "claude" }, "Sending SIGTERM to process");
```

---

## 7. 类型守卫（Type Guards）

> 物理文件路径：`server/src/lib/ai-provider/type-guards.ts`
>
> 这些工具函数供 Service 层和前端（通过共享类型）使用，避免 `as` 类型断言。

```typescript
import type {
  StreamEvent,
  MessageStartEvent,
  ContentDeltaEvent,
  ToolUseEvent,
  ToolResultEvent,
  MessageEndEvent,
  ErrorEvent,
  KeepaliveEvent,
} from "./types";

/**
 * 类型守卫集合：StreamEvent 联合类型的收窄工具。
 *
 * 使用场景（Service 层示例）：
 * ```typescript
 * provider.run({
 *   ...ctx,
 *   onEvent: (event) => {
 *     if (isContentDelta(event)) {
 *       // 这里 event 被 TypeScript 收窄为 ContentDeltaEvent
 *       sseStream.write(`data: ${event.delta}\n\n`);
 *     }
 *   }
 * });
 * ```
 */

export function isMessageStart(event: StreamEvent): event is MessageStartEvent {
  return event.type === "message_start";
}

export function isContentDelta(event: StreamEvent): event is ContentDeltaEvent {
  return event.type === "content_delta";
}

export function isToolUse(event: StreamEvent): event is ToolUseEvent {
  return event.type === "tool_use";
}

export function isToolResult(event: StreamEvent): event is ToolResultEvent {
  return event.type === "tool_result";
}

export function isMessageEnd(event: StreamEvent): event is MessageEndEvent {
  return event.type === "message_end";
}

export function isError(event: StreamEvent): event is ErrorEvent {
  return event.type === "error";
}

export function isKeepalive(event: StreamEvent): event is KeepaliveEvent {
  return event.type === "keepalive";
}

/**
 * 判断事件是否标志着会话的终止（无论正常还是异常）。
 * Service 层可以用此守卫来决定何时关闭 SSE 连接。
 */
export function isTerminalEvent(
  event: StreamEvent
): event is MessageEndEvent {
  return event.type === "message_end";
}
```

---

## 8. 扩展新 Provider 的完整步骤

新增一个 Provider（以假想的 `gemini` CLI 为例）需要按以下顺序操作，每步都有明确的文件变更：

### Step 1：扩展 ProviderType

修改文件：`server/src/lib/ai-provider/types.ts`

```typescript
// 修改前
export type ProviderType = "codex" | "claude" | "opencode";

// 修改后
export type ProviderType = "codex" | "claude" | "opencode" | "gemini";
```

完成后，TypeScript 编译器会在所有处理 `ProviderType` 的 `switch/case` 中报错（如果有 exhaustive check），引导你完成后续所有必要修改。

### Step 2：创建 Provider 实现文件

新建文件：`server/src/lib/ai-provider/providers/gemini-provider.ts`

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import { AbstractAiProvider } from "../abstract-provider";
import type { ProviderRunContext, ProviderType, StreamEvent } from "../types";

export class GeminiProvider extends AbstractAiProvider {
  readonly type: ProviderType = "gemini";

  async isAvailable(): Promise<boolean> {
    // 实现：检查 gemini CLI 是否已安装
    throw new Error("Not implemented");
  }

  async listModels(): Promise<string[]> {
    // 实现：返回支持的模型列表
    throw new Error("Not implemented");
  }

  protected spawnProcess(ctx: ProviderRunContext): ChildProcess {
    // 实现：spawn gemini CLI，翻译 ctx 为 CLI 参数
    throw new Error("Not implemented");
  }

  protected parseOutput(chunk: string, ctx: ProviderRunContext): StreamEvent[] {
    // 实现：解析 gemini CLI 的输出格式为 StreamEvent[]
    throw new Error("Not implemented");
  }
}
```

### Step 3：在 ProviderRegistry 中注册

修改文件：`server/src/lib/ai-provider/registry.ts`

```typescript
import { GeminiProvider } from "./providers/gemini-provider"; // 新增

constructor() {
  this.providers = new Map<ProviderType, IAiProvider>();
  this.register(new ClaudeProvider());
  this.register(new GeminiProvider()); // 新增
}
```

### Step 4：实现 spawnProcess 和 parseOutput

按照 Gemini CLI 的实际协议，完整实现 Step 2 中的两个抽象方法。

### Step 5：更新本文档第 5 节

在 `specs/design/ai-provider-interface.md` 第 5 节中添加 Gemini Provider 的适配说明。

### 验证：上层 Service 代码零改动

Service 层通过 `providerRegistry.get("gemini").run(ctx)` 即可使用新 Provider，**不需要修改任何 Service 层代码**。这证明策略模式的抽象是成功的。

---

## 9. 文件结构总览

```
server/src/lib/ai-provider/
├── types.ts                        # 所有接口、类型、联合类型定义（本文档 §2）
├── abstract-provider.ts            # 抽象基类，通用进程管理逻辑（本文档 §3）
├── registry.ts                     # ProviderRegistry 单例（本文档 §4）
├── type-guards.ts                  # StreamEvent 类型守卫函数（本文档 §7）
└── providers/
    ├── claude-provider.ts          # Claude CLI 适配（MVP，已实现）
    ├── codex-provider.ts           # Codex CLI 适配（预留，TODO）
    └── opencode-provider.ts        # OpenCode CLI 适配（预留，TODO）
```

---

## 10. 未决问题（Open Questions）

| 问题 | 影响范围 | 优先级 | 负责人 |
|------|----------|--------|--------|
| Claude CLI `--output-format stream-json` 的完整事件 Schema 是否与文档一致？需在本地验证。 | ClaudeProvider.parseOutput | P0 | 实现时验证 |
| Keepalive 心跳间隔应设为多少秒？SSE 默认超时是 30s，建议 15s 一次。 | AbstractAiProvider | P1 | 待确认 |
| allowedTools 的格式：逗号分隔字符串还是多个 `--allowedTools` 参数？ | ClaudeProvider.spawnProcess | P0 | 查阅 claude CLI help |
| Codex JSON-RPC 客户端是否需要处理 batch request？ | CodexProvider（TODO） | P2 | 实现时调研 |
| 是否需要支持多轮对话（session continuation）？当前设计是单轮（--print 模式）。 | IAiProvider 接口设计 | P1 | 架构决策 |
