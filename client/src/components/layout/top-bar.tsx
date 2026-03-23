import { useAtom } from "jotai";
import { Sun, Moon, Monitor } from "lucide-react";
import { themePreferenceAtom } from "@/stores/theme-atom";
import { cn } from "@/lib/cn";
import type { ThemePreference } from "@/types/theme";

const themeOptions: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

/**
 * 顶部导航栏
 *
 * 包含应用标题和主题切换按钮组。
 * 纯布局组件，不包含业务逻辑。
 */
export function TopBar() {
  const [themePref, setThemePref] = useAtom(themePreferenceAtom);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      {/* 左侧：应用标题 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">Code Name One</span>
        <span className="rounded bg-accent-muted px-1.5 py-0.5 text-xs font-medium text-accent-text">
          MVP
        </span>
      </div>

      {/* 右侧：主题切换 */}
      <div className="flex items-center gap-0.5 rounded-lg bg-surface-raised p-0.5">
        {themeOptions.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setThemePref(value)}
            title={label}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              themePref === value
                ? "bg-surface text-accent shadow-sm"
                : "text-ink-faint hover:text-ink-muted",
            )}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </header>
  );
}
