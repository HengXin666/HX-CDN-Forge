/**
 * rangeDownloader.ts — IDM 风格多节点 HTTP Range 并行下载
 *
 * 算法:
 * 1. HEAD 请求获取 Content-Length
 * 2. 将文件等分为 N 个 segment (N = 可用节点数), 每个节点负责一个
 * 3. 每个节点用 Range: bytes=start-end 下载自己的 segment
 * 4. 当某节点完成 → 找当前正在下载的最大剩余 segment → 从中间劈开:
 *    - 原节点保留后半段 (与已下载部分连续)
 *    - 空闲节点接管前半段 (新的独立请求)
 * 5. 所有 segment 完成后按字节序拼接
 *
 * 退化: Content-Length 未知 / 不支持 Range → 回退到普通单连接下载
 */

import type { CDNNode, GitHubContext, DownloadProgress, DownloadResult } from '../types';

// ============================================================
// Types
// ============================================================

interface Segment {
  id: number;
  start: number;         // 字节起始 (inclusive)
  end: number;           // 字节结束 (inclusive)
  nodeId: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  data?: ArrayBuffer;
  /** 正在下载时, 已经下载到的字节位置 (用于计算剩余量来决定劈半) */
  downloadedUpTo: number;
  retries: number;
  controller?: AbortController;
}

export interface RangeDownloaderOptions {
  /** 单段超时 (ms), 默认 60000 */
  segmentTimeout: number;
  /** 最大重试次数, 默认 3 */
  maxRetries: number;
  /** 最小可劈半的段大小 (字节), 低于此值不再劈, 默认 256KB */
  minSplitSize: number;
}

const DEFAULT_OPTS: RangeDownloaderOptions = {
  segmentTimeout: 60_000,
  maxRetries: 3,
  minSplitSize: 256 * 1024,
};

// ============================================================
// RangeDownloader
// ============================================================

export class RangeDownloader {
  private opts: RangeDownloaderOptions;

  constructor(opts?: Partial<RangeDownloaderOptions>) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  /**
   * IDM 模式下载单个文件
   *
   * @param url - 任一 CDN 节点的完整 URL (用于 HEAD 探测)
   * @param nodes - 所有可用节点
   * @param github - GitHub 上下文
   * @param filePath - 仓库内相对路径
   * @param onProgress - 进度回调
   */
  async download(
    nodes: CDNNode[],
    github: GitHubContext,
    filePath: string,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const startTime = performance.now();
    const enabledNodes = nodes.filter((n) => n.enabled !== false && n.supportsRange);

    if (enabledNodes.length === 0) {
      throw new Error('No CDN nodes with Range support available');
    }

    // 1. HEAD 探测文件大小 + Range 支持
    const probeNode = enabledNodes[0]!;
    const probeUrl = probeNode.buildUrl(github, filePath);
    const probeResult = await this.probeFile(probeUrl);

    if (probeResult.totalSize <= 0) {
      throw new Error('Cannot determine file size (Content-Length missing or 0)');
    }

    const { totalSize, contentType, supportsRange } = probeResult;

    // 不支持 Range / 文件太小 / 只有 1 个节点 → 降级为单连接
    if (!supportsRange || totalSize < this.opts.minSplitSize * 2 || enabledNodes.length === 1) {
      if (!supportsRange) {
        console.warn(`[RangeDownloader] 服务器不支持 Range, 降级为单连接下载: ${filePath}`);
      }
      return this.downloadSingle(probeUrl, probeNode.id, totalSize, contentType, startTime, onProgress);
    }

    // 2. 等分为 N 个 segment
    const numSegments = enabledNodes.length;
    const segmentSize = Math.ceil(totalSize / numSegments);
    let nextSegId = 0;

    const segments: Segment[] = [];
    for (let i = 0; i < numSegments; i++) {
      const start = i * segmentSize;
      const end = Math.min(start + segmentSize - 1, totalSize - 1);
      if (start > totalSize - 1) break;
      segments.push({
        id: nextSegId++,
        start,
        end,
        nodeId: enabledNodes[i]!.id,
        status: 'pending',
        downloadedUpTo: start,
        retries: 0,
      });
    }

    // 3. 并行下载 + 动态劈半窃取
    let completedBytes = 0;

    const emitProgress = () => {
      if (!onProgress) return;
      const elapsed = (performance.now() - startTime) / 1000;
      const speed = completedBytes / Math.max(elapsed, 0.001);
      const completed = segments.filter((s) => s.status === 'completed').length;
      onProgress({
        loaded: completedBytes,
        total: totalSize,
        percentage: Math.round((completedBytes / totalSize) * 10000) / 100,
        speed,
        eta: speed > 0 ? (totalSize - completedBytes) / speed : Infinity,
        completedChunks: completed,
        totalChunks: segments.length,
      });
    };

    const nodeMap = new Map(enabledNodes.map((n) => [n.id, n]));

    const downloadSegment = async (seg: Segment): Promise<void> => {
      const node = nodeMap.get(seg.nodeId);
      if (!node) { seg.status = 'failed'; return; }

      const url = node.buildUrl(github, filePath);
      const ctrl = new AbortController();
      seg.controller = ctrl;
      seg.status = 'downloading';

      const tid = setTimeout(() => ctrl.abort(), this.opts.segmentTimeout);

      try {
        const resp = await fetch(url, {
          mode: 'cors',
          signal: ctrl.signal,
          headers: { 'Range': `bytes=${seg.start}-${seg.end}` },
        });
        clearTimeout(tid);

        if (!resp.ok && resp.status !== 206) {
          throw new Error(`HTTP ${resp.status}`);
        }

        // 验证服务器确实返回了部分内容 (206), 而不是忽略 Range 返回完整文件 (200)
        if (resp.status === 200 && seg.start > 0) {
          throw new Error('Server returned 200 instead of 206 — Range not supported');
        }

        // 流式读取, 追踪 downloadedUpTo
        if (resp.body) {
          const reader = resp.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            seg.downloadedUpTo = seg.start + received;
          }

          // 拼接
          const buf = new Uint8Array(received);
          let offset = 0;
          for (const c of chunks) {
            buf.set(c, offset);
            offset += c.byteLength;
          }
          seg.data = buf.buffer;
        } else {
          seg.data = await resp.arrayBuffer();
        }

        seg.status = 'completed';
        completedBytes += seg.data!.byteLength;
        emitProgress();
      } catch (err) {
        clearTimeout(tid);
        seg.retries++;
        if (seg.retries < this.opts.maxRetries) {
          seg.status = 'pending';
          seg.downloadedUpTo = seg.start;
        } else {
          seg.status = 'failed';
        }
      }
    };

    // 找到当前正在下载的、剩余量最大的 segment, 劈半
    const trySplitAndSteal = (freeNodeId: string): Segment | null => {
      let bestSeg: Segment | null = null;
      let bestRemaining = 0;

      for (const seg of segments) {
        if (seg.status !== 'downloading') continue;
        const remaining = seg.end - seg.downloadedUpTo;
        if (remaining > bestRemaining && remaining >= this.opts.minSplitSize * 2) {
          bestRemaining = remaining;
          bestSeg = seg;
        }
      }

      if (!bestSeg) return null;

      // 劈半: 原节点保留后半段 (与已下载部分连续), 空闲节点接管前半段
      const splitPoint = bestSeg.downloadedUpTo + Math.floor((bestSeg.end - bestSeg.downloadedUpTo) / 2);

      // 取消原请求
      try { bestSeg.controller?.abort(); } catch {}

      // 原节点的新 segment: downloadedUpTo ~ splitPoint (前半, 连续)
      const origNewSeg: Segment = {
        id: nextSegId++,
        start: bestSeg.downloadedUpTo,
        end: splitPoint,
        nodeId: bestSeg.nodeId,
        status: 'pending',
        downloadedUpTo: bestSeg.downloadedUpTo,
        retries: 0,
      };

      // 空闲节点的 segment: splitPoint+1 ~ end (后半)
      const stolenSeg: Segment = {
        id: nextSegId++,
        start: splitPoint + 1,
        end: bestSeg.end,
        nodeId: freeNodeId,
        status: 'pending',
        downloadedUpTo: splitPoint + 1,
        retries: 0,
      };

      // 更新原 segment: 只保留已下载的部分
      if (bestSeg.downloadedUpTo > bestSeg.start && bestSeg.data) {
        // 截取已下载的数据
        const downloadedSize = bestSeg.downloadedUpTo - bestSeg.start;
        bestSeg.data = bestSeg.data.slice(0, downloadedSize);
        bestSeg.end = bestSeg.downloadedUpTo - 1;
        bestSeg.status = 'completed';
        completedBytes += downloadedSize;
        emitProgress();
      } else {
        // 还没下载到数据, 直接废弃
        bestSeg.status = 'completed';
        bestSeg.data = new ArrayBuffer(0);
        bestSeg.end = bestSeg.start - 1; // 空 segment
      }

      segments.push(origNewSeg, stolenSeg);
      return stolenSeg;
    };

    // Worker 协程
    const worker = async (nodeId: string): Promise<void> => {
      while (true) {
        // 找 pending segment (优先找分配给自己的)
        let seg = segments.find((s) => s.status === 'pending' && s.nodeId === nodeId);
        if (!seg) seg = segments.find((s) => s.status === 'pending');

        if (seg) {
          seg.nodeId = nodeId;
          await downloadSegment(seg);
          continue;
        }

        // 没有 pending → 尝试劈半窃取
        const stolen = trySplitAndSteal(nodeId);
        if (stolen) {
          // 新产生了 2 个 pending segment, 继续循环
          continue;
        }

        // 既没有 pending 也无法窃取 → 检查是否还有 downloading
        const hasActive = segments.some((s) => s.status === 'downloading');
        if (!hasActive) break;

        // 还有 downloading 的, 等一小会再检查 (避免忙等)
        await new Promise((r) => setTimeout(r, 50));
      }
    };

    // 启动所有 worker
    const workers = enabledNodes.map((n) => worker(n.id));
    await Promise.all(workers);

    // 检查失败
    const failed = segments.filter((s) => s.status === 'failed');
    if (failed.length > 0) {
      throw new Error(`Range download failed: ${failed.length} segments failed`);
    }

    // 4. 按字节序排列拼接
    const sorted = segments
      .filter((s) => s.status === 'completed' && s.data && s.data.byteLength > 0)
      .sort((a, b) => a.start - b.start);

    const blob = new Blob(sorted.map((s) => s.data!), { type: contentType });

    // 统计各节点贡献
    const contributions = new Map<string, { bytes: number; chunks: number; avgSpeed: number }>();
    for (const seg of sorted) {
      const existing = contributions.get(seg.nodeId) ?? { bytes: 0, chunks: 0, avgSpeed: 0 };
      existing.bytes += seg.data!.byteLength;
      existing.chunks++;
      contributions.set(seg.nodeId, existing);
    }

    return {
      blob,
      arrayBuffer: () => blob.arrayBuffer(),
      totalSize: blob.size,
      totalTime: performance.now() - startTime,
      contentType,
      usedSplitMode: false,
      usedParallelMode: true,
      nodeContributions: contributions,
    };
  }

  // ============================================================
  // 辅助
  // ============================================================

  private async probeFile(url: string): Promise<{
    totalSize: number;
    contentType: string;
    supportsRange: boolean;
  }> {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const resp = await fetch(url, { method: 'HEAD', mode: 'cors', signal: ctrl.signal });
      clearTimeout(tid);
      const cl = resp.headers.get('Content-Length');
      const ct = resp.headers.get('Content-Type') ?? 'application/octet-stream';
      const ar = resp.headers.get('Accept-Ranges');
      // Accept-Ranges: bytes 表示支持; Accept-Ranges: none 或不存在时不确定
      // 保守策略: 只有明确返回 "bytes" 才认为支持
      const supportsRange = ar?.toLowerCase() === 'bytes';
      return { totalSize: cl ? parseInt(cl, 10) : 0, contentType: ct, supportsRange };
    } catch {
      clearTimeout(tid);
      return { totalSize: 0, contentType: 'application/octet-stream', supportsRange: false };
    }
  }

  private async downloadSingle(
    url: string,
    nodeId: string,
    totalSize: number,
    contentType: string,
    startTime: number,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), this.opts.segmentTimeout);
    const resp = await fetch(url, { mode: 'cors', signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    onProgress?.({
      loaded: blob.size, total: totalSize, percentage: 100,
      speed: 0, eta: 0, completedChunks: 1, totalChunks: 1,
    });
    return {
      blob,
      arrayBuffer: () => blob.arrayBuffer(),
      totalSize: blob.size,
      totalTime: performance.now() - startTime,
      contentType,
      usedSplitMode: false,
      usedParallelMode: false,
      nodeContributions: new Map([[nodeId, { bytes: blob.size, chunks: 1, avgSpeed: 0 }]]),
    };
  }
}
