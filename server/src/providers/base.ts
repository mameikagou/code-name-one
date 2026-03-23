/**
 * @file AbstractAiProvider — AI Provider 基类（Template Method 模式）
 *
 * 设计意图：封装所有 Provider 共有的子进程管理逻辑：
 *   - 进程生命周期管理（spawn → 输出解析 → 退出处理）
 *   - 中止机制（SIGTERM → 2.5s → SIGKILL）
 *   - 僵尸进程清理
 *
 * 子类只需实现两个抽象方法：
 *   - spawnProcess()：构建 CLI 命令并启动子进程
 *   - parseOutput()：将 CLI 输出行解析为 StreamEvent
 *
 * 参考：specs/design/ai-provider-interface.md §3
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  IAiProvider,
  ProviderType,
  ProviderRunContext,
  StreamEvent,
  ProviderErrorCode,
} from "../types/ai-provider";

/** 强制杀死前的等待时间 */
const SIGKILL_DELAY_MS = 2500;

export abstract class AbstractAiProvider implements IAiProvider {
  abstract readonly type: ProviderType;

  /** 活跃子进程映射：sessionId → ChildProcess */
  protected readonly activeProcesses = new Map<string, ChildProcess>();

  // ============================================================
  // 接口方法（子类必须实现）
  // ============================================================

  abstract isAvailable(): Promise<boolean>;
  abstract listModels(): Promise<readonly string[]>;

  /**
   * 启动 CLI 子进程
   *
   * @returns 已 spawn 的 ChildProcess（stdout/stderr 必须是 pipe）
   */
  protected abstract spawnProcess(ctx: ProviderRunContext): ChildProcess;

  /**
   * 将 CLI 的单行输出解析为 StreamEvent 数组
   *
   * @param line - stdout 的一行输出（通常是 JSON）
   * @param ctx - 运行上下文
   * @returns 解析出的事件数组（可能为空，表示该行被忽略）
   */
  protected abstract parseOutput(
    line: string,
    ctx: ProviderRunContext
  ): StreamEvent[];

  // ============================================================
  // 核心生命周期管理（Template Method）
  // ============================================================

  /**
   * 启动 AI 对话流
   *
   * 生命周期：spawn → readline stdout → 逐行 parseOutput → onEvent → close
   *
   * 重要约定：此方法不 reject Promise，错误通过事件传递。
   */
  async run(ctx: ProviderRunContext): Promise<void> {
    const { sessionId, onEvent, signal } = ctx;

    // 防御：同一 session 不能同时运行两个进程
    if (this.activeProcesses.has(sessionId)) {
      onEvent({
        type: "error",
        code: "UNKNOWN",
        message: `Session ${sessionId} already has a running process`,
        retryable: false,
      });
      return;
    }

    let process: ChildProcess;

    try {
      process = this.spawnProcess(ctx);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to spawn process";
      onEvent({
        type: "error",
        code: "CLI_NOT_FOUND",
        message,
        retryable: false,
      });
      onEvent({
        type: "message_end",
        messageId: "",
        stopReason: "error",
      });
      return;
    }

    this.activeProcesses.set(sessionId, process);

    // 收集 stderr 用于错误诊断
    let stderrBuffer = "";

    return new Promise<void>((resolve) => {
      // 监听 abort 信号
      const onAbort = (): void => {
        this.terminateProcess(sessionId);
        onEvent({
          type: "message_end",
          messageId: "",
          stopReason: "cancelled",
        });
      };

      if (signal.aborted) {
        onAbort();
        resolve();
        return;
      }

      signal.addEventListener("abort", onAbort, { once: true });

      // 逐行读取 stdout
      if (process.stdout) {
        const rl = createInterface({ input: process.stdout });

        rl.on("line", (line: string) => {
          // 空行跳过
          if (!line.trim()) return;

          try {
            const events = this.parseOutput(line, ctx);
            for (const event of events) {
              onEvent(event);
            }
          } catch (err) {
            console.warn(
              `[${this.type}] Failed to parse output line:`,
              line,
              err
            );
          }
        });
      }

      // 收集 stderr
      if (process.stderr) {
        process.stderr.on("data", (chunk: Buffer) => {
          stderrBuffer += chunk.toString();
        });
      }

      // 进程退出处理
      process.on("close", (exitCode: number | null) => {
        signal.removeEventListener("abort", onAbort);
        this.activeProcesses.delete(sessionId);

        // 非 0 退出码（且不是被 cancel 的情况）视为错误
        if (exitCode !== null && exitCode !== 0 && !signal.aborted) {
          const errorCode = this.classifyExitError(exitCode, stderrBuffer);
          onEvent({
            type: "error",
            code: errorCode,
            message: stderrBuffer.trim() || `Process exited with code ${exitCode}`,
            retryable: errorCode === "RATE_LIMIT",
          });
          onEvent({
            type: "message_end",
            messageId: "",
            stopReason: "error",
          });
        }

        resolve();
      });

      // 进程 spawn 错误（例如命令不存在）
      process.on("error", (err: Error) => {
        signal.removeEventListener("abort", onAbort);
        this.activeProcesses.delete(sessionId);

        onEvent({
          type: "error",
          code: "CLI_NOT_FOUND",
          message: err.message,
          retryable: false,
        });
        onEvent({
          type: "message_end",
          messageId: "",
          stopReason: "error",
        });

        resolve();
      });
    });
  }

  // ============================================================
  // 取消机制
  // ============================================================

  /**
   * 取消指定会话的 AI 进程
   *
   * 幂等操作：如果 session 没有运行中的进程，静默返回。
   */
  cancel(sessionId: string): void {
    this.terminateProcess(sessionId);
  }

  /**
   * 终止子进程：SIGTERM → 等待 2.5 秒 → SIGKILL
   *
   * 为什么两步：SIGTERM 让进程有机会清理临时文件、保存状态，
   * 如果 2.5 秒内未退出，SIGKILL 强制终止防止僵尸进程。
   */
  private terminateProcess(sessionId: string): void {
    const proc = this.activeProcesses.get(sessionId);
    if (!proc || proc.killed) return;

    // 第一步：优雅关闭
    proc.kill("SIGTERM");

    // 第二步：超时强制杀死
    const killTimer = setTimeout(() => {
      if (!proc.killed) {
        proc.kill("SIGKILL");
        console.warn(
          `[${this.type}] Force killed process for session ${sessionId}`
        );
      }
    }, SIGKILL_DELAY_MS);

    // 进程退出后清理 timer，防止内存泄漏
    proc.on("close", () => {
      clearTimeout(killTimer);
    });
  }

  // ============================================================
  // 错误分类
  // ============================================================

  /**
   * 根据退出码和 stderr 内容推断错误类型
   */
  protected classifyExitError(
    exitCode: number,
    stderr: string
  ): ProviderErrorCode {
    const lowerStderr = stderr.toLowerCase();

    if (lowerStderr.includes("not found") || exitCode === 127) {
      return "CLI_NOT_FOUND";
    }
    if (lowerStderr.includes("auth") || lowerStderr.includes("api key")) {
      return "AUTH_ERROR";
    }
    if (lowerStderr.includes("rate limit") || lowerStderr.includes("429")) {
      return "RATE_LIMIT";
    }
    if (lowerStderr.includes("timeout")) {
      return "TIMEOUT";
    }
    if (exitCode === 1 && stderr.trim() === "") {
      return "PROCESS_CRASHED";
    }

    return "UNKNOWN";
  }
}
