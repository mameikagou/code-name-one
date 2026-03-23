import { ConversationItem } from "./conversation-item";

interface Conversation {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
}

interface ConversationListProps {
  items: readonly Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * 对话列表 -- 纯展示组件
 *
 * 接收对话数组，渲染列表。
 * 不涉及数据获取，所有数据通过 props 传入。
 */
export function ConversationList({ items, selectedId, onSelect }: ConversationListProps) {
  return (
    <div className="flex flex-col gap-0.5 p-2">
      {items.map((item) => (
        <ConversationItem
          key={item.id}
          title={item.title}
          preview={item.preview}
          timestamp={item.timestamp}
          isSelected={item.id === selectedId}
          onClick={() => onSelect(item.id)}
        />
      ))}
    </div>
  );
}
