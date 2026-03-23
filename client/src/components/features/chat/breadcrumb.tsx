import { Tag } from "@/components/ui/tag";

interface BreadcrumbProps {
  title: string;
  tag?: string;
}

/**
 * 面包屑 -- 主面板顶栏左侧
 *
 * 显示当前会话标题 + 项目标签，标题截断处理。
 */
export function Breadcrumb({ title, tag }: BreadcrumbProps) {
  return (
    <div className="flex items-center gap-1.5 text-ink-muted">
      <span className="truncate font-medium text-ink">{title}</span>
      {tag ? <Tag>{tag}</Tag> : null}
      <span className="text-ink-faint">···</span>
    </div>
  );
}
