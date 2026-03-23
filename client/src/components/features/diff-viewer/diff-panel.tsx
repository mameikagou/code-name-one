import { MoreHorizontal, ExternalLink, ChevronDown } from "lucide-react";
import { PanelHeader } from "@/components/ui/panel-header";
import { Tag } from "@/components/ui/tag";
import { IconButton } from "@/components/ui/icon-button";
import { FileCard } from "./file-card";
import { DiffActionBar } from "./diff-action-bar";

interface DiffFileData {
  filename: string;
  additions: number;
  deletions: number;
  original: string;
  modified: string;
  language?: string;
}

interface DiffPanelProps {
  label?: string;
  files: DiffFileData[];
  onRevertAll?: () => void;
  onStageAll?: () => void;
}

/**
 * 完整 Diff 面板 -- 组合顶栏 + 文件卡片列表 + 操作栏
 *
 * 对应 HTML 原型中的 .diff-panel 右栏。
 */
export function DiffPanel({
  label = "未暂存",
  files,
  onRevertAll,
  onStageAll,
}: DiffPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        left={
          <div className="flex items-center gap-2">
            <span className="font-medium">{label}</span>
            <Tag>
              {files.length} <ChevronDown size={10} className="inline-block" />
            </Tag>
          </div>
        }
        right={
          <>
            <IconButton icon={<MoreHorizontal size={14} />} />
            <IconButton icon={<ExternalLink size={14} />} />
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        {files.map((file) => (
          <FileCard
            key={file.filename}
            filename={file.filename}
            additions={file.additions}
            deletions={file.deletions}
            original={file.original}
            modified={file.modified}
            language={file.language}
          />
        ))}
      </div>

      <DiffActionBar onRevertAll={onRevertAll} onStageAll={onStageAll} />
    </div>
  );
}
