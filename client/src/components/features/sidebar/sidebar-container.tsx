import { useState } from "react";
import { Plus } from "lucide-react";
import { ConversationList } from "./conversation-list";
import { Button } from "@/components/ui/button";

/**
 * 占位对话数据 -- 后续替换为 TanStack Query 数据获取
 */
const MOCK_CONVERSATIONS = [
  { id: "1", title: "Debug auth flow", preview: "Fix the token refresh logic...", timestamp: "2m" },
  { id: "2", title: "Add user settings", preview: "Create settings page with...", timestamp: "1h" },
  { id: "3", title: "Refactor API layer", preview: "Move to tRPC for type-safe...", timestamp: "3h" },
  { id: "4", title: "Setup CI pipeline", preview: "Configure GitHub Actions...", timestamp: "1d" },
] as const;

/**
 * Sidebar 容器组件 -- 数据 + 状态
 *
 * 职责：管理对话列表数据和选中状态。
 * 当前使用 mock 数据，后续接入 TanStack Query。
 * 渲染委托给 ConversationList 纯展示组件。
 */
export function SidebarContainer() {
  const [selectedId, setSelectedId] = useState<string | null>("1");

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：新建对话按钮 */}
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Conversations
        </span>
        <Button variant="ghost" size="sm">
          <Plus size={14} />
        </Button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto">
        <ConversationList
          items={MOCK_CONVERSATIONS}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    </div>
  );
}
