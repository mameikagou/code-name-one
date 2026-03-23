import { createFileRoute } from "@tanstack/react-router";

/**
 * 首页路由 -- 默认入口
 *
 * 当前为空壳，AppShell 的内容由 __root.tsx 渲染。
 * 后续可在此处添加首页特定逻辑。
 */
export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  return null;
}
