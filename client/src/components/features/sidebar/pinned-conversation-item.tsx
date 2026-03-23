import { Pin } from "lucide-react";
import { cn } from "@/lib/cn";

interface PinnedConversationItemProps {
  title: string;
  time: string;
  isActive?: boolean;
  onClick?: () => void;
}

/**
 * 置顶会话项 -- 对应侧边栏顶部的对话记录
 *
 * 带 Pin 图标，显示截断标题和相对时间。
 * 与 ProjectFolderItem 的区别：这是历史对话，不是项目文件夹。
 */
export function PinnedConversationItem({
  title,
  time,
  isActive = false,
  onClick,
}: PinnedConversationItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left",
        "mb-0.5 cursor-pointer transition-colors",
        isActive
          ? "bg-surface-overlay"
          : "text-ink-muted hover:bg-surface-overlay",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Pin size={12} className="shrink-0 text-ink-faint" />
        <span className="truncate text-[13px]">{title}</span>
      </div>
      <span className="ml-2 shrink-0 text-[11px] text-ink-faint">{time}</span>
    </button>
  );
}
