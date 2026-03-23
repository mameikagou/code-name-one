# Code-Name-One 技术规格总览

> 本地 AI 编程工作台，兼容 Codex / Claude / OpenCode 三种平台。
> 左栏文件/项目树，中间聊天，右栏代码 Diff，底部聊天输入框。

---

## 1. 项目定位

- **产品形态**：本地桌面 Web 应用（localhost），非 SaaS
- **核心能力**：统一调度 Codex / Claude / OpenCode 三种 AI 编程 CLI，提供一致的交互体验
- **MVP 策略**：先只实现 ClaudeProvider，Codex 和 OpenCode 留接口不实现

## 2. Monorepo 结构

```
code-name-one/
├── package.json          # Bun Workspaces 根配置
├── client/               # React 前端
├── server/               # Hono 后端
└── specs/                # 架构规格文档
```

## 3. 技术选型

### 3.1 运行时 & 工具链

| 技术 | 选择 | 理由 |
|------|------|------|
| 运行时 | **Bun** | 内置 SQLite、原生 TS 支持、极速启动 |
| Monorepo | **Bun Workspaces** | 原生支持，无需 pnpm/turborepo |
| 并发启动 | `bun run --filter '*'` | 替代 concurrently，零依赖 |
| 包管理 | Bun（bun.lock） | 统一生态 |

### 3.2 后端

| 技术 | 选择 | 理由 |
|------|------|------|
| 框架 | **Hono** | 轻量、Web Standard API、原生 SSE streaming |
| 语言 | TypeScript（strict） | 零 any 策略，全量类型注解 |
| 数据库 | **SQLite**（bun:sqlite） | Bun 内置驱动，零额外依赖 |
| ORM | **Drizzle ORM** | 类型安全、SQL-like API、迁移工具完善 |
| 参数校验 | **Zod** + @hono/zod-validator | 运行时 + 编译时双重类型安全 |
| 实时通信 | **SSE**（Server-Sent Events） | 见下方选型分析 |
| 文件监控 | chokidar | 跨平台文件变更监听 |
| ID 生成 | nanoid | 紧凑、URL 安全、碰撞概率极低 |

### 3.3 前端

| 技术 | 选择 | 理由 |
|------|------|------|
| 框架 | React 19 | 生态成熟，并发特性 |
| 构建 | Vite 6 | 快速 HMR，现代 ESM |
| 路由 | TanStack Router | 类型安全路由，文件路由 |
| 数据获取 | TanStack Query v5 | 服务端状态管理，缓存、重试 |
| 状态管理 | Jotai | 原子化状态，细粒度更新 |
| UI | TailwindCSS v3 | 实用优先，快速迭代 |
| 布局 | react-resizable-panels | 桌面级三栏分栏体验 |

### 3.4 工作流

| 工具 | 用途 |
|------|------|
| drizzle-kit | 数据库迁移（generate + push） |
| TypeScript strict | 编译时类型检查（零 any） |

## 4. 实时通信选型：SSE vs WebSocket

### 决策结论：**选 SSE**

| 维度 | SSE | WebSocket |
|------|-----|-----------|
| 通信模式匹配 | **高**（90% 是服务器→客户端单向推送） | 过度设计 |
| Hono 支持 | `hono/streaming` 原生 helpers | 需额外 upgrade 适配层 |
| 断线重连 | 浏览器 `EventSource` 原生 `Last-Event-ID` | 需手动实现全套重连 |
| 调试 | 浏览器 DevTools 直接可看 | 需专用工具 |
| TanStack Query 集成 | 标准 EventSource + query invalidation | 需自定义 Provider |
| 本地环境 | 无反向代理，无限制 | 同样无限制（优势消失） |

**核心理由**：
- 用户发消息 = 一次性 POST，不需要双向常连接
- LLM 流式响应 / 终端输出 / 文件变更通知 = 全是服务器单向推送
- `BufferedEventLog` + `Last-Event-ID` 实现断线重连回放，防止网络抖动丢数据

## 5. 架构设计文档索引

| 文档 | 路径 | 内容 |
|------|------|------|
| 后端分层架构 | `specs/design/backend-architecture.md` | 分层规则、目录结构、API 路由、错误处理 |
| SSE 协议规范 | `specs/design/sse-protocol.md` | 事件类型、帧格式、断线重连、心跳 |
| AI Provider 接口 | `specs/design/ai-provider-interface.md` | IAiProvider、StreamEvent、策略模式 |
| 数据库 Schema | `specs/design/database-schema.md` | 表结构、索引、迁移、Repository 接口 |
| 主题系统 | `specs/design/theme-system.md` | CSS 变量 Token 体系、Dark/Light/System |

## 6. 从参考项目 dever 吸取的教训

| dever 的问题 | 行数/数量 | 本项目对策 |
|-------------|----------|-----------|
| God File（server.ts） | 4396 行 | 严格三层架构，单文件不超 300 行 |
| any 类型滥用 | 864 处 | strict: true + 零 any 策略 |
| 双框架混用（Express + Hono） | 迁移未完成 | 纯 Hono，不引入 Express |
| 单 JSON 文件存所有数据 | 无数据库 | SQLite + Drizzle ORM |
| 职责散乱 | 多处跨文件逻辑重复 | route + service + repository 三件套 |
| 2829 行 SSE Hook | 前端 God Hook | 拆分为多个独立 Hook |
