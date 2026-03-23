/**
 * @file API Client — 轻量 fetch 封装
 *
 * 为什么不用 axios？
 * 1. 项目 API 全是简单 JSON，fetch 完全够用
 * 2. 零依赖，减少打包体积
 * 3. Vite proxy 已配好 /api -> :3000，无需处理 baseURL 或 CORS
 *
 * 设计：每个方法返回 T（已解包 data），调用方无需手动 .data 取值。
 * 错误时抛出 ApiClientError，TanStack Query 会自动捕获。
 */

import type { ApiResponse, ApiErrorResponse } from "@/types/api";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new ApiClientError(
      response.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? `HTTP ${response.status}`,
    );
  }

  const json = (await response.json()) as ApiResponse<T>;
  return json.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}
