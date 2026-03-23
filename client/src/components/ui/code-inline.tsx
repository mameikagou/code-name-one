import { cn } from "@/lib/cn";

interface CodeInlineProps {
  children: string;
  className?: string;
}

/**
 * 行内代码标签 -- 对应 HTML 原型中的 .code-inline
 *
 * 浅灰底色 + 等宽字体，用于在聊天消息中显示文件名、命令等。
 */
export function CodeInline({ children, className }: CodeInlineProps) {
  return (
    <code
      className={cn(
        "rounded bg-surface-overlay px-1 py-0.5 font-code text-xs",
        className,
      )}
    >
      {children}
    </code>
  );
}
