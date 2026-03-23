import type { ReactNode } from "react";

interface SidebarSectionProps {
  children: ReactNode;
}

/**
 * 侧边栏滚动区域 -- 包裹会话列表和文件夹列表
 *
 * flex-grow + overflow-y-auto 确保内容可滚动而不撑破布局。
 */
export function SidebarSection({ children }: SidebarSectionProps) {
  return (
    <div className="flex-grow overflow-y-auto p-2">
      {children}
    </div>
  );
}
