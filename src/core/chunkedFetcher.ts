/**
 * chunkedFetcher.ts — 多 CDN 并行分块加载引擎
 *
 * 功能:
 * 1. 标准模式: 不同分片分配给不同 CDN，动态负载均衡 + 任务窃取
 * 2. 极速模式: 同一分片从多个 CDN 同时请求，取最快响应
 */

import type {
  CDNNode,
  LatencyResult,
  DownloadProgress,
} from '../types';

// ============================================================
// 类型
// ============================================================

interface ChunkDef {
  index: number;
  start: number;
  end: number;
  size: number;
}

type ChunkStatus = 'pending' | 'downloading' | 'completed' | 'failed';

interface ChunkTask {
  chunk: ChunkDef;
  status: ChunkStatus;
  assignedNodeId: string;
  retries: number;
  data?: ArrayBuffer;
  error?: string;
}

interface WorkerStats {
  nodeId: string;
  totalBytes: number;
  totalTime: number;
  speedBps: number;
  completedChunks: number;
  consecutiveFailures: number;
  available: boolean;
}

export interface ChunkedFetcherOptions {
  maxConcurrency: number;
  chunkTimeout: number;
  maxRetries: number;
  enableWorkStealing: boolean;
  turboMode: boolean;
  turboConcurrentCDNs: number;
}

export interface ChunkedFetchResult {
  blob: Blob;
  totalSize: number;
  totalTime: number;
  nodeContributions: Map<string, { bytes: number; chunks: number; avgSpeed: number }>;
  usedParallelMode: boolean;
  contentType: string;
}

// ============================================================
// 负载均衡器
// ============================================================

class LoadBalancer {
  private stats: Map<string, WorkerStats> = new Map();
  private alpha: number;

  constructor(nodeIds: string[], alpha = 0.3) {
    this.alpha = alpha;
    for (const id of nodeIds) {
      this.stats.set(id, {
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

  initFromLatency(results: Map<string, LatencyResult>): void {
    for (const [nodeId, r] of results) {
      const s = this.stats.get(nodeId);
      if (s && r.success) {
        s.speedBps = (1024 * 1024) / Math.max(r.latency, 10);
      }
    }
  }

  report(nodeId: string, bytes: number, timeMs: number, success: boolean): void {
    const s = this.stats.get(nodeId);
    if (!s) return;

    if (success) {
      s.totalBytes += bytes;
      s.totalTime += timeMs;
      s.completedChunks++;
      s.consecutiveFailures = 0;
      const instant = bytes / Math.max(timeMs, 1);
      s.speedBps = s.speedBps > 0
        ? s.speedBps * (1 - this.alpha) + instant * this.alpha
        : instant;
    } else {
      s.consecutiveFailures++;
      if (s.consecutiveFailures >= 3) s.available = false;
    }
  }

  selectBest(pendingPerNode: Map<string, number>): string | null {
    let best: string | null = null;
    let bestETA = Infinity;

    for (const [nodeId, s] of this.stats) {
      if (!s.available) continue;
      const pending = pendingPerNode.get(nodeId) ?? 0;
      const eta = s.speedBps > 0 ? pending / s.speedBps : Infinity;
      if (eta < bestETA) {
        bestETA = eta;
        best = nodeId;
      }
    }
    return best;
  }

  findStealable(tasks: ChunkTask[]): { from: string; taskIndex: number } | null {
    const avail = [...this.stats.values()].filter((s) => s.available);
    if (avail.length < 2) return null;

    const sorted = avail.sort((a, b) => b.speedBps - a.speedBps);
    const fastest = sorted[0]!;
    const slowest = sorted[sorted.length - 1]!;

    if (fastest.speedBps < slowest.speedBps * 2) return null;

    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i]!;
      if (t.assignedNodeId === slowest.nodeId && t.status === 'pending') {
        return { from: slowest.nodeId, taskIndex: i };
      }
    }
    return null;
  }

  getAvailableNodes(): string[] {
    return [...this.stats.entries()]
      .filter(([, s]) => s.available)
      .map(([id]) => id);
  }

  getStats(): Map<string, WorkerStats> {
    return new Map(this.stats);
  }
}

// ============================================================
// ChunkedFetcher
// ============================================================

export class ChunkedFetcher {
  private opts: ChunkedFetcherOptions;

  constructor(opts: Partial<ChunkedFetcherOptions> = {}) {
    this.opts = {
      maxConcurrency: opts.maxConcurrency ?? 6,
      chunkTimeout: opts.chunkTimeout ?? 30_000,
      maxRetries: opts.maxRetries ?? 3,
      enableWorkStealing: opts.enableWorkStealing ?? true,
      turboMode: opts.turboMode ?? false,
      turboConcurrentCDNs: opts.turboConcurrentCDNs ?? 3,
    };
  }

  /**
   * 并行下载多个分片文件，然后拼接
   *
   * @param chunkUrls - 每个分片的 URL 列表 (外层=分片索引, 内层=各CDN节点的URL)
   * @param chunkSizes - 各分片的预期大小
   * @param totalSize - 总大小
   * @param contentType - MIME 类型
   * @param nodes - 可用节点列表 (用于负载均衡)
   * @param latencyResults - 延迟数据
   * @param onProgress - 进度回调
   */
  async downloadChunks(
    chunkUrls: string[][],
    chunkSizes: number[],
    totalSize: number,
    contentType: string,
    nodes: CDNNode[],
    latencyResults?: Map<string, LatencyResult>,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<ChunkedFetchResult> {
    const startTime = performance.now();
    const numChunks = chunkUrls.length;

    if (numChunks === 0) {
      throw new Error('No chunks to download');
    }

    // 极速模式
    if (this.opts.turboMode && chunkUrls[0]!.length > 1) {
      return this.downloadTurbo(
        chunkUrls, chunkSizes, totalSize, contentType,
        nodes, startTime, onProgress,
      );
    }

    // 标准模式: 并行下载各分片
    return this.downloadStandard(
      chunkUrls, chunkSizes, totalSize, contentType,
      nodes, latencyResults, startTime, onProgress,
    );
  }

  // ============================================================
  // 标准模式
  // ============================================================

  private async downloadStandard(
    chunkUrls: string[][],
    chunkSizes: number[],
    totalSize: number,
    contentType: string,
    nodes: CDNNode[],
    latencyResults: Map<string, LatencyResult> | undefined,
    startTime: number,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<ChunkedFetchResult> {
    const nodeIds = nodes.filter((n) => n.enabled !== false).map((n) => n.id);
    const balancer = new LoadBalancer(nodeIds);
    if (latencyResults) balancer.initFromLatency(latencyResults);

    // 分配任务: 每个分片轮询分配到一个 CDN
    const tasks: ChunkTask[] = chunkUrls.map((urls, i) => ({
      chunk: { index: i, start: 0, end: chunkSizes[i]! - 1, size: chunkSizes[i]! },
      status: 'pending' as ChunkStatus,
      assignedNodeId: nodeIds[i % nodeIds.length]!,
      retries: 0,
    }));

    const concurrency = Math.min(this.opts.maxConcurrency, tasks.length);
    let completedBytes = 0;

    const emitProgress = () => {
      if (!onProgress) return;
      const elapsed = (performance.now() - startTime) / 1000;
      const speed = completedBytes / Math.max(elapsed, 0.001);
      const remaining = totalSize - completedBytes;
      onProgress({
        loaded: completedBytes,
        total: totalSize,
        percentage: Math.round((completedBytes / totalSize) * 10000) / 100,
        speed,
        eta: speed > 0 ? remaining / speed : Infinity,
        completedChunks: tasks.filter((t) => t.status === 'completed').length,
        totalChunks: tasks.length,
      });
    };

    const workerFn = async () => {
      while (true) {
        const idx = tasks.findIndex((t) => t.status === 'pending');
        if (idx === -1) break;

        const task = tasks[idx]!;
        task.status = 'downloading';

        // 选择该分片对应 CDN 的 URL
        const nodeIndex = nodeIds.indexOf(task.assignedNodeId);
        const urlIndex = nodeIndex >= 0 && nodeIndex < chunkUrls[task.chunk.index]!.length
          ? nodeIndex
          : 0;
        const url = chunkUrls[task.chunk.index]![urlIndex]!;

        try {
          const t0 = performance.now();
          const data = await this.fetchChunk(url);
          const dt = performance.now() - t0;

          task.data = data;
          task.status = 'completed';
          completedBytes += data.byteLength;
          balancer.report(task.assignedNodeId, data.byteLength, dt, true);
          emitProgress();

          // 任务窃取
          if (this.opts.enableWorkStealing) {
            const steal = balancer.findStealable(tasks);
            if (steal) {
              const stolen = tasks[steal.taskIndex]!;
              const fastNodes = balancer.getAvailableNodes();
              if (fastNodes.length > 0) {
                stolen.assignedNodeId = fastNodes[0]!;
                stolen.status = 'pending';
              }
            }
          }
        } catch (err) {
          task.retries++;
          balancer.report(task.assignedNodeId, 0, 0, false);

          if (task.retries < this.opts.maxRetries) {
            // 重新分配节点
            const pendingMap = getPendingCount(tasks);
            const newNode = balancer.selectBest(pendingMap);
            if (newNode) task.assignedNodeId = newNode;
            task.status = 'pending';
          } else {
            task.status = 'failed';
            task.error = err instanceof Error ? err.message : 'Unknown error';
          }
        }
      }
    };

    const workers = Array.from({ length: concurrency }, () => workerFn());
    await Promise.all(workers);

    const failed = tasks.filter((t) => t.status === 'failed');
    if (failed.length > 0) {
      throw new Error(
        `Failed to download ${failed.length} chunks: ${failed.map((t) => `#${t.chunk.index}: ${t.error}`).join('; ')}`,
      );
    }

    return this.buildResult(tasks, contentType, startTime, balancer, true);
  }

  // ============================================================
  // 极速模式: 同一分片多 CDN 竞速
  // ============================================================

  private async downloadTurbo(
    chunkUrls: string[][],
    chunkSizes: number[],
    totalSize: number,
    contentType: string,
    nodes: CDNNode[],
    startTime: number,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<ChunkedFetchResult> {
    const turboCDNs = Math.min(this.opts.turboConcurrentCDNs, chunkUrls[0]!.length);
    const results: ArrayBuffer[] = new Array(chunkUrls.length);
    const nodeContrib = new Map<string, { bytes: number; chunks: number }>();
    let completedBytes = 0;

    const emitProgress = () => {
      if (!onProgress) return;
      const elapsed = (performance.now() - startTime) / 1000;
      const speed = completedBytes / Math.max(elapsed, 0.001);
      onProgress({
        loaded: completedBytes,
        total: totalSize,
        percentage: Math.round((completedBytes / totalSize) * 10000) / 100,
        speed,
        eta: speed > 0 ? (totalSize - completedBytes) / speed : Infinity,
        completedChunks: results.filter(Boolean).length,
        totalChunks: chunkUrls.length,
      });
    };

    // 限制并发
    const concurrency = Math.min(this.opts.maxConcurrency, chunkUrls.length);
    let nextChunkIndex = 0;

    const worker = async () => {
      while (true) {
        const ci = nextChunkIndex++;
        if (ci >= chunkUrls.length) break;

        const urls = chunkUrls[ci]!.slice(0, turboCDNs);

        // 多 CDN 竞速: 谁先完成用谁的
        const data = await this.raceDownload(urls, nodes, turboCDNs);

        results[ci] = data.buffer;
        completedBytes += data.buffer.byteLength;

        // 记录哪个 CDN 赢了
        const existing = nodeContrib.get(data.winnerId) ?? { bytes: 0, chunks: 0 };
        existing.bytes += data.buffer.byteLength;
        existing.chunks++;
        nodeContrib.set(data.winnerId, existing);

        emitProgress();
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    // 拼接
    const parts = results.filter(Boolean);
    if (parts.length !== chunkUrls.length) {
      throw new Error(`Only downloaded ${parts.length}/${chunkUrls.length} chunks`);
    }

    const blob = new Blob(results, { type: contentType });
    const contributions = new Map<string, { bytes: number; chunks: number; avgSpeed: number }>();
    for (const [id, c] of nodeContrib) {
      contributions.set(id, { ...c, avgSpeed: 0 });
    }

    return {
      blob,
      totalSize,
      totalTime: performance.now() - startTime,
      nodeContributions: contributions,
      usedParallelMode: true,
      contentType,
    };
  }

  /** 多 CDN 竞速下载同一个 URL */
  private async raceDownload(
    urls: string[],
    nodes: CDNNode[],
    _count: number,
  ): Promise<{ buffer: ArrayBuffer; winnerId: string }> {
    const controllers: AbortController[] = [];

    const promises = urls.map(async (url, i) => {
      const ctrl = new AbortController();
      controllers.push(ctrl);
      const tid = setTimeout(() => ctrl.abort(), this.opts.chunkTimeout);

      try {
        const resp = await fetch(url, { mode: 'cors', signal: ctrl.signal });
        clearTimeout(tid);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buffer = await resp.arrayBuffer();
        return {
          buffer,
          winnerId: i < nodes.length ? nodes[i]!.id : `cdn-${i}`,
        };
      } catch (err) {
        clearTimeout(tid);
        throw err;
      }
    });

    try {
      // Promise.any: 第一个成功的
      const result = await Promise.any(promises);
      // 取消其他请求
      for (const ctrl of controllers) {
        try { ctrl.abort(); } catch { /* ignore */ }
      }
      return result;
    } catch {
      throw new Error('All CDN nodes failed for this chunk');
    }
  }

  // ============================================================
  // 辅助
  // ============================================================

  private async fetchChunk(url: string): Promise<ArrayBuffer> {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), this.opts.chunkTimeout);

    try {
      const resp = await fetch(url, { mode: 'cors', signal: ctrl.signal });
      clearTimeout(tid);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      return await resp.arrayBuffer();
    } catch (err) {
      clearTimeout(tid);
      throw err;
    }
  }

  private buildResult(
    tasks: ChunkTask[],
    contentType: string,
    startTime: number,
    balancer: LoadBalancer,
    parallel: boolean,
  ): ChunkedFetchResult {
    const sorted = [...tasks]
      .filter((t) => t.status === 'completed' && t.data)
      .sort((a, b) => a.chunk.index - b.chunk.index);

    const blob = new Blob(sorted.map((t) => t.data!), { type: contentType });

    const contributions = new Map<string, { bytes: number; chunks: number; avgSpeed: number }>();
    for (const task of tasks) {
      if (task.status !== 'completed') continue;
      const existing = contributions.get(task.assignedNodeId) ?? { bytes: 0, chunks: 0, avgSpeed: 0 };
      existing.bytes += task.data?.byteLength ?? 0;
      existing.chunks++;
      contributions.set(task.assignedNodeId, existing);
    }

    for (const [nodeId, stats] of contributions) {
      const ws = balancer.getStats().get(nodeId);
      if (ws && ws.totalTime > 0) {
        stats.avgSpeed = (ws.totalBytes / ws.totalTime) * 1000;
      }
    }

    return {
      blob,
      totalSize: blob.size,
      totalTime: performance.now() - startTime,
      nodeContributions: contributions,
      usedParallelMode: parallel,
      contentType,
    };
  }
}

function getPendingCount(tasks: ChunkTask[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tasks) {
    if (t.status === 'pending' || t.status === 'downloading') {
      m.set(t.assignedNodeId, (m.get(t.assignedNodeId) ?? 0) + 1);
    }
  }
  return m;
}
