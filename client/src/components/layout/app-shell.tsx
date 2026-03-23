import { Panel, PanelGroup } from "react-resizable-panels";
import { ResizeHandle } from "./panel-resize-handle";
import { TopBar } from "./top-bar";
import { StatusBar } from "./status-bar";
import type { ReactNode } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  main: ReactNode;
  detail: ReactNode;
}

/**
 * AppShell -- 三栏可拖拽布局骨架
 *
 * 架构设计：
 * - 布局组件只定义结构（尺寸、拖拽手柄、折叠行为）
 * - 具体内容通过 children/slots 注入
 * - 这样可以在不触碰布局代码的情况下，替换面板内容
 *
 * 面板配置（参考 Codex 截图）：
 * - 左栏 Sidebar: 20% 默认宽度，可折叠，对话列表
 * - 中栏 Main:    50% 默认宽度，核心聊天区
 * - 右栏 Detail:  30% 默认宽度，可折叠，代码 diff
 */
export function AppShell({ sidebar, main, detail }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface text-ink">
      <TopBar />

      <PanelGroup direction="horizontal" className="flex-1">
        {/* 左栏：Sidebar */}
        <Panel
          defaultSize={20}
          minSize={15}
          maxSize={30}
          collapsible
          collapsedSize={0}
          id="sidebar"
          order={1}
        >
          <div className="h-full overflow-hidden border-r border-border bg-surface-raised">
            {sidebar}
          </div>
        </Panel>

        <ResizeHandle />

        {/* 中栏：Main */}
        <Panel defaultSize={50} minSize={30} id="main" order={2}>
          <div className="h-full overflow-hidden bg-surface">
            {main}
          </div>
        </Panel>

        <ResizeHandle />

        {/* 右栏：Detail */}
        <Panel
          defaultSize={30}
          minSize={20}
          maxSize={50}
          collapsible
          collapsedSize={0}
          id="detail"
          order={3}
        >
          <div className="h-full overflow-hidden border-l border-border bg-surface-raised">
            {detail}
          </div>
        </Panel>
      </PanelGroup>

      <StatusBar />
    </div>
  );
}
