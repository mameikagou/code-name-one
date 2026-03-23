import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { Provider as JotaiProvider, useAtomValue } from "jotai";
import { resolvedThemeAtom } from "@/stores/theme-atom";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/**
 * 主题同步组件：监听 resolvedThemeAtom，
 * 将解析后的主题写入 html[data-theme] 属性。
 * 这样 CSS 变量自动切换，零组件重渲染。
 */
function ThemeSync() {
  const theme = useAtomValue(resolvedThemeAtom);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return null;
}

export function App() {
  return (
    <JotaiProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeSync />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </JotaiProvider>
  );
}
