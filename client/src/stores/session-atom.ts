/**
 * @file 选中会话状态 — Jotai atom
 *
 * 为什么用 Jotai 而不是 TanStack Query？
 * "当前选中哪个会话" 是纯客户端 UI 状态，不是服务端数据。
 * Jotai atom 让 sidebar 和 chat 面板共享这个状态，零 props drilling。
 */

import { atom } from "jotai";

/** 当前选中的会话 ID，null 表示未选中任何会话 */
export const selectedSessionIdAtom = atom<string | null>(null);
