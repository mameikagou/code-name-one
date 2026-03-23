import { Undo2, Plus } from "lucide-react";

interface DiffActionBarProps {
  onRevertAll?: () => void;
  onStageAll?: () => void;
}

/**
 * Diff 操作栏 -- 底部固定的"还原全部 / 暂存全部"
 *
 * 对应 HTML 原型最底部的 panel-header 样式操作栏。
 */
export function DiffActionBar({ onRevertAll, onStageAll }: DiffActionBarProps) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-4 border-t border-border bg-surface px-4 py-2.5">
      <button
        type="button"
        onClick={onRevertAll}
        className="flex cursor-pointer items-center gap-1 text-[13px] text-ink-muted transition-colors hover:text-ink"
      >
        <Undo2 size={14} />
        还原全部
      </button>
      <button
        type="button"
        onClick={onStageAll}
        className="flex cursor-pointer items-center gap-1 text-[13px] text-ink-muted transition-colors hover:text-ink"
      >
        <Plus size={14} />
        暂存全部
      </button>
    </div>
  );
}
