/**
 * HX-CDN-Forge 类型定义
 * 统一的类型系统，所有模块共享
 */

// ============================================================
// 基础类型
// ============================================================

/** CDN 源类型 */
export type CDNSourceType = 'github' | 'cloudflare' | 'custom' | 'npm' | 'jsdelivr';

/** CDN 节点地区 */
export type CDNRegion = 'china' | 'asia' | 'global';

/** 延迟状态 */
export type LatencyStatus = 'idle' | 'testing' | 'success' | 'failed';

// ============================================================
// 核心接口
// ============================================================

/**
 * CDN 节点配置
 */
export interface CDNNode {
  /** 节点唯一标识 */
  id: string;
  /** 节点显示名称 */
  name: string;
  /** 基础 URL */
  baseUrl: string;
  /** 节点所在地区 */
  region: CDNRegion;
  /** CDN 源类型 */
  sourceType: CDNSourceType;
  /**
   * URL 构建函数
   * @param baseUrl - CDN 基础 URL
   * @param resourcePath - 资源路径
   * @param context - 可选的上下文信息
   */
  buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => string;
  /** 测速资源路径（可选，默认使用 baseUrl 本身） */
  testPath?: string;
  /** 节点图标 URL 或 emoji（可选） */
  icon?: string;
  /** 节点描述（可选） */
  description?: string;
  /** 是否启用（默认 true） */
  enabled?: boolean;
}

/**
 * CDN 上下文信息 — 用于 URL 构建
 */
export interface CDNContext {
  /** GitHub 用户名 */
  githubUser?: string;
  /** GitHub 仓库名 */
  githubRepo?: string;
  /** GitHub 分支或 commit hash */
  githubRef?: string;
  /** Cloudflare Worker 域名 */
  cfWorkerDomain?: string;
  /** NPM 包名 */
  npmPackage?: string;
  /** NPM 版本 */
  npmVersion?: string;
  /** 自定义配置（扩展用） */
  customConfig?: Record<string, unknown>;
}

/**
 * CDN 配置
 */
export interface CDNConfig {
  /** CDN 上下文信息 */
  context: CDNContext;
  /** CDN 节点列表 */
  nodes: CDNNode[];
  /** 默认节点 ID（可选） */
  defaultNodeId?: string;
  /** 测速超时时间（毫秒，默认 5000） */
  testTimeout?: number;
  /** 测速失败重试次数（默认 2） */
  testRetries?: number;
  /** 是否在首次加载时自动测速并选择最佳节点（默认 true） */
  autoTestOnMount?: boolean;
  /** localStorage 存储键名（默认 'hx-cdn-forge-selected-node'） */
  storageKey?: string;
}

// ============================================================
// 延迟测速相关
// ============================================================

/**
 * 单个节点的延迟测试结果
 */
export interface CDNLatencyResult {
  /** 节点 ID */
  nodeId: string;
  /** 延迟时间（毫秒），-1 表示连接失败 */
  latency: number;
  /** 测速时间戳 */
  timestamp: number;
  /** 是否测速成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 带延迟信息的节点（UI 层使用）
 */
export interface CDNNodeWithLatency extends CDNNode {
  /** 延迟时间（毫秒） */
  latency?: number;
  /** 延迟状态 */
  latencyStatus?: LatencyStatus;
}

// ============================================================
// React 组件相关
// ============================================================

/**
 * CDN Provider Props
 */
export interface CDNProviderProps {
  /** CDN 配置 */
  config: CDNConfig;
  /** 子组件 */
  children: React.ReactNode;
  /** 初始化完成回调 */
  onInitialized?: (currentNode: CDNNode | null) => void;
  /** 节点选择变化回调 */
  onNodeChange?: (node: CDNNode) => void;
}

/**
 * CDN Context 值 — 由 useCDN() 返回
 */
export interface CDNContextValue {
  /** CDN 配置 */
  config: CDNConfig;
  /** 当前选中的节点 */
  currentNode: CDNNode | null;
  /** 所有节点（带延迟信息，按延迟排序） */
  nodes: CDNNodeWithLatency[];
  /** 是否正在测速 */
  isTesting: boolean;
  /** 是否已初始化 */
  isInitialized: boolean;
  /** 测速结果 Map */
  latencyResults: Map<string, CDNLatencyResult>;
  /** 选择节点 */
  selectNode: (nodeId: string) => void;
  /** 测试所有节点延迟 */
  testAllNodes: () => Promise<CDNLatencyResult[]>;
  /** 构建 CDN URL */
  buildUrl: (resourcePath: string) => string;
  /** 获取按延迟排序的节点列表 */
  getSortedNodes: () => CDNNodeWithLatency[];
}

// ============================================================
// 组件自定义化相关
// ============================================================

/**
 * 节点渲染函数 Props
 */
export interface NodeRenderProps {
  node: CDNNodeWithLatency;
  isSelected: boolean;
  isDisabled: boolean;
  latencyText: string;
  latencyClassName: string;
  onSelect: () => void;
}

/**
 * CDN 节点选择器 Props
 */
export interface CDNNodeSelectorProps {
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 是否显示延迟信息（默认 true） */
  showLatency?: boolean;
  /** 是否显示区域信息（默认 true） */
  showRegion?: boolean;
  /** 标题（默认 'CDN 节点'） */
  title?: string;
  /** 是否显示刷新按钮（默认 true） */
  showRefreshButton?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 紧凑模式（默认 false） */
  compact?: boolean;
  /** 选择变化回调 */
  onChange?: (node: CDNNode) => void;
  /** 测速完成回调 */
  onTestComplete?: (results: CDNLatencyResult[]) => void;
  /** 自定义触发按钮渲染 */
  renderTrigger?: (props: { currentNode: CDNNode | null; isOpen: boolean; isTesting: boolean }) => React.ReactNode;
  /** 自定义节点项渲染 */
  renderNode?: (props: NodeRenderProps) => React.ReactNode;
  /** 自定义空状态渲染 */
  renderEmpty?: () => React.ReactNode;
  /** 自定义加载状态渲染 */
  renderLoading?: () => React.ReactNode;
}

// ============================================================
// 简化配置工厂的选项类型
// ============================================================

/**
 * GitHub CDN 快捷配置选项
 */
export interface GitHubCDNOptions {
  /** GitHub 用户名 */
  user: string;
  /** GitHub 仓库名 */
  repo: string;
  /** 分支名或 commit hash（默认 'main'） */
  ref?: string;
  /** 自定义节点列表（覆盖默认节点） */
  nodes?: CDNNode[];
  /** 额外追加的节点 */
  extraNodes?: CDNNode[];
  /** 默认节点 ID */
  defaultNodeId?: string;
  /** 是否自动测速（默认 true） */
  autoTest?: boolean;
  /** 测速超时（毫秒，默认 5000） */
  timeout?: number;
  /** localStorage 键名 */
  storageKey?: string;
}

/**
 * Cloudflare Worker CDN 快捷配置选项
 */
export interface CloudflareCDNOptions {
  /** Worker 域名 */
  workerDomain: string;
  /** GitHub 信息（用于构建代理 URL） */
  github?: { user: string; repo: string; ref?: string };
  /** 额外追加的节点 */
  extraNodes?: CDNNode[];
}

/**
 * NPM CDN 快捷配置选项
 */
export interface NPMCDNOptions {
  /** NPM 包名 */
  package: string;
  /** NPM 版本（默认 'latest'） */
  version?: string;
  /** 自定义节点列表 */
  nodes?: CDNNode[];
}
