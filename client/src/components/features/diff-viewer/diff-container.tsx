import { useState } from "react";
import { GitBranch } from "lucide-react";
import { FileTree } from "./file-tree";

/**
 * 占位文件变更数据 -- 后续替换为真实 diff 数据
 */
const MOCK_FILES = [
  { path: "src/auth/middleware.ts", status: "modified" as const, additions: 12, deletions: 3 },
  { path: "src/api/routes.ts", status: "modified" as const, additions: 25, deletions: 8 },
  { path: "src/utils/token.ts", status: "added" as const, additions: 45, deletions: 0 },
  { path: "src/config/old-auth.ts", status: "deleted" as const, additions: 0, deletions: 67 },
] as const;

/**
 * Diff Viewer 容器组件 -- 数据 + 状态
 *
 * 职责：管理文件变更列表和选中文件的 diff 展示。
 * 当前使用 mock 数据，后续接入真实代码变更 API。
 */
export function DiffContainer() {
  const [selectedPath, setSelectedPath] = useState<string | null>(MOCK_FILES[0].path);

  const totalAdditions = MOCK_FILES.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = MOCK_FILES.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：变更摘要 */}
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-ink-muted" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Changes
          </span>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="text-diff-added">+{totalAdditions}</span>
          <span className="text-diff-removed">-{totalDeletions}</span>
        </div>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto">
        <FileTree
          files={MOCK_FILES}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
        />
      </div>

      {/* 底部：选中文件的 diff 预览占位 */}
      {selectedPath && (
        <div className="border-t border-border p-3">
          <div className="rounded-md bg-surface-sunken p-3 font-code text-xs text-ink-muted">
            <p>Diff preview for: {selectedPath}</p>
            <p className="mt-1 text-ink-faint">Full diff viewer coming soon...</p>
          </div>
        </div>
      )}
    </div>
  );
}
