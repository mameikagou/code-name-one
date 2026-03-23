Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Plan: 将拆分的 UI 原型组件接入前端主流程               

 Context

 上次 commit (87cfb57) 按 HTML 原型拆分了 25+ 个细粒度展示组件，但它们未接入主
 流程。当前三个容器组件仍在使用基础版本的子组件，原型级的
 MainPanel、DiffPanel、Sidebar
 处于"孤立"状态。本次任务是把这些升级版组件正式接入容器层，让前端 UI 匹配 HTML
  原型设计。

 ---
 Step 1: 修改 MainPanel — 透传 disabled prop

 文件: client/src/components/features/chat/main-panel.tsx

 - 在 MainPanelProps 增加 disabled?: boolean
 - 透传给 <ChatInputV2 disabled={disabled} />

 原因: ChatContainer
 需要在发送消息期间禁用输入框（sendMessage.isPending），MainPanel 目前不支持此
  prop。

 ---
 Step 2: 导出 DiffFileData 类型

 文件: client/src/components/features/diff-viewer/diff-panel.tsx

 - 将 interface DiffFileData 改为 export interface DiffFileData

 原因: DiffContainer 需要引用此类型来定义 mock 数据。

 ---
 Step 3: Sidebar 增加 activeConversationId + 新建按钮 + 空列表处理

 文件: client/src/components/features/sidebar/sidebar.tsx

 - 在 SidebarProps 增加 activeConversationId?: string
 - 透传给每个 PinnedConversationItem 的 isActive={conv.id ===
 activeConversationId}
 - 增加 onNewSession?: () => void、isCreating?: boolean
 props，在顶部渲染"新建会话"按钮
 - 处理 pinnedConversations 为空时显示空状态提示

 ---
 Step 4: ChatContainer 接入 MainPanel

 文件: client/src/components/features/chat/chat-container.tsx

 改动要点：
 1. 导入 MainPanel 替代 ChatInput
 2. 通过 useSessions() 的缓存数据派生当前会话标题（不新增 API 请求）
 3. 将 MessageList 作为 children 传入 MainPanel
 4. 透传 disabled={sendMessage.isPending} 到 MainPanel
 5. 空状态（!sessionId）保持不变

 // 伪代码
 const { data: sessions } = useSessions();
 const sessionTitle = sessions?.find(s => s.id === sessionId)?.title ?? "New
 conversation";

 return (
   <MainPanel title={sessionTitle} onSend={handleSend} 
 disabled={sendMessage.isPending}>
     {isLoading ? <Spinner /> : <MessageList messages={messages ?? []} />}
   </MainPanel>
 );

 ---
 Step 5: DiffContainer 接入 DiffPanel

 文件: client/src/components/features/diff-viewer/diff-container.tsx

 改动要点：
 1. 扩展 MOCK_FILES，增加 original / modified 代码字符串和 language，供 Monaco
  DiffEditor 渲染
 2. 导入 DiffPanel 和 DiffFileData 类型
 3. 替换全部 JSX 为 <DiffPanel files={MOCK_FILES} />
 4. 移除 useState、FileTree、GitBranch 等旧引用

 ---
 Step 6: SidebarContainer 接入 Sidebar

 文件: client/src/components/features/sidebar/sidebar-container.tsx

 改动要点：
 1. 导入 Sidebar 替代 ConversationList + 手写 header
 2. 将 sessions 映射为 pinnedConversations 格式：{ id, title, time }
 3. 硬编码一个 projectFolders（当前 API 无文件夹概念）
 4. 传入 activeConversationId={selectedId} +
 onConversationClick={setSelectedId}
 5. 将新建会话逻辑传入 Sidebar 组件
 6. 保留 loading / 空状态处理

 ---
 修改文件清单

 ┌────────────────────────────────┬──────────┬─────────────────────────────┐
 │              文件              │ 改动类型 │            说明             │
 ├────────────────────────────────┼──────────┼─────────────────────────────┤
 │ chat/main-panel.tsx            │ 小改     │ +disabled prop              │
 ├────────────────────────────────┼──────────┼─────────────────────────────┤
 │ diff-viewer/diff-panel.tsx     │ 一行     │ export DiffFileData         │
 ├────────────────────────────────┼──────────┼─────────────────────────────┤
 │ sidebar/sidebar.tsx            │ 中改     │ +activeConversationId,      │
 │                                │          │ +新建按钮, +空状态          │
 ├────────────────────────────────┼──────────┼─────────────────────────────┤
 │ chat/chat-container.tsx        │ 重写     │ 接入 MainPanel              │
 ├────────────────────────────────┼──────────┼─────────────────────────────┤
 │ diff-viewer/diff-container.tsx │ 重写     │ 接入 DiffPanel + 扩展 mock  │
 ├────────────────────────────────┼──────────┼─────────────────────────────┤
 │ sidebar/sidebar-container.tsx  │ 重写     │ 接入 Sidebar                │
 └────────────────────────────────┴──────────┴─────────────────────────────┘

 零后端改动，零新文件，零 API 变更。

 ---
 验证方式

 1. cd client && bun run dev 启动前端
 2. cd server && bun run dev 启动后端
 3. 验证三栏布局正常渲染：
   - 左栏 Sidebar：显示会话列表 + 项目文件夹 + 底部设置
   - 中栏 Chat：顶部面包屑 + 消息区域 + 增强输入框（含模型/质量选择器）
   - 右栏 Diff：文件卡片列表 + Monaco DiffEditor + 操作栏
 4. 功能验证：新建会话 → 选中会话 → 发送消息 → 收到回复
 5. TypeScript 编译通过：bun run typecheck（如有）
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌