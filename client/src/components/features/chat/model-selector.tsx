import { ChevronDown } from "lucide-react";

interface ModelSelectorProps {
  model: string;
  onClick?: () => void;
}

/**
 * 模型选择器 -- 输入框工具栏中的模型切换按钮
 *
 * 显示当前模型名 + 下拉箭头，点击触发选择。
 */
export function ModelSelector({ model, onClick }: ModelSelectorProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[13px] text-ink-muted transition-colors hover:bg-surface-overlay"
    >
      {model}
      <ChevronDown size={12} />
    </button>
  );
}
