import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/** 用户可选的主题偏好：跟随系统 / 强制浅色 / 强制深色 */
export type ThemePreference = "light" | "dark" | "system";

/** 实际应用的主题（解析 system 后的结果） */
export type ResolvedTheme = "light" | "dark";

/**
 * 持久化到 localStorage 的主题偏好 atom。
 * key: "codex-theme"，默认值: "system"
 */
export const themePreferenceAtom = atomWithStorage<ThemePreference>(
  "codex-theme",
  "system",
);

/**
 * 派生 atom：将 "system" 解析为实际的 "light" | "dark"。
 * 读取 window.matchMedia 判断系统偏好。
 */
export const resolvedThemeAtom = atom<ResolvedTheme>((get) => {
  const pref = get(themePreferenceAtom);
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
});
