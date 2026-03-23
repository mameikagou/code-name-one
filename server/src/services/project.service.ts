/**
 * @file Project 业务逻辑层
 *
 * 设计意图：编排 project.repository 的调用，处理业务规则校验。
 * 创建项目时校验路径存在且是目录，防止无效路径进入数据库。
 */

import { existsSync, statSync } from "node:fs";
import { NotFoundError, ValidationError, ConflictError } from "../lib/errors";
import * as projectRepo from "../repositories/project.repository";
import type { Provider } from "../db/schema";

// ============================================================
// 从 repository 推导类型
// ============================================================

type Project = ReturnType<typeof projectRepo.findAll>[number];

// ============================================================
// Service 函数
// ============================================================

/**
 * 获取所有项目列表
 */
export function listProjects(): Project[] {
  return projectRepo.findAll();
}

/**
 * 获取单个项目详情
 *
 * @throws NotFoundError 如果项目不存在
 */
export function getProject(id: string): Project {
  const project = projectRepo.findById(id);
  if (!project) {
    throw new NotFoundError("Project", id);
  }
  return project;
}

/**
 * 创建新项目
 *
 * 业务规则：
 *   1. path 必须是已存在的目录
 *   2. path 不能与已有项目重复（数据库 UNIQUE 约束兜底，但提前检查给更好的错误信息）
 *
 * @param data - 项目创建参数
 * @throws ValidationError 如果路径不存在或不是目录
 * @throws ConflictError 如果路径已被其他项目占用
 */
export function createProject(data: {
  name: string;
  path: string;
  provider?: Provider;
  model?: string;
}): Project {
  // 1. 校验路径存在且是目录
  if (!existsSync(data.path)) {
    throw new ValidationError(`Path does not exist: ${data.path}`);
  }

  const stat = statSync(data.path);
  if (!stat.isDirectory()) {
    throw new ValidationError(`Path is not a directory: ${data.path}`);
  }

  // 2. 校验路径未被占用
  const existing = projectRepo.findByPath(data.path);
  if (existing) {
    throw new ConflictError(
      `Path "${data.path}" is already registered as project "${existing.name}"`
    );
  }

  return projectRepo.create(data);
}

/**
 * 更新项目信息
 *
 * @throws NotFoundError 如果项目不存在
 */
export function updateProject(
  id: string,
  data: {
    name?: string;
    path?: string;
    provider?: Provider;
    model?: string | null;
  }
): Project {
  // 先验证项目存在
  const existing = projectRepo.findById(id);
  if (!existing) {
    throw new NotFoundError("Project", id);
  }

  // 如果更新了 path，需要校验新路径
  if (data.path && data.path !== existing.path) {
    if (!existsSync(data.path)) {
      throw new ValidationError(`Path does not exist: ${data.path}`);
    }
    const stat = statSync(data.path);
    if (!stat.isDirectory()) {
      throw new ValidationError(`Path is not a directory: ${data.path}`);
    }
    const conflict = projectRepo.findByPath(data.path);
    if (conflict && conflict.id !== id) {
      throw new ConflictError(
        `Path "${data.path}" is already registered as project "${conflict.name}"`
      );
    }
  }

  const updated = projectRepo.update(id, data);
  if (!updated) {
    throw new NotFoundError("Project", id);
  }
  return updated;
}

/**
 * 删除项目
 *
 * CASCADE 会级联删除所有关联的 sessions 和 messages。
 *
 * @throws NotFoundError 如果项目不存在
 */
export function deleteProject(id: string): void {
  const existing = projectRepo.findById(id);
  if (!existing) {
    throw new NotFoundError("Project", id);
  }
  projectRepo.remove(id);
}
