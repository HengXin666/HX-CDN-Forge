import type { CDNNode, CDNLatencyResult } from '../types/cdn';

/**
 * CDN 节点测速工具类
 */
export class CDNTester {
  private timeout: number;
  private retryCount: number;

  constructor(options?: { timeout?: number; retryCount?: number }) {
    this.timeout = options?.timeout ?? 5000;
    this.retryCount = options?.retryCount ?? 2;
  }

  /**
   * 测试单个 CDN 节点的延迟
   */
  async testNodeLatency(node: CDNNode, testUrl?: string): Promise<CDNLatencyResult> {
    const url = testUrl || this.buildTestUrl(node.baseUrl, node.testPath || '/');

    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        const startTime = performance.now();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        await fetch(url, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const latency = performance.now() - startTime;

        return {
          nodeId: node.id,
          latency: Math.round(latency * 100) / 100,
          timestamp: Date.now(),
          success: true,
        };
      } catch (error) {
        if (attempt === this.retryCount) {
          return {
            nodeId: node.id,
            latency: -1,
            timestamp: Date.now(),
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
        // 递增等待
        await this.delay(200 * (attempt + 1));
      }
    }

    return {
      nodeId: node.id,
      latency: -1,
      timestamp: Date.now(),
      success: false,
      error: 'Max retry attempts reached',
    };
  }

  /**
   * 并发测试多个 CDN 节点
   */
  async testAllNodes(nodes: CDNNode[]): Promise<CDNLatencyResult[]> {
    const enabledNodes = nodes.filter((n) => n.enabled !== false);
    return Promise.all(enabledNodes.map((node) => this.testNodeLatency(node)));
  }

  /**
   * 流式测试所有节点：并发执行，每完成一个就立即回调
   */
  async testAllNodesStreaming(
    nodes: CDNNode[],
    onResult: (result: CDNLatencyResult) => void,
  ): Promise<CDNLatencyResult[]> {
    const enabledNodes = nodes.filter((n) => n.enabled !== false);
    const results: CDNLatencyResult[] = [];

    const promises = enabledNodes.map(async (node) => {
      const result = await this.testNodeLatency(node);
      results.push(result);
      onResult(result);
      return result;
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * 从结果中找到延迟最低的节点 ID
   */
  getBestNodeId(results: CDNLatencyResult[]): string | null {
    const sorted = results
      .filter((r) => r.success && r.latency >= 0)
      .sort((a, b) => a.latency - b.latency);
    return sorted.length > 0 ? sorted[0]!.nodeId : null;
  }

  /**
   * 更新超时设置
   */
  setTimeout(ms: number): void {
    this.timeout = ms;
  }

  /**
   * 更新重试次数
   */
  setRetryCount(count: number): void {
    this.retryCount = count;
  }

  private buildTestUrl(baseUrl: string, testPath: string): string {
    const normalizedPath = testPath.startsWith('/') ? testPath : `/${testPath}`;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${normalizedBase}${normalizedPath}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** 默认测速器实例 */
export const defaultCDNTester = new CDNTester();
