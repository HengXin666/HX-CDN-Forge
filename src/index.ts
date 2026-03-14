// ============================================================
// HX-CDN-Forge — CDN 节点智能选择器
// ============================================================

// ---- Types ----
export type {
  CDNNode,
  CDNConfig,
  CDNContext,
  CDNContextValue,
  CDNProviderProps,
  CDNSourceType,
  CDNRegion,
  CDNLatencyResult,
  CDNNodeWithLatency,
  CDNNodeSelectorProps,
  NodeRenderProps,
  LatencyStatus,
  GitHubCDNOptions,
  CloudflareCDNOptions,
  NPMCDNOptions,
  CDNChunkedDownloadFn,
  ChunkedDownloadProgress,
  ChunkedDownloadResult,
} from './types/cdn';

// ---- Utils ----
export { CDNTester, defaultCDNTester } from './utils/cdnTester';
export {
  CDNManager,
  createCDNManager,
  CDN_NODE_TEMPLATES,
  createGitHubCDNConfig,
  createCloudflareCDNConfig,
  createNPMCDNConfig,
  createMixedCDNConfig,
} from './utils/cdnManager';

// ---- Chunked Loader ----
export {
  ChunkedLoader,
  defaultChunkedLoader,
  CDN_NODE_LIMITS,
} from './utils/chunkedLoader';
export type {
  CDNNodeCapability,
  Chunk,
  ChunkStatus,
  ChunkTask,
  WorkerStats,
  ChunkedLoadOptions,
  DownloadProgress,
  DownloadResult,
} from './utils/chunkedLoader';

// ---- Context & Hooks ----
export {
  CDNProvider,
  useCDN,
  useCDNUrl,
  useCDNStatus,
  useCurrentCDNNode,
  useCDNChunkedDownload,
} from './contexts/CDNContext';

// ---- Components ----
export {
  CDNNodeSelector,
  getLatencyText,
  getLatencyClassName,
  REGION_LABELS,
} from './components/CDNNodeSelector';

// ---- Styles ----
// 用户需手动导入 CSS：
// import 'hx-cdn-forge/dist/styles.css';
