/**
 * @file Chat hooks — Headless 逻辑层
 *
 * 管理消息获取和发送的纯逻辑 hooks。
 * 容器组件调用 useMessages + useSendMessage 即可获得完整聊天能力。
 *
 * 用法示例：
 *   const { data: messages } = useMessages(sessionId);
 *   const sendMessage = useSendMessage(sessionId);
 *   sendMessage.mutate("Hello!");
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";
import type { Message, SendMessageResponse } from "@/types/api";

/** Query key 常量 */
export const messageKeys = {
  bySession: (sessionId: string) => ["messages", sessionId] as const,
};

/**
 * 获取指定会话的消息列表
 *
 * 对应 GET /api/sessions/:id/messages
 * sessionId 为 null 时禁用查询（未选中会话场景）
 */
export function useMessages(sessionId: string | null) {
  return useQuery({
    queryKey: messageKeys.bySession(sessionId ?? ""),
    queryFn: () => apiGet<Message[]>(`/sessions/${sessionId}/messages`),
    // sessionId 为 null 时不发请求
    enabled: sessionId !== null,
  });
}

/**
 * 发送消息并获取 AI 回复
 *
 * 对应 POST /api/sessions/:id/messages
 * 成功后自动刷新消息列表缓存，新消息立即显示
 *
 * TODO: 后续替换为 SSE 流式接口 POST /sessions/:id/run
 */
export function useSendMessage(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => {
      if (!sessionId) {
        return Promise.reject(new Error("No session selected"));
      }
      return apiPost<SendMessageResponse>(
        `/sessions/${sessionId}/messages`,
        { content },
      );
    },
    onSuccess: () => {
      if (sessionId) {
        // 发送成功后刷新消息列表，让新消息立即出现
        void queryClient.invalidateQueries({
          queryKey: messageKeys.bySession(sessionId),
        });
      }
    },
  });
}
