import { useState } from "react";
import { FileCardHeader } from "./file-card-header";
import { MonacoDiffView } from "./monaco-diff-view";

interface FileCardProps {
  filename: string;
  additions?: number;
  deletions?: number;
  original: string;
  modified: string;
  language?: string;
  defaultCollapsed?: boolean;
}

/**
 * 文件 Diff 卡片 -- 对应 HTML 原型中的 .file-card
 *
 * 外壳：圆角 border + header + Monaco DiffEditor 内容区。
 * collapsed 状态只显示 header，展开显示 diff。
 */
export function FileCard({
  filename,
  additions,
  deletions,
  original,
  modified,
  language,
  defaultCollapsed = false,
}: FileCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-surface">
      <FileCardHeader
        filename={filename}
        additions={additions}
        deletions={deletions}
        onToggle={() => setCollapsed((prev) => !prev)}
      />
      {!collapsed ? (
        <MonacoDiffView
          original={original}
          modified={modified}
          language={language}
        />
      ) : null}
    </div>
  );
}
