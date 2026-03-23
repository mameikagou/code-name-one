/**
 * @file Sidebar 容器 — 纯逻辑组装，零装饰样式
 *
 * 职责：调用 hooks 获取数据，传给 Sidebar 展示组件。
 *
 * 重构说明（本次改动）：
 *   - 原始 ConversationList + 手写 header → 委托给 Sidebar 完整面板组件
 *   - sessions 数据映射为 pinnedConversations 格式
 *   - 硬编码 projectFolders（当前 API 无文件夹概念）
 *   - 新建会话逻辑通过 props 传入 Sidebar
 */

import { useAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { Sidebar } from "./sidebar";
import { useSessions, useCreateSession } from "@/hooks/use-sessions";
import { selectedSessionIdAtom } from "@/stores/session-atom";

/** 硬编码项目文件夹（后续可从 API 获取） */
const PROJECT_FOLDERS = [
  { id: "default", name: "code-name-one" },
];

export function SidebarContainer() {
  const { data: sessions, isLoading } = useSessions();
  const createSession = useCreateSession();
  const [selectedId, setSelectedId] = useAtom(selectedSessionIdAtom);

  function handleNewSession() {
    createSession.mutate(
      { title: "New conversation" },
      {
        onSuccess: (session) => {
          setSelectedId(session.id);
        },
      },
    );
  }

  // 将 API Session 映射为 Sidebar 需要的 pinnedConversations 格式
  const pinnedConversations = (sessions ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    time: formatRelativeTime(s.updatedAt),
  }));

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <Sidebar
      pinnedConversations={pinnedConversations}
      projectFolders={PROJECT_FOLDERS}
      activeConversationId={selectedId}
      activeFolderId="default"
      onNewSession={handleNewSession}
      isCreating={createSession.isPending}
      onConversationClick={setSelectedId}
      onSettingsClick={() => {
        // TODO: 打开设置面板
      }}
    />
  );
}

/** 简单的相对时间格式化 */
function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
