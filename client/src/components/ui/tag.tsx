import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TagProps {
  children: ReactNode;
  className?: string;
}

/**
 * 标签组件 -- 用于面包屑旁的项目标签、计数标签等
 *
 * 对应 HTML 原型中的 .tag 样式：浅灰底色 + 小圆角 + 小字号
 */
export function Tag({ children, className }: TagProps) {
  return (
    <span
      className={cn(
        "rounded bg-surface-overlay px-1.5 py-0.5 text-[11px] text-ink-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
