import { DiffStats } from "@/components/ui/diff-stats";
import { Undo2 } from "lucide-react";

interface SummaryFile {
  name: string;
  additions: number;
  deletions: number;
}

interface SummaryCardProps {
  fileCount: number;
  additions: number;
  deletions: number;
  files: SummaryFile[];
  onUndo?: () => void;
}

/**
 * 变更摘要卡片 -- 对应 HTML 原型中的 .summary-card
 *
 * 头部显示总文件数和总 diff 统计 + 撤销按钮。
 * body 区域列出每个文件及其 diff 统计。
 */
export function SummaryCard({
  fileCount,
  additions,
  deletions,
  files,
  onUndo,
}: SummaryCardProps) {
  return (
    <div className="my-6 overflow-hidden rounded-lg border border-border bg-surface-raised">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-[13px] font-medium">
          {fileCount} 个文件已更改{" "}
          <DiffStats additions={additions} deletions={deletions} />
        </div>
        {onUndo ? (
          <button
            type="button"
            onClick={onUndo}
            className="flex cursor-pointer items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink"
          >
            <span>撤销</span>
            <Undo2 size={12} />
          </button>
        ) : null}
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {files.map((file) => (
          <SummaryFileRow
            key={file.name}
            name={file.name}
            additions={file.additions}
            deletions={file.deletions}
          />
        ))}
      </div>
    </div>
  );
}

/** 摘要卡片内的单行文件 */
function SummaryFileRow({
  name,
  additions,
  deletions,
}: {
  name: string;
  additions: number;
  deletions: number;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="truncate">{name}</span>
      <DiffStats additions={additions} deletions={deletions} className="shrink-0 ml-2" />
    </div>
  );
}
