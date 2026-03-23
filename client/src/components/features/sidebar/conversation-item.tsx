import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";

interface ConversationItemProps {
  title: string;
  preview: string;
  timestamp: string;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * 对话列表项 -- 纯展示组件
 *
 * 显示对话标题、最后消息预览和时间戳。
 * 选中状态通过 isSelected prop 控制。
 */
export function ConversationItem({
  title,
  preview,
  timestamp,
  isSelected,
  onClick,
}: ConversationItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
        isSelected
          ? "bg-accent-muted text-accent-text"
          : "text-ink hover:bg-surface-overlay",
      )}
    >
      <MessageSquare size={16} className="mt-0.5 shrink-0 text-ink-faint" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="ml-2 shrink-0 text-xs text-ink-faint">{timestamp}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-muted">{preview}</p>
      </div>
    </button>
  );
}
