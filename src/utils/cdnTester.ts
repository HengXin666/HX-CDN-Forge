import type { CDNNode, CDNLatencyResult, CDNConfig } from '../types/cdn';

/**
 * CDN 节点测速工具类
 */
export class CDNTester {
  private config: Required<Pick<CDNConfig, 'timeout' | 'retryCount'>>;

  constructor(config?: Partial<Pick<CDNConfig, 'timeout' | 'retryCount'>>) {
    this.config = {
      timeout: config?.timeout ?? 5000,
      retryCount: config?.retryCount ?? 2,
    };
  }

  /**
   * 测试单个 CDN 节点的延迟
   * @param node CDN 节点配置
   * @param testPath 测速路径，默认为根路径
   * @returns 延迟结果
   */
  async testNodeLatency(node: CDNNode, testPath: string = '/'): Promise<CDNLatencyResult> {
    const testUrl = this.buildTestUrl(node.baseUrl, testPath);
    
    for (let attempt = 0; attempt < this.config.retryCount; attempt++) {
      try {
        const startTime = performance.now();
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        const response = await fetch(testUrl, {
          method: 'HEAD',
          mode: 'no-cors', // 允许跨域请求
          cache: 'no-cache',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        const endTime = performance.now();
        const latency = endTime - startTime;
        
        // no-cors 模式下，response.ok 总是 false，response.status 为 0
        // 只要没有抛出异常，就认为请求成功
        return {
          nodeId: node.id,
          latency: Math.round(latency * 100) / 100,
          timestamp: Date.now(),
          success: true,
        };
      } catch (error) {
        // 最后一次尝试失败
        if (attempt === this.config.retryCount - 1) {
          return {
            nodeId: node.id,
            latency: -1,
            timestamp: Date.now(),
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
        
        // 等待一段时间后重试
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
   * 批量测试多个 CDN 节点的延迟
   * @param nodes CDN 节点列表
   * @param testPath 测速路径
   * @returns 延迟结果列表
   */
  async testAllNodes(nodes: CDNNode[], testPath: string = '/'): Promise<CDNLatencyResult[]> {
    const enabledNodes = nodes.filter(node => node.enabled !== false);
    
    const results = await Promise.all(
      enabledNodes.map(node => this.testNodeLatency(node, testPath))
    );
    
    return results;
  }

  /**
   * 获取最佳节点（延迟最低且成功）
   * @param results 测速结果列表
   * @returns 最佳节点 ID，如果没有可用节点则返回 null
   */
  getBestNode(results: CDNLatencyResult[]): string | null {
    const successResults = results
      .filter(r => r.success && r.latency >= 0)
      .sort((a, b) => a.latency - b.latency);
    
    return successResults.length > 0 ? successResults[0].nodeId : null;
  }

  /**
   * 构建测速 URL
   */
  private buildTestUrl(baseUrl: string, testPath: string): string {
    // 确保路径以 / 开头
    const normalizedPath = testPath.startsWith('/') ? testPath : `/${testPath}`;
    // 移除 baseUrl 末尾的 /
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${normalizedBaseUrl}${normalizedPath}`;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 默认 CDN 测速器实例
 */
export const defaultCDNTester = new CDNTester();
