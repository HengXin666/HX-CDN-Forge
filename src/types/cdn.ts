/**
 * CDN 节点配置类型定义
 */
export interface CDNNode {
  /** 节点唯一标识 */
  id: string;
  /** 节点名称 */
  name: string;
  /** 节点基础 URL */
  baseUrl: string;
  /** 节点描述 */
  description?: string;
  /** 节点区域 */
  region?: string;
  /** 是否为默认节点 */
  isDefault?: boolean;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * CDN 节点测速结果
 */
export interface CDNLatencyResult {
  /** 节点 ID */
  nodeId: string;
  /** 延迟时间（毫秒），-1 表示测速失败 */
  latency: number;
  /** 测速时间戳 */
  timestamp: number;
  /** 是否测速成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * CDN 配置
 */
export interface CDNConfig {
  /** GitHub 用户名 */
  githubUser: string;
  /** GitHub 仓库名 */
  githubRepo: string;
  /** GitHub 分支或 commit ID */
  githubRef: string;
  /** 可用的 CDN 节点列表 */
  nodes: CDNNode[];
  /** 测速超时时间（毫秒） */
  timeout?: number;
  /** 测速重试次数 */
  retryCount?: number;
  /** 自动选择最佳节点 */
  autoSelectBest?: boolean;
  /** 本地存储键名 */
  storageKey?: string;
}

/**
 * GitHub CDN 路径类型
 */
export type GitHubPathType = 'default' | 'latest-commit' | 'custom';
