import { DiffStats } from "@/components/ui/diff-stats";
import { ChevronUp } from "lucide-react";

interface FileCardHeaderProps {
  filename: string;
  additions?: number;
  deletions?: number;
  onToggle?: () => void;
}

/**
 * 文件卡片头部 -- 文件名 + diff 统计 + 折叠/展开按钮
 */
export function FileCardHeader({
  filename,
  additions,
  deletions,
  onToggle,
}: FileCardHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-surface-raised px-3 py-2">
      <span className="text-[13px] font-medium">
        {filename}
        {additions != null && deletions != null ? (
          <DiffStats additions={additions} deletions={deletions} className="ml-2" />
        ) : null}
      </span>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          className="cursor-pointer text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronUp size={14} />
        </button>
      ) : null}
    </div>
  );
}
