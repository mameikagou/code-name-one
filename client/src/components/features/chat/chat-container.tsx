/**
 * @file Chat 容器 — 纯逻辑组装，零装饰样式
 *
 * 职责：读取当前选中会话，获取消息，处理发送。
 * 渲染委托给 MessageList 和 ChatInput 展示组件。
 *
 * 重构说明（原 mock 数据已删除）：
 *   - INITIAL_MESSAGES → useMessages(sessionId) 真实 API
 *   - setTimeout mock → useSendMessage(sessionId) 真实 API
 *   - 新增：未选中会话时显示空状态
 *
 * TODO: 后续将 useSendMessage 替换为 SSE 流式接口
 */

import { useAtomValue } from "jotai";
import { Loader2, MessageSquare } from "lucide-react";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { useMessages, useSendMessage } from "@/hooks/use-chat";
import { selectedSessionIdAtom } from "@/stores/session-atom";

export function ChatContainer() {
  const sessionId = useAtomValue(selectedSessionIdAtom);
  const { data: messages, isLoading } = useMessages(sessionId);
  const sendMessage = useSendMessage(sessionId);

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
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-ink-muted" />
          </div>
        ) : (
          <MessageList messages={messages ?? []} />
        )}
      </div>
      <ChatInput onSend={handleSend} disabled={sendMessage.isPending} />
    </div>
  );
}
