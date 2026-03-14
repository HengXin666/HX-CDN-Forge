import type { CDNNode, CDNContext, CDNLatencyResult } from '../types/cdn';

// ============================================================
// 类型定义
// ============================================================

/** 各 CDN 服务的文件大小限制和能力 */
export interface CDNNodeCapability {
  /** 单文件最大大小（字节），-1 表示无限制 */
  maxFileSize: number;
  /** 是否支持 Range 请求 */
  supportsRange: boolean;
  /** 是否已验证（运行时探测后为 true） */
  verified: boolean;
}

/** 分块描述 */
export interface Chunk {
  /** 分块索引 */
  index: number;
  /** 起始字节偏移 */
  start: number;
  /** 结束字节偏移（含） */
  end: number;
  /** 分块大小（字节） */
  size: number;
}

/** 分块下载状态 */
export type ChunkStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'stolen';

/** 单个分块的任务 */
export interface ChunkTask {
  chunk: Chunk;
  status: ChunkStatus;
  /** 分配给哪个节点执行 */
  assignedNodeId: string;
  /** 已重试次数 */
  retries: number;
  /** 下载耗时（毫秒） */
  downloadTime?: number;
  /** 下载到的数据 */
  data?: ArrayBuffer;
  /** 错误信息 */
  error?: string;
}

/** Worker（节点执行器）运行时状态 */
export interface WorkerStats {
  nodeId: string;
  /** 累计下载字节数 */
  totalBytes: number;
  /** 累计下载耗时 */
  totalTime: number;
  /** 当前速度（字节/毫秒），EWMA 平滑 */
  speedBps: number;
  /** 已完成的分块数 */
  completedChunks: number;
  /** 连续失败次数 */
  consecutiveFailures: number;
  /** 是否可用 */
  available: boolean;
}

/** 并行分块下载配置 */
export interface ChunkedLoadOptions {
  /** 基础分块大小（字节，默认 2MB） */
  chunkSize?: number;
  /** 最大并发连接数（默认 6） */
  maxConcurrency?: number;
  /** 单个分块的超时时间（毫秒，默认 30000） */
  chunkTimeout?: number;
  /** 单个分块最大重试次数（默认 3） */
  maxRetries?: number;
  /** 是否启用任务窃取（默认 true） */
  enableWorkStealing?: boolean;
  /** 文件总大小阈值：低于此值使用单连接（字节，默认 1MB） */
  singleConnectionThreshold?: number;
  /** 速度平滑因子 EWMA alpha（默认 0.3） */
  speedAlpha?: number;
  /** Range 探测超时时间（毫秒，默认 5000） */
  probeTimeout?: number;
}

/** 下载进度回调参数 */
export interface DownloadProgress {
  /** 已下载字节数 */
  loaded: number;
  /** 总字节数 */
  total: number;
  /** 百分比 0-100 */
  percentage: number;
  /** 当前总体速度（字节/秒） */
  speed: number;
  /** 预估剩余时间（秒） */
  eta: number;
  /** 各节点的分块完成情况 */
  nodeStats: Map<string, WorkerStats>;
  /** 已完成的分块数 */
  completedChunks: number;
  /** 总分块数 */
  totalChunks: number;
}

/** 下载结果 */
export interface DownloadResult {
  /** 下载完成的数据 */
  blob: Blob;
  /** 总字节数 */
  totalSize: number;
  /** 总耗时（毫秒） */
  totalTime: number;
  /** 各节点贡献统计 */
  nodeContributions: Map<string, { bytes: number; chunks: number; avgSpeed: number }>;
  /** 是否使用了多节点并行 */
  usedParallelMode: boolean;
  /** MIME 类型 */
  contentType: string;
}

// ============================================================
// 预定义的 CDN 节点能力数据库
// ============================================================

/**
 * 各 CDN 节点的已知文件大小限制
 * 基于调研数据，可被运行时探测覆盖
 */
export const CDN_NODE_LIMITS: Record<string, CDNNodeCapability> = {
  // jsDelivr 系列 — 单文件最大 20MB
  'jsdelivr-main': { maxFileSize: 20 * 1024 * 1024, supportsRange: true, verified: false },
  'jsdelivr-fastly': { maxFileSize: 20 * 1024 * 1024, supportsRange: true, verified: false },
  'jsdelivr-testing': { maxFileSize: 20 * 1024 * 1024, supportsRange: true, verified: false },
  'jsd-mirror': { maxFileSize: 20 * 1024 * 1024, supportsRange: true, verified: false },
  'zstatic': { maxFileSize: 20 * 1024 * 1024, supportsRange: true, verified: false },

  // GitHub Raw — 单文件最大 100MB（Git 限制），支持 Range
  'github-raw': { maxFileSize: 100 * 1024 * 1024, supportsRange: true, verified: false },

  // NPM CDN 节点
  'jsdelivr-npm': { maxFileSize: 20 * 1024 * 1024, supportsRange: true, verified: false },
  'unpkg': { maxFileSize: 20 * 1024 * 1024, supportsRange: true, verified: false },
  'esm-sh': { maxFileSize: 20 * 1024 * 1024, supportsRange: true, verified: false },

  // Cloudflare Workers — 无响应体大小限制（流式传输）
  'gh-proxy-public': { maxFileSize: -1, supportsRange: true, verified: false },
};

// ============================================================
// Range 探测器
// ============================================================

interface ProbeResult {
  supportsRange: boolean;
  contentLength: number;
  contentType: string;
  acceptRanges: string | null;
}

/**
 * 探测一个 URL 是否支持 Range 请求
 */
async function probeRangeSupport(url: string, timeout: number): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // 先发 HEAD 请求获取文件信息
    const headResponse = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const acceptRanges = headResponse.headers.get('Accept-Ranges');
    const contentLength = parseInt(headResponse.headers.get('Content-Length') || '0', 10);
    const contentType = headResponse.headers.get('Content-Type') || 'application/octet-stream';

    // 如果 HEAD 明确声明不支持，直接返回
    if (acceptRanges === 'none') {
      return { supportsRange: false, contentLength, contentType, acceptRanges };
    }

    // 如果有 Accept-Ranges: bytes，大概率支持
    if (acceptRanges === 'bytes' && contentLength > 0) {
      return { supportsRange: true, contentLength, contentType, acceptRanges };
    }

    // 不确定的情况下，尝试一个小 Range 请求验证
    if (contentLength > 0) {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), timeout);
      try {
        const rangeResponse = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          headers: { Range: 'bytes=0-0' },
          signal: controller2.signal,
        });
        clearTimeout(timeoutId2);
        return {
          supportsRange: rangeResponse.status === 206,
          contentLength,
          contentType,
          acceptRanges,
        };
      } catch {
        clearTimeout(timeoutId2);
        return { supportsRange: false, contentLength, contentType, acceptRanges };
      }
    }

    return { supportsRange: false, contentLength, contentType, acceptRanges };
  } catch {
    clearTimeout(timeoutId);
    return { supportsRange: false, contentLength: 0, contentType: 'application/octet-stream', acceptRanges: null };
  }
}

// ============================================================
// 动态负载均衡调度器
// ============================================================

class LoadBalancer {
  private workerStats: Map<string, WorkerStats> = new Map();
  private alpha: number;

  constructor(nodeIds: string[], alpha: number = 0.3) {
    this.alpha = alpha;
    for (const id of nodeIds) {
      this.workerStats.set(id, {
        nodeId: id,
        totalBytes: 0,
        totalTime: 0,
        speedBps: 0,
        completedChunks: 0,
        consecutiveFailures: 0,
        available: true,
      });
    }
  }

  /**
   * 根据延迟结果初始化各节点的预估速度
   */
  initFromLatency(latencyResults: Map<string, CDNLatencyResult>): void {
    for (const [nodeId, result] of latencyResults) {
      const stats = this.workerStats.get(nodeId);
      if (stats && result.success) {
        // 用延迟的倒数作为初始速度权重（越低延迟，初始分配越多）
        // 假设 50ms 延迟大约对应 1MB/s 的初始速度估计
        stats.speedBps = (1024 * 1024) / Math.max(result.latency, 10);
      }
    }
  }

  /**
   * 报告一个分块的下载结果，更新节点统计
   */
  reportChunkResult(nodeId: string, bytes: number, timeMs: number, success: boolean): void {
    const stats = this.workerStats.get(nodeId);
    if (!stats) return;

    if (success) {
      stats.totalBytes += bytes;
      stats.totalTime += timeMs;
      stats.completedChunks++;
      stats.consecutiveFailures = 0;

      // EWMA 平滑更新速度
      const instantSpeed = bytes / Math.max(timeMs, 1);
      stats.speedBps = stats.speedBps > 0
        ? stats.speedBps * (1 - this.alpha) + instantSpeed * this.alpha
        : instantSpeed;
    } else {
      stats.consecutiveFailures++;
      // 连续失败 3 次，标记节点不可用
      if (stats.consecutiveFailures >= 3) {
        stats.available = false;
      }
    }
  }

  /**
   * 选择最优节点分配下一个分块
   * 策略：选择预估完成时间最早的可用节点
   */
  selectBestNode(pendingChunksPerNode: Map<string, number>): string | null {
    let bestNode: string | null = null;
    let bestETA = Infinity;

    for (const [nodeId, stats] of this.workerStats) {
      if (!stats.available) continue;

      const pendingCount = pendingChunksPerNode.get(nodeId) || 0;
      // 预估完成当前积压任务的时间
      const eta = stats.speedBps > 0 ? pendingCount / stats.speedBps : Infinity;

      if (eta < bestETA) {
        bestETA = eta;
        bestNode = nodeId;
      }
    }

    return bestNode;
  }

  /**
   * 任务窃取：找到最慢的节点，把它的待执行任务转给最快的节点
   */
  findStealableTask(tasks: ChunkTask[]): { from: string; taskIndex: number } | null {
    const availableNodes = [...this.workerStats.values()].filter((s) => s.available);
    if (availableNodes.length < 2) return null;

    // 按速度排序
    const sorted = availableNodes.sort((a, b) => b.speedBps - a.speedBps);
    const fastest = sorted[0]!;
    const slowest = sorted[sorted.length - 1]!;

    // 速度差距需要至少 2 倍才执行窃取
    if (fastest.speedBps < slowest.speedBps * 2) return null;

    // 找到分配给最慢节点的 pending 任务
    for (let i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i]!;
      if (task.assignedNodeId === slowest.nodeId && task.status === 'pending') {
        return { from: slowest.nodeId, taskIndex: i };
      }
    }

    return null;
  }

  getStats(): Map<string, WorkerStats> {
    return new Map(this.workerStats);
  }

  getAvailableNodes(): string[] {
    return [...this.workerStats.entries()]
      .filter(([, s]) => s.available)
      .map(([id]) => id);
  }
}

// ============================================================
// ChunkedLoader — 并行分块加载引擎
// ============================================================

export class ChunkedLoader {
  private options: Required<ChunkedLoadOptions>;
  private nodeCapabilities: Map<string, CDNNodeCapability> = new Map();

  constructor(options?: ChunkedLoadOptions) {
    this.options = {
      chunkSize: options?.chunkSize ?? 2 * 1024 * 1024,           // 2MB
      maxConcurrency: options?.maxConcurrency ?? 6,
      chunkTimeout: options?.chunkTimeout ?? 30000,                // 30s
      maxRetries: options?.maxRetries ?? 3,
      enableWorkStealing: options?.enableWorkStealing ?? true,
      singleConnectionThreshold: options?.singleConnectionThreshold ?? 1024 * 1024, // 1MB
      speedAlpha: options?.speedAlpha ?? 0.3,
      probeTimeout: options?.probeTimeout ?? 5000,
    };

    // 预加载已知的节点限制
    for (const [nodeId, cap] of Object.entries(CDN_NODE_LIMITS)) {
      this.nodeCapabilities.set(nodeId, { ...cap });
    }
  }

  /**
   * 获取节点能力信息（已知 + 运行时探测）
   */
  getNodeCapability(nodeId: string): CDNNodeCapability | undefined {
    return this.nodeCapabilities.get(nodeId);
  }

  /**
   * 运行时探测节点是否支持 Range 请求
   */
  async probeNode(
    node: CDNNode,
    resourceUrl: string,
  ): Promise<ProbeResult & { nodeId: string }> {
    const result = await probeRangeSupport(resourceUrl, this.options.probeTimeout);

    // 更新节点能力缓存
    const existing = this.nodeCapabilities.get(node.id) || {
      maxFileSize: -1,
      supportsRange: false,
      verified: false,
    };
    this.nodeCapabilities.set(node.id, {
      ...existing,
      supportsRange: result.supportsRange,
      verified: true,
    });

    return { ...result, nodeId: node.id };
  }

  /**
   * 并行探测多个节点的 Range 支持
   */
  async probeAllNodes(
    nodes: CDNNode[],
    buildUrlFn: (node: CDNNode, resourcePath: string, context?: CDNContext) => string,
    resourcePath: string,
    context?: CDNContext,
  ): Promise<Map<string, ProbeResult & { nodeId: string }>> {
    const results = new Map<string, ProbeResult & { nodeId: string }>();

    const promises = nodes.map(async (node) => {
      try {
        const url = buildUrlFn(node, resourcePath, context);
        const result = await this.probeNode(node, url);
        results.set(node.id, result);
      } catch {
        results.set(node.id, {
          nodeId: node.id,
          supportsRange: false,
          contentLength: 0,
          contentType: 'application/octet-stream',
          acceptRanges: null,
        });
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * 核心方法：并行分块下载
   *
   * @param nodes - 可用的 CDN 节点列表（按延迟排序）
   * @param buildUrlFn - URL 构建函数
   * @param resourcePath - 资源路径
   * @param context - CDN 上下文
   * @param latencyResults - 延迟测速结果（用于初始负载分配）
   * @param onProgress - 进度回调
   */
  async download(
    nodes: CDNNode[],
    buildUrlFn: (node: CDNNode, resourcePath: string, context?: CDNContext) => string,
    resourcePath: string,
    context?: CDNContext,
    latencyResults?: Map<string, CDNLatencyResult>,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const startTime = performance.now();
    const enabledNodes = nodes.filter((n) => n.enabled !== false);

    if (enabledNodes.length === 0) {
      throw new Error('No available CDN nodes');
    }

    // 1. 用第一个可用节点探测文件信息
    const primaryUrl = buildUrlFn(enabledNodes[0]!, resourcePath, context);
    const probeResult = await probeRangeSupport(primaryUrl, this.options.probeTimeout);

    if (probeResult.contentLength === 0) {
      // 无法获取文件大小，回退到单连接模式
      return this.downloadSingle(primaryUrl, probeResult.contentType, startTime);
    }

    const totalSize = probeResult.contentLength;

    // 2. 决定下载策略
    if (totalSize <= this.options.singleConnectionThreshold || !probeResult.supportsRange) {
      // 小文件或不支持 Range，单连接下载
      return this.downloadSingle(primaryUrl, probeResult.contentType, startTime);
    }

    // 3. 并行探测所有节点的 Range 支持
    const nodeProbes = await this.probeAllNodes(enabledNodes, buildUrlFn, resourcePath, context);

    // 筛选支持 Range 且文件大小在限制内的节点
    const rangeNodes = enabledNodes.filter((node) => {
      const probe = nodeProbes.get(node.id);
      if (!probe?.supportsRange) return false;

      const cap = this.nodeCapabilities.get(node.id);
      if (cap && cap.maxFileSize > 0 && totalSize > cap.maxFileSize) return false;

      return true;
    });

    if (rangeNodes.length === 0) {
      // 没有节点支持 Range，回退到单连接
      return this.downloadSingle(primaryUrl, probeResult.contentType, startTime);
    }

    // 如果只有一个支持 Range 的节点，也用并行分块（同一节点多连接）
    const effectiveNodes = rangeNodes.length === 1
      ? [rangeNodes[0]!]
      : rangeNodes;

    // 4. 执行并行分块下载
    return this.downloadParallel(
      effectiveNodes,
      buildUrlFn,
      resourcePath,
      context,
      totalSize,
      probeResult.contentType,
      latencyResults,
      onProgress,
      startTime,
    );
  }

  // ============================================================
  // 单连接下载
  // ============================================================

  private async downloadSingle(
    url: string,
    contentType: string,
    startTime: number,
  ): Promise<DownloadResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.chunkTimeout * 3);

    try {
      const response = await fetch(url, {
        mode: 'cors',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const totalTime = performance.now() - startTime;

      return {
        blob,
        totalSize: blob.size,
        totalTime,
        nodeContributions: new Map(),
        usedParallelMode: false,
        contentType: contentType || blob.type,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // ============================================================
  // 并行分块下载
  // ============================================================

  private async downloadParallel(
    nodes: CDNNode[],
    buildUrlFn: (node: CDNNode, resourcePath: string, context?: CDNContext) => string,
    resourcePath: string,
    context: CDNContext | undefined,
    totalSize: number,
    contentType: string,
    latencyResults: Map<string, CDNLatencyResult> | undefined,
    onProgress: ((progress: DownloadProgress) => void) | undefined,
    startTime: number,
  ): Promise<DownloadResult> {
    // 1. 创建分块
    const chunks = this.createChunks(totalSize);

    // 2. 初始化负载均衡器
    const nodeIds = nodes.map((n) => n.id);
    const balancer = new LoadBalancer(nodeIds, this.options.speedAlpha);
    if (latencyResults) {
      balancer.initFromLatency(latencyResults);
    }

    // 3. 初始分配任务
    const tasks: ChunkTask[] = chunks.map((chunk, i) => ({
      chunk,
      status: 'pending' as ChunkStatus,
      assignedNodeId: nodeIds[i % nodeIds.length]!,
      retries: 0,
    }));

    // 4. 构建节点 URL 映射
    const nodeUrlMap = new Map<string, string>();
    for (const node of nodes) {
      nodeUrlMap.set(node.id, buildUrlFn(node, resourcePath, context));
    }

    // 5. 并发执行
    const concurrency = Math.min(this.options.maxConcurrency, chunks.length);
    let completedBytes = 0;

    const emitProgress = () => {
      if (!onProgress) return;
      const elapsed = (performance.now() - startTime) / 1000; // 秒
      const speed = completedBytes / Math.max(elapsed, 0.001);
      const remaining = totalSize - completedBytes;
      const eta = speed > 0 ? remaining / speed : Infinity;

      onProgress({
        loaded: completedBytes,
        total: totalSize,
        percentage: Math.round((completedBytes / totalSize) * 10000) / 100,
        speed,
        eta,
        nodeStats: balancer.getStats(),
        completedChunks: tasks.filter((t) => t.status === 'completed').length,
        totalChunks: chunks.length,
      });
    };

    // Worker 循环
    const workerFn = async () => {
      while (true) {
        // 找下一个待执行的任务
        const taskIndex = tasks.findIndex((t) => t.status === 'pending');
        if (taskIndex === -1) break;

        const task = tasks[taskIndex]!;
        task.status = 'downloading';

        // 获取分配节点的 URL
        let url = nodeUrlMap.get(task.assignedNodeId);
        if (!url) {
          // 节点不可用，重新分配
          const pendingMap = this.getPendingCountPerNode(tasks);
          const newNode = balancer.selectBestNode(pendingMap);
          if (newNode && nodeUrlMap.has(newNode)) {
            task.assignedNodeId = newNode;
            url = nodeUrlMap.get(newNode)!;
          } else {
            task.status = 'failed';
            task.error = 'No available node';
            continue;
          }
        }

        try {
          const chunkStart = performance.now();
          const data = await this.downloadChunk(url, task.chunk.start, task.chunk.end);
          const chunkTime = performance.now() - chunkStart;

          task.data = data;
          task.downloadTime = chunkTime;
          task.status = 'completed';
          completedBytes += data.byteLength;

          balancer.reportChunkResult(task.assignedNodeId, data.byteLength, chunkTime, true);
          emitProgress();

          // 尝试任务窃取
          if (this.options.enableWorkStealing) {
            const stealInfo = balancer.findStealableTask(tasks);
            if (stealInfo) {
              const stolen = tasks[stealInfo.taskIndex]!;
              const fastestNodes = balancer.getAvailableNodes();
              if (fastestNodes.length > 0) {
                // 把慢节点的任务抢过来
                stolen.assignedNodeId = fastestNodes[0]!;
                stolen.status = 'pending';
              }
            }
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          task.retries++;
          balancer.reportChunkResult(task.assignedNodeId, 0, 0, false);

          if (task.retries < this.options.maxRetries) {
            // 重新入队，可能会被分配到不同的节点
            const pendingMap = this.getPendingCountPerNode(tasks);
            const newNode = balancer.selectBestNode(pendingMap);
            if (newNode) {
              task.assignedNodeId = newNode;
            }
            task.status = 'pending';
          } else {
            task.status = 'failed';
            task.error = errMsg;
          }
        }
      }
    };

    // 启动 worker 协程
    const workers = Array.from({ length: concurrency }, () => workerFn());
    await Promise.all(workers);

    // 6. 检查是否有失败的分块
    const failedTasks = tasks.filter((t) => t.status === 'failed');
    if (failedTasks.length > 0) {
      throw new Error(
        `Failed to download ${failedTasks.length} chunks: ${failedTasks.map((t) => `chunk#${t.chunk.index}: ${t.error}`).join('; ')}`,
      );
    }

    // 7. 重组 Blob
    const blob = this.reassembleBlob(tasks, contentType);
    const totalTime = performance.now() - startTime;

    // 8. 计算各节点贡献
    const contributions = new Map<string, { bytes: number; chunks: number; avgSpeed: number }>();
    for (const task of tasks) {
      if (task.status !== 'completed') continue;
      const existing = contributions.get(task.assignedNodeId) || { bytes: 0, chunks: 0, avgSpeed: 0 };
      existing.bytes += task.data?.byteLength || 0;
      existing.chunks++;
      contributions.set(task.assignedNodeId, existing);
    }
    // 计算平均速度
    for (const [nodeId, stats] of contributions) {
      const workerStat = balancer.getStats().get(nodeId);
      if (workerStat && workerStat.totalTime > 0) {
        stats.avgSpeed = (workerStat.totalBytes / workerStat.totalTime) * 1000; // 字节/秒
      }
    }

    return {
      blob,
      totalSize,
      totalTime,
      nodeContributions: contributions,
      usedParallelMode: true,
      contentType,
    };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /** 创建分块列表 */
  private createChunks(totalSize: number): Chunk[] {
    const chunks: Chunk[] = [];
    let offset = 0;
    let index = 0;

    while (offset < totalSize) {
      const end = Math.min(offset + this.options.chunkSize - 1, totalSize - 1);
      chunks.push({
        index,
        start: offset,
        end,
        size: end - offset + 1,
      });
      offset = end + 1;
      index++;
    }

    return chunks;
  }

  /** 下载单个分块 */
  private async downloadChunk(url: string, start: number, end: number): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.chunkTimeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: {
          Range: `bytes=${start}-${end}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status !== 206 && response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /** 按顺序重组分块为 Blob */
  private reassembleBlob(tasks: ChunkTask[], contentType: string): Blob {
    // 按分块索引排序
    const sorted = [...tasks]
      .filter((t) => t.status === 'completed' && t.data)
      .sort((a, b) => a.chunk.index - b.chunk.index);

    const parts: ArrayBuffer[] = sorted.map((t) => t.data!);
    return new Blob(parts, { type: contentType });
  }

  /** 统计各节点待执行分块数 */
  private getPendingCountPerNode(tasks: ChunkTask[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.status === 'pending' || task.status === 'downloading') {
        counts.set(task.assignedNodeId, (counts.get(task.assignedNodeId) || 0) + 1);
      }
    }
    return counts;
  }

  // ============================================================
  // 配置更新
  // ============================================================

  setChunkSize(bytes: number): void {
    this.options.chunkSize = bytes;
  }

  setMaxConcurrency(n: number): void {
    this.options.maxConcurrency = n;
  }

  setChunkTimeout(ms: number): void {
    this.options.chunkTimeout = ms;
  }

  getOptions(): Readonly<Required<ChunkedLoadOptions>> {
    return { ...this.options };
  }
}

/** 默认分块加载器实例 */
export const defaultChunkedLoader = new ChunkedLoader();
