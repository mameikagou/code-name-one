/**
 * @file Sidebar 容器 — 纯逻辑组装，零装饰样式
 *
 * 职责：调用 hooks 获取数据，传给展示组件。
 * 所有视觉样式在子组件（ConversationList / ConversationItem）中定义。
 *
 * 重构说明（原 mock 数据已删除）：
 *   - MOCK_CONVERSATIONS → useSessions() 真实 API
 *   - useState(selectedId) → selectedSessionIdAtom (Jotai 跨面板共享)
 *   - "新建" 按钮 → useCreateSession() mutation
 */

import { useAtom } from "jotai";
import { Plus, Loader2 } from "lucide-react";
import { ConversationList } from "./conversation-list";
import { Button } from "@/components/ui/button";
import { useSessions, useCreateSession } from "@/hooks/use-sessions";
import { selectedSessionIdAtom } from "@/stores/session-atom";

export function SidebarContainer() {
  const { data: sessions, isLoading } = useSessions();
  const createSession = useCreateSession();
  const [selectedId, setSelectedId] = useAtom(selectedSessionIdAtom);

  function handleNewSession() {
    createSession.mutate(
      { title: "New conversation" },
      {
        onSuccess: (session) => {
          // 创建成功后自动选中新会话
          setSelectedId(session.id);
        },
      },
    );
  }

  // 将 API Session 映射为 ConversationList 需要的格式
  const items = (sessions ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    preview: "",
    timestamp: formatRelativeTime(s.updatedAt),
  }));

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：新建对话按钮 */}
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Conversations
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewSession}
          disabled={createSession.isPending}
        >
          {createSession.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </Button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-ink-muted" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-4 text-center text-sm text-ink-muted">
            No conversations yet
          </div>
        ) : (
          <ConversationList
            items={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </div>
    </div>
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
