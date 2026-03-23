# SSE 实时通信协议规范

**文档状态**：草稿 v1.0
**创建日期**：2026-03-23
**适用项目**：code-name-one — 本地 AI 编程工作台
**技术栈**：Bun + Hono + TypeScript (strict)

---

## 目录

1. [选型决策：为什么选 SSE 而非 WebSocket](#1-选型决策为什么选-sse-而非-websocket)
2. [SSE 事件类型枚举](#2-sse-事件类型枚举)
3. [SSE 帧格式规范](#3-sse-帧格式规范)
4. [断线重连协议（Last-Event-ID）](#4-断线重连协议last-event-id)
5. [心跳机制](#5-心跳机制)
6. [SSE 端点清单](#6-sse-端点清单)
7. [服务端实现规范](#7-服务端实现规范)
8. [客户端消费规范](#8-客户端消费规范)
9. [URL 长度保护](#9-url-长度保护)

---

## 1. 选型决策：为什么选 SSE 而非 WebSocket

### 1.1 背景

本项目是一个**本地 AI 编程工作台**，核心功能是：

- 将用户指令发送给 AI（单次 HTTP POST，请求体小）
- 接收 AI 流式输出文本（持续的服务器推送，数据量大）
- 监控文件变更事件（服务器推送，客户端只需接收）

绝大多数通信模式是**单向的：服务器 → 客户端**，客户端在流式过程中极少需要反向推送数据。

### 1.2 方案对比

| 对比维度 | SSE (Server-Sent Events) | WebSocket |
|---|---|---|
| **通信模式匹配度** | ✅ 原生单向推送，天然匹配本项目 90% 的服务器→客户端场景 | ⚠️ 全双工协议，用来做单向推送是"杀鸡用牛刀"，引入不必要的握手复杂度 |
| **Hono 框架支持度** | ✅ `hono/streaming` 提供原生 `streamSSE()` helper，一行代码完成协议配置 | ⚠️ Hono 无内置 WebSocket helpers；需手动处理 Upgrade 握手和帧协议 |
| **断线重连** | ✅ 浏览器 `EventSource` 原生支持自动重连，并自动携带 `Last-Event-ID` header，零代码成本 | ❌ 需要自行实现重连逻辑、序列号管理、重放队列，代码量大且易出错 |
| **调试便利性** | ✅ Chrome DevTools → Network → EventStream 面板可直接查看每一帧的 event/data，对开发者极友好 | ❌ DevTools 只能看到二进制 WebSocket 帧，调试需借助专用工具或手动 decode |
| **与 TanStack Query 集成难度** | ✅ 可与 `useQuery` 组合：用 Query 管理 EventSource 实例生命周期，`queryFn` 返回一个 cleanup 函数 | ❌ 需自定义 hook，手动管理连接状态、心跳、事件订阅，与 Query 几乎无法自然集成 |
| **本地 localhost 环境** | ✅ 无反向代理，无 Nginx/Caddy 的 buffering 问题，SSE 帧实时到达 | ⚠️ WebSocket 在本地同样工作，但无额外优势；生产环境若有代理则需配置 `proxy_read_timeout` 等 |
| **协议开销** | ✅ 基于纯 HTTP/1.1，无额外握手，连接建立快 | ⚠️ 需要 HTTP → WebSocket Upgrade 握手，多一个 RTT |
| **服务端实现复杂度** | ✅ 返回带正确 Content-Type 的 streaming response 即可 | ❌ 需要实现 WebSocket 握手、ping/pong 心跳、消息帧 encode/decode |
| **浏览器兼容性** | ✅ 所有现代浏览器原生支持 EventSource，无需 polyfill | ✅ 同样良好，但本项目目标是本地工具，兼容性非决策因素 |

### 1.3 结论

**SSE 是本项目实时通信的最佳选择。**

核心理由：本项目的通信模式决定了我们不需要 WebSocket 的全双工能力。SSE 在"浏览器自动重连 + Last-Event-ID"、"Hono 原生支持"、"DevTools 可视"三个维度上的碾压式优势，使其成为本场景下技术复杂度最低、可维护性最高的方案。

> **注意**：如果未来需要实现"用户在 AI 输出过程中发送取消/打断指令"，仍然推荐使用独立的 HTTP DELETE/PATCH 请求来实现，而非升级到 WebSocket。这保持了架构的简单性。

---

## 2. SSE 事件类型枚举

### 2.1 事件类型定义

```typescript
/**
 * SSE 流事件类型枚举
 *
 * 设计原则：
 * - 事件类型名称使用 snake_case，与 SSE `event:` 字段直接映射
 * - 覆盖 AI 对话全生命周期（start → delta* → end）
 * - 工具调用单独拆分为 tool_use / tool_result，便于前端独立渲染
 */
type StreamEventType =
  | "message_start"  // AI 对话会话开始，包含 session 元信息
  | "content_delta"  // 文本增量（核心事件，每个 token 一帧，最高频）
  | "tool_use"       // AI 决定调用工具（执行命令/读写文件/搜索）
  | "tool_result"    // 工具执行结果返回（可能包含大量文件内容）
  | "message_end"    // 对话结束，包含 token usage 统计
  | "error"          // 错误事件（API 超时、工具执行失败等）
  | "keepalive"      // 心跳（使用 SSE comment 帧格式，不携带 data）
  | "file_change"    // 文件系统变更通知（新增/修改/删除）
  | "session_state"; // 会话状态机变更（idle / running / waiting_tool）
```

### 2.2 各事件完整 Interface 定义

#### message_start — AI 对话开始

```typescript
/**
 * 触发时机：客户端发起 POST /api/sessions/:id/run 后，
 * 服务端开始向 AI API 发请求时立即推送此帧。
 * 用途：前端可在此时清空上一次的输出区域、显示 loading 状态。
 */
interface MessageStartEvent {
  type: "message_start";
  /** 全局唯一的消息 ID，贯穿整个对话流 */
  messageId: string;
  /** 会话 ID */
  sessionId: string;
  /** 使用的模型名称，例如 "claude-opus-4-5" */
  model: string;
  /** 服务端时间戳（Unix ms） */
  timestamp: number;
}

// 示例 JSON payload
// {
//   "type": "message_start",
//   "messageId": "msg_01XYZ",
//   "sessionId": "sess_abc123",
//   "model": "claude-opus-4-5",
//   "timestamp": 1742659200000
// }
```

#### content_delta — 文本增量（最核心事件）

```typescript
/**
 * 触发时机：AI 每输出一个或若干个 token 时推送。
 * 这是流式对话中频率最高的事件，单次对话可能有数百帧。
 *
 * 设计决策：delta 只携带"增量文本"，不携带累计文本。
 * 前端负责拼接，这样可以减少每帧的数据量。
 */
interface ContentDeltaEvent {
  type: "content_delta";
  /** 对应的消息 ID */
  messageId: string;
  /** 增量文本内容（可能是单个字符，也可能是几个 token） */
  delta: string;
  /** 当前帧在此消息中的序号，从 0 开始，用于前端检测乱序 */
  index: number;
}

// 示例 JSON payload
// {
//   "type": "content_delta",
//   "messageId": "msg_01XYZ",
//   "delta": "好的，我来帮你",
//   "index": 0
// }
```

#### tool_use — AI 调用工具

```typescript
/**
 * 触发时机：AI 决定调用某个工具（执行 shell 命令、读写文件等）时推送。
 * 前端收到此事件后，应在 UI 上显示"AI 正在执行工具：xxx"的状态。
 *
 * 设计决策：input 使用 unknown 而非 any，强制调用方做类型收窄。
 */
interface ToolUseEvent {
  type: "tool_use";
  messageId: string;
  /** 工具调用的唯一 ID，与后续 tool_result 的 toolCallId 对应 */
  toolCallId: string;
  /** 工具名称，例如 "bash", "read_file", "write_file", "search" */
  toolName: string;
  /** 工具调用参数，结构因 toolName 不同而异 */
  input: unknown;
}

// 示例 JSON payload（bash 工具）
// {
//   "type": "tool_use",
//   "messageId": "msg_01XYZ",
//   "toolCallId": "toolu_01ABC",
//   "toolName": "bash",
//   "input": { "command": "ls -la /src", "timeout": 30000 }
// }
```

#### tool_result — 工具执行结果

```typescript
/**
 * 触发时机：工具执行完毕后推送。
 * 前端可在此时隐藏工具执行中的状态，显示工具输出结果。
 *
 * 注意：content 可能非常大（例如读取了一个几千行的文件）。
 * 如果 content 超过 10KB，建议前端做折叠展示。
 */
interface ToolResultEvent {
  type: "tool_result";
  messageId: string;
  /** 对应 ToolUseEvent 的 toolCallId */
  toolCallId: string;
  /** 工具执行是否成功 */
  isError: boolean;
  /** 工具输出内容（可能是文本、JSON 字符串或错误信息） */
  content: string;
  /** 工具执行耗时（ms） */
  durationMs: number;
}

// 示例 JSON payload
// {
//   "type": "tool_result",
//   "messageId": "msg_01XYZ",
//   "toolCallId": "toolu_01ABC",
//   "isError": false,
//   "content": "total 48\ndrwxr-xr-x  8 user staff  256 Mar 23 10:00 .\n...",
//   "durationMs": 142
// }
```

#### message_end — 对话结束

```typescript
/**
 * 触发时机：AI 完成整个响应后推送，是此次对话流的最后一帧。
 * 前端收到此事件后，应移除所有 loading 状态，允许用户再次输入。
 */
interface MessageEndEvent {
  type: "message_end";
  messageId: string;
  /** 对话结束原因 */
  stopReason: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence";
  /** Token 用量统计 */
  usage: {
    /** 输入 token 数 */
    inputTokens: number;
    /** 输出 token 数 */
    outputTokens: number;
    /** 缓存命中的 token 数（如有） */
    cacheReadTokens: number;
    /** 写入缓存的 token 数（如有） */
    cacheCreationTokens: number;
  };
  /** 服务端处理耗时（ms），从收到请求到发出此帧 */
  durationMs: number;
}

// 示例 JSON payload
// {
//   "type": "message_end",
//   "messageId": "msg_01XYZ",
//   "stopReason": "end_turn",
//   "usage": {
//     "inputTokens": 1024,
//     "outputTokens": 512,
//     "cacheReadTokens": 2048,
//     "cacheCreationTokens": 0
//   },
//   "durationMs": 3420
// }
```

#### error — 错误事件

```typescript
/**
 * 触发时机：任何阶段出现不可恢复的错误时推送。
 * 推送此事件后，服务端会关闭 SSE 连接。
 * 前端应根据 code 决定是否自动重试或显示错误提示。
 */
interface ErrorEvent {
  type: "error";
  messageId: string | null; // 如果错误发生在 message 开始之前，则为 null
  /** 错误码，用于前端做分支处理 */
  code:
    | "UPSTREAM_TIMEOUT"      // AI API 超时
    | "UPSTREAM_RATE_LIMIT"   // AI API 触发限流
    | "TOOL_EXECUTION_FAILED" // 工具执行失败（非 AI 侧错误）
    | "SESSION_NOT_FOUND"     // 会话 ID 不存在
    | "INTERNAL_ERROR";       // 服务端未预期错误
  /** 人类可读的错误信息（英文，避免 i18n 复杂性） */
  message: string;
  /** 是否建议客户端重试 */
  retryable: boolean;
  /** 建议的重试等待时间（ms），retryable=false 时此字段无意义 */
  retryAfterMs: number;
}

// 示例 JSON payload
// {
//   "type": "error",
//   "messageId": "msg_01XYZ",
//   "code": "UPSTREAM_TIMEOUT",
//   "message": "AI API request timed out after 60s",
//   "retryable": true,
//   "retryAfterMs": 2000
// }
```

#### file_change — 文件变更通知

```typescript
/**
 * 触发时机：服务端文件监控器（FSWatcher）检测到文件系统变更时推送。
 * 此事件仅在 /api/projects/:id/files/watch 端点使用。
 */
interface FileChangeEvent {
  type: "file_change";
  /** 项目 ID */
  projectId: string;
  /** 变更类型 */
  changeType: "created" | "modified" | "deleted" | "renamed";
  /** 相对于项目根目录的文件路径 */
  filePath: string;
  /** 如果是 renamed，旧路径在此字段 */
  oldFilePath?: string;
  /** 文件修改时间（Unix ms） */
  modifiedAt: number;
}

// 示例 JSON payload
// {
//   "type": "file_change",
//   "projectId": "proj_xyz",
//   "changeType": "modified",
//   "filePath": "src/components/App.tsx",
//   "modifiedAt": 1742659200000
// }
```

#### session_state — 会话状态变更

```typescript
/**
 * 触发时机：会话状态机发生转换时推送。
 * 前端可用此事件同步状态指示器（例如顶部状态栏）。
 *
 * 会话状态机流转：
 *   idle → running (用户发起请求)
 *   running → waiting_tool (AI 调用工具，等待结果)
 *   waiting_tool → running (工具返回，AI 继续输出)
 *   running → idle (message_end)
 *   running/waiting_tool → error (发生错误)
 */
interface SessionStateEvent {
  type: "session_state";
  sessionId: string;
  previousState: SessionState;
  currentState: SessionState;
  /** 状态变更原因（用于调试日志） */
  reason: string;
}

type SessionState = "idle" | "running" | "waiting_tool" | "error";

// 示例 JSON payload
// {
//   "type": "session_state",
//   "sessionId": "sess_abc123",
//   "previousState": "running",
//   "currentState": "waiting_tool",
//   "reason": "AI invoked bash tool"
// }
```

---

## 3. SSE 帧格式规范

### 3.1 标准事件帧

SSE 协议由 [W3C EventSource 规范](https://html.spec.whatwg.org/multipage/server-sent-events.html) 定义，每一帧的格式如下：

```
id: {monotonic_counter}\n
event: {StreamEventType}\n
data: {JSON payload, single line}\n
\n
```

**关键约束（违反任何一条都会导致客户端解析失败）**：

| 字段 | 规则 |
|---|---|
| `id` | 单调递增整数字符串，同一 SSE 连接内全局唯一。浏览器用此值自动维护 `Last-Event-ID`。 |
| `event` | 对应 `StreamEventType` 的字符串值。省略时浏览器触发 `onmessage`；指定后触发对应的 `addEventListener(type, ...)` 监听器。 |
| `data` | **必须是单行 JSON 字符串**（不含换行符）。如有换行，SSE 协议会将多行 data 拼接，可能导致 JSON 解析错误。序列化时需对 `\n` 转义。 |
| 帧结束 | 每帧以**一个空行**（即 `\n\n`）结尾。这是 EventSource 识别帧边界的唯一依据。 |

**合规帧示例（content_delta）**：

```
id: 42
event: content_delta
data: {"type":"content_delta","messageId":"msg_01XYZ","delta":"好的，我来","index":0}

```

### 3.2 心跳帧（SSE Comment 格式）

心跳帧使用 SSE 注释语法，以冒号开头：

```
: keepalive\n\n
```

**设计决策**：心跳帧使用 comment 格式而非正常事件格式，原因：
1. 不触发 `EventSource` 的任何事件监听器，前端无需处理
2. 不会被加入 `BufferedEventLog`，不影响 `Last-Event-ID` 序号
3. 仍然能穿透代理/浏览器的 idle timeout 检测

### 3.3 帧格式实现参考

```typescript
// SSE 帧的内存表示
interface SseFrame {
  id: string;        // 单调递增计数器字符串
  event?: string;    // 可选，对应 StreamEventType
  data: string;      // JSON 字符串（已序列化，单行）
  timestamp: number; // 帧创建时的 Unix ms，用于 TTL 清理
}

/**
 * 将 SseFrame 序列化为符合 SSE 协议的字符串
 *
 * 注意：data 中的换行符必须转义，否则 EventSource 会误判帧边界。
 * Hono 的 streamSSE() helper 已处理此问题，直接使用 helper 时无需手动处理。
 */
function serializeSseFrame(frame: SseFrame): string {
  // JSON.stringify 产生的字符串默认不含换行，但 data 如果来自用户输入则可能含有
  // 此处做防御性处理
  const safeData = frame.data.replace(/\n/g, "\\n");

  const parts: string[] = [`id: ${frame.id}`];
  if (frame.event !== undefined) {
    parts.push(`event: ${frame.event}`);
  }
  parts.push(`data: ${safeData}`);
  parts.push(""); // 空行，表示帧结束
  parts.push(""); // 合计两个 \n，即 \n\n

  return parts.join("\n");
}
```

---

## 4. 断线重连协议（Last-Event-ID）

### 4.1 背景与问题

浏览器 `EventSource` 会在连接断开时自动重连，重连请求会携带 `Last-Event-ID` header，值为最后一次成功收到的帧的 `id`。

**没有缓冲区的问题**：如果服务端在客户端断线期间产生了若干帧，重连后这些帧将永远丢失，客户端会看到不连续的 AI 输出（例如跳字、工具结果消失）。

**解决方案**：服务端维护一个 `BufferedEventLog`，缓存最近的 N 帧，重连时回放错过的帧。

### 4.2 BufferedEventLog 工作原理

`BufferedEventLog` 是一个**内存环形缓冲区**，每个 SSE 端点（会话）独享一个实例。

```
                    BufferedEventLog (maxSize = 500)
  ┌────────────────────────────────────────────────────────┐
  │  id=1  │  id=2  │  id=3  │  ...  │  id=499  │  id=500  │
  │ frame  │ frame  │ frame  │       │  frame   │  frame   │  ← 环形，满后覆盖最旧帧
  └────────────────────────────────────────────────────────┘
           ↑
      oldest                                         newest
```

**核心操作**：

| 方法 | 行为 |
|---|---|
| `push(event, data)` | 分配新 id（单调递增），创建 `SseFrame`，加入缓冲区。若缓冲区满，覆盖最旧帧，并将 `hasGap` 标记置为 `true`。 |
| `since(sinceId)` | 返回 id 严格大于 `sinceId` 的所有帧，按 id 升序排列。若 `hasGap=true` 且请求的 `sinceId` 早于缓冲区中最旧的帧，说明有帧已被覆盖，此时返回全部缓冲帧并附带 `hasGap` 警告。 |
| `clear()` | 清空缓冲区，释放内存。在会话 TTL 到期时调用。 |

### 4.3 重连完整流程

```
客户端断线（网络抖动 / 浏览器切Tab / 电脑休眠）
  │
  ▼
浏览器 EventSource 自动重连
  │  （默认等待 ~3 秒，可通过 SSE retry: 字段自定义）
  ▼
HTTP GET /api/sessions/:id/run (或对应端点)
  Headers:
    Last-Event-ID: 42   ← 客户端最后收到的帧 id
  │
  ▼
服务端中间件提取 Last-Event-ID header
  │
  ├── Last-Event-ID 为空（首次连接）
  │     └── 直接建立 SSE 连接，从当前状态开始推送
  │
  └── Last-Event-ID = "42"
        │
        ▼
      BufferedEventLog.since("42") 查询缓冲区
        │
        ├── hasGap = false，返回 [frame43, frame44, ...]
        │     └── 服务端依序回放这些帧（标注 event: replay 以便调试）
        │           └── 继续实时推送新帧
        │
        └── hasGap = true（缓冲区已溢出，帧已丢失）
              └── 推送 session_state 事件通知客户端状态
                    └── 继续实时推送（接受部分丢失）
                          （极端场景：AI 输出非常长且客户端长时间断线）
```

### 4.4 hasGap 处理策略

当 `hasGap=true` 时，服务端应在回放帧之前推送一个特殊的 `session_state` 事件：

```typescript
// hasGap 情况下的降级处理
const gapNotification: SessionStateEvent = {
  type: "session_state",
  sessionId: sessionId,
  previousState: currentState,
  currentState: currentState,
  reason: "replay_buffer_overflow: some frames were lost during reconnect",
};
```

前端收到此通知后，可选择提示用户"部分内容可能丢失，建议刷新页面"，而不是静默出现不连续的内容。

### 4.5 TTL 清理机制

每个 `BufferedEventLog` 实例与一个会话绑定，在会话结束后继续保留一段时间（用于最后的重连场景）。

```
会话结束（message_end 推送完毕）
  │
  ├── 设置 TTL 定时器：30 分钟后清理 EventLog
  │
  └── 30 分钟后
        BufferedEventLog.clear()  → 释放内存
        删除 sessionId → BufferedEventLog 的映射关系
```

**为什么是 30 分钟**：
- 远超浏览器 EventSource 的最大重连等待时间（通常 < 1 分钟）
- 适应用户关掉 Tab 后短时间内重新打开的场景
- 500 帧 × 平均 500 bytes/帧 = ~250KB，30 分钟占用可接受

---

## 5. 心跳机制

### 5.1 为什么需要心跳

在以下场景中，空闲的 HTTP 长连接会被强制关闭：

| 场景 | 默认超时 |
|---|---|
| 浏览器对非活跃连接的 idle timeout | 通常 2-5 分钟 |
| Nginx/Apache 反向代理的 proxy_read_timeout | 默认 60 秒 |
| 操作系统的 TCP keepalive | 通常 2 小时（太长） |
| AI 工具执行耗时较长（例如编译项目） | 可能超过 60 秒 |

虽然本项目是本地运行（无反向代理），但工具执行可能超过 60 秒，浏览器自身的超时也可能触发。心跳是防御性措施。

### 5.2 心跳规范

```
发送间隔：每 15 秒一次
发送格式：: keepalive\n\n  （SSE comment 帧）
计入 EventLog：否
计入 Last-Event-ID：否
```

**为什么 15 秒**：

- 远小于所有已知代理的默认 60 秒超时
- 足够频繁以维持连接活性
- 不会对性能产生可测量的影响（comment 帧只有 15 字节）

### 5.3 实现要点

```typescript
// 心跳定时器应在 SSE 连接建立时启动，连接关闭时清除
// 使用 AbortSignal 或 stream close 事件来确保定时器不泄漏

const KEEPALIVE_INTERVAL_MS = 15_000;

async function startKeepalive(
  stream: WritableStream,
  signal: AbortSignal
): Promise<void> {
  const intervalId = setInterval(async () => {
    if (signal.aborted) {
      clearInterval(intervalId);
      return;
    }
    // SSE comment 帧，不触发任何 EventSource 事件监听器
    await writeSseKeepAlive(stream);
  }, KEEPALIVE_INTERVAL_MS);

  // 确保连接关闭时定时器一定被清除，防止内存泄漏
  signal.addEventListener("abort", () => clearInterval(intervalId));
}
```

---

## 6. SSE 端点清单

| 端点 | HTTP 方法 | 触发的事件类型 | 用途描述 |
|---|---|---|---|
| `/api/sessions/:id/run` | POST | `message_start`, `content_delta`, `tool_use`, `tool_result`, `message_end`, `error`, `session_state` | AI 对话流。POST 方法避免 URL 长度限制（请求体携带用户消息）。响应体是 SSE 流。 |
| `/api/projects/:id/files/watch` | GET | `file_change` | 文件系统变更实时监控。GET 无请求体，通过 query param 传递过滤条件（如监控路径）。 |

**关于 `/run` 端点使用 POST 的说明**：

SSE 通常与 GET 请求关联，但本端点使用 POST 是有意为之：
1. 用户消息（prompt）可能很长，不适合放在 URL 中
2. 避免浏览器历史记录、CDN 缓存记录敏感内容
3. POST 正文可携带完整的会话上下文配置

---

## 7. 服务端实现规范

### 7.1 目录结构

```
server/
└── lib/
    └── sse/
        ├── writer.ts        # SSE 帧写入工具函数
        ├── event-log.ts     # BufferedEventLog 实现
        └── keepalive.ts     # 心跳定时器管理
```

### 7.2 `lib/sse/writer.ts` — 帧写入层

```typescript
// lib/sse/writer.ts
//
// 职责：封装所有与 SSE 协议帧格式相关的底层写入操作。
// 调用方（路由 handler）只需调用这些函数，无需关心帧序列化细节。
//
// 设计决策：
//   - setSseHeaders 必须在响应体写入任何内容之前调用，否则 headers 已锁定
//   - writeSseFrame 和 writeSseKeepAlive 返回 Promise，调用方必须 await，
//     否则并发写入会导致帧交叉（corrupted frames）

import type { Context } from "hono";

// SSE 帧的内存表示，用于在写入函数之间传递
export interface SseFrame {
  id: string;
  event?: string;
  data: string;
  timestamp: number;
}

/**
 * 为 Hono Context 的响应设置 SSE 必需的 HTTP 头。
 *
 * 必须在流式响应开始前调用一次。
 *
 * @param c - Hono Context 对象
 */
export function setSseHeaders(c: Context): void {
  // text/event-stream 是 SSE 规范要求的 Content-Type
  c.header("Content-Type", "text/event-stream");
  // 禁止任何代理/浏览器对响应体做缓冲，确保帧实时到达客户端
  c.header("Cache-Control", "no-cache");
  // 保持 HTTP 长连接
  c.header("Connection", "keep-alive");
  // 允许跨域（如前端 dev server 端口与后端不同）
  c.header("Access-Control-Allow-Origin", "*");
  // 允许跨域请求携带 Last-Event-ID header
  c.header("Access-Control-Allow-Headers", "Last-Event-ID, Cache-Control");
}

/**
 * 将一个 SseFrame 写入 SSE 流。
 *
 * 调用方必须 await 此函数，确保帧按序写入，避免并发写入导致帧混淆。
 *
 * @param writer - WritableStreamDefaultWriter，从 SSE 流获取
 * @param frame  - 要写入的 SSE 帧
 * @throws       - 如果底层写入失败（例如客户端已断开），会抛出错误
 */
export async function writeSseFrame(
  writer: WritableStreamDefaultWriter<string>,
  frame: SseFrame
): Promise<void> {
  // 防御性检查：data 不能包含换行符，否则 EventSource 会误判帧边界
  const safeData = frame.data.replace(/\n/g, "\\n");

  const parts: string[] = [`id: ${frame.id}`];

  if (frame.event !== undefined && frame.event.length > 0) {
    parts.push(`event: ${frame.event}`);
  }

  parts.push(`data: ${safeData}`);
  // 两个 \n：一个结束 data 字段，一个作为帧分隔空行
  parts.push("\n");

  await writer.write(parts.join("\n"));
}

/**
 * 写入一个 SSE 心跳 comment 帧。
 *
 * comment 帧不触发任何 EventSource 事件监听器，仅用于维持连接活性。
 * 心跳帧不应写入 BufferedEventLog。
 *
 * @param writer - WritableStreamDefaultWriter
 */
export async function writeSseKeepAlive(
  writer: WritableStreamDefaultWriter<string>
): Promise<void> {
  // SSE comment 格式：以冒号开头，后跟任意文本，以双换行结束
  await writer.write(": keepalive\n\n");
}
```

### 7.3 `lib/sse/event-log.ts` — 事件缓冲层

```typescript
// lib/sse/event-log.ts
//
// 职责：实现断线重连所需的帧缓冲区（内存环形队列）。
//
// 设计说明：
//   使用 Array + 指针模拟环形缓冲区，避免频繁的数组 shift 操作（O(n)）。
//   环形结构保证 push 操作始终是 O(1)。
//
// 内存估算：
//   500 帧 × 平均 500 bytes/帧 = 250KB per session。
//   对于本地工具应用，这个内存占用完全可接受。

export interface SseFrame {
  id: string;
  event?: string;
  data: string;
  timestamp: number;
}

// 环形缓冲区溢出时附加在 since() 返回值中的元信息
export interface SinceResult {
  frames: SseFrame[];
  /** true 表示缓冲区曾经溢出，请求的 sinceId 之前可能有帧已丢失 */
  hasGap: boolean;
}

export class BufferedEventLog {
  // 环形缓冲区（预分配固定大小）
  private readonly buffer: Array<SseFrame | undefined>;
  // 下一个写入位置的指针（对 maxSize 取模）
  private writeIndex: number = 0;
  // 当前缓冲区中有效帧的数量（达到 maxSize 后不再增长）
  private size: number = 0;
  // 单调递增的帧 ID 计数器
  private idCounter: number = 0;
  // 缓冲区是否发生过溢出（即有帧被覆盖）
  private hasGap: boolean = false;

  constructor(private readonly maxSize: number = 500) {
    // 预分配数组，避免运行时动态扩容
    this.buffer = new Array<SseFrame | undefined>(maxSize).fill(undefined);
  }

  /**
   * 向缓冲区追加一帧，并返回已创建的帧（含分配的 id）。
   *
   * @param event - SSE 事件类型（对应 StreamEventType）
   * @param data  - 事件 payload，将被 JSON 序列化为单行字符串
   * @returns       完整的 SseFrame，可直接传给 writeSseFrame()
   */
  push(event: string, data: unknown): SseFrame {
    const frame: SseFrame = {
      id: String(++this.idCounter),
      event,
      // JSON.stringify 确保 data 是单行字符串（不含换行）
      data: JSON.stringify(data),
      timestamp: Date.now(),
    };

    // 如果当前位置已有帧（缓冲区满，触发覆盖），标记 hasGap
    if (this.buffer[this.writeIndex] !== undefined) {
      this.hasGap = true;
    }

    this.buffer[this.writeIndex] = frame;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
    this.size = Math.min(this.size + 1, this.maxSize);

    return frame;
  }

  /**
   * 获取 id 严格大于 sinceId 的所有帧，按 id 升序排列。
   *
   * 用于断线重连时回放错过的帧。
   *
   * @param sinceId - 客户端 Last-Event-ID header 的值
   * @returns         帧列表 + hasGap 标记
   */
  since(sinceId: string): SinceResult {
    const sinceIdNum = parseInt(sinceId, 10);

    if (isNaN(sinceIdNum)) {
      // sinceId 格式非法，返回全部缓冲帧
      return { frames: this.getAllFrames(), hasGap: this.hasGap };
    }

    const frames = this.getAllFrames().filter(
      (frame) => parseInt(frame.id, 10) > sinceIdNum
    );

    return { frames, hasGap: this.hasGap };
  }

  /**
   * 清空缓冲区，释放内存。
   * 在会话 TTL 到期时调用。
   */
  clear(): void {
    this.buffer.fill(undefined);
    this.writeIndex = 0;
    this.size = 0;
    this.hasGap = false;
    // 注意：idCounter 不重置，保持单调性，防止清理后的连接误判帧序
  }

  /**
   * 将环形缓冲区的内容按时间序（id 升序）转换为有序数组。
   *
   * 内部工具方法，供 since() 使用。
   */
  private getAllFrames(): SseFrame[] {
    if (this.size === 0) return [];

    if (this.size < this.maxSize) {
      // 缓冲区未满，直接取前 size 个元素（已按序）
      return this.buffer.slice(0, this.size) as SseFrame[];
    }

    // 缓冲区已满（环形），需要将两段拼接：从 writeIndex 到末尾，再从头到 writeIndex
    const tail = this.buffer.slice(this.writeIndex) as SseFrame[];
    const head = this.buffer.slice(0, this.writeIndex) as SseFrame[];
    return [...tail, ...head];
  }

  /** 当前缓冲区中的帧数量（调试用） */
  get frameCount(): number {
    return this.size;
  }

  /** 最新分配的帧 ID（调试用） */
  get latestId(): string {
    return String(this.idCounter);
  }
}
```

---

## 8. 客户端消费规范

### 8.1 基本 EventSource 用法

```typescript
// 建立 SSE 连接的基础模式
// 注意：EventSource 不支持设置请求头（无法传 Authorization），
// 如需认证，通过 URL query param 或 cookie 传递 token。

const url = `/api/sessions/${sessionId}/events`;
const source = new EventSource(url);

// 监听通用 message 事件（对应未指定 event: 字段的帧）
source.addEventListener("message", (e: MessageEvent<string>) => {
  // 所有帧的 data 都是 JSON 字符串，需要手动 parse
  const payload = JSON.parse(e.data) as StreamEvent;
  console.log("received:", payload);
});

// 监听具名事件（对应帧的 event: 字段）
source.addEventListener("content_delta", (e: MessageEvent<string>) => {
  const delta = JSON.parse(e.data) as ContentDeltaEvent;
  appendText(delta.delta);
});

source.addEventListener("message_end", (e: MessageEvent<string>) => {
  const end = JSON.parse(e.data) as MessageEndEvent;
  showUsageStats(end.usage);
  source.close(); // 对话结束，主动关闭 EventSource，避免不必要的重连
});

source.addEventListener("error", (e: MessageEvent<string>) => {
  const error = JSON.parse(e.data) as ErrorEvent;
  showError(error.message);
  if (!error.retryable) {
    source.close(); // 不可重试的错误，主动关闭
  }
});

// 连接错误（网络断开等），此时 e 是 Event 类型，不是 MessageEvent
source.onerror = (e: Event) => {
  // EventSource 会自动重连，此处可以显示"重连中..."状态
  console.warn("SSE connection error, EventSource will retry automatically", e);
};
```

### 8.2 与 TanStack Query 的集成模式

TanStack Query 的 `useQuery` 天然适合管理 EventSource 的生命周期：

```typescript
// hooks/useAiStream.ts
//
// 将 EventSource 的生命周期与 React 组件/TanStack Query 绑定。
//
// 设计思路：
//   - useQuery 的 queryFn 负责建立 EventSource 连接
//   - 通过 zustand / useState 存储流式输出的累积文本
//   - EventSource 的 close() 在 useQuery 的 cleanup 中调用
//
// 注意：这里使用 enabled 选项控制何时建立连接，
// 仅在用户发送消息后（hasActiveRun=true）才建立 SSE 连接。

import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

interface UseAiStreamOptions {
  sessionId: string;
  /** 是否激活 SSE 连接（用户发送消息后设为 true） */
  enabled: boolean;
  onDelta: (text: string) => void;
  onEnd: (usage: MessageEndEvent["usage"]) => void;
  onError: (error: ErrorEvent) => void;
}

export function useAiStream({
  sessionId,
  enabled,
  onDelta,
  onEnd,
  onError,
}: UseAiStreamOptions) {
  const sourceRef = useRef<EventSource | null>(null);

  const query = useQuery({
    queryKey: ["ai-stream", sessionId],
    enabled,
    // staleTime: Infinity 防止 TanStack Query 因认为数据过期而重新 fetch（重连由 EventSource 自己管）
    staleTime: Infinity,
    queryFn: () =>
      new Promise<void>((resolve, reject) => {
        const source = new EventSource(`/api/sessions/${sessionId}/events`);
        sourceRef.current = source;

        source.addEventListener("content_delta", (e: MessageEvent<string>) => {
          const delta = JSON.parse(e.data) as ContentDeltaEvent;
          onDelta(delta.delta);
        });

        source.addEventListener("message_end", (e: MessageEvent<string>) => {
          const end = JSON.parse(e.data) as MessageEndEvent;
          onEnd(end.usage);
          source.close();
          resolve(); // 通知 TanStack Query 本次 query 成功完成
        });

        source.addEventListener("error", (e: MessageEvent<string>) => {
          const error = JSON.parse(e.data) as ErrorEvent;
          onError(error);
          if (!error.retryable) {
            source.close();
            reject(new Error(error.message)); // 通知 TanStack Query 失败
          }
          // retryable=true 时，让 EventSource 自动重连，不 reject
        });

        source.onerror = () => {
          // 网络层错误，EventSource 正在自动重连，不做额外处理
        };
      }),
  });

  const close = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  return { ...query, close };
}
```

### 8.3 DevTools 调试指南

1. 打开 Chrome DevTools → Network 面板
2. 过滤类型：选择 **"Fetch/XHR"** 或在 Filter 框输入 `event-stream`
3. 找到目标请求，点击 → 选择 **"EventStream"** 标签页
4. 可实时看到每一帧的 `id`、`event`、`data` 字段

这是 SSE 相对于 WebSocket 的重大调试优势。

---

## 9. URL 长度保护

### 9.1 问题背景

SSE 标准连接方式使用 GET 请求，请求体通过 URL query params 传递。但 URL 存在长度限制：

| 客户端/服务端 | URL 长度上限 |
|---|---|
| Chrome/Firefox | ~32,768 字符 |
| Safari | ~80,000 字符 |
| Hono/Bun HTTP 服务器 | 约 16KB（与底层 HTTP 解析器有关） |
| 保守安全阈值（参考 dever 经验） | **1800 字节** |

### 9.2 降级策略

本项目的 `/api/sessions/:id/run` 端点已使用 **POST 方法**，规避了 URL 长度问题（请求体无长度限制）。

但如果未来有端点必须使用 GET + SSE 模式（例如文件监控端点的过滤条件），需要实现以下降级：

```typescript
// client/lib/sse-client.ts
//
// URL 长度保护：当 URL 超过安全阈值时，自动降级到 POST + ReadableStream 模式。
//
// SSE（EventSource）vs Fetch ReadableStream 的区别：
//   - EventSource：浏览器原生实现，自动重连，支持 Last-Event-ID
//   - Fetch ReadableStream：手动实现，需要自己解析 SSE 帧，自己处理重连

const SSE_URL_MAX_BYTES = 1800;

interface SseConnectionOptions {
  url: string;
  params?: Record<string, string>;
  onFrame: (frame: { event: string; data: string; id: string }) => void;
}

export function connectSse(options: SseConnectionOptions): () => void {
  const { url, params = {}, onFrame } = options;

  const queryString = new URLSearchParams(params).toString();
  const fullUrl = queryString.length > 0 ? `${url}?${queryString}` : url;
  const urlBytes = new TextEncoder().encode(fullUrl).length;

  if (urlBytes <= SSE_URL_MAX_BYTES) {
    // 正常路径：使用原生 EventSource（支持自动重连）
    return connectViaEventSource(fullUrl, onFrame);
  }

  // 降级路径：URL 过长，改用 POST + fetch ReadableStream
  // 注意：此模式下浏览器不会自动重连，需要调用方处理断线重连
  console.warn(
    `[SSE] URL length ${urlBytes} exceeds safe limit ${SSE_URL_MAX_BYTES}, ` +
      `falling back to POST + ReadableStream mode. Auto-reconnect is disabled.`
  );
  return connectViaFetchStream(url, params, onFrame);
}

function connectViaEventSource(
  url: string,
  onFrame: SseConnectionOptions["onFrame"]
): () => void {
  const source = new EventSource(url);

  // 转发所有具名事件到统一的 onFrame 回调
  const eventTypes: StreamEventType[] = [
    "message_start",
    "content_delta",
    "tool_use",
    "tool_result",
    "message_end",
    "error",
    "session_state",
    "file_change",
  ];

  for (const eventType of eventTypes) {
    source.addEventListener(eventType, (e: MessageEvent<string>) => {
      onFrame({ event: eventType, data: e.data, id: e.lastEventId });
    });
  }

  return () => source.close();
}

function connectViaFetchStream(
  url: string,
  params: Record<string, string>,
  onFrame: SseConnectionOptions["onFrame"]
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok || response.body === null) {
        throw new Error(`SSE fetch failed: ${response.status}`);
      }

      // 手动解析 SSE 帧
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let currentId = "";
      let currentEvent = "";
      let currentData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split("\n");
        // 保留最后一个未完成的行
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("id: ")) {
            currentId = line.slice(4);
          } else if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6);
          } else if (line === "") {
            // 空行：帧结束，触发回调
            if (currentData.length > 0) {
              onFrame({ event: currentEvent, data: currentData, id: currentId });
            }
            // 重置当前帧状态
            currentId = "";
            currentEvent = "";
            currentData = "";
          }
          // 忽略 comment 行（以 : 开头）
        }
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        console.error("[SSE] fetch stream error:", err);
      }
    }
  })();

  return () => controller.abort();
}
```

### 9.3 关键差异对照

| 特性 | EventSource | POST + fetch ReadableStream |
|---|---|---|
| 自动重连 | ✅ 浏览器原生支持 | ❌ 需自行实现 |
| Last-Event-ID | ✅ 自动携带 | ❌ 需手动记录并在重连时传递 |
| 代码复杂度 | 低 | 高（需手动解析 SSE 帧文本） |
| URL 长度限制 | 受限（1800 字节阈值） | 无限制 |
| 适用场景 | 绝大多数情况 | URL 超长的边界场景 |

---

## 附录 A：完整类型汇总（可直接复制使用）

```typescript
// types/sse.ts — 项目 SSE 协议完整类型定义

// ============================================================
// 核心枚举与联合类型
// ============================================================

export type StreamEventType =
  | "message_start"
  | "content_delta"
  | "tool_use"
  | "tool_result"
  | "message_end"
  | "error"
  | "keepalive"
  | "file_change"
  | "session_state";

export type SessionState = "idle" | "running" | "waiting_tool" | "error";

// ============================================================
// 各事件 Payload 类型
// ============================================================

export interface MessageStartEvent {
  type: "message_start";
  messageId: string;
  sessionId: string;
  model: string;
  timestamp: number;
}

export interface ContentDeltaEvent {
  type: "content_delta";
  messageId: string;
  delta: string;
  index: number;
}

export interface ToolUseEvent {
  type: "tool_use";
  messageId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ToolResultEvent {
  type: "tool_result";
  messageId: string;
  toolCallId: string;
  isError: boolean;
  content: string;
  durationMs: number;
}

export interface MessageEndEvent {
  type: "message_end";
  messageId: string;
  stopReason: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence";
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  durationMs: number;
}

export interface SseErrorEvent {
  type: "error";
  messageId: string | null;
  code:
    | "UPSTREAM_TIMEOUT"
    | "UPSTREAM_RATE_LIMIT"
    | "TOOL_EXECUTION_FAILED"
    | "SESSION_NOT_FOUND"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
  retryAfterMs: number;
}

export interface FileChangeEvent {
  type: "file_change";
  projectId: string;
  changeType: "created" | "modified" | "deleted" | "renamed";
  filePath: string;
  oldFilePath?: string;
  modifiedAt: number;
}

export interface SessionStateEvent {
  type: "session_state";
  sessionId: string;
  previousState: SessionState;
  currentState: SessionState;
  reason: string;
}

// ============================================================
// 所有事件的判别联合类型（Discriminated Union）
// 用于类型收窄（switch / if 判断 type 字段后自动推断具体类型）
// ============================================================

export type StreamEvent =
  | MessageStartEvent
  | ContentDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | MessageEndEvent
  | SseErrorEvent
  | FileChangeEvent
  | SessionStateEvent;

// ============================================================
// 协议层类型
// ============================================================

export interface SseFrame {
  id: string;
  event?: string;
  data: string;
  timestamp: number;
}

export interface SinceResult {
  frames: SseFrame[];
  hasGap: boolean;
}
```

---

## 附录 B：错误码与 HTTP 状态码映射

| 错误码 | HTTP 状态码 | 说明 |
|---|---|---|
| `UPSTREAM_TIMEOUT` | 504 | AI API 超时，建议重试 |
| `UPSTREAM_RATE_LIMIT` | 429 | AI API 限流，等待 retryAfterMs 后重试 |
| `TOOL_EXECUTION_FAILED` | 200 | 通过 SSE error 事件传递（HTTP 连接已建立，错误通过流传递） |
| `SESSION_NOT_FOUND` | 404 | 会话不存在，在 SSE 连接建立前即返回 HTTP 404 |
| `INTERNAL_ERROR` | 500 | 服务端未预期错误，建议不自动重试 |

> **注意**：一旦 SSE 连接建立（HTTP 200 已响应），所有后续错误只能通过 SSE `error` 事件帧传递，而不能再改变 HTTP 状态码。这是 SSE 协议的固有限制。
