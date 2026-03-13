import {
  CDNConfig,
  CDNNode,
  CDNContext,
  CDNSourceType,
} from '../types/cdn';

/**
 * 预定义的 CDN 节点模板
 */
export const CDN_NODE_TEMPLATES = {
  /**
   * GitHub 相关 CDN 节点
   */
  github: {
    jsdelivr_main: {
      id: 'jsdelivr-main',
      name: 'jsDelivr (Main)',
      baseUrl: 'https://cdn.jsdelivr.net/gh',
      region: 'global' as const,
      sourceType: 'github' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (!context?.githubUser || !context?.githubRepo || !context?.githubRef) {
          throw new Error('GitHub context (user, repo, ref) is required');
        }
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.githubUser}/${context.githubRepo}@${context.githubRef}${cleanPath}`;
      },
    },

    jsdelivr_fastly: {
      id: 'jsdelivr-fastly',
      name: 'jsDelivr (Fastly)',
      baseUrl: 'https://fastly.jsdelivr.net/gh',
      region: 'global' as const,
      sourceType: 'github' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (!context?.githubUser || !context?.githubRepo || !context?.githubRef) {
          throw new Error('GitHub context (user, repo, ref) is required');
        }
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.githubUser}/${context.githubRepo}@${context.githubRef}${cleanPath}`;
      },
    },

    jsdelivr_testing: {
      id: 'jsdelivr-testing',
      name: 'jsDelivr (Testing)',
      baseUrl: 'https://testing.jsdelivr.net/gh',
      region: 'global' as const,
      sourceType: 'github' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (!context?.githubUser || !context?.githubRepo || !context?.githubRef) {
          throw new Error('GitHub context (user, repo, ref) is required');
        }
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.githubUser}/${context.githubRepo}@${context.githubRef}${cleanPath}`;
      },
    },

    jsd_mirror: {
      id: 'jsd-mirror',
      name: 'JSD Mirror (中国大陆)',
      baseUrl: 'https://cdn.jsdmirror.com/gh',
      region: 'china' as const,
      sourceType: 'github' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (!context?.githubUser || !context?.githubRepo || !context?.githubRef) {
          throw new Error('GitHub context (user, repo, ref) is required');
        }
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.githubUser}/${context.githubRepo}@${context.githubRef}${cleanPath}`;
      },
    },

    zstatic: {
      id: 'zstatic',
      name: 'Zstatic (中国大陆)',
      baseUrl: 'https://jsd.zstatic.net/gh',
      region: 'china' as const,
      sourceType: 'github' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (!context?.githubUser || !context?.githubRepo || !context?.githubRef) {
          throw new Error('GitHub context (user, repo, ref) is required');
        }
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.githubUser}/${context.githubRepo}@${context.githubRef}${cleanPath}`;
      },
    },

    github_raw: {
      id: 'github-raw',
      name: 'GitHub Raw',
      baseUrl: 'https://raw.githubusercontent.com',
      region: 'global' as const,
      sourceType: 'github' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (!context?.githubUser || !context?.githubRepo || !context?.githubRef) {
          throw new Error('GitHub context (user, repo, ref) is required');
        }
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.githubUser}/${context.githubRepo}/${context.githubRef}${cleanPath}`;
      },
    },
  },

  /**
   * Cloudflare Workers 代理 GitHub 资源节点
   * 需要用户自行部署 gh-proxy 或类似服务
   */
  cloudflare: {
    /**
     * 创建 Cloudflare Worker 节点配置
     * @param workerDomain - Worker 域名，例如：'your-worker.workers.dev' 或自定义域名
     */
    createWorkerNode: (workerDomain: string): CDNNode => ({
      id: `cf-worker-${workerDomain.replace(/\./g, '-')}`,
      name: `Cloudflare Worker (${workerDomain})`,
      baseUrl: `https://${workerDomain}`,
      region: 'global',
      sourceType: 'cloudflare',
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        // Cloudflare Worker 代理 GitHub 资源
        if (context?.githubUser && context?.githubRepo && context?.githubRef) {
          const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
          const githubUrl = `https://github.com/${context.githubUser}/${context.githubRepo}/blob/${context.githubRef}${cleanPath}`;
          return `${baseUrl}/${githubUrl}`;
        }
        // 如果有完整 URL，直接代理
        if (resourcePath.startsWith('http')) {
          return `${baseUrl}/${resourcePath}`;
        }
        return `${baseUrl}${resourcePath}`;
      },
    }),

    /**
     * 公共 gh-proxy 服务（示例，建议自行部署）
     */
    public_proxy: {
      id: 'gh-proxy-public',
      name: 'GitHub Proxy (公共)',
      baseUrl: 'https://gh.api.99988866.xyz',
      region: 'global' as const,
      sourceType: 'cloudflare' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (context?.githubUser && context?.githubRepo && context?.githubRef) {
          const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
          const githubUrl = `https://github.com/${context.githubUser}/${context.githubRepo}/blob/${context.githubRef}${cleanPath}`;
          return `${baseUrl}/${githubUrl}`;
        }
        if (resourcePath.startsWith('http')) {
          return `${baseUrl}/${resourcePath}`;
        }
        return `${baseUrl}${resourcePath}`;
      },
    },
  },

  /**
   * NPM 包 CDN 节点
   */
  npm: {
    jsdelivr_npm: {
      id: 'jsdelivr-npm',
      name: 'jsDelivr (NPM)',
      baseUrl: 'https://cdn.jsdelivr.net/npm',
      region: 'global' as const,
      sourceType: 'npm' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (!context?.npmPackage) {
          throw new Error('NPM package name is required');
        }
        const version = context.npmVersion || 'latest';
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.npmPackage}@${version}${cleanPath}`;
      },
    },

    unpkg: {
      id: 'unpkg',
      name: 'unpkg',
      baseUrl: 'https://unpkg.com',
      region: 'global' as const,
      sourceType: 'npm' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (!context?.npmPackage) {
          throw new Error('NPM package name is required');
        }
        const version = context.npmVersion || 'latest';
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.npmPackage}@${version}${cleanPath}`;
      },
    },

    esm_sh: {
      id: 'esm-sh',
      name: 'esm.sh',
      baseUrl: 'https://esm.sh',
      region: 'global' as const,
      sourceType: 'npm' as CDNSourceType,
      buildUrl: (baseUrl: string, resourcePath: string, context?: CDNContext) => {
        if (!context?.npmPackage) {
          throw new Error('NPM package name is required');
        }
        const version = context.npmVersion ? `@${context.npmVersion}` : '';
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}/${context.npmPackage}${version}${cleanPath}`;
      },
    },
  },
};

/**
 * CDN 管理器
 */
export class CDNManager {
  private config: CDNConfig;
  private currentNode: CDNNode | null = null;
  private storageKey: string;

  constructor(config: CDNConfig) {
    this.config = config;
    this.storageKey = config.storageKey || 'hx-cdn-forge-selected-node';
    this.loadSelectedNode();
  }

  /**
   * 从 localStorage 加载上次选择的节点
   */
  private loadSelectedNode(): void {
    if (typeof window === 'undefined') return;

    try {
      const savedNodeId = localStorage.getItem(this.storageKey);
      if (savedNodeId) {
        const node = this.config.nodes.find(n => n.id === savedNodeId);
        if (node) {
          this.currentNode = node;
        }
      }
    } catch (error) {
      console.error('Failed to load selected node from localStorage:', error);
    }
  }

  /**
   * 保存选择的节点到 localStorage
   */
  private saveSelectedNode(nodeId: string): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.storageKey, nodeId);
    } catch (error) {
      console.error('Failed to save selected node to localStorage:', error);
    }
  }

  /**
   * 获取当前节点
   */
  getCurrentNode(): CDNNode | null {
    return this.currentNode;
  }

  /**
   * 选择节点
   */
  selectNode(nodeId: string): CDNNode | null {
    const node = this.config.nodes.find(n => n.id === nodeId);
    if (node) {
      this.currentNode = node;
      this.saveSelectedNode(nodeId);
      return node;
    }
    return null;
  }

  /**
   * 获取所有节点
   */
  getAllNodes(): CDNNode[] {
    return this.config.nodes;
  }

  /**
   * 构建 CDN URL
   */
  buildUrl(resourcePath: string): string {
    if (!this.currentNode) {
      throw new Error('No CDN node selected');
    }

    try {
      return this.currentNode.buildUrl(
        this.currentNode.baseUrl,
        resourcePath,
        this.config.context
      );
    } catch (error) {
      console.error(`Failed to build URL for node ${this.currentNode.id}:`, error);
      throw error;
    }
  }

  /**
   * 获取测速 URL
   */
  getTestUrl(node: CDNNode): string {
    const testPath = node.testPath || '/';
    return node.buildUrl(node.baseUrl, testPath, this.config.context);
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
      // 如果节点列表更新，检查当前节点是否还在列表中
      const exists = newConfig.nodes.find(n => n.id === this.currentNode!.id);
      if (!exists) {
        this.currentNode = null;
      }
    }
  }
}

/**
 * 创建 GitHub CDN 配置（便捷方法）
 */
export function createGitHubCDNConfig(options: {
  githubUser: string;
  githubRepo: string;
  githubRef: string;
  cdnNodes?: CDNNode[];
  defaultNodeId?: string;
}): CDNConfig {
  const defaultNodes = [
    CDN_NODE_TEMPLATES.github.jsdelivr_main,
    CDN_NODE_TEMPLATES.github.jsdelivr_fastly,
    CDN_NODE_TEMPLATES.github.jsdelivr_testing,
    CDN_NODE_TEMPLATES.github.jsd_mirror,
    CDN_NODE_TEMPLATES.github.zstatic,
    CDN_NODE_TEMPLATES.github.github_raw,
  ];

  return {
    context: {
      githubUser: options.githubUser,
      githubRepo: options.githubRepo,
      githubRef: options.githubRef,
    },
    nodes: options.cdnNodes || defaultNodes,
    defaultNodeId: options.defaultNodeId,
  };
}

/**
 * 创建 Cloudflare Worker CDN 配置（便捷方法）
 */
export function createCloudflareCDNConfig(options: {
  workerDomain: string;
  githubUser?: string;
  githubRepo?: string;
  githubRef?: string;
  additionalNodes?: CDNNode[];
}): CDNConfig {
  const cfNode = CDN_NODE_TEMPLATES.cloudflare.createWorkerNode(options.workerDomain);

  const nodes = [cfNode, ...(options.additionalNodes || [])];

  return {
    context: {
      cfWorkerDomain: options.workerDomain,
      githubUser: options.githubUser,
      githubRepo: options.githubRepo,
      githubRef: options.githubRef,
    },
    nodes,
  };
}

/**
 * 创建 NPM CDN 配置（便捷方法）
 */
export function createNPMCDNConfig(options: {
  npmPackage: string;
  npmVersion?: string;
  cdnNodes?: CDNNode[];
}): CDNConfig {
  const defaultNodes = [
    CDN_NODE_TEMPLATES.npm.jsdelivr_npm,
    CDN_NODE_TEMPLATES.npm.unpkg,
    CDN_NODE_TEMPLATES.npm.esm_sh,
  ];

  return {
    context: {
      npmPackage: options.npmPackage,
      npmVersion: options.npmVersion,
    },
    nodes: options.cdnNodes || defaultNodes,
  };
}

/**
 * 创建混合 CDN 配置（支持多种源）
 */
export function createMixedCDNConfig(options: {
  nodes: CDNNode[];
  context?: CDNContext;
}): CDNConfig {
  return {
    context: options.context || {},
    nodes: options.nodes,
  };
}
