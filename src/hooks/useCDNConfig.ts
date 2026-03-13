import type { CDNConfig, CDNNode } from '../types/cdn';

/**
 * GitHub CDN 配置接口
 */
export interface GitHubCDNOptions {
  /** GitHub 用户名 */
  githubUser: string;
  /** GitHub 仓库名 */
  githubRepo: string;
  /** GitHub 分支或 commit ID */
  githubRef?: string;
  /** 自定义 CDN 节点列表 */
  customNodes?: CDNNode[];
  /** 是否自动选择最佳节点 */
  autoSelectBest?: boolean;
  /** 测速超时时间（毫秒） */
  timeout?: number;
  /** 测速重试次数 */
  retryCount?: number;
  /** 本地存储键名 */
  storageKey?: string;
}

/**
 * 默认的 GitHub CDN 节点配置
 * 基于调研报告中的推荐方案
 */
export const DEFAULT_GITHUB_CDN_NODES: CDNNode[] = [
  {
    id: 'jsdelivr-fastly',
    name: 'jsDelivr (Fastly)',
    baseUrl: 'https://fastly.jsdelivr.net/gh',
    description: 'jsDelivr Fastly 节点，国内访问较稳定',
    region: '全球',
    isDefault: true,
  },
  {
    id: 'jsdelivr-main',
    name: 'jsDelivr (Main)',
    baseUrl: 'https://cdn.jsdelivr.net/gh',
    description: 'jsDelivr 主节点',
    region: '全球',
  },
  {
    id: 'jsdelivr-testing',
    name: 'jsDelivr (Testing)',
    baseUrl: 'https://testing.jsdelivr.net/gh',
    description: 'jsDelivr 测试节点',
    region: '全球',
  },
  {
    id: 'jsdmirror',
    name: 'JSD Mirror',
    baseUrl: 'https://cdn.jsdmirror.com/gh',
    description: 'jsDelivr 国内镜像站，腾讯云 EdgeOne 加速',
    region: '中国大陆',
  },
  {
    id: 'zstatic',
    name: 'Zstatic',
    baseUrl: 'https://s4.zstatic.net/gh',
    description: 'Zstatic CDN，支持镜像回源',
    region: '全球',
  },
  {
    id: 'github-raw',
    name: 'GitHub Raw',
    baseUrl: 'https://raw.githubusercontent.com',
    description: 'GitHub 原始文件服务',
    region: '全球',
  },
];

/**
 * 创建 GitHub CDN 配置
 */
export function createGitHubCDNConfig(options: GitHubCDNOptions): CDNConfig {
  const {
    githubUser,
    githubRepo,
    githubRef = 'main',
    customNodes,
    autoSelectBest = true,
    timeout = 5000,
    retryCount = 2,
    storageKey = 'github-cdn-selected-node',
  } = options;

  // 合并自定义节点和默认节点
  const nodes = customNodes && customNodes.length > 0
    ? customNodes
    : DEFAULT_GITHUB_CDN_NODES;

  return {
    githubUser,
    githubRepo,
    githubRef,
    nodes,
    autoSelectBest,
    timeout,
    retryCount,
    storageKey,
  };
}

/**
 * 快速创建简单的 GitHub CDN 配置
 * 适用于快速集成场景
 */
export function createSimpleGitHubCDNConfig(
  githubUser: string,
  githubRepo: string,
  githubRef: string = 'main'
): CDNConfig {
  return createGitHubCDNConfig({
    githubUser,
    githubRepo,
    githubRef,
    autoSelectBest: true,
  });
}
