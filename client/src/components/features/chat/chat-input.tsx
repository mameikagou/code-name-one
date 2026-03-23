import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/cn";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

/**
 * 聊天输入框 -- 展示组件
 *
 * 底部固定的输入区域，包含文本框和发送按钮。
 * 通过 onSend 回调向上传递用户输入。
 */
export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-border bg-surface p-3"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder="Type a message..."
        disabled={disabled}
        rows={1}
        className={cn(
          "flex-1 resize-none rounded-lg border border-border bg-surface-sunken px-3 py-2",
          "text-sm text-ink placeholder:text-ink-faint",
          "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
          "disabled:opacity-50",
        )}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          "bg-accent text-white transition-colors hover:bg-accent-hover",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        <Send size={16} />
      </button>
    </form>
  );
}
