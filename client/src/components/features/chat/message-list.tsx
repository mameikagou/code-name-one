import { cn } from "@/lib/cn";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface MessageListProps {
  messages: readonly Message[];
}

/**
 * 消息列表 -- 纯展示组件
 *
 * 渲染用户和助手的对话气泡。
 * 用户消息右对齐 accent 背景，助手消息左对齐。
 */
export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "flex",
            msg.role === "user" ? "justify-end" : "justify-start",
          )}
        >
          <div
            className={cn(
              "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
              msg.role === "user"
                ? "bg-accent text-white"
                : "bg-surface-raised text-ink",
            )}
          >
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  );
}
