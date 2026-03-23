import { ChevronDown } from "lucide-react";

interface QualitySelectorProps {
  level: string;
  onClick?: () => void;
}

/**
 * 质量档位选择器 -- 输入框工具栏中的质量级别切换
 *
 * 显示当前质量级别（超高/标准等）+ 下拉箭头。
 */
export function QualitySelector({ level, onClick }: QualitySelectorProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-0.5 text-[11px] text-ink-faint transition-colors hover:text-ink-muted"
    >
      {level}
      <ChevronDown size={10} />
    </button>
  );
}
