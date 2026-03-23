import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

interface SendButtonProps {
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * 圆形发送按钮 -- 输入框右侧
 *
 * 灰色圆形底色 + 白色上箭头图标。
 * disabled 时降低透明度。
 */
export function SendButton({ disabled = false, onClick }: SendButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        "bg-ink-faint text-white transition-colors",
        "hover:bg-ink-muted",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <ArrowUp size={14} />
    </button>
  );
}
