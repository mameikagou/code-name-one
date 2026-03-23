# 项目进度追踪

> 最后更新：2026-03-24

---

## Phase 1: 基础骨架 ✅

- [x] 安装后端依赖（drizzle-orm, zod, @hono/zod-validator, nanoid, drizzle-kit, @types/bun）
- [x] 创建 `server/tsconfig.json`（strict mode）
- [x] `server/src/lib/errors.ts` — AppError / NotFoundError / ValidationError
- [x] `server/src/types/common.ts` — ApiResponse<T> 统一响应格式
- [x] `server/src/middleware/error-handler.ts` — 全局错误拦截
- [x] `server/src/middleware/logger.ts` — 请求日志
- [x] `server/src/app.ts` — createApp() 工厂函数
- [x] `server/src/index.ts` — 重构为调用 createApp()

## Phase 2: 数据层 ✅

- [x] `server/src/db/schema.ts` — 4 张表（projects/sessions/messages/preferences）+ relations
- [x] `server/src/db/client.ts` — bun:sqlite + drizzle-orm，WAL/foreign_keys PRAGMAs
- [x] `server/src/db/seed.ts` — 启动时确保 default project 存在
- [x] `server/drizzle.config.ts` — drizzle-kit 配置
- [x] `server/src/repositories/session.repository.ts` — findAll / findById / create / updateStatus
- [x] `server/src/repositories/message.repository.ts` — findBySessionId / create
- [x] `bunx drizzle-kit push` 建表成功

## Phase 3: MVP API 端点 ✅

- [x] `GET /api/sessions` — 列出所有会话
- [x] `POST /api/sessions` — 创建新会话
- [x] `GET /api/sessions/:id/messages` — 获取会话消息
- [x] `POST /api/sessions/:id/messages` — 发送消息 + mock AI 回复（300ms 延迟）
- [x] `server/src/services/session.service.ts` — 业务逻辑层
- [x] `server/src/routes/sessions.route.ts` — 路由 + Zod 校验
- [x] curl 端到端测试全部通过

## Phase 4: 前端 API 对接 ✅

- [x] `client/src/lib/api-client.ts` — fetch 封装（apiGet/apiPost）
- [x] `client/src/types/api.ts` — Session / Message / SendMessageResponse 类型
- [x] `client/src/hooks/use-sessions.ts` — useSessions() + useCreateSession()
- [x] `client/src/hooks/use-chat.ts` — useMessages() + useSendMessage()
- [x] `client/src/stores/session-atom.ts` — selectedSessionIdAtom
- [x] `sidebar-container.tsx` 重构 — 删除 mock，接入 useSessions + Jotai
- [x] `chat-container.tsx` 重构 — 删除 mock，接入 useMessages + useSendMessage
- [x] TypeScript 零错误编译通过
- [x] `bun run dev` 前后端同时启动正常

---

## 待完成

### Phase 5: SSE 流式通信 ⏳
- [ ] SSE Writer + BufferedEventLog
- [ ] `POST /sessions/:id/run` 替换 mock POST 端点
- [ ] 前端 EventSource hook 消费 SSE 流

### Phase 6: Claude Provider ⏳
- [ ] AI Provider 类型定义 + AbstractProvider 基类
- [ ] ClaudeProvider 实现（spawn CLI + 解析 NDJSON）
- [ ] ProviderRegistry

### 前端样式优化 ⏳
- [ ] 全局设计系统统一调整
- [ ] Loading skeleton / empty state 优化
- [ ] 响应式布局适配
