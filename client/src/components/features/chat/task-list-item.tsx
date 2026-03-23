import type { ReactNode } from "react";
import { CheckSquare, Square } from "lucide-react";

interface TaskListItemProps {
  completed: boolean;
  label: ReactNode;
  children?: ReactNode;
}

/**
 * 任务勾选项 -- 对应聊天消息中的 task-list-item
 *
 * 显示一个勾选框图标 + 标签 + 可选子内容列表。
 * completed 控制图标样式和整体透明度。
 */
export function TaskListItem({ completed, label, children }: TaskListItemProps) {
  const Icon = completed ? CheckSquare : Square;

  return (
    <div className={`flex items-start gap-2 mb-2 ${completed ? "opacity-80" : ""}`}>
      <Icon
        size={16}
        className="mt-0.5 shrink-0 text-ink-muted"
      />
      <div className="min-w-0">
        {label}
        {children}
      </div>
    </div>
  );
}
