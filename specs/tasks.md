# Code-Name-One 后端实施任务拆分

> 按 Phase 逐步推进，每步验证后再进下一步。
> MVP 策略：先只实现 ClaudeProvider。

---

## Phase 1: 基础骨架 ✅ (完成于 2026-03-24)

### Task 1.1: 安装后端依赖 ✅
- **操作**：在 `server/` 下安装依赖
  ```bash
  cd server && bun add drizzle-orm zod @hono/zod-validator nanoid chokidar
  cd server && bun add -d drizzle-kit @types/bun
  ```
- **输入**：当前 server/package.json（只有 hono + typescript）
- **输出**：package.json 新增 6 个依赖
- **验证**：`bun install` 无报错

### Task 1.2: 创建 app.ts 工厂函数 ✅
- **操作**：新建 `server/src/app.ts`
- **设计**：
  - `createApp()` 函数返回配置好的 Hono 实例
  - 注册中间件：cors → logger → error-handler
  - 挂载所有路由模块
- **依赖文件**：`specs/design/backend-architecture.md` §4
- **验证**：TypeScript 编译无错误

### Task 1.3: 创建中间件三件套 ✅
- **操作**：新建 `server/src/middleware/` 目录
  - `cors.ts` — 开发环境放行 `localhost:5173`
  - `logger.ts` — 请求日志（method, path, status, duration ms）
  - `error-handler.ts` — 全局错误 → `{ error: { code, message, details? } }`
- **依赖文件**：`specs/design/backend-architecture.md` §7
- **验证**：故意抛错，确认 error-handler 捕获并返回统一格式

### Task 1.4: 创建基础类型和错误类 ✅
- **操作**：
  - `server/src/types/common.ts` — `ApiResponse<T>`, `PaginationParams`
  - `server/src/lib/errors.ts` — `AppError`, `NotFoundError`, `ValidationError`, `ConflictError`, `ProviderUnavailableError`
- **验证**：类型可被其他模块正常 import

### Task 1.5: 创建环境配置 ✅
- **操作**：`server/src/config/env.ts`
  - 用 Zod 定义环境变量 schema（PORT, DB_PATH, LOG_LEVEL, NODE_ENV）
  - 启动时校验，缺少必要变量则 throw
- **验证**：缺少环境变量时报清晰错误信息

### Task 1.6: 重构 index.ts 入口 ✅
- **操作**：重构 `server/src/index.ts`
  - 调用 `createApp()` 获取 Hono 实例
  - `export default { port, fetch: app.fetch }`
  - 启动时打印 banner（端口、环境、已注册路由数）
- **验证**：`bun run dev:server` 启动无报错，`GET /api/health` 返回 200

### Phase 1 整体验收 ✅
```bash
bun run dev:server
curl http://localhost:3000/api/health  # → { status: "ok", ... }
# 日志输出：GET /api/health 200 xxms
```

---

## Phase 2: 数据层 ✅ (完成于 2026-03-24)

### Task 2.1: 创建 Drizzle Schema ✅
- **操作**：`server/src/db/schema.ts`
  - 定义 4 张表：projects / sessions / messages / preferences
  - 定义 relations
  - 导出推断类型：`Project`, `NewProject`, `Session`, ...
- **依赖文件**：`specs/design/database-schema.md` §4-5
- **验证**：TypeScript 编译无错误，类型推断正确

### Task 2.2: 创建数据库客户端 ✅
- **操作**：`server/src/db/client.ts`
  - `bun:sqlite` + `drizzle-orm/bun-sqlite`
  - `PRAGMA journal_mode = WAL`
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA busy_timeout = 5000`
  - 数据库文件路径：`data/code-name-one.db`
- **依赖文件**：`specs/design/database-schema.md` §2
- **验证**：`data/code-name-one.db` 文件创建成功

### Task 2.3: 配置 drizzle-kit 并生成迁移 ✅
- **操作**：
  - 创建 `server/drizzle.config.ts`
  - 运行 `bunx drizzle-kit generate`
  - 运行 `bunx drizzle-kit push`
- **输出**：`server/src/db/migrations/0000_fluffy_random.sql`
- **验证**：SQLite 中 4 张表创建成功

### Task 2.4: 创建 Repository 层 ✅
- **操作**：`server/src/repositories/` 4 个文件
  - `project.repository.ts` — findAll / findById / findByPath / create / update / remove
  - `session.repository.ts` — findAll / findById / create / updateStatus
  - `message.repository.ts` — findBySessionId / create
  - `preference.repository.ts` — get<T> / set<T> / remove / getAll
- **依赖文件**：`specs/design/database-schema.md` §8
- **验证**：每个 Repository 方法能正确读写数据库

### Phase 2 整体验收 ✅
```bash
# 启动服务后验证：
# POST /api/projects → 创建 project → GET → 确认存在 ✅
# POST /api/sessions → 创建 session → GET → 确认存在 ✅
```

---

## Phase 3: SSE 基础设施 ✅ (完成于 2026-03-24)

### Task 3.1: 创建 SSE Writer ✅
- **操作**：`server/src/lib/sse/writer.ts`
  - `setSseHeaders(c: Context)` — Content-Type, Cache-Control, X-Accel-Buffering
  - `writeSseFrame(stream, frame: SseFrame)` — 序列化 SSE 帧
  - `writeSseKeepAlive(stream)` — 心跳 comment 帧
- **依赖文件**：`specs/design/sse-protocol.md` §7
- **验证**：手动 curl 测试 SSE 帧格式正确

### Task 3.2: 创建 BufferedEventLog ✅
- **操作**：`server/src/lib/sse/event-log.ts`
  - `BufferedEventLog` 类：push / since / clear
  - maxSize = 500 帧（滑动窗口 / 环形缓冲区）
  - TTL 清理由 SessionService 管理（30 分钟后自动清理）
- **操作**：`server/src/types/sse.ts` — SseFrame / SinceResult 类型
- **依赖文件**：`specs/design/sse-protocol.md` §4
- **验证**：环形缓冲区逻辑正确

### Task 3.3: 创建 SSE 测试端点 ✅
- **操作**：在 app.ts 中添加 `GET /api/sse-test`
  - 每秒推送一个 content_delta 事件
  - 5 秒后推送 message_end
  - 15 秒心跳
- **验证**：
  ```bash
  curl -N http://localhost:3000/api/sse-test
  # 确认：text/event-stream header + id/event/data 帧 + 心跳 ✅
  ```

### Phase 3 整体验收 ✅
- SSE 帧格式正确（id + event + data + 空行）
- 心跳每 15 秒一次
- 断线重连：Last-Event-ID → BufferedEventLog.since() 回放

---

## Phase 4: Claude Provider（MVP 核心）✅ (完成于 2026-03-24)

### Task 4.1: 创建 AI Provider 类型定义 ✅
- **操作**：`server/src/types/ai-provider.ts`
  - `ProviderType` 联合类型
  - 所有 `StreamEvent` 子类型 interface（8 种）
  - `StreamEvent` 联合类型
  - `ProviderRunContext` interface
  - `IAiProvider` interface
  - 类型守卫函数
- **依赖文件**：`specs/design/ai-provider-interface.md` §2
- **验证**：TypeScript 编译无错误

### Task 4.2: 创建 AbstractAiProvider 基类 ✅
- **操作**：`server/src/providers/base.ts`
  - `activeProcesses: Map<string, ChildProcess>`
  - `run(ctx)` — Template Method：spawn → readline → parseOutput → close
  - `cancel(sessionId)` — SIGTERM → 2.5s → SIGKILL
  - 抽象方法：`spawnProcess()`, `parseOutput()`
- **依赖文件**：`specs/design/ai-provider-interface.md` §3
- **验证**：TypeScript 编译，抽象方法签名正确

### Task 4.3: 调研 Claude CLI stream-json 格式 ✅
- **操作**：
  1. `claude --version` → 2.1.81
  2. `claude -p --output-format stream-json --verbose "hello"` 捕获输出
  3. 实测输出格式（NDJSON）：
     - `{"type":"system","subtype":"init",...}` — 初始化
     - `{"type":"assistant","message":{content:[{type:"text",text:"..."}]}}` — AI 响应
     - `{"type":"result","subtype":"success","result":"...","usage":{}}` — 完成
- **关键发现**：`--output-format stream-json` 必须配合 `--verbose` 使用
- **验证**：能手动解析 Claude CLI 的流式 JSON 输出

### Task 4.4: 实现 ClaudeProvider ✅
- **操作**：`server/src/providers/claude.ts`
  - 继承 `AbstractAiProvider`
  - `isAvailable()` — `execSync("claude --version")` 检测
  - `listModels()` — 返回 claude-opus-4-6 / claude-sonnet-4-6 / claude-haiku-4-5
  - `spawnProcess()` — spawn `claude -p --output-format stream-json --verbose "prompt"`
  - `parseOutput()` — 解析 NDJSON → StreamEvent
- **验证**：`GET /api/providers` 返回 `[{type:"claude",available:true,models:[...]}]`

### Task 4.5: 创建 ProviderRegistry ✅
- **操作**：`server/src/providers/registry.ts`
  - MVP 只注册 ClaudeProvider
  - `get(type)` / `getAvailable()` / `listRegistered()` 方法
  - 模块级单例导出 `providerRegistry`
- **验证**：`getAvailable()` 返回 `["claude"]` ✅

### Phase 4 整体验收 ✅
```bash
# 验证结果：
# 1. GET /api/providers → [{"type":"claude","available":true,"models":["claude-opus-4-6",...]}] ✅
# 2. Claude CLI 输出格式已完整映射到 StreamEvent
# 3. SIGTERM → SIGKILL 进程清理机制已实现
```

---

## Phase 5: 业务 Service + 路由 ✅ (完成于 2026-03-24)

### Task 5.1: 创建 SessionService ✅
- **操作**：重写 `server/src/services/session.service.ts`
  - `run(sessionId, prompt, onEvent, signal)` — 核心方法：
    1. 查询 session → 获取 provider 类型
    2. 从 Registry 获取 Provider，检查可用性
    3. 创建 AbortController + BufferedEventLog
    4. 保存用户消息
    5. 调用 `provider.run(ctx)`
    6. 事件同时写入 EventLog + SSE 回调
    7. content_delta 累积文本，message_end 时保存 assistant message
  - `cancel(sessionId)` — AbortController.abort() + provider.cancel()
  - `getEventLog(sessionId)` — 断线重连用
  - `isRunning(sessionId)` — 检查运行状态
  - 活跃状态：`Map<sessionId, { abortController, eventLog }>`
  - TTL 清理：30 分钟后自动释放 EventLog
- **验证**：TypeScript 编译无错误

### Task 5.2: 创建 ProjectService ✅
- **操作**：`server/src/services/project.service.ts`
  - 创建项目（校验路径存在且是目录）
  - CRUD 操作委托给 Repository
  - 路径冲突检测（ConflictError）
- **验证**：创建/查询/更新/删除项目 ✅

### Task 5.3: 创建 Sessions 路由 ✅
- **操作**：`server/src/routes/sessions.route.ts`
  - `GET /api/sessions` — 列表（支持 projectId 筛选）
  - `POST /api/sessions` — 创建会话
  - `GET /api/sessions/:id` — 详情
  - `POST /api/sessions/:id/run` — **触发 AI 对话（SSE 流）**
  - `DELETE /api/sessions/:id/run` — 取消对话
  - `GET /api/sessions/:id/messages` — 消息历史
  - `POST /api/sessions/:id/messages` — 保存消息（向后兼容）
- **验证**：每个端点返回正确的 HTTP 状态码和响应格式 ✅

### Task 5.4: 创建 Projects 路由 ✅
- **操作**：`server/src/routes/projects.route.ts`
  - `GET /api/projects` — 列表
  - `POST /api/projects` — 创建
  - `GET /api/projects/:id` — 详情
  - `PUT /api/projects/:id` — 更新
  - `DELETE /api/projects/:id` — 删除
- **验证**：CRUD 全流程 ✅

### Task 5.5: 创建 Providers 路由 ✅
- **操作**：`server/src/routes/providers.route.ts`
  - `GET /api/providers` — 返回已安装的 Provider 列表 + 模型
- **验证**：返回 `[{ type: "claude", available: true, models: [...] }]` ✅

### Task 5.6: 创建路由统一注册 ✅
- **操作**：`server/src/routes/index.ts`
  - 导入所有路由模块（sessions + projects + providers），挂载到 app
- **验证**：所有路由正确响应

### Task 5.7: 创建 FileWatcherService（可选，低优先级）
- **状态**：⏳ 延后到后续迭代
- **原因**：MVP 不需要文件监控功能

### Phase 5 整体验收 ✅
```bash
# 验证结果：
# 1. POST /api/projects → 201 Created ✅
# 2. POST /api/sessions → 201 Created ✅
# 3. GET /api/sse-test → SSE 流正确 ✅
# 4. GET /api/providers → claude available ✅
# 5. POST /api/sessions/:id/run → SSE AI 对话端点（已实现，待真实 Claude 调用验证）
# 6. DELETE /api/sessions/:id/run → 取消端点已实现
```

---

## Phase 6（后续）: 扩展 Provider

### Task 6.1: 调研并实现 CodexProvider
- JSON-RPC over stdio 协议
- 需要 `lib/process/json-rpc-client.ts`

### Task 6.2: 调研并实现 OpenCodeProvider
- 待调研具体协议

---

## 依赖关系总结

```
Phase 1 (骨架)          ✅
    ↓
Phase 2 (数据层)    Phase 3 (SSE)
    ✅                    ✅
    ↓                    ↓
         Phase 4 (Claude Provider)
              ✅
              ↓
         Phase 5 (Service + 路由)
              ✅
              ↓
         Phase 6 (扩展 Provider)
              ⏳
```

Phase 2 和 Phase 3 可以并行开发（无依赖）。
Phase 4 依赖 Phase 3（SSE 类型定义）。
Phase 5 依赖 Phase 2 + 3 + 4。

---

## 实施进度摘要

| Phase | 状态 | 完成日期 |
|-------|------|---------|
| Phase 1: 基础骨架 | ✅ 完成 | 2026-03-24 |
| Phase 2: 数据层 | ✅ 完成 | 2026-03-24 |
| Phase 3: SSE 基础设施 | ✅ 完成 | 2026-03-24 |
| Phase 4: Claude Provider | ✅ 完成 | 2026-03-24 |
| Phase 5: 业务 Service + 路由 | ✅ 完成（5.7 延后） | 2026-03-24 |
| Phase 6: 扩展 Provider | ⏳ 待开始 | - |

**新增文件清单**：
- `server/src/config/env.ts` — 环境变量校验
- `server/src/middleware/cors.ts` — CORS 中间件
- `server/src/types/sse.ts` — SSE 类型定义
- `server/src/types/ai-provider.ts` — AI Provider 类型定义
- `server/src/lib/sse/writer.ts` — SSE 帧写入工具
- `server/src/lib/sse/event-log.ts` — 断线重连缓冲区
- `server/src/providers/base.ts` — AbstractAiProvider 基类
- `server/src/providers/claude.ts` — ClaudeProvider 实现
- `server/src/providers/registry.ts` — ProviderRegistry 单例
- `server/src/repositories/project.repository.ts` — Project CRUD
- `server/src/repositories/preference.repository.ts` — Preference KV 存储
- `server/src/services/project.service.ts` — Project 业务逻辑
- `server/src/routes/projects.route.ts` — Projects CRUD 路由
- `server/src/routes/providers.route.ts` — Providers 查询路由
- `server/src/db/migrations/0000_fluffy_random.sql` — 初始迁移文件

**修改文件清单**：
- `server/src/lib/errors.ts` — 新增 ConflictError + ProviderUnavailableError
- `server/src/middleware/error-handler.ts` — 扩展状态码支持 (409, 503)
- `server/src/db/schema.ts` — 新增类型别名导出
- `server/src/app.ts` — 注册 CORS + SSE 测试端点
- `server/src/index.ts` — 使用 env 配置 + 启动 banner
- `server/src/services/session.service.ts` — 从 mock 重写为真实 AI 集成
- `server/src/routes/sessions.route.ts` — 新增 run/cancel SSE 端点
- `server/src/routes/index.ts` — 注册 projects + providers 路由
