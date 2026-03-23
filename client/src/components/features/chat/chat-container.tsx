import { useState } from "react";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/**
 * 占位消息数据 -- 后续替换为 TanStack Query + WebSocket
 */
const INITIAL_MESSAGES: Message[] = [
  { id: "1", role: "assistant", content: "Hello! I'm your coding assistant. How can I help you today?" },
  { id: "2", role: "user", content: "Can you help me debug the authentication flow?" },
  { id: "3", role: "assistant", content: "Of course! Let me look at the auth module. Could you point me to the relevant files?" },
];

/**
 * Chat 容器组件 -- 数据 + 状态
 *
 * 职责：管理消息列表和发送逻辑。
 * 当前使用 mock 数据，后续接入真实 API。
 * 渲染委托给 MessageList 和 ChatInput 纯展示组件。
 */
export function ChatContainer() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);

  function handleSend(content: string) {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMsg]);

    // 模拟助手回复 -- 后续替换为真实 API 调用
    setTimeout(() => {
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I received your message: "${content}". This is a placeholder response.`,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }, 500);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} />
      </div>
      <ChatInput onSend={handleSend} />
    </div>
  );
}
