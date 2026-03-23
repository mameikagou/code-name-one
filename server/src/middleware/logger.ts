/**
 * @file 请求日志中间件
 *
 * 设计意图：在每个请求的生命周期内记录 HTTP 方法、路径、状态码和耗时，
 * 格式简洁一行，方便开发调试和生产排查。
 *
 * 输出示例："GET /api/sessions 200 12ms"
 */

import type { MiddlewareHandler } from "hono";

/**
 * 简单请求日志中间件
 *
 * 使用 performance.now() 计算高精度耗时，
 * 在 await next() 之后拿到最终的 response status。
 */
export const logger: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = (performance.now() - start).toFixed(0);
  const status = c.res.status;

  console.log(`${method} ${path} ${status} ${duration}ms`);
};
