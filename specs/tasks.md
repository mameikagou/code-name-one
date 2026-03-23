# Code-Name-One 后端实施任务拆分

> 按 Phase 逐步推进，每步验证后再进下一步。
> MVP 策略：先只实现 ClaudeProvider。

---

## Phase 1: 基础骨架

### Task 1.1: 安装后端依赖
- **操作**：在 `server/` 下安装依赖
  ```bash
  cd server && bun add drizzle-orm zod @hono/zod-validator nanoid chokidar
  cd server && bun add -d drizzle-kit @types/bun
  ```
- **输入**：当前 server/package.json（只有 hono + typescript）
- **输出**：package.json 新增 6 个依赖
- **验证**：`bun install` 无报错

### Task 1.2: 创建 app.ts 工厂函数
- **操作**：新建 `server/src/app.ts`
- **设计**：
  - `createApp()` 函数返回配置好的 Hono 实例
  - 注册中间件：cors → logger → error-handler
  - 挂载所有路由模块
- **依赖文件**：`specs/design/backend-architecture.md` §4
- **验证**：TypeScript 编译无错误

### Task 1.3: 创建中间件三件套
- **操作**：新建 `server/src/middleware/` 目录
  - `cors.ts` — 开发环境放行 `localhost:5173`
  - `logger.ts` — 请求日志（method, path, status, duration ms）
  - `error-handler.ts` — 全局错误 → `{ error: { code, message, details? } }`
- **依赖文件**：`specs/design/backend-architecture.md` §7
- **验证**：故意抛错，确认 error-handler 捕获并返回统一格式

### Task 1.4: 创建基础类型和错误类
- **操作**：
  - `server/src/types/common.ts` — `ApiResponse<T>`, `PaginationParams`
  - `server/src/lib/errors.ts` — `AppError`, `NotFoundError`, `ValidationError`, `ConflictError`
- **验证**：类型可被其他模块正常 import

### Task 1.5: 创建环境配置
- **操作**：`server/src/config/env.ts`
  - 用 Zod 定义环境变量 schema（PORT, DB_PATH, LOG_LEVEL）
  - 启动时校验，缺少必要变量则 throw
- **验证**：缺少环境变量时报清晰错误信息

### Task 1.6: 重构 index.ts 入口
- **操作**：重构 `server/src/index.ts`
  - 调用 `createApp()` 获取 Hono 实例
  - `export default { port, fetch: app.fetch }`
  - 启动时打印 banner（端口、环境、已注册路由数）
- **验证**：`bun run dev:server` 启动无报错，`GET /api/health` 返回 200

### Phase 1 整体验收
```bash
bun run dev:server
curl http://localhost:3000/api/health  # → { status: "ok", ... }
# 日志输出：GET /api/health 200 xxms
```

---

## Phase 2: 数据层

### Task 2.1: 创建 Drizzle Schema
- **操作**：`server/src/db/schema.ts`
  - 定义 4 张表：projects / sessions / messages / preferences
  - 定义 relations
  - 导出推断类型：`Project`, `NewProject`, `Session`, ...
- **依赖文件**：`specs/design/database-schema.md` §4-5
- **验证**：TypeScript 编译无错误，类型推断正确

### Task 2.2: 创建数据库客户端
- **操作**：`server/src/db/client.ts`
  - `bun:sqlite` + `drizzle-orm/bun-sqlite`
  - `PRAGMA journal_mode = WAL`
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA busy_timeout = 5000`
  - 数据库文件路径：`data/code-name-one.db`
- **依赖文件**：`specs/design/database-schema.md` §2
- **验证**：`data/code-name-one.db` 文件创建成功

### Task 2.3: 配置 drizzle-kit 并生成迁移
- **操作**：
  - 创建 `server/drizzle.config.ts`
  - 运行 `bunx drizzle-kit generate`
  - 运行 `bunx drizzle-kit push`
- **输出**：`server/src/db/migrations/0000_initial.sql`
- **验证**：SQLite 中 4 张表创建成功

### Task 2.4: 创建 Repository 层
- **操作**：`server/src/repositories/` 4 个文件
  - `project.repository.ts` — findAll / findById / findByPath / create / update / delete
  - `session.repository.ts` — findByProjectId / findById / create / updateStatus / delete
  - `message.repository.ts` — findBySessionId / create / createBatch
  - `preference.repository.ts` — get<T> / set<T> / delete
- **依赖文件**：`specs/design/database-schema.md` §8
- **验证**：每个 Repository 方法能正确读写数据库

### Phase 2 整体验收
```bash
# 启动服务后，通过临时测试脚本验证：
# 1. 创建 project → 查询 project → 确认存在
# 2. 创建 session → 查询 sessions by projectId → 确认关联
# 3. 创建 message → 查询 messages by sessionId → 确认关联
# 4. set preference → get preference → 确认值
```

---

## Phase 3: SSE 基础设施

### Task 3.1: 创建 SSE Writer
- **操作**：`server/src/lib/sse/writer.ts`
  - `setSseHeaders(c: Context)` — Content-Type, Cache-Control, X-Accel-Buffering
  - `writeSseFrame(stream, frame: SseFrame)` — 序列化 SSE 帧
  - `writeSseKeepAlive(stream)` — 心跳 comment 帧
- **依赖文件**：`specs/design/sse-protocol.md` §7
- **验证**：手动 curl 测试 SSE 帧格式正确

### Task 3.2: 创建 BufferedEventLog
- **操作**：`server/src/lib/sse/event-log.ts`
  - `BufferedEventLog` 类：push / since / clear
  - maxSize = 500 帧（滑动窗口）
  - TTL 清理机制（30 分钟后自动销毁）
- **操作**：`server/src/types/sse.ts` — SseFrame 类型
- **依赖文件**：`specs/design/sse-protocol.md` §4
- **验证**：
  ```
  push 10 帧 → since("5") → 返回帧 6-10
  push 600 帧 → 缓冲区仅保留最新 500 帧
  ```

### Task 3.3: 创建 SSE 测试端点
- **操作**：临时在 health route 中添加 `GET /api/sse-test`
  - 每秒推送一个 content_delta 事件
  - 5 秒后推送 message_end
  - 15 秒心跳
- **验证**：
  ```bash
  curl -N http://localhost:3000/api/sse-test
  # 确认：text/event-stream header + id/event/data 帧 + 心跳
  ```

### Phase 3 整体验收
- SSE 帧格式正确（id + event + data + 空行）
- 心跳每 15 秒一次
- 断线重连：curl 中断后重连带 Last-Event-ID，回放缺失帧

---

## Phase 4: Claude Provider（MVP 核心）

### Task 4.1: 创建 AI Provider 类型定义
- **操作**：`server/src/types/ai-provider.ts`
  - `ProviderType` 联合类型
  - 所有 `StreamEvent` 子类型 interface
  - `StreamEvent` 联合类型
  - `ProviderRunContext` interface
  - `IAiProvider` interface
  - 类型守卫函数
- **依赖文件**：`specs/design/ai-provider-interface.md` §2
- **验证**：TypeScript 编译无错误

### Task 4.2: 创建 AbstractAiProvider 基类
- **操作**：`server/src/providers/base.ts`
  - `activeProcesses: Map<string, ChildProcess>`
  - `cancel(sessionId)` — SIGTERM → 2.5s → SIGKILL
  - `finally` 块清理僵尸进程
  - 抽象方法：`spawnProcess()`, `parseOutput()`
- **依赖文件**：`specs/design/ai-provider-interface.md` §3
- **验证**：TypeScript 编译，抽象方法签名正确

### Task 4.3: 调研 Claude CLI stream-json 格式
- **操作**：
  1. 运行 `claude --help` 查看可用参数
  2. 运行 `claude --output-format stream-json --print "hello"` 捕获输出
  3. 分析输出的 JSON 行格式，映射到 StreamEvent 类型
- **输出**：记录 Claude CLI 的精确调用方式和输出格式到 specs
- **验证**：能手动解析 Claude CLI 的流式 JSON 输出

### Task 4.4: 实现 ClaudeProvider
- **操作**：`server/src/providers/claude.ts`
  - 继承 `AbstractAiProvider`
  - `isAvailable()` — `which claude` 检测
  - `listModels()` — 返回支持的模型列表
  - `spawnProcess()` — spawn claude CLI 子进程
  - `parseOutput()` — 解析 stream-json 行 → StreamEvent
- **验证**：手动触发一次对话，确认事件流正确

### Task 4.5: 创建 ProviderRegistry
- **操作**：`server/src/providers/registry.ts`
  - MVP 只注册 ClaudeProvider
  - `get(type)` / `getAvailable()` 方法
  - 单例导出
- **验证**：`getAvailable()` 返回 `["claude"]`（本机已安装时）

### Phase 4 整体验收
```bash
# 手动测试：
# 1. GET /api/providers → ["claude"]
# 2. spawn claude CLI → 收到 StreamEvent 序列
# 3. cancel → 进程被正确 kill
```

---

## Phase 5: 业务 Service + 路由

### Task 5.1: 创建 SessionService
- **操作**：`server/src/services/session.service.ts`
  - `run(sessionId, prompt, onEvent)` — 核心方法：
    1. 查询 session → 获取 provider 类型
    2. 从 Registry 获取 Provider
    3. 创建 AbortController
    4. 创建/获取 BufferedEventLog
    5. 调用 `provider.run(ctx)`
    6. 事件同时写入 EventLog + SSE 回调
  - `cancel(sessionId)` — AbortController.abort()
  - `getEventLog(sessionId)` — 断线重连用
- **依赖文件**：plan 文件中 SessionService 设计
- **验证**：配合 ClaudeProvider 完成一次完整对话流

### Task 5.2: 创建 ProjectService
- **操作**：`server/src/services/project.service.ts`
  - 创建项目（校验路径存在、是否 git repo）
  - CRUD 操作委托给 Repository
- **验证**：创建/查询/更新/删除项目

### Task 5.3: 创建 Sessions 路由
- **操作**：`server/src/routes/sessions.route.ts`
  - `GET /api/sessions` — 列表（支持 projectId 筛选）
  - `POST /api/sessions` — 创建会话
  - `GET /api/sessions/:id` — 详情
  - `POST /api/sessions/:id/run` — **触发 AI 对话（SSE 流）**
  - `DELETE /api/sessions/:id/run` — 取消对话
  - `GET /api/sessions/:id/messages` — 消息历史
- **验证**：每个端点返回正确的 HTTP 状态码和响应格式

### Task 5.4: 创建 Projects 路由
- **操作**：`server/src/routes/projects.route.ts`
  - `GET /api/projects` — 列表
  - `POST /api/projects` — 创建
  - `GET /api/projects/:id` — 详情
  - `PUT /api/projects/:id` — 更新
  - `DELETE /api/projects/:id` — 删除
- **验证**：CRUD 全流程

### Task 5.5: 创建 Providers 路由
- **操作**：`server/src/routes/providers.route.ts`
  - `GET /api/providers` — 返回已安装的 Provider 列表
- **验证**：返回 `[{ type: "claude", available: true, models: [...] }]`

### Task 5.6: 创建路由统一注册
- **操作**：`server/src/routes/index.ts`
  - 导入所有路由模块，挂载到 app
- **操作**：更新 `app.ts` 使用统一注册

### Task 5.7: 创建 FileWatcherService（可选，低优先级）
- **操作**：`server/src/services/file-watcher.service.ts`
  - chokidar 监控项目目录
  - 变更事件 → SSE 推送 file_change 事件
- **操作**：`server/src/routes/files.route.ts`
  - `GET /api/projects/:id/files` — 文件树
  - `GET /api/projects/:id/files/watch` — SSE 文件变更流
- **验证**：修改文件后 SSE 推送变更事件

### Phase 5 整体验收（端到端）
```bash
# 完整流程验证：
# 1. POST /api/projects → 创建项目
# 2. POST /api/sessions → 创建会话
# 3. POST /api/sessions/:id/run { prompt: "hello" }
#    → SSE 流：message_start → content_delta(s) → message_end
# 4. GET /api/sessions/:id/messages → 查看保存的消息
# 5. DELETE /api/sessions/:id/run → 取消正在进行的对话
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
Phase 1 (骨架)
    ↓
Phase 2 (数据层)    Phase 3 (SSE)
    ↓                    ↓
         Phase 4 (Claude Provider)
              ↓
         Phase 5 (Service + 路由)
              ↓
         Phase 6 (扩展 Provider)
```

Phase 2 和 Phase 3 可以并行开发（无依赖）。
Phase 4 依赖 Phase 3（SSE 类型定义）。
Phase 5 依赖 Phase 2 + 3 + 4。
