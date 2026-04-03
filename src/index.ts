// ============================================================
// HX-CDN-Forge v2 — GitHub 文件 CDN 代理 + 大文件差分切片
// ============================================================

// ---- Types ----
export type {
  CDNRegion,
  DownloadMode,
  CompressionEncoding,
  LatencyStatus,
  CDNNode,
  CDNNodeWithLatency,
  GitHubContext,
  ForgeConfig,
  SplitInfo,
  SplitChunkInfo,
  SplitCache,
  ZipInfo,
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

// ---- Core: Manifest (info.yaml / .cache.yaml / info-zip.yaml) ----
export {
  parseInfoYaml,
  serializeInfoYaml,
  parseCacheYaml,
  serializeCacheYaml,
  parseInfoZipYaml,
  serializeInfoZipYaml,
} from './core/manifest';

// ---- Core: Download Mode Resolver ----
export {
  resolveDownloadMode,
  getExtension,
  isTextFile,
  isBinaryFile,
  getFileTypeLabel,
} from './core/modeResolver';

// ---- Core: Decompressor ----
export {
  decompressBlob,
  supportsDecompressionStream,
  supportsEncoding,
} from './core/decompressor';

// ---- Core: Fetcher Engine ----
export { ForgeEngine } from './core/fetcher';

// ---- Core: Chunked Fetcher ----
export { ChunkedFetcher } from './core/chunkedFetcher';
export type { ChunkedFetcherOptions, ChunkedFetchResult } from './core/chunkedFetcher';

// ---- Core: Range Downloader (IDM mode) ----
export { RangeDownloader } from './core/rangeDownloader';
export type { RangeDownloaderOptions } from './core/rangeDownloader';

// ---- React: Context & Hooks ----
export {
  CDNProvider,
  useCDN,
  useCDNUrl,
  useCurrentCDNNode,
  useCDNStatus,
  useReqByCDN,
  useReqByCDNAuto,
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
