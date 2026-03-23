import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { SidebarContainer } from "@/components/features/sidebar/sidebar-container";
import { ChatContainer } from "@/components/features/chat/chat-container";
import { DiffContainer } from "@/components/features/diff-viewer/diff-container";

/**
 * 根路由 -- 包裹 AppShell 三栏布局
 *
 * 将三个 feature container 注入到 AppShell 的三个 slot 中。
 * Outlet 暂时不渲染额外内容（子路由后续扩展）。
 */
export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <AppShell
        sidebar={<SidebarContainer />}
        main={<ChatContainer />}
        detail={<DiffContainer />}
      />
      <Outlet />
    </>
  );
}
