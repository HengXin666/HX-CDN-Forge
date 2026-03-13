import type { CDNConfig, CDNNode, CDNLatencyResult } from '../types/cdn';
import { CDNTester, defaultCDNTester } from './cdnTester';

/**
 * CDN 管理器
 * 负责节点选择、存储、URL 构建等功能
 */
export class CDNManager {
  private config: CDNConfig;
  private tester: CDNTester;
  private currentNodeId: string | null = null;
  private latencyResults: Map<string, CDNLatencyResult> = new Map();
  private storageKey: string;

  constructor(config: CDNConfig) {
    this.config = config;
    this.tester = new CDNTester({
      timeout: config.timeout,
      retryCount: config.retryCount,
    });
    this.storageKey = config.storageKey ?? 'cdn-selected-node';
    
    // 从本地存储恢复选中的节点
    this.loadSelectedNode();
  }

  /**
   * 初始化：自动测速并选择最佳节点
   */
  async initialize(): Promise<void> {
    // 如果已有选中的节点，先使用
    if (this.currentNodeId) {
      return;
    }

    // 如果启用自动选择，则测速并选择最佳节点
    if (this.config.autoSelectBest !== false) {
      await this.testAndSelectBest();
    } else {
      // 否则选择默认节点
      const defaultNode = this.config.nodes.find(n => n.isDefault);
      if (defaultNode) {
        this.selectNode(defaultNode.id);
      } else if (this.config.nodes.length > 0) {
        this.selectNode(this.config.nodes[0].id);
      }
    }
  }

  /**
   * 测速并选择最佳节点
   */
  async testAndSelectBest(): Promise<CDNLatencyResult[]> {
    const results = await this.tester.testAllNodes(this.config.nodes);
    
    // 存储测速结果
    results.forEach(result => {
      this.latencyResults.set(result.nodeId, result);
    });
    
    // 选择最佳节点
    const bestNodeId = this.tester.getBestNode(results);
    if (bestNodeId) {
      this.selectNode(bestNodeId);
    }
    
    return results;
  }

  /**
   * 测试所有节点延迟
   */
  async testAllNodes(): Promise<CDNLatencyResult[]> {
    const results = await this.tester.testAllNodes(this.config.nodes);
    
    results.forEach(result => {
      this.latencyResults.set(result.nodeId, result);
    });
    
    return results;
  }

  /**
   * 选择节点
   */
  selectNode(nodeId: string): void {
    const node = this.config.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.warn(`CDN node not found: ${nodeId}`);
      return;
    }
    
    this.currentNodeId = nodeId;
    this.saveSelectedNode(nodeId);
  }

  /**
   * 获取当前选中的节点
   */
  getCurrentNode(): CDNNode | null {
    if (!this.currentNodeId) return null;
    return this.config.nodes.find(n => n.id === this.currentNodeId) || null;
  }

  /**
   * 获取当前节点 ID
   */
  getCurrentNodeId(): string | null {
    return this.currentNodeId;
  }

  /**
   * 获取所有节点（带延迟信息）
   */
  getNodesWithLatency(): Array<CDNNode & { latency?: number; latencyStatus?: 'success' | 'failed' | 'testing' }> {
    return this.config.nodes.map(node => {
      const result = this.latencyResults.get(node.id);
      return {
        ...node,
        latency: result?.latency,
        latencyStatus: result ? (result.success ? 'success' : 'failed') : undefined,
      };
    });
  }

  /**
   * 获取排序后的节点列表（按延迟排序）
   */
  getSortedNodes(): Array<CDNNode & { latency?: number; latencyStatus?: 'success' | 'failed' | 'testing' }> {
    const nodes = this.getNodesWithLatency();
    
    return nodes.sort((a, b) => {
      // 成功的节点优先
      if (a.latencyStatus === 'success' && b.latencyStatus !== 'success') return -1;
      if (a.latencyStatus !== 'success' && b.latencyStatus === 'success') return 1;
      
      // 都成功或都失败，按延迟排序
      const latencyA = a.latency ?? Infinity;
      const latencyB = b.latency ?? Infinity;
      return latencyA - latencyB;
    });
  }

  /**
   * 构建 GitHub CDN URL
   * @param relativePath 相对于仓库根目录的路径
   * @param customRef 自定义引用（分支、tag 或 commit），不指定则使用配置中的引用
   */
  buildUrl(relativePath: string, customRef?: string): string {
    const node = this.getCurrentNode();
    if (!node) {
      console.warn('No CDN node selected');
      return '';
    }

    const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    const ref = customRef || this.config.githubRef;
    
    // 根据 baseUrl 的格式构建完整 URL
    // 支持两种格式：
    // 1. https://cdn.jsdelivr.net/gh/user/repo@ref
    // 2. https://cdn.example.com (需要自行拼接路径)
    
    if (node.baseUrl.includes('/gh/')) {
      // jsDelivr 格式：已包含 /gh/user/repo
      const baseUrl = node.baseUrl.endsWith('/') ? node.baseUrl.slice(0, -1) : node.baseUrl;
      return `${baseUrl}${cleanPath}`;
    } else {
      // 其他 CDN 格式：需要拼接完整路径
      const baseUrl = node.baseUrl.endsWith('/') ? node.baseUrl.slice(0, -1) : node.baseUrl;
      return `${baseUrl}/gh/${this.config.githubUser}/${this.config.githubRepo}@${ref}${cleanPath}`;
    }
  }

  /**
   * 构建指定节点的 URL
   */
  buildUrlForNode(nodeId: string, relativePath: string, customRef?: string): string {
    const node = this.config.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.warn(`CDN node not found: ${nodeId}`);
      return '';
    }

    const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    const ref = customRef || this.config.githubRef;
    
    if (node.baseUrl.includes('/gh/')) {
      const baseUrl = node.baseUrl.endsWith('/') ? node.baseUrl.slice(0, -1) : node.baseUrl;
      return `${baseUrl}${cleanPath}`;
    } else {
      const baseUrl = node.baseUrl.endsWith('/') ? node.baseUrl.slice(0, -1) : node.baseUrl;
      return `${baseUrl}/gh/${this.config.githubUser}/${this.config.githubRepo}@${ref}${cleanPath}`;
    }
  }

  /**
   * 从本地存储加载选中的节点
   */
  private loadSelectedNode(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const savedNodeId = localStorage.getItem(this.storageKey);
      if (savedNodeId) {
        // 验证节点是否存在
        const node = this.config.nodes.find(n => n.id === savedNodeId);
        if (node && node.enabled !== false) {
          this.currentNodeId = savedNodeId;
        }
      }
    } catch (error) {
      console.warn('Failed to load selected CDN node:', error);
    }
  }

  /**
   * 保存选中的节点到本地存储
   */
  private saveSelectedNode(nodeId: string): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(this.storageKey, nodeId);
    } catch (error) {
      console.warn('Failed to save selected CDN node:', error);
    }
  }

  /**
   * 清除选中的节点
   */
  clearSelectedNode(): void {
    this.currentNodeId = null;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (error) {
        console.warn('Failed to clear selected CDN node:', error);
      }
    }
  }

  /**
   * 获取测速结果
   */
  getLatencyResults(): Map<string, CDNLatencyResult> {
    return new Map(this.latencyResults);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CDNConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * 创建 CDN 管理器实例
 */
export function createCDNManager(config: CDNConfig): CDNManager {
  return new CDNManager(config);
}
