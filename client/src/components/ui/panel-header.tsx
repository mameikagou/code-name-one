import type { ReactNode } from "react";

interface PanelHeaderProps {
  left: ReactNode;
  right?: ReactNode;
}

/**
 * 通用面板顶栏 -- Main Panel 和 Diff Panel 都复用
 *
 * 固定 44px 高度，左右两端对齐布局，底部 border 分隔。
 */
export function PanelHeader({ left, right }: PanelHeaderProps) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4 text-[13px]">
      <div className="min-w-0 flex-1">{left}</div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </header>
  );
}
