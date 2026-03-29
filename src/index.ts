// ============================================================
// HX-CDN-Forge v2 — GitHub 文件 CDN 代理 + 大文件差分切片
// ============================================================

// ---- Types ----
export type {
  CDNRegion,
  LatencyStatus,
  CDNNode,
  CDNNodeWithLatency,
  GitHubContext,
  ForgeConfig,
  SplitInfo,
  SplitChunkInfo,
  SplitCache,
  LatencyResult,
  DownloadProgress,
  DownloadResult,
  CDNProviderProps,
  CDNContextValue,
  CDNNodeSelectorProps,
  NodeRenderProps,
  SplitCommandOptions,
} from './types';

// ---- Core: Config ----
export { DEFAULTS, normalizeConfig, createForgeConfig } from './core/config';

// ---- Core: CDN Nodes ----
export {
  CDN_NODE_PRESETS,
  DEFAULT_GITHUB_CDN_NODES,
  createWorkerNode,
  CDNTester,
  getSortedNodesWithLatency,
} from './core/cdnNodes';

// ---- Core: Manifest (info.yaml / .cache.yaml) ----
export {
  parseInfoYaml,
  serializeInfoYaml,
  parseCacheYaml,
  serializeCacheYaml,
} from './core/manifest';

// ---- Core: Fetcher Engine ----
export { ForgeEngine } from './core/fetcher';

// ---- Core: Chunked Fetcher ----
export { ChunkedFetcher } from './core/chunkedFetcher';
export type { ChunkedFetcherOptions, ChunkedFetchResult } from './core/chunkedFetcher';

// ---- React: Context & Hooks ----
export {
  CDNProvider,
  useCDN,
  useCDNUrl,
  useCurrentCDNNode,
  useCDNStatus,
  useReqByCDN,
} from './react/CDNContext';

// ---- React: Components ----
export {
  CDNNodeSelector,
  getLatencyText,
  getLatencyClassName,
  REGION_LABELS,
} from './react/CDNNodeSelector';

// ---- Styles ----
// 用户需手动导入 CSS：
// import 'hx-cdn-forge/styles.css';
