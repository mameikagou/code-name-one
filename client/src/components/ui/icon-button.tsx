import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
}

/**
 * 图标按钮 -- 对应 HTML 原型中的 .btn-icon
 *
 * 无文字，只有图标的小按钮，hover 时显示浅底色。
 * 用于面板顶栏的操作按钮（展开、更多等）。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "flex cursor-pointer items-center rounded p-1 text-ink-muted transition-colors",
          "hover:bg-surface-overlay hover:text-ink",
          className,
        )}
        {...props}
      >
        {icon}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
