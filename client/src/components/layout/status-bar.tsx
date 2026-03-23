/**
 * 底部状态栏 -- Codex 风格
 *
 * 显示连接状态、当前模型等信息。
 * 当前为占位实现，后续接入真实状态。
 */
export function StatusBar() {
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-surface px-3">
      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-diff-added" />
        <span className="text-xs text-ink-muted">Ready</span>
      </div>
      <span className="text-xs text-ink-faint">v0.1.0</span>
    </footer>
  );
}
