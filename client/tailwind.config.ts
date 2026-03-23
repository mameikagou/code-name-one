import type { Config } from "tailwindcss";

/**
 * Tailwind 配置 -- CSS 变量桥接
 *
 * 核心思路：不使用 Tailwind 的 dark: modifier，而是把 CSS Custom Properties
 * 映射为 Tailwind 工具类。切换主题只需修改 html[data-theme] 属性，
 * 所有用到 bg-surface / text-ink 等类的元素自动跟随变化。
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          muted: "var(--color-accent-muted)",
          text: "var(--color-accent-text)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          muted: "var(--color-ink-muted)",
          faint: "var(--color-ink-faint)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          overlay: "var(--color-surface-overlay)",
          sunken: "var(--color-surface-sunken)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        diff: {
          added: "var(--color-diff-added)",
          removed: "var(--color-diff-removed)",
          "added-bg": "var(--color-diff-added-bg)",
          "removed-bg": "var(--color-diff-removed-bg)",
        },
        skill: "var(--color-skill)",
        "panel-handle": {
          DEFAULT: "var(--color-panel-handle)",
          hover: "var(--color-panel-handle-hover)",
        },
      },
      fontFamily: {
        ui: "var(--font-ui)",
        code: "var(--font-code)",
      },
    },
  },
  plugins: [],
} satisfies Config;
