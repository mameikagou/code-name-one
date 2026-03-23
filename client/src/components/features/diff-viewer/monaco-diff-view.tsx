import { DiffEditor } from "@monaco-editor/react";
import { useAtomValue } from "jotai";
import { resolvedThemeAtom } from "@/stores/theme-atom";

interface MonacoDiffViewProps {
  original: string;
  modified: string;
  language?: string;
}

/**
 * Monaco DiffEditor 封装 -- 文件 diff 渲染核心
 *
 * 为什么封装一层：
 * 1. 统一主题跟随（读 Jotai resolvedThemeAtom，映射到 Monaco 的 vs / vs-dark）
 * 2. 统一 readonly + inline diff 等默认配置
 * 3. 隔离 Monaco 的重型依赖，方便后续 lazy load
 */
export function MonacoDiffView({
  original,
  modified,
  language = "plaintext",
}: MonacoDiffViewProps) {
  const theme = useAtomValue(resolvedThemeAtom);
  const monacoTheme = theme === "dark" ? "vs-dark" : "vs";

  return (
    <DiffEditor
      original={original}
      modified={modified}
      language={language}
      theme={monacoTheme}
      options={{
        readOnly: true,
        renderSideBySide: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: "on",
        fontSize: 12,
        fontFamily: "var(--font-code)",
        automaticLayout: true,
        scrollbar: {
          vertical: "auto",
          horizontal: "auto",
        },
      }}
      height="300px"
    />
  );
}
