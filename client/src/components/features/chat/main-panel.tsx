import type { ReactNode } from "react";
import { Play, PanelRight } from "lucide-react";
import { PanelHeader } from "@/components/ui/panel-header";
import { IconButton } from "@/components/ui/icon-button";
import { Breadcrumb } from "./breadcrumb";
import { ChatMessageArea } from "./chat-message-area";
import { ChatInputV2 } from "./chat-input-v2";

interface MainPanelProps {
  /** 当前会话标题 */
  title: string;
  /** 项目标签 */
  tag?: string;
  /** 聊天消息内容 */
  children: ReactNode;
  /** 模型名称 */
  modelName?: string;
  /** 质量级别 */
  qualityLevel?: string;
  /** 发送消息回调 */
  onSend: (message: string) => void;
  onModelClick?: () => void;
  onQualityClick?: () => void;
}

/**
 * 主面板 -- 组合顶栏 + 聊天内容 + 输入框
 *
 * 对应 HTML 原型中的 .main-panel，中间一栏。
 */
export function MainPanel({
  title,
  tag,
  children,
  modelName,
  qualityLevel,
  onSend,
  onModelClick,
  onQualityClick,
}: MainPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        left={<Breadcrumb title={title} tag={tag} />}
        right={
          <>
            <IconButton icon={<Play size={14} />} />
            <IconButton icon={<PanelRight size={14} />} />
          </>
        }
      />

      <ChatMessageArea>
        {children}
      </ChatMessageArea>

      <ChatInputV2
        onSend={onSend}
        modelName={modelName}
        qualityLevel={qualityLevel}
        onModelClick={onModelClick}
        onQualityClick={onQualityClick}
      />
    </div>
  );
}
