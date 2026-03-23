/**
 * @file Chat 容器 — 纯逻辑组装，零装饰样式
 *
 * 职责：读取当前选中会话，获取消息，处理发送。
 * 渲染委托给 MainPanel（含 PanelHeader + ChatMessageArea + ChatInputV2）。
 *
 * 重构说明（本次改动）：
 *   - 原始 ChatInput + MessageList 手动组合 → 委托给 MainPanel
 *   - 从 sessions 缓存派生会话标题（不新增 API 请求）
 *   - MainPanel 内部使用 ChatInputV2（增强输入框，含模型/质量选择器）
 *
 * TODO: 后续将 useSendMessage 替换为 SSE 流式接口
 */

import { useAtomValue } from "jotai";
import { Loader2, MessageSquare } from "lucide-react";
import { MainPanel } from "./main-panel";
import { MessageList } from "./message-list";
import { useMessages, useSendMessage } from "@/hooks/use-chat";
import { useSessions } from "@/hooks/use-sessions";
import { selectedSessionIdAtom } from "@/stores/session-atom";

export function ChatContainer() {
  const sessionId = useAtomValue(selectedSessionIdAtom);
  const { data: messages, isLoading } = useMessages(sessionId);
  const sendMessage = useSendMessage(sessionId);

  // 从已缓存的 sessions 列表派生当前会话标题（零额外请求）
  const { data: sessions } = useSessions();
  const currentSession = sessions?.find((s) => s.id === sessionId);
  const sessionTitle = currentSession?.title ?? "New conversation";

  function handleSend(content: string) {
    sendMessage.mutate(content);
  }

  // 未选中任何会话
  if (!sessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-ink-muted">
        <MessageSquare size={32} className="mb-3 opacity-40" />
        <p className="text-sm">Select a conversation or create a new one</p>
      </div>
    );
  }

  return (
    <MainPanel
      title={sessionTitle}
      modelName={currentSession?.model ?? "Claude"}
      onSend={handleSend}
      disabled={sendMessage.isPending}
    >
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 size={20} className="animate-spin text-ink-muted" />
        </div>
      ) : (
        <MessageList messages={messages ?? []} />
      )}
    </MainPanel>
  );
}
