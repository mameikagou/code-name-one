/**
 * @file 统一 API 响应类型
 *
 * 设计意图：所有 API 响应都包裹在统一的信封格式中，
 * 前端只需检查 "data" 或 "error" 字段即可区分成功/失败。
 *
 * 成功：{ data: T }
 * 失败：{ error: { code: string; message: string } }
 */

// ============================================================
// 成功响应：泛型信封
// 使用方式：ApiResponse<Session[]>、ApiResponse<Message>
// ============================================================

export interface ApiResponse<T> {
  data: T;
}

// ============================================================
// 错误响应：固定结构
// code 为机器可读的错误码（如 "NOT_FOUND"）
// message 为人类可读的描述
// ============================================================

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
