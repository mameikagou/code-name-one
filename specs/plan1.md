Plan: 最小路径打通前后端 + Headless 组件重构                                         

 Context

 项目 code-name-one 是一个 Codex 风格的本地 AI
 编程工作台。当前前端有完整骨架（三栏布局、主题系统）但全是 mock 数据，后端只有 12
 行代码（/api/health）。specs 里有详尽的架构设计但代码完全没跟上。

 目标：用最小工作量打通"创建会话 -> 发消息 ->
 看到回复"的端到端流程，同时将前端组件重构为 Headless + Styled 模式。

 核心策略：
 - 跳过 SSE，先用简单的 POST 请求返回 mock AI 回复（后续替换为 SSE 流）
 - 直接上 SQLite + Drizzle（不搞内存 mock，Drizzle schema 已在 specs 里设计好）
 - Vite 已配好 /api -> :3000 代理，无需处理 CORS

 ---
 Step 0: 安装依赖 & 配置

 server/package.json 添加依赖：
 - deps: drizzle-orm, zod, @hono/zod-validator, nanoid
 - devDeps: drizzle-kit, @types/bun

 server/tsconfig.json 创建（strict mode, @/ 别名）

 验证：bun install 成功，bun run dev:server 正常启动

 ---
 Step 1: 后端骨架 — 错误处理 + 中间件 + App 工厂

 创建文件：
 - server/src/lib/errors.ts — AppError / NotFoundError / ValidationError
 - server/src/types/common.ts — ApiResponse<T> 统一响应格式
 - server/src/middleware/error-handler.ts — 全局错误拦截
 - server/src/middleware/logger.ts — 请求日志 METHOD /path STATUS Xms
 - server/src/app.ts — createApp() 工厂函数，注册中间件 + 路由
 - server/src/index.ts — 重构为调用 createApp()

 验证：curl localhost:3000/api/health 返回 { data: { status: "ok" } }

 ---
 Step 2: 数据库层 — Schema + Client + Repositories

 创建文件：
 - server/src/db/schema.ts — 按 specs/design/database-schema.md 定义 4
 张表（projects/sessions/messages/preferences）+ Drizzle relations
 - server/src/db/client.ts — bun:sqlite + drizzle-orm/bun-sqlite，设置
 WAL/foreign_keys/busy_timeout PRAGMAs
 - server/src/db/index.ts — barrel 导出
 - server/src/db/seed.ts — 启动时确保 default project 存在（幂等）
 - server/drizzle.config.ts — drizzle-kit 配置
 - server/src/repositories/session.repository.ts — findAll / findById / create /
 updateStatus
 - server/src/repositories/message.repository.ts — findBySessionId / create

 注意：DB 路径 data/code-name-one.db，需确保 data/ 目录存在且在 .gitignore 中

 验证：bunx drizzle-kit push 建表成功

 ---
 Step 3: 后端 API — 最小可用端点

 MVP 只需 4 个端点：

 ┌────────┬────────────────────────────┬───────────────────────────────┐
 │ Method │            Path            │             用途              │
 ├────────┼────────────────────────────┼───────────────────────────────┤
 │ GET    │ /api/sessions              │ 列出所有会话（sidebar）       │
 ├────────┼────────────────────────────┼───────────────────────────────┤
 │ POST   │ /api/sessions              │ 创建新会话                    │
 ├────────┼────────────────────────────┼───────────────────────────────┤
 │ GET    │ /api/sessions/:id/messages │ 获取会话消息                  │
 ├────────┼────────────────────────────┼───────────────────────────────┤
 │ POST   │ /api/sessions/:id/messages │ 发送消息（返回 mock AI 回复） │
 └────────┴────────────────────────────┴───────────────────────────────┘

 关键设计：POST /api/sessions/:id/messages 是 MVP 的核心简化——
 1. 保存 user message 到 DB
 2. 生成 mock AI 回复（Bun.sleep(300) 模拟延迟）
 3. 保存 assistant message 到 DB
 4. 返回 { userMessage, assistantMessage }

 后续替换路径：这个端点 -> POST /sessions/:id/run (SSE 流)

 创建文件：
 - server/src/services/session.service.ts — 业务逻辑层
 - server/src/routes/sessions.route.ts — 路由 + Zod 校验
 - server/src/routes/index.ts — 路由注册

 验证：curl 测试完整 CRUD 流程

 ---
 Step 4: 前端 API Client + Hooks

 创建文件：
 - client/src/lib/api-client.ts — fetch 封装（get<T> / post<T>），base URL /api
 - client/src/types/api.ts — Session / Message / ApiResponse<T> 类型定义
 - client/src/hooks/use-sessions.ts — useSessions() (useQuery) + useCreateSession()
 (useMutation)
 - client/src/hooks/use-chat.ts — useMessages(sessionId) (useQuery) +
 useSendMessage(sessionId) (useMutation，onSuccess 时 invalidate messages query)
 - client/src/stores/session-atom.ts — selectedSessionIdAtom: atom<string | null>(null)
  连接 sidebar 和 chat

 ---
 Step 5: 前端组件重构 — 逻辑先行，UI 彻底分离

 核心原则：先把逻辑写对，UI 只给最基础的结构（无装饰样式），方便后续统一调全局样式。

 逻辑层（Headless Hooks）— 纯逻辑，零 UI

 - client/src/hooks/use-sessions.ts — 会话 CRUD 逻辑
 - client/src/hooks/use-chat.ts — 消息收发逻辑
 - client/src/stores/session-atom.ts — 选中会话状态

 容器组件 — 只负责组装 hooks + 传 props，零样式

 sidebar-container.tsx 重构：

 - 删除 MOCK_CONVERSATIONS 和 useState
 - 调用 useSessions() + useCreateSession() + selectedSessionIdAtom
 - 纯结构，样式全在子组件

 chat-container.tsx 重构：

 - 删除 INITIAL_MESSAGES、useState、setTimeout
 - 调用 useMessages(sessionId) + useSendMessage(sessionId) + 读取 selectedSessionIdAtom
 - 纯结构，样式全在子组件

 UI 组件 — 样式独立，后续统一调整

 现有展示组件保持不动（chat-input.tsx、message-list.tsx、conversation-item.tsx、convers
 ation-list.tsx），只做类型对齐。样式后续由用户统一调整全局设计系统。

 不动的组件：

 - diff-container.tsx — 与聊天流程无关
 - 所有 layout 组件 — 不动

 ---
 Step 6: 收尾 & 扩展点标记

 - 添加 loading 骨架态（sidebar 和 chat 查询 loading 时）
 - 添加 empty state（"暂无对话" / "发送消息开始"）
 - 在代码中标记 TODO：SSE 替换点、真实 AI Provider 接入点

 ---
 关键文件清单

 后端新建（~13 个文件）

 server/src/app.ts
 server/src/lib/errors.ts
 server/src/types/common.ts
 server/src/middleware/error-handler.ts
 server/src/middleware/logger.ts
 server/src/db/schema.ts
 server/src/db/client.ts
 server/src/db/index.ts
 server/src/db/seed.ts
 server/src/repositories/session.repository.ts
 server/src/repositories/message.repository.ts
 server/src/services/session.service.ts
 server/src/routes/sessions.route.ts
 server/src/routes/index.ts
 server/drizzle.config.ts

 后端修改（2 个文件）

 server/src/index.ts          — 重构为 createApp()
 server/package.json           — 添加依赖

 前端新建（5 个文件）

 client/src/lib/api-client.ts
 client/src/types/api.ts
 client/src/hooks/use-sessions.ts
 client/src/hooks/use-chat.ts
 client/src/stores/session-atom.ts

 前端修改（2 个文件）

 client/src/components/features/sidebar/sidebar-container.tsx
 client/src/components/features/chat/chat-container.tsx

 ---
 验证方案（端到端）

 启动：bun run dev（同时启动 client:5173 + server:3000）

 1. 打开 localhost:5173，sidebar 显示空列表
 2. 点击 "+" 新建按钮 -> sidebar 出现新会话
 3. 点击会话 -> 右侧 chat 面板加载（空消息）
 4. 输入消息发送 -> 用户消息出现 -> mock AI 回复出现
 5. 刷新页面 -> 数据持久化（SQLite）
 6. 再建一个会话 -> 切换会话 -> 消息隔离正确

 ---
 踩坑预警

 1. bun:sqlite 只能在 Bun 运行时用，drizzle-kit 命令必须用 bunx
 2. nanoid v5 是 ESM-only，server 已有 "type": "module" 没问题
 3. Drizzle 驱动用 drizzle-orm/bun-sqlite，不是 better-sqlite3
 4. PRAGMA foreign_keys 每次连接都要设，不会持久化到 DB 文件
 5. TanStack Query 缓存：useSendMessage 的 onSuccess 必须
 invalidateQueries(["messages", sessionId])，否则新消息不刷新
 6. 类型映射：API 返回的 Session 有 updatedAt，但 ConversationItem 要 timestamp
 字符串，需要格式化
 7. data/ 目录：确保存在 + 加入 .gitignore