import type { ReactNode } from "react";

interface ChatMessageAreaProps {
  children: ReactNode;
}

/**
 * 聊天内容滚动区域 -- 对应 HTML 原型中的 .chat-content
 *
 * flex-1 占满剩余空间，overflow-y-auto 允许滚动。
 * padding 与 HTML 原型对齐：24px 上下，32px 左右。
 */
export function ChatMessageArea({ children }: ChatMessageAreaProps) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      {children}
    </div>
  );
}
