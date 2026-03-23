/**
 * @file Diff Viewer 容器组件 — 数据 + 状态
 *
 * 职责：管理文件变更列表和 diff 展示。
 * 当前使用 mock 数据（含 original/modified 代码），后续接入真实 git diff API。
 *
 * 重构说明（本次改动）：
 *   - 原始 FileTree + 文字占位 → 委托给 DiffPanel（含 FileCard + Monaco DiffEditor）
 *   - 扩展 mock 数据，增加 original/modified 代码字符串供 Monaco 渲染
 */

import { DiffPanel, type DiffFileData } from "./diff-panel";

/**
 * 占位文件变更数据 — 后续替换为真实 diff 数据
 *
 * 包含 original/modified 代码字符串，供 Monaco DiffEditor 渲染真实的代码对比效果。
 */
const MOCK_FILES: DiffFileData[] = [
  {
    filename: "src/auth/middleware.ts",
    additions: 12,
    deletions: 3,
    language: "typescript",
    original: [
      'import { verify } from "jsonwebtoken";',
      "",
      "export function authMiddleware(req, res, next) {",
      "  const token = req.headers.authorization;",
      '  if (!token) return res.status(401).send("No token");',
      "  next();",
      "}",
    ].join("\n"),
    modified: [
      'import { verify, type JwtPayload } from "jsonwebtoken";',
      'import { logger } from "../utils/logger";',
      "",
      "export function authMiddleware(req, res, next) {",
      '  const token = req.headers.authorization?.replace("Bearer ", "");',
      "  if (!token) {",
      '    logger.warn("Missing auth token");',
      '    return res.status(401).json({ error: "Unauthorized" });',
      "  }",
      "  try {",
      "    const payload = verify(token, process.env.JWT_SECRET!) as JwtPayload;",
      "    req.user = payload;",
      "    next();",
      "  } catch {",
      '    return res.status(403).json({ error: "Invalid token" });',
      "  }",
      "}",
    ].join("\n"),
  },
  {
    filename: "src/api/routes.ts",
    additions: 25,
    deletions: 8,
    language: "typescript",
    original: [
      'import { Hono } from "hono";',
      "",
      "const app = new Hono();",
      "",
      'app.get("/health", (c) => c.json({ ok: true }));',
      "",
      "export default app;",
    ].join("\n"),
    modified: [
      'import { Hono } from "hono";',
      'import { authMiddleware } from "../auth/middleware";',
      'import { sessionRoutes } from "./sessions";',
      "",
      "const app = new Hono();",
      "",
      'app.get("/health", (c) => c.json({ ok: true }));',
      "",
      "// Protected routes",
      'app.use("/api/*", authMiddleware);',
      'app.route("/api/sessions", sessionRoutes);',
      "",
      "export default app;",
    ].join("\n"),
  },
  {
    filename: "src/utils/token.ts",
    additions: 45,
    deletions: 0,
    language: "typescript",
    original: "",
    modified: [
      'import { sign, verify, type JwtPayload } from "jsonwebtoken";',
      "",
      "const JWT_SECRET = process.env.JWT_SECRET!;",
      "const TOKEN_TTL = 60 * 60 * 24; // 24h",
      "",
      "export function createToken(userId: string): string {",
      "  return sign({ sub: userId }, JWT_SECRET, {",
      "    expiresIn: TOKEN_TTL,",
      "  });",
      "}",
      "",
      "export function verifyToken(token: string): JwtPayload {",
      "  return verify(token, JWT_SECRET) as JwtPayload;",
      "}",
    ].join("\n"),
  },
];

/**
 * Diff Viewer 容器组件
 *
 * 将 mock 数据注入 DiffPanel，后续替换为真实 API 数据。
 */
export function DiffContainer() {
  return (
    <DiffPanel
      label="未暂存"
      files={MOCK_FILES}
      onRevertAll={() => {
        // TODO: 接入真实 git revert
      }}
      onStageAll={() => {
        // TODO: 接入真实 git stage
      }}
    />
  );
}
