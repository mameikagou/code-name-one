import { PanelResizeHandle } from "react-resizable-panels";
import { cn } from "@/lib/cn";

interface ResizeHandleProps {
  className?: string;
}

/**
 * 自定义拖拽分割手柄 -- Codex 风格
 *
 * 默认是一条极细的线，hover 时高亮。
 * 用 group 包裹实现 hover 时子元素的联动动画。
 */
export function ResizeHandle({ className }: ResizeHandleProps) {
  return (
    <PanelResizeHandle
      className={cn(
        "group relative flex w-[3px] items-center justify-center",
        "bg-border transition-colors hover:bg-accent",
        className,
      )}
    >
      {/* hover 时出现的可视化抓手指示器 */}
      <div
        className={cn(
          "absolute h-8 w-[3px] rounded-full bg-accent",
          "opacity-0 transition-opacity group-hover:opacity-100",
        )}
      />
    </PanelResizeHandle>
  );
}
