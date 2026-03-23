import type { ReactNode } from "react";

interface SidebarFooterProps {
  children: ReactNode;
}

/**
 * 侧边栏底部栏 -- 设置入口等
 *
 * 顶部有 border 分隔线，固定在侧边栏底部。
 */
export function SidebarFooter({ children }: SidebarFooterProps) {
  return (
    <div className="border-t border-border px-4 py-3">
      {children}
    </div>
  );
}
