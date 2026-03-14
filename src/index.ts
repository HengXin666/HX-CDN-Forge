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

// ---- Context & Hooks ----
export {
  CDNProvider,
  useCDN,
  useCDNUrl,
  useCDNStatus,
  useCurrentCDNNode,
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
