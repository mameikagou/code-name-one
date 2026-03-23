import { Settings } from "lucide-react";
import { SidebarSection } from "./sidebar-section";
import { SidebarFooter } from "./sidebar-footer";
import { PinnedConversationItem } from "./pinned-conversation-item";
import { ProjectFolderItem } from "./project-folder-item";
import { ThreadPlaceholder } from "./thread-placeholder";

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
  activeFolderId?: string;
  onFolderClick?: (id: string) => void;
  onConversationClick?: (id: string) => void;
  onSettingsClick?: () => void;
}

/**
 * 完整侧边栏 -- 组合所有子组件
 *
 * 结构：
 * - 置顶会话列表（带分隔间距）
 * - 项目文件夹列表（可含子线程占位）
 * - 底部设置入口
 */
export function Sidebar({
  pinnedConversations,
  projectFolders,
  activeFolderId,
  onFolderClick,
  onConversationClick,
  onSettingsClick,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <SidebarSection>
        {/* 置顶会话 */}
        <div className="mb-6">
          {pinnedConversations.map((conv) => (
            <PinnedConversationItem
              key={conv.id}
              title={conv.title}
              time={conv.time}
              onClick={() => onConversationClick?.(conv.id)}
            />
          ))}
        </div>

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
