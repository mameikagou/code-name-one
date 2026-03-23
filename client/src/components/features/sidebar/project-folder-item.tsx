import type { ReactNode } from "react";
import { Folder } from "lucide-react";
import { cn } from "@/lib/cn";

interface ProjectFolderItemProps {
  name: string;
  icon?: ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

/**
 * 项目文件夹项 -- 侧边栏中的项目入口
 *
 * 默认显示文件夹图标，可通过 icon prop 自定义。
 * children 用于渲染子项（如 ThreadPlaceholder）。
 */
export function ProjectFolderItem({
  name,
  icon,
  isActive = false,
  onClick,
  children,
}: ProjectFolderItemProps) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left",
          "mb-0.5 cursor-pointer transition-colors",
          isActive
            ? "bg-surface-overlay"
            : "hover:bg-surface-overlay",
        )}
      >
        {icon ?? <Folder size={14} className="shrink-0" />}
        <span className="truncate text-[13px]">{name}</span>
      </button>
      {children}
    </>
  );
}
