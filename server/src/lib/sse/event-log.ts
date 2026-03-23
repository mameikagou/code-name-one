/**
 * @file 断线重连缓冲区（环形缓冲区实现）
 *
 * 设计意图：SSE 断线重连时，客户端通过 Last-Event-ID header 告知服务端
 * 最后收到的帧 ID，服务端从缓冲区回放缺失的帧。
 *
 * 为什么用环形缓冲区而不是数组：
 *   - 固定内存占用（maxSize 帧），不会因为长对话无限增长
 *   - O(1) 写入，O(n) 读取（n = 缺失帧数，通常很小）
 *   - 当缓冲区满时自动覆盖最旧的帧，并标记 hasGap
 *
 * 参考：specs/design/sse-protocol.md §4
 */

import type { SseFrame, SinceResult } from "../../types/sse";

export class BufferedEventLog {
  /** 环形缓冲区，预分配固定大小 */
  private readonly buffer: Array<SseFrame | undefined>;

  /** 缓冲区最大容量 */
  private readonly maxSize: number;

  /** 下一个写入位置（取模循环） */
  private writeIndex: number = 0;

  /** 当前已存储的帧数（<= maxSize） */
  private size: number = 0;

  /** 单调递增的帧 ID 计数器 */
  private idCounter: number = 0;

  /**
   * 是否发生过帧丢失（缓冲区溢出覆盖旧帧）
   * 一旦为 true，在本次 session 生命周期内不会重置
   */
  private overflowed: boolean = false;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
    // 预分配数组，避免动态扩展的 GC 压力
    this.buffer = new Array<SseFrame | undefined>(maxSize).fill(undefined);
  }

  /**
   * 推入一帧事件到缓冲区
   *
   * @param event - 事件类型名称（如 "content_delta"）
   * @param data - 事件数据（会被 JSON.stringify）
   * @returns 构建好的 SseFrame（包含分配的 id）
   */
  push(event: string, data: unknown): SseFrame {
    this.idCounter++;

    const frame: SseFrame = {
      id: String(this.idCounter),
      event,
      data: JSON.stringify(data),
      timestamp: Date.now(),
    };

    // 如果缓冲区已满，覆盖最旧的帧并标记溢出
    if (this.size >= this.maxSize) {
      this.overflowed = true;
    }

    this.buffer[this.writeIndex] = frame;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;

    if (this.size < this.maxSize) {
      this.size++;
    }

    return frame;
  }

  /**
   * 获取指定 ID 之后的所有缓冲帧（断线重连用）
   *
   * @param sinceId - Last-Event-ID 的值（字符串化的数字）
   * @returns 缺失帧列表 + 是否有帧丢失标记
   */
  since(sinceId: string): SinceResult {
    const sinceIdNum = parseInt(sinceId, 10);

    if (isNaN(sinceIdNum)) {
      return { frames: [], hasGap: false };
    }

    // 收集所有 id > sinceIdNum 的帧
    const frames: SseFrame[] = [];
    let oldestBufferedId = Infinity;

    for (let i = 0; i < this.size; i++) {
      const frame = this.buffer[i];
      if (frame) {
        const frameIdNum = parseInt(frame.id, 10);

        if (frameIdNum < oldestBufferedId) {
          oldestBufferedId = frameIdNum;
        }

        if (frameIdNum > sinceIdNum) {
          frames.push(frame);
        }
      }
    }

    // 按 id 升序排列
    frames.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

    // 判断是否有帧丢失：
    // 如果请求的 sinceId 比缓冲区中最旧的帧还要老，说明有帧被覆盖了
    const hasGap =
      this.overflowed && sinceIdNum < oldestBufferedId;

    return { frames, hasGap };
  }

  /**
   * 清空缓冲区，释放内存
   *
   * 会话结束后调用，防止内存泄漏。
   */
  clear(): void {
    this.buffer.fill(undefined);
    this.writeIndex = 0;
    this.size = 0;
    this.idCounter = 0;
    this.overflowed = false;
  }

  /** 当前缓冲区中的帧数 */
  get length(): number {
    return this.size;
  }

  /** 最新的帧 ID（字符串），缓冲区为空时返回 "0" */
  get lastId(): string {
    return String(this.idCounter);
  }
}
