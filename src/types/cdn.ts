/**
 * CDN 节点类型定义
 */

/**
 * CDN 源类型
 */
export type CDNSourceType = 'github' | 'cloudflare' | 'custom' | 'npm' | 'jsdelivr';

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
  region: 'china' | 'asia' | 'global';
  /** CDN 源类型 */
  sourceType: CDNSourceType;
  /** 
   * URL 构建函数
   * @param baseUrl - CDN 基础 URL
   * @param resourcePath - 资源路径
   * @param context - 可选的上下文信息
   */
  buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => string;
  /** 测速资源路径（可选，默认使用 '/') */
  testPath?: string;
  /** 节点图标（可选） */
  icon?: string;
}

/**
 * CDN 上下文信息
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
  /** 自定义配置 */
  customConfig?: Record<string, any>;
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
  /** 是否在首次加载时自动测速（默认 true） */
  autoTestOnMount?: boolean;
  /** localStorage 存储键名（默认 'cdn-selected-node'） */
  storageKey?: string;
}

/**
 * 节点延迟信息
 */
export interface NodeLatency {
  /** 节点 ID */
  nodeId: string;
  /** 延迟时间（毫秒），null 表示连接失败 */
  latency: number | null;
  /** 测速时间戳 */
  timestamp: number;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * CDN 状态
 */
export interface CDNStatus {
  /** 当前选中的节点 */
  currentNode: CDNNode | null;
  /** 所有节点的延迟数据 */
  nodeLatencies: Map<string, NodeLatency>;
  /** 是否正在测速 */
  isTesting: boolean;
  /** 上次测速时间 */
  lastTestTime: number | null;
}

/**
 * CDN Provider Props
 */
export interface CDNProviderProps {
  /** CDN 配置 */
  config: CDNConfig;
  /** 子组件 */
  children: React.ReactNode;
}

/**
 * CDN Context 值
 */
export interface CDNContextValue {
  /** CDN 配置 */
  config: CDNConfig;
  /** 当前选中的节点 */
  currentNode: CDNNode | null;
  /** 所有节点的延迟数据 */
  nodeLatencies: Map<string, NodeLatency>;
  /** 是否正在测速 */
  isTesting: boolean;
  /** 测试所有节点延迟 */
  testLatencies: () => Promise<void>;
  /** 选择节点 */
  selectNode: (nodeId: string) => void;
  /** 获取 CDN URL */
  getCdnUrl: (resourcePath: string) => string;
  /** 获取所有节点（按延迟排序） */
  getSortedNodes: () => Array<CDNNode & { latency: number | null }>;
}
