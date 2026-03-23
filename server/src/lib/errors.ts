/**
 * @file 自定义错误类体系
 *
 * 设计意图：统一的错误分类机制，让上层（中间件、路由）可以根据 statusCode
 * 自动返回对应的 HTTP 状态码，而不需要到处写 if/else 判断。
 *
 * 继承关系：
 *   Error
 *     └─ AppError (带 statusCode + code)
 *         ├─ NotFoundError (404)
 *         └─ ValidationError (400)
 */

// ============================================================
// 基类：AppError
// 所有业务错误都继承此类，携带 HTTP 状态码和机器可读的 code
// ============================================================

export class AppError extends Error {
  /** HTTP 状态码，如 400, 404, 500 */
  public readonly statusCode: number;

  /** 机器可读的错误码，如 "NOT_FOUND"、"VALIDATION_ERROR" */
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);

    // 确保 instanceof 检查能正确工作
    // 原因：TypeScript 编译后，继承内置类（Error）会丢失原型链
    Object.setPrototypeOf(this, new.target.prototype);

    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
  }
}

// ============================================================
// NotFoundError：资源不存在 (404)
// 使用场景：根据 ID 查询 session/message 时未找到
// ============================================================

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id "${id}" not found`, 404, "NOT_FOUND");
  }
}

// ============================================================
// ValidationError：请求参数校验失败 (400)
// 使用场景：业务层发现不合法的状态转换、非法参数等
// ============================================================

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

// ============================================================
// ConflictError：资源状态冲突 (409)
// 使用场景：session 已在运行中，客户端再次请求 run
// ============================================================

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

// ============================================================
// ProviderUnavailableError：AI Provider 不可用 (503)
// 使用场景：Claude CLI 未安装、Provider 进程启动失败
// ============================================================

export class ProviderUnavailableError extends AppError {
  constructor(provider: string, reason: string) {
    super(
      `Provider "${provider}" is unavailable: ${reason}`,
      503,
      "PROVIDER_UNAVAILABLE"
    );
  }
}
