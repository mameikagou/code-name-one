/**
 * @file Session 业务逻辑层
 *
 * 设计意图：编排 repository 层的调用，处理业务规则校验。
 * Service 层是唯一允许抛业务错误（NotFoundError、ValidationError）的地方。
 *
 * MVP 阶段的 sendMessage 使用 mock AI 回复，后续替换为真实 LLM 调用。
 */

import { NotFoundError, ValidationError } from "../lib/errors";
import * as messageRepo from "../repositories/message.repository";
import * as sessionRepo from "../repositories/session.repository";
import { ensureDefaultProject } from "../db/seed";

// ============================================================
// 从 repository 推导类型，避免重复定义
// ============================================================

type Session = ReturnType<typeof sessionRepo.findAll>[number];
type Message = ReturnType<typeof messageRepo.findBySessionId>[number];

// ============================================================
// Service 函数
// ============================================================

/**
 * 获取 session 列表
 *
 * @param projectId - 可选，按项目过滤
 */
export function listSessions(projectId?: string): Session[] {
  return sessionRepo.findAll(projectId);
}

/**
 * 创建新 session
 *
 * 自动关联到默认项目（如果不存在则创建）。
 *
 * @param title - session 标题
 * @returns 新创建的 session
 */
export async function createSession(title: string): Promise<Session> {
  const projectId = await ensureDefaultProject();
  return sessionRepo.create({ title, projectId });
}

/**
 * 获取指定 session 的消息列表
 *
 * @param sessionId - 会话 ID
 * @returns 按时间线排序的消息列表
 * @throws NotFoundError 如果 session 不存在
 */
export function getMessages(sessionId: string): Message[] {
  // 先验证 session 存在
  const session = sessionRepo.findById(sessionId);
  if (!session) {
    throw new NotFoundError("Session", sessionId);
  }

  return messageRepo.findBySessionId(sessionId);
}

/**
 * 发送消息并获取 AI 回复（MVP mock 版本）
 *
 * 核心流程：
 *   1. 验证 session 存在且状态为 active
 *   2. 保存用户消息
 *   3. 模拟 AI 处理延迟
 *   4. 生成并保存 mock AI 回复
 *   5. 返回两条消息
 *
 * @param sessionId - 会话 ID
 * @param content - 用户消息内容
 * @returns 包含 userMessage 和 assistantMessage 的对象
 * @throws NotFoundError 如果 session 不存在
 * @throws ValidationError 如果 session 状态不是 active
 */
export async function sendMessage(
  sessionId: string,
  content: string
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  // 1. 验证 session 存在
  const session = sessionRepo.findById(sessionId);
  if (!session) {
    throw new NotFoundError("Session", sessionId);
  }

  // 2. 验证 session 状态为 active
  if (session.status !== "active") {
    throw new ValidationError(
      `Session "${sessionId}" is not active (current status: ${session.status})`
    );
  }

  // 3. 保存用户消息
  const userMessage = messageRepo.create({
    sessionId,
    role: "user",
    content,
  });

  // 4. 模拟 AI 处理延迟（MVP 阶段，后续替换为真实 LLM 调用）
  await Bun.sleep(300);

  // 5. 生成 mock AI 回复
  const mockReply = `This is a mock response to: "${content.slice(0, 50)}${content.length > 50 ? "..." : ""}"`;

  const assistantMessage = messageRepo.create({
    sessionId,
    role: "assistant",
    content: mockReply,
    metadata: { model: "mock", provider: "mock" },
  });

  return { userMessage, assistantMessage };
}
