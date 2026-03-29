/**
 * 全局配置 — 默认值 + 配置工厂
 */

import type { ForgeConfig, GitHubContext } from '../types';
import { DEFAULT_GITHUB_CDN_NODES } from './cdnNodes';

/** 默认配置值 */
export const DEFAULTS = {
  splitThreshold: 20 * 1024 * 1024,   // 20MB
  chunkSizeForSplit: 19 * 1024 * 1024, // 切片时使用 19MB (留余量)
  testTimeout: 5000,
  testRetries: 2,
  maxConcurrency: 6,
  chunkTimeout: 30_000,
  maxRetries: 3,
  enableWorkStealing: true,
  turboMode: false,
  turboConcurrentCDNs: 3,
  storageKey: 'hx-cdn-forge-node',
  autoTest: true,
} as const;

/** 规范化配置 (填充默认值) */
export function normalizeConfig(config: ForgeConfig): Required<ForgeConfig> {
  return {
    github: config.github,
    nodes: config.nodes ?? DEFAULT_GITHUB_CDN_NODES,
    defaultNodeId: config.defaultNodeId ?? '',
    autoTest: config.autoTest ?? DEFAULTS.autoTest,
    testTimeout: config.testTimeout ?? DEFAULTS.testTimeout,
    testRetries: config.testRetries ?? DEFAULTS.testRetries,
    splitThreshold: config.splitThreshold ?? DEFAULTS.splitThreshold,
    mappingPrefix: config.mappingPrefix ?? '',
    splitStoragePath: config.splitStoragePath ?? '',
    storageKey: config.storageKey ?? DEFAULTS.storageKey,
    maxConcurrency: config.maxConcurrency ?? DEFAULTS.maxConcurrency,
    chunkTimeout: config.chunkTimeout ?? DEFAULTS.chunkTimeout,
    maxRetries: config.maxRetries ?? DEFAULTS.maxRetries,
    enableWorkStealing: config.enableWorkStealing ?? DEFAULTS.enableWorkStealing,
    turboMode: config.turboMode ?? DEFAULTS.turboMode,
    turboConcurrentCDNs: config.turboConcurrentCDNs ?? DEFAULTS.turboConcurrentCDNs,
  };
}

/**
 * 快速创建配置
 *
 * @example
 * ```ts
 * const config = createForgeConfig({
 *   user: 'HengXin666',
 *   repo: 'my-assets',
 *   ref: 'bot-a1b2c3-20260329', // 推荐使用 tag
 * });
 * ```
 */
export function createForgeConfig(
  github: GitHubContext,
  options?: Partial<Omit<ForgeConfig, 'github'>>,
): ForgeConfig {
  return {
    github,
    ...options,
  };
}
