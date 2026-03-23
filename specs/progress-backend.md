# 后端进度追踪

> 最后更新：2026-03-24

---

## Phase 1: 基础骨架 ✅

- [x] 安装后端依赖（drizzle-orm, zod, @hono/zod-validator, nanoid, drizzle-kit, @types/bun）
- [x] `server/tsconfig.json`（strict mode）
- [x] `server/src/lib/errors.ts` — AppError / NotFoundError / ValidationError / ConflictError / ProviderUnavailableError
- [x] `server/src/types/common.ts` — ApiResponse<T> 统一响应格式
- [x] `server/src/middleware/error-handler.ts` — 全局错误拦截（支持 400/404/409/503/500）
- [x] `server/src/middleware/logger.ts` — 请求日志（method, path, status, duration ms）
- [x] `server/src/middleware/cors.ts` — CORS 配置（开发环境放行 localhost:5173）
- [x] `server/src/config/env.ts` — Zod 环境变量校验（PORT, DB_PATH, LOG_LEVEL, NODE_ENV）
- [x] `server/src/app.ts` — createApp() 工厂函数，中间件顺序 cors → logger → routes → onError
- [x] `server/src/index.ts` — 使用 env 配置 + 启动 banner

## Phase 2: 数据层 ✅

- [x] `server/src/db/schema.ts` — 4 张表（projects/sessions/messages/preferences）+ relations + 类型别名导出
- [x] `server/src/db/client.ts` — bun:sqlite + drizzle-orm，WAL/foreign_keys/busy_timeout/synchronous PRAGMAs
- [x] `server/src/db/seed.ts` — 启动时确保 default project 存在
- [x] `server/drizzle.config.ts` — drizzle-kit 配置
- [x] `server/src/db/migrations/0000_fluffy_random.sql` — 初始迁移文件
- [x] `server/src/repositories/session.repository.ts` — findAll / findById / create / updateStatus
- [x] `server/src/repositories/message.repository.ts` — findBySessionId / create
- [x] `server/src/repositories/project.repository.ts` — findAll / findById / findByPath / create / update / remove
- [x] `server/src/repositories/preference.repository.ts` — get<T> / set<T> / remove / getAll（upsert 语义）
- [x] `bunx drizzle-kit generate` + `push` 建表成功

## Phase 3: SSE 基础设施 ✅

- [x] `server/src/types/sse.ts` — SseFrame / SinceResult 类型定义
- [x] `server/src/lib/sse/writer.ts` — setSseHeaders / writeSseFrame / writeSseKeepAlive（15s 心跳）
- [x] `server/src/lib/sse/event-log.ts` — BufferedEventLog 环形缓冲区（maxSize=500, since() 断线重连回放, hasGap 标记）
- [x] `GET /api/sse-test` — SSE 测试端点（每秒 content_delta × 5 → message_end）
- [x] curl 验证：text/event-stream header + id/event/data 帧格式正确

## Phase 4: Claude Provider（MVP 核心）✅

- [x] `server/src/types/ai-provider.ts` — ProviderType / StreamEvent（8 种事件）/ ProviderRunContext / IAiProvider 接口 / 类型守卫
- [x] `server/src/providers/base.ts` — AbstractAiProvider 基类（Template Method: spawn → readline → parseOutput → close, SIGTERM → 2.5s → SIGKILL）
- [x] Claude CLI 调研：`claude -p --output-format stream-json --verbose`，NDJSON 三种事件（system/assistant/result）
- [x] `server/src/providers/claude.ts` — ClaudeProvider（isAvailable / listModels / spawnProcess / parseOutput）
- [x] `server/src/providers/registry.ts` — ProviderRegistry 单例（MVP 仅注册 Claude）
- [x] `GET /api/providers` 验证：`[{type:"claude", available:true, models:["claude-opus-4-6","claude-sonnet-4-6","claude-haiku-4-5"]}]`

## Phase 5: 业务 Service + 路由 ✅

- [x] `server/src/services/session.service.ts` — 从 mock 重写为真实 AI 集成
  - `run(sessionId, prompt, onEvent, signal)` — AI 对话核心流程
  - `cancel(sessionId)` — AbortController.abort() + provider.cancel()
  - `getEventLog(sessionId)` — 断线重连
  - `isRunning(sessionId)` — 运行状态检查
  - 活跃状态存储：Map<sessionId, {abortController, eventLog}>，30 分钟 TTL 清理
- [x] `server/src/services/project.service.ts` — Project CRUD + 路径校验（existsSync + isDirectory + 冲突检测）
- [x] `server/src/routes/sessions.route.ts` — 升级：新增 GET /:id 详情 + POST /:id/run（SSE 流）+ DELETE /:id/run（取消）
- [x] `server/src/routes/projects.route.ts` — 完整 CRUD（GET/POST/GET:id/PUT:id/DELETE:id）
- [x] `server/src/routes/providers.route.ts` — GET /api/providers
- [x] `server/src/routes/index.ts` — 统一注册 sessions + projects + providers 路由

### 端到端验证结果
```
GET  /api/health     → 200 ✅
GET  /api/providers  → 200 [claude available] ✅
GET  /api/projects   → 200 ✅
POST /api/projects   → 201 ✅
GET  /api/sessions   → 200 ✅
POST /api/sessions   → 201 ✅
GET  /api/sse-test   → 200 SSE stream ✅
```

---

## 待完成

### Task 5.7: FileWatcherService（低优先级）⏳
- [ ] `server/src/services/file-watcher.service.ts` — chokidar 文件监控
- [ ] `server/src/routes/files.route.ts` — GET /projects/:id/files + SSE 变更流

### Phase 6: 扩展 Provider ⏳
- [ ] CodexProvider（JSON-RPC over stdio）
- [ ] OpenCodeProvider（待调研）

### 前端对接新端点 ⏳
- [ ] 前端 SSE 流消费 hook（替换旧的 POST /messages 调用）
- [ ] 前端 Projects CRUD UI
- [ ] 前端 Provider 选择 UI
