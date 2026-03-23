/**
 * @file Projects 路由定义
 *
 * 设计意图：薄路由层，只负责请求校验 → 调 Service → 返回响应。
 * 完整的 CRUD 操作，路由不超过 20 行业务逻辑。
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as projectService from "../services/project.service";
import { PROVIDERS } from "../db/schema";

// ============================================================
// Zod Schemas
// ============================================================

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  path: z.string().min(1, "Path is required"),
  provider: z.enum(PROVIDERS).optional(),
  model: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  path: z.string().min(1).optional(),
  provider: z.enum(PROVIDERS).optional(),
  model: z.string().nullable().optional(),
});

// ============================================================
// 路由定义
// ============================================================

export const projectsRoute = new Hono()

  // GET /api/projects — 列表
  .get("/api/projects", (c) => {
    const projects = projectService.listProjects();
    return c.json({ data: projects });
  })

  // POST /api/projects — 创建
  .post(
    "/api/projects",
    zValidator("json", createProjectSchema),
    (c) => {
      const data = c.req.valid("json");
      const project = projectService.createProject(data);
      return c.json({ data: project }, 201);
    }
  )

  // GET /api/projects/:id — 详情
  .get("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const project = projectService.getProject(id);
    return c.json({ data: project });
  })

  // PUT /api/projects/:id — 更新
  .put(
    "/api/projects/:id",
    zValidator("json", updateProjectSchema),
    (c) => {
      const id = c.req.param("id");
      const data = c.req.valid("json");
      const project = projectService.updateProject(id, data);
      return c.json({ data: project });
    }
  )

  // DELETE /api/projects/:id — 删除
  .delete("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    projectService.deleteProject(id);
    return c.json({ data: { deleted: true } });
  });
