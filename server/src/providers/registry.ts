/**
 * @file ProviderRegistry — AI Provider 注册中心（单例）
 *
 * 设计意图：统一管理所有 AI Provider 的注册和查找。
 * 上层 Service 通过 type 获取 Provider 实例，无需关心具体实现。
 *
 * MVP 阶段只注册 ClaudeProvider，后续按需添加 Codex/OpenCode。
 *
 * 参考：specs/design/ai-provider-interface.md §4
 */

import type { IAiProvider, ProviderType } from "../types/ai-provider";
import { ClaudeProvider } from "./claude";

export class ProviderRegistry {
  /** 已注册的 Provider 映射 */
  private readonly providers = new Map<ProviderType, IAiProvider>();

  constructor() {
    // MVP：只注册 Claude Provider
    this.register(new ClaudeProvider());
  }

  /**
   * 注册一个 Provider
   *
   * @param provider - 实现 IAiProvider 接口的 Provider 实例
   */
  register(provider: IAiProvider): void {
    this.providers.set(provider.type, provider);
  }

  /**
   * 获取指定类型的 Provider
   *
   * @param type - Provider 类型
   * @returns Provider 实例
   * @throws Error 如果类型未注册
   */
  get(type: ProviderType): IAiProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Provider "${type}" is not registered`);
    }
    return provider;
  }

  /**
   * 获取所有已安装且可用的 Provider 类型
   *
   * 并行检测所有已注册 Provider 的可用性。
   */
  async getAvailable(): Promise<ProviderType[]> {
    const entries = Array.from(this.providers.entries());

    const results = await Promise.allSettled(
      entries.map(async ([type, provider]) => {
        const available = await provider.isAvailable();
        return { type, available };
      })
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<{ type: ProviderType; available: boolean }> =>
          r.status === "fulfilled" && r.value.available
      )
      .map((r) => r.value.type);
  }

  /**
   * 返回所有已注册的 Provider 类型（不检测可用性）
   */
  listRegistered(): ProviderType[] {
    return Array.from(this.providers.keys());
  }
}

/**
 * 全局单例 ProviderRegistry
 *
 * 整个应用共享一个 registry 实例。
 */
export const providerRegistry = new ProviderRegistry();
