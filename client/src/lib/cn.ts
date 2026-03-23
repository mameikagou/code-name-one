import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并 className 的工具函数。
 * clsx 负责条件拼接，twMerge 负责去重冲突的 Tailwind 类。
 *
 * 用法：cn("px-4 py-2", isActive && "bg-accent", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
