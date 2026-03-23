
## 5. 技术选型

### 5.1 后端

| 技术 | 选择 | 理由 |
|------|------|------|
| 框架 | Hono (Node.js) | 轻量、现代、TypeScript 原生、生态友好 |
| 语言 | TypeScript | 前后端同构，类型共享 |
| 数据库 | SQLite () | 单机优先，零配置，足够支撑 MVP |
| ORM | Drizzle ORM | 类型安全，SQL-like API，轻量 |

### 5.2 前端

| 技术 | 选择 | 理由 |
|------|------|------|
| 框架 | React 19 | 生态成熟，并发特性 |
| 构建 | Vite | 快速 HMR，现代 ESM |
| 路由 | TanStack Router | 类型安全路由，状态管理友好 |
| 数据获取 | TanStack Query | 服务端状态管理，缓存、重试、乐观更新 |
| 状态管理 | Jotai | 原子化状态，细粒度更新 |
| UI | TailwindCSS v3 | 实用优先，快速迭代 |
| 布局 | react-resizable-panels | 桌面级分栏体验 |

### 5.3 工作流

| 工具 | 用途 |
|------|------|
| pnpm workspace | monorepo 管理 (client + server) |
| concurrently | 同时启动前后端 |
| drizzle-kit | 数据库迁移 |