/**
 * @file Sessions hooks — Headless 逻辑层
 *
 * 纯数据逻辑，零 UI。容器组件只需调用这些 hooks 就能拿到
 * 会话列表、创建会话等全部能力。
 *
 * 用法示例：
 *   const { data, isLoading } = useSessions();
 *   const createSession = useCreateSession();
 *   createSession.mutate({ title: "New chat" });
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";
import type { Session } from "@/types/api";

/** Query key 常量，避免魔法字符串 */
export const sessionKeys = {
  all: ["sessions"] as const,
  detail: (id: string) => ["sessions", id] as const,
};

/**
 * 获取所有会话列表
 *
 * 对应 GET /api/sessions
 * 返回按 createdAt DESC 排序的会话数组
 */
export function useSessions() {
  return useQuery({
    queryKey: sessionKeys.all,
    queryFn: () => apiGet<Session[]>("/sessions"),
  });
}

/**
 * 创建新会话
 *
 * 对应 POST /api/sessions
 * 成功后自动刷新会话列表缓存
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { title: string }) =>
      apiPost<Session>("/sessions", params),
    onSuccess: () => {
      // 创建成功后，让 sessions 列表重新 fetch
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}
