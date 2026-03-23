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

## Phase 7: 前端组件拆分（基于 UI 原型 index copy.html） ✅

> 2026-03-24：按照 `specs/ui/index copy.html` 设计稿，将前端组件拆分为细粒度展示组件。
> 旧 container 组件保留（数据层），新组件为纯展示层，下一步接入。

### 共享 UI 原子 — `client/src/components/ui/`
- [x] `tag.tsx` — 标签组件
- [x] `diff-stats.tsx` — +N -M 统计显示
- [x] `icon-button.tsx` — 图标按钮
- [x] `code-inline.tsx` — 行内代码标签
- [x] `panel-header.tsx` — 通用面板顶栏

### Sidebar — `client/src/components/features/sidebar/`
- [x] `pinned-conversation-item.tsx` — 置顶会话项（Pin 图标 + 时间戳）
- [x] `project-folder-item.tsx` — 项目文件夹项
- [x] `thread-placeholder.tsx` — "无线程" 占位符
- [x] `sidebar-section.tsx` — 滚动区域容器
- [x] `sidebar-footer.tsx` — 底部设置栏
- [x] `sidebar.tsx` — 完整侧边栏组合

### Chat 主面板 — `client/src/components/features/chat/`
- [x] `breadcrumb.tsx` — 面包屑（标题 + 项目标签）
- [x] `task-list-item.tsx` — 任务勾选项
- [x] `summary-card.tsx` — 变更摘要卡片 + SummaryFileRow
- [x] `model-selector.tsx` — 模型下拉选择器
- [x] `quality-selector.tsx` — 质量档位选择器
- [x] `send-button.tsx` — 圆形发送按钮
- [x] `chat-input-v2.tsx` — 重写输入框（工具栏 + 模型/质量选择）
- [x] `chat-message-area.tsx` — 聊天内容滚动区域
- [x] `main-panel.tsx` — 完整主面板组合

### Diff 面板 — `client/src/components/features/diff-viewer/`（Monaco DiffEditor）
- [x] `monaco-diff-view.tsx` — Monaco DiffEditor 封装（跟随明暗主题）
- [x] `file-card-header.tsx` — 文件卡片头部
- [x] `file-card.tsx` — 文件 diff 卡片（内嵌 Monaco）
- [x] `diff-action-bar.tsx` — 底部操作栏（还原/暂存）
- [x] `diff-panel.tsx` — 完整 diff 面板组合

### 依赖变更
- [x] 新增 `@monaco-editor/react` + `monaco-editor`
- [x] 清理 `pnpm-lock.yaml`（项目用 bun），`bun install` 重新生成 `bun.lock`

## Phase 8: 容器层接入升级版展示组件 ✅

> 2026-03-24：将 Phase 7 拆分的原型级面板组件正式接入三个容器，替换旧的基础版渲染。
> 零后端改动，零新文件，零 API 变更。

### 展示组件 props 增强
- [x] `main-panel.tsx` — 新增 `disabled` prop 透传至 `ChatInputV2`（发送中禁用输入）
- [x] `diff-panel.tsx` — 导出 `DiffFileData` 类型供容器引用
- [x] `sidebar.tsx` — 新增 `activeConversationId`（选中高亮）、`onNewSession` + `isCreating`（新建按钮）、空列表状态

### 容器层重写
- [x] `chat-container.tsx` — 接入 `MainPanel`（PanelHeader + Breadcrumb + ChatMessageArea + ChatInputV2），从 sessions 缓存派生会话标题
- [x] `diff-container.tsx` — 接入 `DiffPanel`（FileCard + Monaco DiffEditor + DiffActionBar），扩展 mock 数据含 original/modified 代码字符串
- [x] `sidebar-container.tsx` — 接入 `Sidebar`（PinnedConversationItem + ProjectFolderItem + SidebarFooter），sessions → pinnedConversations 数据映射

### 验证
- [x] TypeScript 零错误编译通过（`bunx tsc --noEmit`）

---

## 待完成

### Phase 5: SSE 流式通信 ⏳（下一优先级）
- [ ] SSE Writer + BufferedEventLog
- [ ] `POST /sessions/:id/run` 替换 mock POST 端点
- [ ] 前端 EventSource hook 消费 SSE 流

### Phase 6: Claude Provider ⏳
- [ ] AI Provider 类型定义 + AbstractProvider 基类
- [ ] ClaudeProvider 实现（spawn CLI + 解析 NDJSON）
- [ ] ProviderRegistry

### 前端优化 ⏳
- [ ] Loading skeleton / empty state 优化
- [ ] 响应式布局适配
