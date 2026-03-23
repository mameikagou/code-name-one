import { cn } from "@/lib/cn";

interface DiffStatsProps {
  additions: number;
  deletions: number;
  className?: string;
}

/**
 * Diff 统计显示 -- "+N -M" 格式
 *
 * 绿色显示新增行数，红色显示删除行数。
 * 使用等宽字体（font-code）保持对齐。
 */
export function DiffStats({ additions, deletions, className }: DiffStatsProps) {
  return (
    <span className={cn("font-code text-xs", className)}>
      <span className="text-diff-added">+{additions}</span>{" "}
      <span className="text-diff-removed">-{deletions}</span>
    </span>
  );
}
