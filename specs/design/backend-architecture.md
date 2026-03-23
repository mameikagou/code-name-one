# 后端分层架构设计文档

> **文档状态**：✅ 已定稿（v1.0）
> **创建日期**：2026-03-23
> **适用范围**：`server/` 目录下所有后端代码
> **唯一真相源（Single Source of Truth）**：本文档是后端架构的权威规范。任何涉及以下内容的变更，必须先更新本文档并经过 Code Review 确认，方可动手写代码：
> - 引入新的设计模式
> - 更改模块间的依赖关系
> - 新增或修改数据库表结构
> - 新增或修改 API 端点

---

## 目录

1. [架构概述](#1-架构概述)
2. [分层架构设计](#2-分层架构设计)
3. [完整目录结构](#3-完整目录结构)
4. [App 工厂模式](#4-app-工厂模式)
5. [API 路由清单](#5-api-路由清单)
6. [层间依赖规则](#6-层间依赖规则重要)
7. [错误处理策略](#7-错误处理策略)
8. [从 dever 吸取的教训](#8-从-dever-吸取的教训)

---

## 1. 架构概述

### 1.1 项目定位

`code-name-one` 是一个**本地 AI 编程工作台**，核心目标是在同一个 UI 壳下兼容三种主流 AI 编程 CLI 平台：

| 平台 | 状态 | 交互协议 |
|------|------|---------|
| Claude CLI | **MVP 实现** | `claude --output-format stream-json` |
| Codex CLI | 预留接口，后补 | TBD |
| OpenCode CLI | 预留接口，后补 | TBD |

本项目**不是**云服务，**不是** SaaS。它作为本机守护进程运行，通过 HTTP/SSE 与前端（`localhost:5173`）通信，通过子进程与 AI CLI 工具通信。

### 1.2 技术选型理由

| 技术 | 选择 | 理由 |
|------|------|------|
| 运行时 | **Bun** | 内置 SQLite（`bun:sqlite`）、原生 TypeScript 支持、比 Node.js 快 3-4x |
| Web 框架 | **Hono v4** | 轻量（12KB）、TypeScript-first、与 Bun 原生集成、不引入 Express 历史包袱 |
| 数据库 | **SQLite** | 单机本地工作台，零运维，Bun 原生内置，无需额外安装 |
| ORM | **Drizzle ORM** | 类型安全、SQL-like API、轻量（不像 Prisma 带 Rust 引擎）、迁移工具完善 |
| 实时通信 | **SSE（Server-Sent Events）** | 见下方 SSE vs WebSocket 决策分析 |

### 1.3 SSE vs WebSocket 决策分析

本项目选择 **SSE** 而非 WebSocket，理由如下：

```
AI CLI 通信模式分析：

  服务端 → 客户端：AI 流式输出（token streaming）  ← 占 95% 通信量，单向
  客户端 → 服务端：发送 prompt、取消任务           ← 占 5%，普通 HTTP POST 即可
```

| 维度 | SSE | WebSocket |
|------|-----|-----------|
| 通信方向 | 服务端单向推送 | 全双工 |
| 断线重连 | 浏览器原生自动重连（`retry` 字段） | 需手动实现 |
| HTTP 兼容性 | 标准 HTTP，穿透代理无障碍 | 需要协议升级握手 |
| 实现复杂度 | 低，Hono 内置支持 | 高，需要状态管理 |
| 本项目适用性 | ✅ 完全匹配单向流式输出场景 | ❌ 过度设计 |

**结论**：AI token 流、文件变更通知全部走 SSE；用户指令（发送 prompt、取消任务）走普通 HTTP POST/DELETE。

---

## 2. 分层架构设计

### 2.1 请求生命周期

```
                   ┌──────────────────────────────────────────────────────┐
                   │                   Bun HTTP Server                    │
                   └──────────────────┬───────────────────────────────────┘
                                      │ HTTP Request
                                      ▼
                   ┌──────────────────────────────────────────────────────┐
                   │                Middleware Layer                       │
                   │   cors → logger → error-handler                      │
                   └──────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
                   ┌──────────────────────────────────────────────────────┐
                   │                  Routes Layer                         │
                   │   Zod 参数校验 → 调 Service → 序列化响应              │
                   └──────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
                   ┌──────────────────────────────────────────────────────┐
                   │                 Services Layer                        │
                   │   业务编排，协调 Repository / Provider / Lib          │
                   └────────┬────────────────────┬────────────────────────┘
                            │                    │
               ┌────────────▼────────┐  ┌────────▼────────────┐
               │  Repository Layer   │  │   Provider Layer     │
               │  Drizzle ORM CRUD   │  │  AI CLI 进程管理     │
               └────────────┬────────┘  └────────┬────────────┘
                            │                    │
                   ┌────────▼────────────────────▼────────────┐
                   │                  Lib Layer                │
                   │  SSE / 子进程 / 错误类 / 工具函数          │
                   └────────────────────┬─────────────────────┘
                                        │
                   ┌────────────────────▼─────────────────────┐
                   │                Infrastructure              │
                   │  SQLite 文件 / AI CLI 进程 / 文件系统      │
                   └──────────────────────────────────────────┘
```

**简写形式（适合口头描述）**：

```
HTTP Request → [Middleware] → [Routes] → [Services] → [Repository/Provider/Lib] → [Infra]
```

---

### 2.2 Middleware 层

**职责**：横切关注点（Cross-Cutting Concerns），在请求到达业务逻辑之前/之后统一处理。

**执行顺序**（顺序很重要，不可随意调换）：

```
cors → logger → error-handler → (业务路由)
```

#### 2.2.1 cors（`middleware/cors.ts`）

```typescript
// 规则：开发环境放行 localhost:5173（Vite 默认端口）
// 生产环境不存在跨域问题（前后端同机运行）
import { cors } from "hono/cors";

export const corsMiddleware = cors({
  origin: process.env.NODE_ENV === "development" ? "http://localhost:5173" : [],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
});
```

#### 2.2.2 logger（`middleware/logger.ts`）

**必须记录的字段**：`method`、`path`、`status`、`duration(ms)`

```typescript
// 输出格式示例：
// → POST /api/sessions/run 200 142ms
// → GET  /api/projects     500 8ms  [ERROR]
```

#### 2.2.3 error-handler（`middleware/error-handler.ts`）

**全局错误捕获**，将所有未处理异常统一转换为 JSON 响应，禁止让原始错误栈泄露到客户端。

统一响应格式：

```typescript
// 成功响应
{
  "data": { ... }
}

// 错误响应
{
  "error": {
    "code": "NOT_FOUND",          // 机器可读的错误码（大写下划线）
    "message": "Session not found", // 人类可读的描述
    "details": { ... }            // 可选，调试信息（仅开发环境输出）
  }
}
```

**禁止事项**：
- ❌ 在任何路由或 Service 中直接 `return c.json({ error: "..." })` —— 必须 throw AppError，由 error-handler 统一处理
- ❌ 在错误响应中包含原始错误栈（production 环境）

---

### 2.3 Routes 层

**职责**：HTTP 协议转换层。负责三件事，仅此三件：

1. **解析入参**：path params / query string / request body（用 Zod 校验）
2. **调用 Service**：将解析后的数据传给对应 Service
3. **序列化响应**：将 Service 返回值转换为 HTTP 响应（JSON 或 SSE 流）

**规则**：
- 必须使用 `@hono/zod-validator` 做参数校验，**不允许**手写 if/else 参数校验
- 路由函数体**不超过 20 行**

**禁止事项**：
- ❌ 在路由层写任何业务逻辑（如：判断 session 是否 active、计算文件差异）
- ❌ 在路由层直接调用 Repository（必须通过 Service）
- ❌ 在路由层直接调用 Provider（必须通过 Service）
- ❌ 在路由层写 try-catch（由 error-handler 中间件统一处理）

**示例：正确写法**

```typescript
// routes/sessions.route.ts

const runSessionSchema = z.object({
  prompt: z.string().min(1).max(10000),
  workdir: z.string().optional(),
});

// ✅ 路由只做三件事：解析参数 → 调 Service → 返回响应
sessions.post("/:id/run", zValidator("json", runSessionSchema), async (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");
  // Service 负责所有业务逻辑，路由只是转发
  const stream = await sessionService.run(id, body);
  return stream; // SSE 流直接返回
});
```

---

### 2.4 Services 层

**职责**：业务编排层。这是整个后端最核心的一层，负责：

1. 协调多个 Repository（数据读写）
2. 协调 Provider（AI 进程通信）
3. 管理所有副作用（DB 写入、进程管理、文件操作）

**规则**：
- Service 之间**可以互相调用**（如 SessionService 调用 ProjectService 验证项目存在）
- Service 方法应该是原子的：要么全部成功，要么 throw Error 回滚
- 单个 Service 文件**不超过 300 行**，超出则拆分子 Service

**禁止事项**：
- ❌ Service 层不知道 HTTP 的存在（不能访问 `c.req`、不能调用 `c.json()`）
- ❌ Service 直接操作数据库 SQL（必须通过 Repository）
- ❌ 将 Hono Context 对象传入 Service

#### 关键 Services 说明

| Service | 核心职责 |
|---------|---------|
| **SessionService** | 最核心 Service。管理 AI 对话生命周期：创建 session、触发 Provider、将 AI 输出存入 DB、管理 SSE 流 |
| **ProjectService** | 项目 CRUD、工作目录验证、项目配置管理 |
| **ProviderService** | AI Provider 的路由分发（根据 provider 字段选择对应 Provider 实例） |
| **FileWatcherService** | 监听项目目录文件变更（使用 Bun `watch` API），通过 SSE 推送变更事件 |

**SessionService 业务流程**（最复杂，重点说明）：

```
POST /api/sessions/:id/run
         │
         ▼
  SessionService.run(sessionId, prompt)
         │
         ├─ 1. ProjectRepository.findById(session.projectId)  → 验证项目存在
         │
         ├─ 2. SessionRepository.updateStatus(sessionId, "running")  → DB 状态更新
         │
         ├─ 3. MessageRepository.create({ role: "user", content: prompt })  → 存用户消息
         │
         ├─ 4. ProviderService.getProvider(session.provider)  → 获取 AI Provider 实例
         │
         ├─ 5. provider.stream(prompt, workdir)  → 启动 AI CLI 子进程，获取流
         │
         ├─ 6. 流式处理：
         │      ├─ 每个 token → SSE writeSseFrame(c, token)  → 推送到前端
         │      ├─ 每个完整消息 → MessageRepository.create({ role: "assistant", content })
         │      └─ 出错/完成 → SessionRepository.updateStatus(sessionId, "idle"/"error")
         │
         └─ 7. return SSE Response
```

---

### 2.5 Repository 层

**职责**：纯数据库 CRUD 层，是数据库和业务逻辑之间的防腐层（Anti-Corruption Layer）。

**规则**：
- 只做数据库操作，返回数据，**不做任何业务判断**
- 使用 Drizzle ORM，禁止写裸 SQL 字符串（除非 Drizzle 实在无法表达的复杂查询）
- 所有方法必须有完整的 TypeScript 返回类型注解
- 数据不存在时返回 `null`，由 Service 层决定是否 throw NotFoundError

**禁止事项**：
- ❌ 在 Repository 中调用其他 Repository（数据聚合在 Service 层做）
- ❌ 在 Repository 中写业务判断（如：`if (session.status === "running") throw Error`）
- ❌ 在 Repository 中调用 Provider 或 Lib

**四个 Repository 职责**：

| Repository | 管理的数据 |
|-----------|----------|
| `project.repository.ts` | projects 表 CRUD |
| `session.repository.ts` | sessions 表 CRUD + 状态更新 |
| `message.repository.ts` | messages 表 CRUD + 按 session 分页查询 |
| `preference.repository.ts` | preferences 表（用户偏好/配置）CRUD |

**示例：正确写法**

```typescript
// repositories/session.repository.ts

export class SessionRepository {
  // ✅ 只返回数据，不做业务判断
  async findById(id: string): Promise<Session | null> {
    const result = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return result[0] ?? null;
  }

  // ✅ 注意返回 null 而不是 throw Error
  async updateStatus(id: string, status: SessionStatus): Promise<Session | null> {
    const result = await db
      .update(sessions)
      .set({ status, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .returning();
    return result[0] ?? null;
  }
}
```

---

### 2.6 Provider 层

**职责**：AI CLI 进程管理层。负责 spawn 子进程、发送 stdin 指令、解析 stdout 输出流。

**设计模式**：**策略模式（Strategy Pattern）**

```typescript
// types/ai-provider.ts

// IAiProvider 是所有 Provider 必须实现的接口（策略接口）
export interface IAiProvider {
  readonly name: string;                           // Provider 标识符（"claude" | "codex" | "opencode"）
  readonly isAvailable: () => Promise<boolean>;    // 检查 CLI 是否已安装
  readonly stream: (                               // 核心：发送 prompt，返回流式事件
    prompt: string,
    workdir: string,
    options?: ProviderStreamOptions
  ) => AsyncGenerator<StreamEvent>;
  readonly cancel: () => Promise<void>;            // 取消当前正在运行的任务
}

// StreamEvent 是所有 Provider 输出的统一类型（联合类型）
export type StreamEvent =
  | { type: "token";    content: string }           // AI 输出的单个 token
  | { type: "message";  content: string; role: "assistant" | "tool" } // 完整消息
  | { type: "error";    message: string; code?: string }
  | { type: "done";     exitCode: number };
```

**ProviderRegistry（注册表模式）**：

```typescript
// providers/registry.ts
// 统一管理所有 Provider 实例，避免散乱

export class ProviderRegistry {
  private readonly providers = new Map<string, IAiProvider>();

  register(provider: IAiProvider): void { ... }
  get(name: string): IAiProvider { ... }           // 不存在则 throw AppError
  listAvailable(): Promise<IAiProvider[]> { ... }  // 过滤掉未安装的 CLI
}
```

**三个 Provider 实现**：

| Provider | 状态 | 说明 |
|---------|------|------|
| `claude.ts` | **MVP 实现** | 调用 `claude --output-format stream-json` CLI |
| `codex.ts` | 预留骨架 | 实现 IAiProvider 接口，方法体 throw NotImplementedError |
| `opencode.ts` | 预留骨架 | 同上 |

**禁止事项**：
- ❌ Provider 层不能直接访问数据库
- ❌ Provider 层不能调用 Service 层（防止循环依赖）
- ❌ 不同 Provider 之间不能互相调用

---

### 2.7 Lib 层

**职责**：纯技术基础设施，与业务逻辑完全无关的工具代码。

#### 2.7.1 SSE 基础设施（`lib/sse/`）

```typescript
// lib/sse/writer.ts

// setSseHeaders：设置正确的 SSE 响应头
// writeSseFrame：向客户端写入一帧 SSE 数据
// keepalive：定时发送 comment 行防止连接超时（每 15 秒发一个 ": keepalive\n\n"）
```

```typescript
// lib/sse/event-log.ts

// BufferedEventLog：在内存中缓存 SSE 事件
// 用途：客户端断线重连时，可以从中间断点重放事件（基于 Last-Event-ID 头）
// 注意：缓冲区有大小上限，超出则 LRU 丢弃最旧的事件
```

#### 2.7.2 子进程管理（`lib/process/`）

```typescript
// lib/process/spawn.ts

// 安全的子进程 spawn 封装，强制要求：
// 1. 必须设置 timeout（默认 5 分钟）
// 2. 必须处理 stderr
// 3. 必须处理进程意外退出
// 4. 支持取消（AbortSignal）
```

```typescript
// lib/process/json-rpc-client.ts

// JSON-RPC over stdio 客户端
// 用于与支持 JSON-RPC 协议的 AI CLI 通信
// 提供 request(method, params) → Promise<result> 接口
```

#### 2.7.3 错误类（`lib/errors.ts`）

见 [第 7 章 错误处理策略](#7-错误处理策略)。

---

## 3. 完整目录结构

```
server/src/
│
├── index.ts                          # 入口：Bun.serve + createApp()
│                                     # 唯一职责：启动 HTTP 服务，不写业务代码
│
├── app.ts                            # Hono app 工厂函数 createApp()
│                                     # 注册中间件 + 挂载路由
│
├── config/
│   └── env.ts                        # 环境变量 Zod schema 校验
│                                     # 启动时校验，缺少必要变量直接 exit(1)
│
├── db/
│   ├── client.ts                     # Drizzle + bun:sqlite 单例
│                                     # 开启 WAL 模式（提升并发读取性能）
│                                     # 开启 PRAGMA journal_mode=WAL
│   ├── schema.ts                     # 全部表定义（projects/sessions/messages/preferences）
│   └── migrations/                   # drizzle-kit 生成的迁移文件（自动生成，禁止手动修改）
│
├── types/
│   ├── ai-provider.ts                # IAiProvider 接口 + StreamEvent 联合类型
│   ├── sse.ts                        # SseFrame 类型（data/event/id/retry 字段）
│   └── common.ts                     # ApiResponse<T> / PaginatedResponse<T> 等通用类型
│
├── lib/
│   ├── sse/
│   │   ├── writer.ts                 # setSseHeaders / writeSseFrame / keepalive
│   │   └── event-log.ts              # BufferedEventLog（断线重连事件回放）
│   ├── process/
│   │   ├── spawn.ts                  # 安全子进程 spawn（带 timeout + AbortSignal）
│   │   └── json-rpc-client.ts        # JSON-RPC over stdio 客户端
│   └── errors.ts                     # AppError / NotFoundError / ValidationError 错误类
│
├── providers/
│   ├── base.ts                       # AbstractAiProvider（实现 IAiProvider 的公共逻辑）
│   ├── claude.ts                     # ClaudeProvider（MVP 实现）
│   ├── codex.ts                      # CodexProvider（预留骨架，方法体 throw NotImplementedError）
│   ├── opencode.ts                   # OpenCodeProvider（预留骨架）
│   └── registry.ts                   # ProviderRegistry（单例，统一注册 + 查找）
│
├── repositories/
│   ├── project.repository.ts         # projects 表 CRUD
│   ├── session.repository.ts         # sessions 表 CRUD + 状态管理
│   ├── message.repository.ts         # messages 表 CRUD + 分页查询
│   └── preference.repository.ts      # preferences 表 CRUD
│
├── services/
│   ├── project.service.ts            # 项目管理业务逻辑
│   ├── session.service.ts            # 核心：AI 对话生命周期管理
│   ├── file-watcher.service.ts       # 文件变更监听（Bun watch API）
│   └── provider.service.ts           # Provider 路由分发（根据名称选 Provider 实例）
│
├── routes/
│   ├── index.ts                      # 统一注册所有路由到 app 实例
│   ├── health.route.ts               # GET /api/health
│   ├── projects.route.ts             # GET/POST/PUT/DELETE /api/projects
│   ├── sessions.route.ts             # GET/POST /api/sessions + POST/DELETE /api/sessions/:id/run
│   ├── messages.route.ts             # GET /api/sessions/:id/messages
│   ├── providers.route.ts            # GET /api/providers
│   └── files.route.ts                # GET /api/projects/:id/files + GET .../files/watch (SSE)
│
└── middleware/
    ├── cors.ts                        # CORS 配置（开发环境放行 localhost:5173）
    ├── logger.ts                      # 请求日志（method/path/status/duration）
    └── error-handler.ts               # 全局错误捕获 → 统一 JSON 格式
```

---

## 4. App 工厂模式

### 4.1 为什么用工厂模式

**不用工厂模式的写法（错误示范）**：

```typescript
// ❌ 错误写法：app 是模块级全局单例
// 问题：测试时无法 mock 依赖，多个测试用例共享状态，互相污染
const app = new Hono();
app.use(cors());
app.route("/api/projects", projectsRoute);
export default app;
```

**用工厂模式的写法（正确）**：

```typescript
// ✅ 正确写法：createApp 是工厂函数
// 优势：
// 1. 测试时每个 test case 调用 createApp() 获得全新实例，天然隔离
// 2. 依赖注入友好：可以传入 mock 的 db 或 service
// 3. 便于未来支持多实例（如：测试 + 生产同时运行）
export function createApp(deps?: AppDependencies): Hono { ... }
```

### 4.2 app.ts 完整设计

```typescript
// app.ts
// 职责：Hono app 工厂函数，注册中间件和路由
// 不包含任何业务逻辑，仅做"装配"工作

import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
import { loggerMiddleware } from "./middleware/logger";
import { errorHandler } from "./middleware/error-handler";
import { registerRoutes } from "./routes/index";
import { ProviderRegistry } from "./providers/registry";
import { ClaudeProvider } from "./providers/claude";

export interface AppDependencies {
  // 依赖注入接口：测试时可传入 mock，生产时使用默认值
  providerRegistry?: ProviderRegistry;
}

export function createApp(deps: AppDependencies = {}): Hono {
  const app = new Hono();

  // === 中间件注册（顺序不可随意调换）===

  // 1. CORS 必须最先处理，保证 OPTIONS 预检请求能正确响应
  app.use("*", corsMiddleware);

  // 2. 请求日志（在 error-handler 之前，这样 500 错误也能被记录）
  app.use("*", loggerMiddleware);

  // 3. 全局错误捕获（必须在业务路由之前注册，Hono 的 onError 会捕获后续路由的错误）
  app.onError(errorHandler);

  // === 依赖实例化 ===

  // Provider Registry（单例，生产使用默认，测试可注入 mock）
  const registry = deps.providerRegistry ?? buildDefaultRegistry();

  // === 路由注册 ===
  registerRoutes(app, { registry });

  return app;
}

function buildDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new ClaudeProvider());
  // CodexProvider 和 OpenCodeProvider 在 MVP 阶段不注册
  // 待实现后解注释：
  // registry.register(new CodexProvider());
  // registry.register(new OpenCodeProvider());
  return registry;
}
```

### 4.3 index.ts 入口设计

```typescript
// index.ts
// 职责：启动 Bun HTTP Server，仅此而已
// 不在这里写任何业务逻辑或中间件配置

import { createApp } from "./app";
import { validateEnv } from "./config/env";

// 启动时立即校验环境变量，缺少必要配置直接 crash（fail fast 原则）
const env = validateEnv();

const app = createApp();

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`✅ Server running at http://localhost:${server.port}`);
```

---

## 5. API 路由清单

所有路由统一挂载在 `/api` 前缀下。

### 5.1 完整端点列表

| Method | Path | 说明 | 返回格式 |
|--------|------|------|---------|
| `GET` | `/api/health` | 服务健康检查 | JSON |
| `GET` | `/api/projects` | 获取项目列表 | JSON |
| `POST` | `/api/projects` | 创建新项目 | JSON |
| `GET` | `/api/projects/:id` | 获取项目详情 | JSON |
| `PUT` | `/api/projects/:id` | 更新项目信息 | JSON |
| `DELETE` | `/api/projects/:id` | 删除项目 | JSON |
| `GET` | `/api/sessions` | 获取会话列表（支持 `projectId` query 过滤） | JSON |
| `POST` | `/api/sessions` | 创建新会话 | JSON |
| `GET` | `/api/sessions/:id` | 获取会话详情 | JSON |
| `POST` | `/api/sessions/:id/run` | **触发 AI 对话**，返回 SSE 流 | SSE |
| `DELETE` | `/api/sessions/:id/run` | 取消当前正在运行的 AI 对话 | JSON |
| `GET` | `/api/sessions/:id/messages` | 获取会话消息历史（分页） | JSON |
| `GET` | `/api/providers` | 获取已安装的可用 Provider 列表 | JSON |
| `GET` | `/api/projects/:id/files` | 获取项目文件树 | JSON |
| `GET` | `/api/projects/:id/files/watch` | **文件变更监听**，返回 SSE 流 | SSE |

### 5.2 SSE 端点详细说明

#### `POST /api/sessions/:id/run`

**请求体**：
```typescript
{
  prompt: string;       // 用户输入的 prompt（1-10000 字符）
  workdir?: string;     // 工作目录（可选，默认使用项目根目录）
}
```

**SSE 事件流格式**：
```
event: token
data: {"content": "Hello"}

event: token
data: {"content": " World"}

event: message
data: {"role": "assistant", "content": "Hello World", "id": "msg_xxx"}

event: done
data: {"exitCode": 0}

// 出错时：
event: error
data: {"code": "PROVIDER_TIMEOUT", "message": "AI CLI did not respond within 5 minutes"}
```

#### `GET /api/projects/:id/files/watch`

**SSE 事件流格式**：
```
event: file_change
data: {"type": "modify", "path": "src/index.ts", "timestamp": "2026-03-23T10:00:00Z"}

event: file_change
data: {"type": "create", "path": "src/new-file.ts", "timestamp": "2026-03-23T10:00:01Z"}

event: file_change
data: {"type": "delete", "path": "src/old-file.ts", "timestamp": "2026-03-23T10:00:02Z"}
```

### 5.3 通用响应格式

**成功（2xx）**：
```typescript
// 单个资源
{ "data": { "id": "...", ... } }

// 列表资源
{ "data": [...], "total": 10, "page": 1, "pageSize": 20 }
```

**错误（4xx/5xx）**：
```typescript
{ "error": { "code": "NOT_FOUND", "message": "Session not found" } }
```

---

## 6. 层间依赖规则（重要）

### 6.1 依赖规则图

```
┌─────────────────────────────────────────────────┐
│                  Routes Layer                    │
└──────────────┬──────────────────────────────────┘
               │ ✅ 允许
               ▼
┌─────────────────────────────────────────────────┐
│                 Services Layer                   │
└──────┬──────────────────┬────────────────────────┘
       │ ✅ 允许           │ ✅ 允许
       ▼                  ▼
┌──────────────┐   ┌──────────────┐
│  Repository  │   │   Provider   │
│    Layer     │   │    Layer     │
└──────┬───────┘   └──────┬───────┘
       │ ✅ 允许           │ ✅ 允许
       ▼                  ▼
┌─────────────────────────────────────────────────┐
│                   Lib Layer                      │
└─────────────────────────────────────────────────┘
```

### 6.2 允许的依赖关系

| 依赖方向 | 状态 | 说明 |
|---------|------|------|
| Routes → Services | ✅ 允许 | 路由调用 Service 处理业务 |
| Services → Repositories | ✅ 允许 | Service 通过 Repository 读写数据 |
| Services → Providers | ✅ 允许 | Service 通过 Provider 与 AI 通信 |
| Services → Lib | ✅ 允许 | Service 使用错误类、工具函数 |
| Repositories → Lib | ✅ 允许 | Repository 使用数据库 client |
| Providers → Lib | ✅ 允许 | Provider 使用子进程管理、错误类 |
| Services → Services | ✅ 允许 | 有限度的 Service 间调用（避免循环依赖） |

### 6.3 禁止的依赖关系

| 禁止方向 | 状态 | 原因 |
|---------|------|------|
| Routes → Repositories | ❌ 禁止 | 跳层：路由不应直接操作数据库，绕过业务逻辑 |
| Routes → Providers | ❌ 禁止 | 跳层：路由不应直接管理 AI 进程 |
| Repositories → Services | ❌ 禁止 | 反向依赖：Repository 不应知道 Service 的存在 |
| Repositories → Providers | ❌ 禁止 | 跨层：Repository 只管数据，不管进程 |
| Providers → Services | ❌ 禁止 | 循环依赖：会导致模块循环引用 |
| Providers → Repositories | ❌ 禁止 | 跨层：Provider 只管进程通信，不管数据库 |
| Lib → 任何业务层 | ❌ 禁止 | Lib 是最底层工具，不能依赖上层业务 |

### 6.4 依赖规则执行机制

> **注意**：当前阶段靠 Code Review 人工执行此规则。未来可引入 `dependency-cruiser` 工具自动检测层间违规。

---

## 7. 错误处理策略

### 7.1 错误类继承体系

```typescript
// lib/errors.ts

// 基础错误类：所有业务错误的父类
export class AppError extends Error {
  constructor(
    public readonly code: string,        // 机器可读错误码（大写下划线）
    public readonly message: string,     // 人类可读描述
    public readonly statusCode: number,  // 对应 HTTP 状态码
    public readonly details?: unknown    // 可选调试信息
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// 404 错误：资源不存在
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super("NOT_FOUND", `${resource} with id "${id}" not found`, 404);
  }
}

// 400 错误：请求参数不合法（Zod 校验通常不走这个，但有时 Service 层需要抛参数错误）
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

// 409 错误：资源状态冲突（如：session 正在运行时再次触发 run）
export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

// 503 错误：外部依赖不可用（如：Claude CLI 未安装）
export class ProviderUnavailableError extends AppError {
  constructor(providerName: string) {
    super("PROVIDER_UNAVAILABLE", `Provider "${providerName}" is not available. Please install the CLI.`, 503);
  }
}

// 500 错误：内部未预期错误（兜底）
export class InternalError extends AppError {
  constructor(message: string = "An unexpected error occurred") {
    super("INTERNAL_ERROR", message, 500);
  }
}
```

### 7.2 HTTP 状态码映射

| 状态码 | 错误类 | 错误码 | 场景 |
|--------|--------|--------|------|
| 400 | `ValidationError` | `VALIDATION_ERROR` | 参数格式错误 |
| 404 | `NotFoundError` | `NOT_FOUND` | 资源不存在 |
| 409 | `ConflictError` | `CONFLICT` | 状态冲突（如重复 run） |
| 503 | `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | AI CLI 未安装 |
| 500 | `InternalError` | `INTERNAL_ERROR` | 未预期内部错误 |

### 7.3 error-handler 实现逻辑

```typescript
// middleware/error-handler.ts

export const errorHandler: ErrorHandler = (err, c) => {
  // 1. 如果是我们定义的 AppError，取其结构化信息
  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          // details 仅在开发环境暴露，生产环境隐藏（防止信息泄露）
          ...(process.env.NODE_ENV === "development" && { details: err.details }),
        },
      },
      err.statusCode as StatusCode
    );
  }

  // 2. Zod 校验错误（@hono/zod-validator 抛出）
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: err.errors,
        },
      },
      400
    );
  }

  // 3. 未知错误：记录日志，对客户端返回通用 500
  console.error("[UnhandledError]", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
    500
  );
};
```

### 7.4 AI Provider 错误处理规范

Provider 调用 AI CLI 时，必须实现以下容错机制（缺一不可）：

| 机制 | 实现方式 | 说明 |
|------|---------|------|
| 超时控制 | `AbortSignal.timeout(5 * 60 * 1000)` | AI 任务最长允许 5 分钟，超时自动 kill 进程 |
| stderr 监听 | 监听子进程 stderr | 记录错误日志，转换为 `StreamEvent { type: "error" }` |
| 进程退出处理 | 监听 `process.on("exit")` | 非 0 退出码视为错误，触发 SSE error 事件 |
| 日志记录 | `console.error` + 结构化日志 | 记录 provider name、prompt 摘要、错误详情 |

---

## 8. 从 dever 吸取的教训

`dever` 是本项目的前置参考项目。通过对 `dever` 的代码库分析，发现了以下典型问题。本项目通过架构约束明确避免这些问题。

### 8.1 问题一：God File（上帝文件）

**dever 的问题**：单个文件承担过多职责，路由、业务逻辑、数据库操作混写在同一个文件里。某些核心文件超过 800 行，修改时牵一发动全身。

**本项目的解决方案**：

- 严格三层分离：`route.ts` / `service.ts` / `repository.ts` 三件套，职责单一
- **硬性规定**：单个文件超过 300 行，必须拆分（Code Review 硬卡）
- 目录结构即文档：看目录名就知道每个文件的职责

### 8.2 问题二：`any` 类型滥用

**dever 的问题**：大量使用 `any` 类型做偷懒，导致类型系统形同虚设，编译器无法发现的运行时错误频发。

**本项目的解决方案**：

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,          // 开启所有严格检查
    "noImplicitAny": true,   // 禁止隐式 any
    "strictNullChecks": true  // null/undefined 必须显式处理
  }
}
```

- CI/CD 中运行 `tsc --noEmit`，有类型错误则 build 失败
- `StreamEvent` 用联合类型，`IAiProvider` 用接口，杜绝 `any` 类型的 Provider 返回值

### 8.3 问题三：双框架混用

**dever 的问题**：同时引入了 Express 和另一个框架，导致中间件注册方式不一致，错误处理逻辑分散在两套体系里。

**本项目的解决方案**：

- **纯 Hono，不引入 Express**，所有中间件使用 Hono 的 `app.use()`
- `package.json` 中明确禁止 `express` 依赖（Code Review 检查）
- 错误处理统一用 `app.onError(errorHandler)` 一个入口

### 8.4 问题四：单 JSON 文件作为数据库

**dever 的问题**：使用 JSON 文件持久化数据，并发写入时没有锁，导致数据丢失。多进程访问时产生竞态条件。

**本项目的解决方案**：

- **SQLite + Drizzle ORM**，Bun 原生内置，天然支持 ACID 事务
- 开启 WAL 模式（Write-Ahead Logging）：`PRAGMA journal_mode=WAL`，支持一写多读并发
- Drizzle 的类型安全保证 schema 变更时编译时报错，而非运行时崩溃

### 8.5 问题五：职责散乱，没有层的概念

**dever 的问题**：函数随机分布在各个文件里，不知道去哪里找逻辑。数据库调用散落在路由回调里，API 调用夹杂在数据库操作中间。

**本项目的解决方案**：

- **强制分层**：每个业务域（projects / sessions / messages）都必须有且仅有 `route + service + repository` 三件套
- **层间依赖规则**（见第 6 章）由 Code Review 硬性执行
- 新增任何业务模块，都必须遵循三件套模板，不允许"临时文件"或"工具文件"绕过分层

### 8.6 问题六：AI 进程管理缺乏容错

**dever 的问题**：直接 `spawn` 子进程，没有超时、没有错误捕获，AI CLI 卡死时整个服务挂起。

**本项目的解决方案**：

- `lib/process/spawn.ts` 封装安全子进程管理，强制携带 `AbortSignal`
- Provider 层统一实现超时控制、stderr 捕获、进程退出处理
- SSE 流出错时推送 `{ type: "error" }` 事件，前端可以优雅降级，而不是页面白屏

---

## 附录：关键设计决策记录（ADR）

| 决策 | 选择 | 备选方案 | 选择理由 |
|------|------|---------|---------|
| 实时通信协议 | SSE | WebSocket | AI token 流是单向推送，SSE 天然契合，实现更简单 |
| 数据库 | SQLite | PostgreSQL / JSON文件 | 本地工作台无需网络数据库，Bun 原生内置 SQLite |
| ORM | Drizzle | Prisma / TypeORM | 轻量无 Rust 引擎依赖，类型安全，SQL-like API |
| AI Provider 设计模式 | Strategy Pattern | 直接 if-else | 便于添加新 Provider，符合开闭原则 |
| App 创建方式 | Factory Function | 模块级单例 | 便于测试时注入 mock 依赖 |
| MVP Provider | Claude only | 三个同时实现 | 避免过度设计，先跑通一个 Provider 的完整链路 |

---

*本文档由架构师撰写，是团队的架构设计规范。任何违反本文档约定的代码将在 Code Review 阶段被打回。*
