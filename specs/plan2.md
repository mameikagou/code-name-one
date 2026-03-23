前端组件拆分计划：基于 index copy.html UI 原型                                              

 Context

 当前 client/src/components/ 下已有一套 MVP 组件（ConversationItem、ChatInput、DiffContainer
  等），但与 specs/ui/index copy.html 的 UI 设计存在较大差距。需要按照 HTML
 原型重写前端组件，粒度尽量细，方便后续组装和替换。

 已有架构：React 19 + Tailwind CSS + CSS Variables (tokens.css) + Jotai + TanStack
 Router/Query + lucide-react icons + react-resizable-panels。

 组件拆分清单

 按照 HTML 原型从外到内、从左到右拆分。所有组件放 client/src/components/ 下。

 1. Layout 层（已有，需改造）

 ┌──────────┬──────────────────────┬────────────────────────────────────────────────┐
 │   组件   │         路径         │                      说明                      │
 ├──────────┼──────────────────────┼────────────────────────────────────────────────┤
 │ AppShell │ layout/app-shell.tsx │ 改造 三栏布局：Sidebar + MainPanel + DiffPanel │
 └──────────┴──────────────────────┴────────────────────────────────────────────────┘

 2. Sidebar 区域 — features/sidebar/

 #: 2.1
 组件名: WindowControls
 Props: —
 说明: 红黄绿三个圆点（macOS 窗口控件）
 ────────────────────────────────────────
 #: 2.2
 组件名: PinnedConversationItem
 Props: title: string, time: string, isActive?: boolean
 说明: 置顶的会话项（无图标，有时间戳）
 ────────────────────────────────────────
 #: 2.3
 组件名: ProjectFolderItem
 Props: name: string, icon?: ReactNode, isActive?: boolean, children?: ReactNode
 说明: 项目文件夹项（带文件夹图标）
 ────────────────────────────────────────
 #: 2.4
 组件名: ThreadPlaceholder
 Props: text: string
 说明: 文件夹下的"无线程"子项（缩进、小字）
 ────────────────────────────────────────
 #: 2.5
 组件名: SidebarSection
 Props: children: ReactNode
 说明: 滚动区域容器
 ────────────────────────────────────────
 #: 2.6
 组件名: SidebarFooter
 Props: children: ReactNode
 说明: 底部设置栏
 ────────────────────────────────────────
 #: 2.7
 组件名: Sidebar
 Props: 组合以上
 说明: 完整侧边栏容器

 3. Main Chat Panel — features/chat/

 #: 3.1
 组件名: PanelHeader
 Props: left: ReactNode, right?: ReactNode
 说明: 通用面板顶栏（Main 和 Diff 都用）
 ────────────────────────────────────────
 #: 3.2
 组件名: Breadcrumb
 Props: title: string, tag?: string
 说明: 面包屑：标题 + 标签
 ────────────────────────────────────────
 #: 3.3
 组件名: IconButton
 Props: icon: ReactNode, onClick?: () => void
 说明: 通用图标按钮（.btn-icon）
 ────────────────────────────────────────
 #: 3.4
 组件名: TaskListItem
 Props: completed: boolean, label: ReactNode, children?: ReactNode
 说明: 任务勾选项
 ────────────────────────────────────────
 #: 3.5
 组件名: CodeInline
 Props: children: string
 说明: 行内代码标签
 ────────────────────────────────────────
 #: 3.6
 组件名: SummaryCard
 Props: title: string, additions: number, deletions: number, files: SummaryFile[], onUndo?:
   () => void
 说明: 变更摘要卡片
 ────────────────────────────────────────
 #: 3.7
 组件名: SummaryFileRow
 Props: name: string, additions: number, deletions: number
 说明: 摘要卡片内的单行文件
 ────────────────────────────────────────
 #: 3.8
 组件名: ChatInput
 Props: 重写：placeholder?: string, modelName: string, qualityLevel: string, onSend: (msg:
   string) => void
 说明: 输入框 + 工具栏（模型选择器、质量档位、附件按钮、发送按钮）
 ────────────────────────────────────────
 #: 3.9
 组件名: ModelSelector
 Props: model: string, onChange?: () => void
 说明: 模型下拉选择器
 ────────────────────────────────────────
 #: 3.10
 组件名: QualitySelector
 Props: level: string, onChange?: () => void
 说明: 质量档位选择器（超高/标准等）
 ────────────────────────────────────────
 #: 3.11
 组件名: SendButton
 Props: disabled?: boolean, onClick?: () => void
 说明: 圆形发送按钮
 ────────────────────────────────────────
 #: 3.12
 组件名: ChatMessageArea
 Props: children: ReactNode
 说明: 聊天内容滚动区域
 ────────────────────────────────────────
 #: 3.13
 组件名: MainPanel
 Props: 组合以上
 说明: 完整主面板

 4. Diff Panel — features/diff-viewer/

 ┌─────┬─────────────────┬───────────────────────────────────┬──────────────────────────┐
 │  #  │     组件名      │               Props               │           说明           │
 ├─────┼─────────────────┼───────────────────────────────────┼──────────────────────────┤
 │ 4.1 │ DiffPanelHeader │ label: string, count: number      │ 右面板顶栏（"未暂存" +   │
 │     │                 │                                   │ 数量标签）               │
 ├─────┼─────────────────┼───────────────────────────────────┼──────────────────────────┤
 │     │                 │ filename: string, additions?:     │                          │
 │ 4.2 │ FileCard        │ number, deletions?: number,       │ 文件 diff 卡片外壳       │
 │     │                 │ collapsed?: boolean, children?:   │                          │
 │     │                 │ ReactNode                         │                          │
 ├─────┼─────────────────┼───────────────────────────────────┼──────────────────────────┤
 │     │                 │ filename: string, additions?:     │                          │
 │ 4.3 │ FileCardHeader  │ number, deletions?: number,       │ 文件卡片头部             │
 │     │                 │ onToggle?: () => void             │                          │
 ├─────┼─────────────────┼───────────────────────────────────┼──────────────────────────┤
 │     │                 │ type: 'added' | 'removed' |       │                          │
 │ 4.4 │ DiffLine        │ 'unchanged', lineNum: number,     │ 单行 diff                │
 │     │                 │ content: string                   │                          │
 ├─────┼─────────────────┼───────────────────────────────────┼──────────────────────────┤
 │     │                 │ type: 'added' | 'removed' |       │ 带语法高亮的 diff        │
 │ 4.5 │ DiffLineSyntax  │ 'unchanged', lineNum: number,     │ 行（JSON 等）            │
 │     │                 │ tokens: SyntaxToken[]             │                          │
 ├─────┼─────────────────┼───────────────────────────────────┼──────────────────────────┤
 │ 4.6 │ FoldedLines     │ count: number, collapsed?:        │ 折叠行指示器（"312       │
 │     │                 │ boolean, onToggle?: () => void    │ unmodified lines"）      │
 ├─────┼─────────────────┼───────────────────────────────────┼──────────────────────────┤
 │ 4.7 │ DiffLines       │ lines: DiffLineData[]             │ diff 行列表容器          │
 ├─────┼─────────────────┼───────────────────────────────────┼──────────────────────────┤
 │ 4.8 │ DiffActionBar   │ onRevertAll?: () => void,         │ 底部操作栏（还原全部 /   │
 │     │                 │ onStageAll?: () => void           │ 暂存全部）               │
 ├─────┼─────────────────┼───────────────────────────────────┼──────────────────────────┤
 │ 4.9 │ DiffPanel       │ 组合以上                          │ 完整 diff 面板           │
 └─────┴─────────────────┴───────────────────────────────────┴──────────────────────────┘

 5. 共享 UI 原子 — ui/

 ┌─────┬────────────┬─────────────────────────────┐
 │  #  │   组件名   │            说明             │
 ├─────┼────────────┼─────────────────────────────┤
 │ 5.1 │ Tag        │ 标签（.tag）                │
 ├─────┼────────────┼─────────────────────────────┤
 │ 5.2 │ DiffStats  │ +N -M 统计显示              │
 ├─────┼────────────┼─────────────────────────────┤
 │ 5.3 │ IconButton │ 如果 3.3 通用性够强就放这里 │
 └─────┴────────────┴─────────────────────────────┘

 实施步骤

 1. 新增共享原子组件：Tag, DiffStats, IconButton → ui/
 2. 重写 Sidebar：新建 2.1~2.7，替换现有 sidebar-container.tsx / conversation-item.tsx
 3. 重写 Chat 主面板：新建 3.1~3.13，替换现有 chat-container.tsx / chat-input.tsx
 4. 重写 Diff 面板：新建 4.1~4.9，替换现有 diff-container.tsx / file-tree.tsx
 5. 改造 AppShell：确保三栏布局与 HTML 原型一致
 6. 样式对齐：确保 tokens.css 中的变量覆盖所有 HTML 原型中的颜色/字体

 关键约束

 - 所有组件用 Tailwind + CSS Variables，不写行内 style（HTML 原型中的 inline style 全转
 Tailwind）
 - 图标统一用 lucide-react，不内联 SVG
 - 严格 TypeScript：所有 Props 定义 interface，禁止 any
 - 遵循现有 Container/Presentational 分层模式
 - diff 代码块后续会用 Monaco Editor 替换，当前先用纯 HTML 渲染

 验证方式

 1. pnpm --filter client dev 启动开发服务器
 2. 浏览器打开，三栏布局与 index copy.html 视觉一致
 3. 明暗主题切换正常
 4. pnpm --filter client build 无 TypeScript 报错