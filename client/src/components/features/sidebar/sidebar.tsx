import { Settings, Plus, Loader2, MessageSquare } from "lucide-react";
import { SidebarSection } from "./sidebar-section";
import { SidebarFooter } from "./sidebar-footer";
import { PinnedConversationItem } from "./pinned-conversation-item";
import { ProjectFolderItem } from "./project-folder-item";
import { ThreadPlaceholder } from "./thread-placeholder";
import { Button } from "@/components/ui/button";

/**
 * 侧边栏数据类型定义
 */
interface PinnedConversation {
  id: string;
  title: string;
  time: string;
}

interface ProjectFolder {
  id: string;
  name: string;
  isActive?: boolean;
  threadPlaceholder?: string;
}

interface SidebarProps {
  pinnedConversations: PinnedConversation[];
  projectFolders: ProjectFolder[];
  /** 当前选中的会话 ID，用于高亮 */
  activeConversationId?: string | null;
  activeFolderId?: string;
  /** 新建会话回调 */
  onNewSession?: () => void;
  /** 新建会话进行中 */
  isCreating?: boolean;
  onFolderClick?: (id: string) => void;
  onConversationClick?: (id: string) => void;
  onSettingsClick?: () => void;
}

/**
 * 完整侧边栏 -- 组合所有子组件
 *
 * 结构：
 * - 顶部新建按钮
 * - 会话列表（带分隔间距）
 * - 项目文件夹列表（可含子线程占位）
 * - 底部设置入口
 */
export function Sidebar({
  pinnedConversations,
  projectFolders,
  activeConversationId,
  activeFolderId,
  onNewSession,
  isCreating = false,
  onFolderClick,
  onConversationClick,
  onSettingsClick,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      {/* 顶部：标题 + 新建按钮 */}
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Sessions
        </span>
        {onNewSession ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewSession}
            disabled={isCreating}
          >
            {isCreating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
          </Button>
        ) : null}
      </div>

      <SidebarSection>
        {/* 会话列表 */}
        {pinnedConversations.length > 0 ? (
          <div className="mb-6">
            {pinnedConversations.map((conv) => (
              <PinnedConversationItem
                key={conv.id}
                title={conv.title}
                time={conv.time}
                isActive={conv.id === activeConversationId}
                onClick={() => onConversationClick?.(conv.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-ink-muted">
            <MessageSquare size={24} className="mb-2 opacity-40" />
            <p className="text-xs">No conversations yet</p>
          </div>
        )}

        {/* 项目文件夹 */}
        {projectFolders.map((folder) => (
          <ProjectFolderItem
            key={folder.id}
            name={folder.name}
            isActive={folder.id === activeFolderId}
            onClick={() => onFolderClick?.(folder.id)}
          >
            {folder.threadPlaceholder ? (
              <ThreadPlaceholder text={folder.threadPlaceholder} />
            ) : null}
          </ProjectFolderItem>
        ))}
      </SidebarSection>

      <SidebarFooter>
        <button
          type="button"
          onClick={onSettingsClick}
          className="flex cursor-pointer items-center gap-2 text-ink-muted transition-colors hover:text-ink"
        >
          <Settings size={14} />
          <span className="text-[13px]">设置</span>
        </button>
      </SidebarFooter>
    </div>
  );
}
