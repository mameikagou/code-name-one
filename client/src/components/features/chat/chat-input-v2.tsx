import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ModelSelector } from "./model-selector";
import { QualitySelector } from "./quality-selector";
import { SendButton } from "./send-button";

interface ChatInputProps {
  placeholder?: string;
  modelName?: string;
  qualityLevel?: string;
  onSend: (message: string) => void;
  onModelClick?: () => void;
  onQualityClick?: () => void;
  disabled?: boolean;
}

/**
 * 聊天输入框 -- 对应 HTML 原型中的 .input-box
 *
 * 结构：
 * - textarea 文本输入区
 * - 工具栏：附件按钮 | 模型选择器 | 质量选择器 | 发送按钮
 */
export function ChatInputV2({
  placeholder = "要求后续变更",
  modelName = "GPT-5.4",
  qualityLevel = "超高",
  onSend,
  onModelClick,
  onQualityClick,
  disabled = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <div className="px-8 pb-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-3 shadow-sm"
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          className="w-full resize-none bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconButton icon={<Plus size={14} />} className="text-ink-muted" />
            <ModelSelector model={modelName} onClick={onModelClick} />
            <QualitySelector level={qualityLevel} onClick={onQualityClick} />
          </div>
          <SendButton disabled={disabled || !value.trim()} />
        </div>
      </form>
    </div>
  );
}
