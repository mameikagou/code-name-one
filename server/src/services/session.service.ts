/**
 * @file Session 业务逻辑层（AI 对话生命周期管理）
 *
 * 设计意图：编排 AI 对话的完整流程：
 *   1. 创建/查询 session
 *   2. 触发 AI 对话（run）：保存用户消息 → 获取 Provider → 流式推送事件 → 保存 AI 回复
 *   3. 取消对话（cancel）：终止 AI 进程
 *   4. 断线重连（getEventLog）：回放缺失帧
 *
 * 核心数据结构：activeSessions Map 存储运行中会话的 AbortController 和 BufferedEventLog。
 * 会话结束后保留 30 分钟（供断线重连），然后自动清理。
 *
 * 层级约束：Service → Repository + Provider，不直接操作 HTTP。
 */

import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ProviderUnavailableError,
} from "../lib/errors";
import { BufferedEventLog } from "../lib/sse/event-log";
import * as messageRepo from "../repositories/message.repository";
import * as sessionRepo from "../repositories/session.repository";
import * as projectRepo from "../repositories/project.repository";
import { providerRegistry } from "../providers/registry";
import type { StreamEvent } from "../types/ai-provider";
import { ensureDefaultProject } from "../db/seed";

// ============================================================
// 类型定义
// ============================================================

type Session = ReturnType<typeof sessionRepo.findAll>[number];
type Message = ReturnType<typeof messageRepo.findBySessionId>[number];

/** 运行中会话的活跃状态 */
interface ActiveSession {
  readonly abortController: AbortController;
  readonly eventLog: BufferedEventLog;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

/** 活跃会话存储：sessionId → ActiveSession */
const activeSessions = new Map<string, ActiveSession>();

/** 会话结束后 EventLog 保留时间（30 分钟），供断线重连 */
const EVENT_LOG_TTL_MS = 30 * 60 * 1000;

// ============================================================
// 查询类 Service 函数（保留原有逻辑）
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
 */
export async function createSession(title: string): Promise<Session> {
  const projectId = await ensureDefaultProject();
  return sessionRepo.create({ title, projectId });
}

/**
 * 获取单个 session 详情
 *
 * @throws NotFoundError 如果 session 不存在
 */
export function getSession(sessionId: string): Session {
  const session = sessionRepo.findById(sessionId);
  if (!session) {
    throw new NotFoundError("Session", sessionId);
  }
  return session;
}

/**
 * 获取指定 session 的消息列表
 *
 * @throws NotFoundError 如果 session 不存在
 */
export function getMessages(sessionId: string): Message[] {
  const session = sessionRepo.findById(sessionId);
  if (!session) {
    throw new NotFoundError("Session", sessionId);
  }
  return messageRepo.findBySessionId(sessionId);
}

// ============================================================
// AI 对话核心流程
// ============================================================

/**
 * 启动 AI 对话流
 *
 * 核心流程：
 *   1. 验证 session 和 project 存在
 *   2. 检查 session 未在运行中
 *   3. 保存用户消息
 *   4. 获取 Provider 并检查可用性
 *   5. 创建 AbortController 和 BufferedEventLog
 *   6. 调用 Provider.run()，事件同时写入 EventLog 和 SSE 回调
 *   7. 累积 AI 文本，对话结束时保存 assistant message
 *   8. 更新 session 状态
 *
 * @param sessionId - 会话 ID
 * @param prompt - 用户输入
 * @param onEvent - SSE 事件回调（每个事件调用一次）
 * @param signal - 外部 AbortSignal（可选，用于 HTTP 连接断开时中止）
 *
 * @throws NotFoundError session/project 不存在
 * @throws ConflictError session 已有运行中的对话
 * @throws ProviderUnavailableError Provider CLI 不可用
 */
export async function run(
  sessionId: string,
  prompt: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  // 1. 验证 session 存在
  const session = sessionRepo.findById(sessionId);
  if (!session) {
    throw new NotFoundError("Session", sessionId);
  }

  // 2. 检查是否已有运行中的进程
  if (activeSessions.has(sessionId)) {
    throw new ConflictError(
      `Session "${sessionId}" already has a running AI process`
    );
  }

  // 3. 获取关联的 project
  const project = projectRepo.findById(session.projectId);
  if (!project) {
    throw new NotFoundError("Project", session.projectId);
  }

  // 4. 获取 Provider 并检查可用性
  const providerType = session.provider ?? "claude";
  const provider = providerRegistry.get(providerType);
  const isAvailable = await provider.isAvailable();
  if (!isAvailable) {
    throw new ProviderUnavailableError(
      providerType,
      "CLI tool is not installed or not in PATH"
    );
  }

  // 5. 保存用户消息
  messageRepo.create({
    sessionId,
    role: "user",
    content: prompt,
  });

  // 6. 创建活跃会话状态
  const abortController = new AbortController();
  const eventLog = new BufferedEventLog();

  // 如果有外部 signal（HTTP 连接断开），联动 abort
  if (signal) {
    signal.addEventListener("abort", () => {
      abortController.abort();
    }, { once: true });
  }

  // 清理之前残留的 cleanup timer（如果有的话）
  const existingActive = activeSessions.get(sessionId);
  if (existingActive?.cleanupTimer) {
    clearTimeout(existingActive.cleanupTimer);
  }

  activeSessions.set(sessionId, { abortController, eventLog });

  // 7. 累积 AI 响应文本
  let assistantText = "";
  let currentModel = session.model ?? "";

  // 8. 调用 Provider
  try {
    await provider.run({
      sessionId,
      workingDirectory: project.path,
      prompt,
      model: session.model ?? undefined,
      onEvent: (event: StreamEvent) => {
        // 写入 EventLog（供断线重连）
        eventLog.push(event.type, event);

        // 累积文本
        if (event.type === "content_delta") {
          assistantText += event.delta;
        }
        if (event.type === "message_start") {
          currentModel = event.model;
        }

        // 对话结束时保存 assistant message
        if (event.type === "message_end" && assistantText.length > 0) {
          messageRepo.create({
            sessionId,
            role: "assistant",
            content: assistantText,
            metadata: {
              model: currentModel,
              provider: providerType,
              stopReason: event.stopReason,
              usage: event.usage,
            },
          });
        }

        // 转发给 SSE 回调
        onEvent(event);
      },
      signal: abortController.signal,
    });
  } finally {
    // 9. 对话结束后设置延迟清理
    scheduleCleanup(sessionId);
  }
}

/**
 * 取消正在运行的 AI 对话
 *
 * 幂等操作：如果 session 没有运行中的对话，静默返回。
 */
export function cancel(sessionId: string): void {
  const active = activeSessions.get(sessionId);
  if (!active) return;

  active.abortController.abort();

  // 获取 session 的 provider 类型，调用 provider.cancel
  const session = sessionRepo.findById(sessionId);
  if (session) {
    const providerType = session.provider ?? "claude";
    try {
      const provider = providerRegistry.get(providerType);
      provider.cancel(sessionId);
    } catch {
      // Provider 不存在时静默处理
    }
  }
}

/**
 * 获取指定会话的 BufferedEventLog（断线重连用）
 *
 * @returns EventLog 实例或 undefined（会话从未运行或已清理）
 */
export function getEventLog(sessionId: string): BufferedEventLog | undefined {
  return activeSessions.get(sessionId)?.eventLog;
}

/**
 * 检查会话是否正在运行
 */
export function isRunning(sessionId: string): boolean {
  const active = activeSessions.get(sessionId);
  return !!active && !active.abortController.signal.aborted;
}

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 设置延迟清理：30 分钟后移除 EventLog 和 ActiveSession
 *
 * 使用 .unref() 防止 timer 阻止进程退出。
 */
function scheduleCleanup(sessionId: string): void {
  const active = activeSessions.get(sessionId);
  if (!active) return;

  const timer = setTimeout(() => {
    const entry = activeSessions.get(sessionId);
    if (entry) {
      entry.eventLog.clear();
      activeSessions.delete(sessionId);
    }
  }, EVENT_LOG_TTL_MS);

  // .unref() 让 timer 不阻止进程退出
  if (timer && typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  // 更新 active session 的 cleanup timer
  // 需要用 Object.assign 因为 ActiveSession 的其他字段是 readonly
  (active as { cleanupTimer?: ReturnType<typeof setTimeout> }).cleanupTimer = timer;
}
