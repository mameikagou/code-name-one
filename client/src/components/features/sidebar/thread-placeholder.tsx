interface ThreadPlaceholderProps {
  text: string;
}

/**
 * 线程占位符 -- 文件夹下"无线程"提示
 *
 * 缩进 + 小字号 + 浅色，表示当前项目下没有活跃线程。
 */
export function ThreadPlaceholder({ text }: ThreadPlaceholderProps) {
  return (
    <div className="mb-0.5 py-1.5 pl-8 text-xs text-ink-faint">
      {text}
    </div>
  );
}
