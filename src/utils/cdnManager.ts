import type {
  CDNConfig,
  CDNNode,
  CDNContext,
  CDNSourceType,
  CDNLatencyResult,
  CDNNodeWithLatency,
  GitHubCDNOptions,
  CloudflareCDNOptions,
  NPMCDNOptions,
} from '../types/cdn';
import { CDNTester } from './cdnTester';

// ============================================================
// 预定义节点模板
// ============================================================

/** 构建 jsDelivr 风格的 GitHub URL */
const buildJsDelivrGhUrl = (baseUrl: string, resourcePath: string, context?: CDNContext): string => {
  if (!context?.githubUser || !context?.githubRepo || !context?.githubRef) {
    throw new Error('GitHub context (user, repo, ref) is required for this CDN node');
  }
  const path = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  return `${baseUrl}/${context.githubUser}/${context.githubRepo}@${context.githubRef}${path}`;
};

/** 构建 GitHub Raw URL */
const buildGithubRawUrl = (baseUrl: string, resourcePath: string, context?: CDNContext): string => {
  if (!context?.githubUser || !context?.githubRepo || !context?.githubRef) {
    throw new Error('GitHub context (user, repo, ref) is required for this CDN node');
  }
  const path = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  return `${baseUrl}/${context.githubUser}/${context.githubRepo}/${context.githubRef}${path}`;
};

/** 构建 NPM CDN URL */
const buildNpmUrl = (baseUrl: string, resourcePath: string, context?: CDNContext): string => {
  if (!context?.npmPackage) {
    throw new Error('NPM package name is required for this CDN node');
  }
  const version = context.npmVersion || 'latest';
  const path = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  return `${baseUrl}/${context.npmPackage}@${version}${path}`;
};

/** 构建 Cloudflare Worker 代理 URL */
const buildCfWorkerUrl = (baseUrl: string, resourcePath: string, context?: CDNContext): string => {
  if (context?.githubUser && context?.githubRepo && context?.githubRef) {
    const path = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
    return `${baseUrl}/https://raw.githubusercontent.com/${context.githubUser}/${context.githubRepo}/${context.githubRef}${path}`;
  }
  if (resourcePath.startsWith('http')) {
    return `${baseUrl}/${resourcePath}`;
  }
  return `${baseUrl}${resourcePath}`;
};

/**
 * 预定义的 CDN 节点模板
 *
 * 用法：
 * ```ts
 * import { CDN_NODE_TEMPLATES } from 'hx-cdn-forge';
 * const node = CDN_NODE_TEMPLATES.github.jsdelivr_main;
 * ```
 */
export const CDN_NODE_TEMPLATES = {
  github: {
    jsdelivr_main: {
      id: 'jsdelivr-main',
      name: 'jsDelivr (Main)',
      baseUrl: 'https://cdn.jsdelivr.net/gh',
      region: 'global' as const,
      sourceType: 'github' as CDNSourceType,
      description: 'jsDelivr 主节点，全球 CDN',
      buildUrl: buildJsDelivrGhUrl,
    },
    jsdelivr_fastly: {
      id: 'jsdelivr-fastly',
      name: 'jsDelivr (Fastly)',
      baseUrl: 'https://fastly.jsdelivr.net/gh',
      region: 'global' as const,
      sourceType: 'github' as CDNSourceType,
      description: 'jsDelivr Fastly 节点，国内访问较稳定',
      buildUrl: buildJsDelivrGhUrl,
    },
    jsdelivr_testing: {
      id: 'jsdelivr-testing',
      name: 'jsDelivr (Testing)',
      baseUrl: 'https://testing.jsdelivr.net/gh',
      region: 'global' as const,
      sourceType: 'github' as CDNSourceType,
      description: 'jsDelivr 测试节点',
      buildUrl: buildJsDelivrGhUrl,
    },
    jsd_mirror: {
      id: 'jsd-mirror',
      name: 'JSD Mirror',
      baseUrl: 'https://cdn.jsdmirror.com/gh',
      region: 'china' as const,
      sourceType: 'github' as CDNSourceType,
      description: 'jsDelivr 国内镜像站，腾讯云 EdgeOne 加速',
      buildUrl: buildJsDelivrGhUrl,
    },
    zstatic: {
      id: 'zstatic',
      name: 'Zstatic',
      baseUrl: 'https://jsd.zstatic.net/gh',
      region: 'china' as const,
      sourceType: 'github' as CDNSourceType,
      description: 'Zstatic CDN，支持镜像回源',
      buildUrl: buildJsDelivrGhUrl,
    },
    github_raw: {
      id: 'github-raw',
      name: 'GitHub Raw',
      baseUrl: 'https://raw.githubusercontent.com',
      region: 'global' as const,
      sourceType: 'github' as CDNSourceType,
      description: 'GitHub 原始文件服务',
      buildUrl: buildGithubRawUrl,
    },
  },

  cloudflare: {
    /**
     * 创建 Cloudflare Worker 节点
     */
    createWorkerNode: (workerDomain: string): CDNNode => ({
      id: `cf-worker-${workerDomain.replace(/\./g, '-')}`,
      name: `CF Worker (${workerDomain})`,
      baseUrl: `https://${workerDomain}`,
      region: 'global',
      sourceType: 'cloudflare',
      description: `Cloudflare Worker 代理 (${workerDomain})`,
      buildUrl: buildCfWorkerUrl,
    }),
    public_proxy: {
      id: 'gh-proxy-public',
      name: 'GitHub Proxy',
      baseUrl: 'https://gh.api.99988866.xyz',
      region: 'global' as const,
      sourceType: 'cloudflare' as CDNSourceType,
      description: '公共 gh-proxy 服务（建议自行部署）',
      buildUrl: buildCfWorkerUrl,
    },
  },

  npm: {
    jsdelivr_npm: {
      id: 'jsdelivr-npm',
      name: 'jsDelivr (NPM)',
      baseUrl: 'https://cdn.jsdelivr.net/npm',
      region: 'global' as const,
      sourceType: 'npm' as CDNSourceType,
      description: 'jsDelivr NPM CDN',
      buildUrl: buildNpmUrl,
    },
    unpkg: {
      id: 'unpkg',
      name: 'unpkg',
      baseUrl: 'https://unpkg.com',
      region: 'global' as const,
      sourceType: 'npm' as CDNSourceType,
      description: 'unpkg CDN',
      buildUrl: buildNpmUrl,
    },
    esm_sh: {
      id: 'esm-sh',
      name: 'esm.sh',
      baseUrl: 'https://esm.sh',
      region: 'global' as const,
      sourceType: 'npm' as CDNSourceType,
      description: 'esm.sh CDN',
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext): string => {
        if (!context?.npmPackage) {
          throw new Error('NPM package name is required');
        }
        const version = context.npmVersion ? `@${context.npmVersion}` : '';
        const path = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.npmPackage}${version}${path}`;
      },
    },
  },
} as const;

// ============================================================
// CDN Manager — 核心管理器
// ============================================================

export class CDNManager {
  private config: CDNConfig;
  private currentNode: CDNNode | null = null;
  private tester: CDNTester;
  private latencyResults: Map<string, CDNLatencyResult> = new Map();
  private storageKey: string;

  constructor(config: CDNConfig) {
    this.config = config;
    this.storageKey = config.storageKey || 'hx-cdn-forge-selected-node';
    this.tester = new CDNTester({
      timeout: config.testTimeout ?? 5000,
      retryCount: config.testRetries ?? 2,
    });

    // 尝试从 localStorage 恢复上次选择
    this.loadSelectedNode();

    // 如果没有恢复到节点，尝试使用默认节点
    if (!this.currentNode && config.defaultNodeId) {
      const defaultNode = config.nodes.find((n) => n.id === config.defaultNodeId);
      if (defaultNode) {
        this.currentNode = defaultNode;
      }
    }

    // 如果还没有节点，选第一个启用的
    if (!this.currentNode) {
      const firstEnabled = config.nodes.find((n) => n.enabled !== false);
      if (firstEnabled) {
        this.currentNode = firstEnabled;
      }
    }
  }

  /**
   * 初始化：如果 autoTestOnMount 为 true，自动测速并选择最佳节点
   */
  async initialize(): Promise<void> {
    if (this.config.autoTestOnMount !== false) {
      await this.testAndSelectBest();
    }
  }

  /**
   * 测速所有节点并自动选择最佳节点
   */
  async testAndSelectBest(): Promise<CDNLatencyResult[]> {
    const results = await this.testAllNodes();
    const bestId = this.tester.getBestNodeId(results);
    if (bestId) {
      this.selectNode(bestId);
    }
    return results;
  }

  /**
   * 测速所有节点（不自动切换）
   */
  async testAllNodes(): Promise<CDNLatencyResult[]> {
    const results = await this.tester.testAllNodes(this.config.nodes);
    this.latencyResults.clear();
    for (const r of results) {
      this.latencyResults.set(r.nodeId, r);
    }
    return results;
  }

  /**
   * 流式测速所有节点：每完成一个立即回调
   */
  async testAllNodesStreaming(
    onResult: (result: CDNLatencyResult) => void,
  ): Promise<CDNLatencyResult[]> {
    this.latencyResults.clear();
    const results = await this.tester.testAllNodesStreaming(
      this.config.nodes,
      (result) => {
        this.latencyResults.set(result.nodeId, result);
        onResult(result);
      },
    );
    return results;
  }

  /**
   * 选择节点
   */
  selectNode(nodeId: string): CDNNode | null {
    const node = this.config.nodes.find((n) => n.id === nodeId);
    if (node) {
      this.currentNode = node;
      this.saveSelectedNode(nodeId);
      return node;
    }
    return null;
  }

  /**
   * 获取当前选中的节点
   */
  getCurrentNode(): CDNNode | null {
    return this.currentNode;
  }

  /**
   * 获取所有节点
   */
  getAllNodes(): CDNNode[] {
    return this.config.nodes;
  }

  /**
   * 获取带延迟信息且按延迟排序的节点列表
   */
  getSortedNodes(): CDNNodeWithLatency[] {
    return this.config.nodes
      .filter((n) => n.enabled !== false)
      .map((node) => {
        const result = this.latencyResults.get(node.id);
        return {
          ...node,
          latency: result?.success ? result.latency : result ? -1 : undefined,
          latencyStatus: result
            ? result.success
              ? ('success' as const)
              : ('failed' as const)
            : ('idle' as const),
        };
      })
      .sort((a, b) => {
        // 有延迟数据的排前面
        if (a.latency === undefined && b.latency === undefined) return 0;
        if (a.latency === undefined) return 1;
        if (b.latency === undefined) return -1;
        // 失败的排后面
        if (a.latency < 0 && b.latency < 0) return 0;
        if (a.latency < 0) return 1;
        if (b.latency < 0) return -1;
        return a.latency - b.latency;
      });
  }

  /**
   * 获取延迟测试结果
   */
  getLatencyResults(): Map<string, CDNLatencyResult> {
    return new Map(this.latencyResults);
  }

  /**
   * 构建 CDN URL
   */
  buildUrl(resourcePath: string): string {
    if (!this.currentNode) {
      throw new Error('No CDN node selected. Call selectNode() or initialize() first.');
    }
    return this.currentNode.buildUrl(this.currentNode.baseUrl, resourcePath, this.config.context);
  }

  /**
   * 获取配置
   */
  getConfig(): CDNConfig {
    return this.config;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<CDNConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.nodes && this.currentNode) {
      const exists = newConfig.nodes.find((n) => n.id === this.currentNode!.id);
      if (!exists) {
        this.currentNode = null;
      }
    }
    if (newConfig.testTimeout !== undefined || newConfig.testRetries !== undefined) {
      if (newConfig.testTimeout !== undefined) this.tester.setTimeout(newConfig.testTimeout);
      if (newConfig.testRetries !== undefined) this.tester.setRetryCount(newConfig.testRetries);
    }
  }

  // ---- Private ----

  private loadSelectedNode(): void {
    if (typeof window === 'undefined') return;
    try {
      const savedId = localStorage.getItem(this.storageKey);
      if (savedId) {
        const node = this.config.nodes.find((n) => n.id === savedId);
        if (node) {
          this.currentNode = node;
        }
      }
    } catch {
      // localStorage 不可用时忽略
    }
  }

  private saveSelectedNode(nodeId: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, nodeId);
    } catch {
      // localStorage 不可用时忽略
    }
  }
}

// ============================================================
// 工厂函数创建 CDNManager 实例
// ============================================================

/**
 * 创建 CDN Manager 实例（便捷工厂函数）
 */
export function createCDNManager(config: CDNConfig): CDNManager {
  return new CDNManager(config);
}

// ============================================================
// 便捷配置函数
// ============================================================

/** 默认的 GitHub CDN 节点列表 */
const DEFAULT_GITHUB_NODES: CDNNode[] = [
  CDN_NODE_TEMPLATES.github.jsdelivr_main,
  CDN_NODE_TEMPLATES.github.jsdelivr_fastly,
  CDN_NODE_TEMPLATES.github.jsdelivr_testing,
  CDN_NODE_TEMPLATES.github.jsd_mirror,
  CDN_NODE_TEMPLATES.github.zstatic,
  CDN_NODE_TEMPLATES.github.github_raw,
];

/** 默认的 NPM CDN 节点列表 */
const DEFAULT_NPM_NODES: CDNNode[] = [
  CDN_NODE_TEMPLATES.npm.jsdelivr_npm,
  CDN_NODE_TEMPLATES.npm.unpkg,
  CDN_NODE_TEMPLATES.npm.esm_sh,
];

/**
 * 创建 GitHub CDN 配置
 *
 * @example
 * ```ts
 * const config = createGitHubCDNConfig({
 *   user: 'facebook',
 *   repo: 'react',
 *   ref: 'main',
 * });
 * ```
 */
export function createGitHubCDNConfig(options: GitHubCDNOptions): CDNConfig {
  const nodes = options.nodes || DEFAULT_GITHUB_NODES;
  const allNodes = options.extraNodes ? [...nodes, ...options.extraNodes] : nodes;

  return {
    context: {
      githubUser: options.user,
      githubRepo: options.repo,
      githubRef: options.ref || 'main',
    },
    nodes: allNodes,
    defaultNodeId: options.defaultNodeId,
    autoTestOnMount: options.autoTest ?? true,
    testTimeout: options.timeout,
    storageKey: options.storageKey,
  };
}

/**
 * 创建 Cloudflare Worker CDN 配置
 *
 * @example
 * ```ts
 * const config = createCloudflareCDNConfig({
 *   workerDomain: 'my-proxy.workers.dev',
 *   github: { user: 'HengXin666', repo: 'myrepo' },
 * });
 * ```
 */
export function createCloudflareCDNConfig(options: CloudflareCDNOptions): CDNConfig {
  const cfNode = CDN_NODE_TEMPLATES.cloudflare.createWorkerNode(options.workerDomain);
  const nodes = [cfNode, ...(options.extraNodes || [])];

  return {
    context: {
      cfWorkerDomain: options.workerDomain,
      githubUser: options.github?.user,
      githubRepo: options.github?.repo,
      githubRef: options.github?.ref || 'main',
    },
    nodes,
  };
}

/**
 * 创建 NPM CDN 配置
 *
 * @example
 * ```ts
 * const config = createNPMCDNConfig({
 *   package: 'react',
 *   version: '18.2.0',
 * });
 * ```
 */
export function createNPMCDNConfig(options: NPMCDNOptions): CDNConfig {
  return {
    context: {
      npmPackage: options.package,
      npmVersion: options.version,
    },
    nodes: options.nodes || DEFAULT_NPM_NODES,
  };
}

/**
 * 创建混合 CDN 配置
 */
export function createMixedCDNConfig(options: {
  nodes: CDNNode[];
  context?: CDNContext;
  defaultNodeId?: string;
  autoTest?: boolean;
}): CDNConfig {
  return {
    context: options.context || {},
    nodes: options.nodes,
    defaultNodeId: options.defaultNodeId,
    autoTestOnMount: options.autoTest,
  };
}
