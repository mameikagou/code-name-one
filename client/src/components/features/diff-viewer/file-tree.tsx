import { FileCode, FilePlus, FileX } from "lucide-react";
import { cn } from "@/lib/cn";

type FileStatus = "added" | "modified" | "deleted";

interface FileEntry {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}

interface FileTreeProps {
  files: readonly FileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

const statusConfig: Record<FileStatus, { icon: typeof FileCode; color: string }> = {
  added: { icon: FilePlus, color: "text-diff-added" },
  modified: { icon: FileCode, color: "text-accent" },
  deleted: { icon: FileX, color: "text-diff-removed" },
};

/**
 * 文件变更列表 -- 纯展示组件
 *
 * 显示变更文件列表，每个文件标注增删行数和状态图标。
 */
export function FileTree({ files, selectedPath, onSelect }: FileTreeProps) {
  return (
    <div className="flex flex-col gap-0.5 p-2">
      {files.map((file) => {
        const { icon: Icon, color } = statusConfig[file.status];
        return (
          <button
            key={file.path}
            type="button"
            onClick={() => onSelect(file.path)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
              selectedPath === file.path
                ? "bg-accent-muted"
                : "hover:bg-surface-overlay",
            )}
          >
            <Icon size={14} className={cn("shrink-0", color)} />
            <span className="min-w-0 flex-1 truncate font-code text-xs text-ink">
              {file.path}
            </span>
            <div className="flex shrink-0 gap-1 text-xs">
              {file.additions > 0 && (
                <span className="text-diff-added">+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span className="text-diff-removed">-{file.deletions}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
