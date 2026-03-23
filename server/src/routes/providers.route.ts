/**
 * @file Providers 路由定义
 *
 * 设计意图：返回已安装可用的 AI Provider 列表及其支持的模型。
 * 前端用此端点渲染 Provider 选择 UI。
 */

import { Hono } from "hono";
import { providerRegistry } from "../providers/registry";

// ============================================================
// 路由定义
// ============================================================

export const providersRoute = new Hono()

  // GET /api/providers — 可用 Provider 列表
  .get("/api/providers", async (c) => {
    const registered = providerRegistry.listRegistered();

    const providerInfos = await Promise.all(
      registered.map(async (type) => {
        const provider = providerRegistry.get(type);
        const [available, models] = await Promise.all([
          provider.isAvailable(),
          provider.listModels(),
        ]);
        return { type, available, models };
      })
    );

    return c.json({ data: providerInfos });
  });
