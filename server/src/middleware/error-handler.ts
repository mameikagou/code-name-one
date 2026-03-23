/**
 * @file Hono 全局错误处理中间件
 *
 * 设计意图：统一的错误捕获出口。所有未被路由层处理的异常都会落到这里，
 * 根据是否为 AppError 返回不同的响应格式。
 *
 * - AppError → 返回对应的 statusCode + 统一 error 格式
 * - 未知错误 → 返回 500 + 通用错误信息（不泄漏内部细节）
 */

import type { ErrorHandler } from "hono";
import { AppError } from "../lib/errors";
import type { ApiErrorResponse } from "../types/common";

// ============================================================
// onError 处理函数
// 注册方式：app.onError(errorHandler)
// ============================================================

export const errorHandler: ErrorHandler = (err, c) => {
  // 1. 先打印完整错误栈，方便开发调试
  //    生产环境可替换为结构化日志（如 pino）
  console.error(`[ERROR] ${err.message}`, err.stack);

  // 2. 判断是否为业务已知错误
  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    return c.json(body, err.statusCode as 400 | 404 | 500);
  }

  // 3. 未知错误：返回 500，隐藏内部实现细节
  //    只暴露通用信息，防止敏感信息泄漏
  const body: ApiErrorResponse = {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  };
  return c.json(body, 500);
};
