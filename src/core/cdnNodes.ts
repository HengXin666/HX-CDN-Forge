/**
 * CDN 节点定义 + 测速工具
 * 专注 GitHub 文件代理
 */

import type {
  CDNNode,
  CDNNodeWithLatency,
  GitHubContext,
  LatencyResult,
} from '../types';

// ============================================================
// URL 构建器
// ============================================================

/** jsDelivr 风格: cdn.jsdelivr.net/gh/{user}/{repo}@{ref}/{path} */
const buildJsDelivrUrl = (baseUrl: string) =>
  (ctx: GitHubContext, filePath: string): string => {
    const path = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return `${baseUrl}/${ctx.user}/${ctx.repo}@${ctx.ref}${path}`;
  };

/** GitHub Raw: raw.githubusercontent.com/{user}/{repo}/{ref}/{path} */
const buildGithubRawUrl = (ctx: GitHubContext, filePath: string): string => {
  const path = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `https://raw.githubusercontent.com/${ctx.user}/${ctx.repo}/${ctx.ref}${path}`;
};

/** Cloudflare Worker 代理: {domain}/https://raw.githubusercontent.com/... */
const buildCfWorkerUrl = (domain: string) =>
  (ctx: GitHubContext, filePath: string): string => {
    const rawUrl = buildGithubRawUrl(ctx, filePath);
    return `https://${domain}/${rawUrl}`;
  };

// ============================================================
// 预定义节点
// ============================================================

export const CDN_NODE_PRESETS = {
  jsdelivr_main: {
    id: 'jsdelivr-main',
    name: 'jsDelivr (Main)',
    baseUrl: 'https://cdn.jsdelivr.net/gh',
    region: 'global' as const,
    buildUrl: buildJsDelivrUrl('https://cdn.jsdelivr.net/gh'),
    maxFileSize: 20 * 1024 * 1024,
    supportsRange: true,
    description: 'jsDelivr 主节点，全球 CDN',
  },
  jsdelivr_fastly: {
    id: 'jsdelivr-fastly',
    name: 'jsDelivr (Fastly)',
    baseUrl: 'https://fastly.jsdelivr.net/gh',
    region: 'global' as const,
    buildUrl: buildJsDelivrUrl('https://fastly.jsdelivr.net/gh'),
    maxFileSize: 20 * 1024 * 1024,
    supportsRange: true,
    description: 'jsDelivr Fastly 节点',
  },
  jsdelivr_testing: {
    id: 'jsdelivr-testing',
    name: 'jsDelivr (Testing)',
    baseUrl: 'https://testing.jsdelivr.net/gh',
    region: 'global' as const,
    buildUrl: buildJsDelivrUrl('https://testing.jsdelivr.net/gh'),
    maxFileSize: 20 * 1024 * 1024,
    supportsRange: true,
    description: 'jsDelivr 测试节点',
  },
  jsd_mirror: {
    id: 'jsd-mirror',
    name: 'JSD Mirror',
    baseUrl: 'https://cdn.jsdmirror.com/gh',
    region: 'china' as const,
    buildUrl: buildJsDelivrUrl('https://cdn.jsdmirror.com/gh'),
    maxFileSize: 20 * 1024 * 1024,
    supportsRange: true,
    description: 'jsDelivr 国内镜像，腾讯云 EdgeOne 加速',
  },
  zstatic: {
    id: 'zstatic',
    name: 'Zstatic',
    baseUrl: 'https://jsd.zstatic.net/gh',
    region: 'china' as const,
    buildUrl: buildJsDelivrUrl('https://jsd.zstatic.net/gh'),
    maxFileSize: 20 * 1024 * 1024,
    supportsRange: true,
    description: 'Zstatic CDN 镜像',
  },
  github_raw: {
    id: 'github-raw',
    name: 'GitHub Raw',
    baseUrl: 'https://raw.githubusercontent.com',
    region: 'global' as const,
    buildUrl: buildGithubRawUrl,
    maxFileSize: 100 * 1024 * 1024,
    supportsRange: false,  // CORS preflight 对 Range 请求返回 403
    description: 'GitHub 原始文件服务',
  },
} satisfies Record<string, CDNNode>;

/** 默认的 GitHub CDN 节点列表 */
export const DEFAULT_GITHUB_CDN_NODES: CDNNode[] = [
  CDN_NODE_PRESETS.jsdelivr_main,
  CDN_NODE_PRESETS.jsdelivr_fastly,
  CDN_NODE_PRESETS.jsdelivr_testing,
  CDN_NODE_PRESETS.jsd_mirror,
  CDN_NODE_PRESETS.zstatic,
  CDN_NODE_PRESETS.github_raw,
];

/**
 * 创建 Cloudflare Worker 代理节点
 */
export function createWorkerNode(domain: string): CDNNode {
  return {
    id: `cf-worker-${domain.replace(/\./g, '-')}`,
    name: `CF Worker (${domain})`,
    baseUrl: `https://${domain}`,
    region: 'global',
    buildUrl: buildCfWorkerUrl(domain),
    maxFileSize: -1,
    supportsRange: true,
    description: `Cloudflare Worker 代理 (${domain})`,
  };
}

// ============================================================
// 测速工具
// ============================================================

export class CDNTester {
  private timeout: number;
  private retryCount: number;

  constructor(timeout = 5000, retryCount = 2) {
    this.timeout = timeout;
    this.retryCount = retryCount;
  }

  /** 测试单节点延迟 */
  async testNode(node: CDNNode, testUrl?: string): Promise<LatencyResult> {
    const url = testUrl ?? node.baseUrl;

    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        const start = performance.now();
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), this.timeout);

        await fetch(url, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
          signal: ctrl.signal,
        });
        clearTimeout(tid);

        return {
          nodeId: node.id,
          latency: Math.round((performance.now() - start) * 100) / 100,
          success: true,
          timestamp: Date.now(),
        };
      } catch (err) {
        if (attempt === this.retryCount) {
          return {
            nodeId: node.id,
            latency: -1,
            success: false,
            timestamp: Date.now(),
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
        await delay(200 * (attempt + 1));
      }
    }

    return { nodeId: node.id, latency: -1, success: false, timestamp: Date.now() };
  }

  /** 并发测试所有启用节点 */
  async testAll(nodes: CDNNode[]): Promise<LatencyResult[]> {
    const enabled = nodes.filter((n) => n.enabled !== false);
    return Promise.all(enabled.map((n) => this.testNode(n)));
  }

  /** 流式测试: 每完成一个就回调 */
  async testAllStreaming(
    nodes: CDNNode[],
    onResult: (r: LatencyResult) => void,
  ): Promise<LatencyResult[]> {
    const enabled = nodes.filter((n) => n.enabled !== false);
    const results: LatencyResult[] = [];

    const promises = enabled.map(async (node) => {
      const r = await this.testNode(node);
      results.push(r);
      onResult(r);
      return r;
    });

    await Promise.all(promises);
    return results;
  }

  /** 找延迟最低的节点 ID */
  getBestNodeId(results: LatencyResult[]): string | null {
    const sorted = results
      .filter((r) => r.success && r.latency >= 0)
      .sort((a, b) => a.latency - b.latency);
    return sorted.length > 0 ? sorted[0]!.nodeId : null;
  }

  setTimeout(ms: number): void { this.timeout = ms; }
  setRetryCount(n: number): void { this.retryCount = n; }
}

/** 获取排序后的节点列表 (带延迟信息) */
export function getSortedNodesWithLatency(
  nodes: CDNNode[],
  results: Map<string, LatencyResult>,
): CDNNodeWithLatency[] {
  return nodes
    .filter((n) => n.enabled !== false)
    .map((node) => {
      const r = results.get(node.id);
      return {
        ...node,
        latency: r?.success ? r.latency : r ? -1 : undefined,
        latencyStatus: r
          ? r.success ? ('success' as const) : ('failed' as const)
          : ('idle' as const),
      };
    })
    .sort((a, b) => {
      if (a.latency === undefined && b.latency === undefined) return 0;
      if (a.latency === undefined) return 1;
      if (b.latency === undefined) return -1;
      if (a.latency < 0 && b.latency < 0) return 0;
      if (a.latency < 0) return 1;
      if (b.latency < 0) return -1;
      return a.latency - b.latency;
    });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
