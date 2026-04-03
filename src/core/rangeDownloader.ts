/**
 * rangeDownloader.ts — IDM 风格多节点 HTTP Range 并行下载
 *
 * 算法:
 * 1. HEAD 并发竞速探测文件大小 (Promise.any, 取最快成功的节点)
 * 2. 将文件等分为 N 个 segment (N = 可用节点数), 每个节点负责一个
 * 3. 每个节点用 Range: bytes=start-end 下载自己的 segment
 * 4. 当某节点完成 → 找当前正在下载的最大剩余 segment → 劈半窃取:
 *    - 原节点继续传输 (不 abort 连接, 仅缩短 end 并截断多余数据)
 *    - 空闲节点接管后半段 (新 Range 请求)
 * 5. 慢节点检测: 如果某 segment 下载停滞超过 stallTimeout → abort + 拉黑节点
 *    → 将其未完成部分交给其他可用节点
 * 6. Worker 漂移: 被拉黑的 worker 不退出, 自动切换到可用节点继续工作, 保持并行度
 * 7. 节点分配使用 round-robin 轮询, 多 worker 漂移时避免堆积
 * 8. 所有 segment 完成后按字节序拼接 + 完整性校验
 *
 * 降级: Content-Length 未知 / 不支持 Range → 回退到普通单连接下载
 */

import type { CDNNode, GitHubContext, DownloadProgress, DownloadResult } from '../types';

// ============================================================
// Types
// ============================================================

interface Segment {
  id: number;
  start: number;
  end: number;
  nodeId: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  data?: ArrayBuffer;
  downloadedUpTo: number;
  lastProgressAt: number;  // 上次有数据到达的时间戳 (用于停滞检测)
  retries: number;
  controller?: AbortController;
  /** 被劈半窃取后 end 被缩短, 流式读取需要提前截断 */
  splitShrunk?: boolean;
}

export interface RangeDownloaderOptions {
  /** 单段超时 (ms), 默认 60000 */
  segmentTimeout: number;
  /** 最大重试次数, 默认 3 */
  maxRetries: number;
  /** 最小可劈半的段大小 (字节), 低于此值不再劈, 默认 256KB */
  minSplitSize: number;
  /** 停滞超时 (ms): segment 无新数据到达超过此时间 → abort + 交给其他节点, 默认 2500 */
  stallTimeout: number;
  /** 停滞检测间隔 (ms), 默认 500 */
  stallCheckInterval: number;
}

const DEFAULT_OPTS: RangeDownloaderOptions = {
  segmentTimeout: 60_000,
  maxRetries: 3,
  minSplitSize: 256 * 1024,
  stallTimeout: 2_500,
  stallCheckInterval: 500,
};

// ============================================================
// RangeDownloader
// ============================================================

export class RangeDownloader {
  private opts: RangeDownloaderOptions;

  constructor(opts?: Partial<RangeDownloaderOptions>) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

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

    // 1. 检查节点是否声明支持 Range (信任节点配置, 不依赖 HEAD Accept-Ranges)
    const rangeNodes = enabledNodes.filter((n) => n.supportsRange);
    if (rangeNodes.length === 0) {
      console.warn(`[RangeDownloader] 无节点声明支持 Range, 降级为单连接: ${filePath}`);
      const fallback = enabledNodes[0]!;
      const url = fallback.buildUrl(github, filePath);
      return this.downloadSingle(url, fallback.id, 0, 'application/octet-stream', startTime, onProgress);
    }

    // 2. HEAD 探测文件大小 — 并发竞速, 取最快成功的节点结果
    //    比串行逐个尝试快得多: 串行最坏 N×10s, 竞速只需最快节点的延迟
    let totalSize = 0;
    let contentType = 'application/octet-stream';
    try {
      const probeResult = await Promise.any(
        rangeNodes.map(async (node) => {
          const url = node.buildUrl(github, filePath);
          const probe = await this.probeFile(url);
          if (probe.totalSize <= 0) throw new Error('probe failed');
          return probe;
        }),
      );
      totalSize = probeResult.totalSize;
      contentType = probeResult.contentType;
    } catch {
      // 所有节点都失败了, totalSize 保持 0
    }

    if (totalSize <= 0) {
      // Content-Length 拿不到, 降级单连接
      console.warn(`[RangeDownloader] Content-Length 未知, 降级为单连接: ${filePath}`);
      const url = rangeNodes[0]!.buildUrl(github, filePath);
      return this.downloadSingle(url, rangeNodes[0]!.id, 0, contentType, startTime, onProgress);
    }

    if (totalSize < this.opts.minSplitSize * 2 || rangeNodes.length === 1) {
      const url = rangeNodes[0]!.buildUrl(github, filePath);
      return this.downloadSingle(url, rangeNodes[0]!.id, totalSize, contentType, startTime, onProgress);
    }

    // 3. 等分 segment
    const numSegments = rangeNodes.length;
    const segmentSize = Math.ceil(totalSize / numSegments);
    let nextSegId = 0;

    const segments: Segment[] = [];
    for (let i = 0; i < numSegments; i++) {
      const start = i * segmentSize;
      const end = Math.min(start + segmentSize - 1, totalSize - 1);
      if (start > totalSize - 1) break;
      segments.push({
        id: nextSegId++,
        start, end,
        nodeId: rangeNodes[i]!.id,
        status: 'pending',
        downloadedUpTo: start,
        lastProgressAt: 0,
        retries: 0,
      });
    }

    // 节点状态: 拉黑的节点不再分配任务
    const bannedNodes = new Set<string>();
    const nodeMap = new Map(rangeNodes.map((n) => [n.id, n]));
    let completedBytes = 0;

    let lastProgressEmit = 0;
    const PROGRESS_THROTTLE = 100; // ms, 进度回调最小间隔, 避免高频 UI 重绘

    const emitProgress = (force = false) => {
      if (!onProgress) return;
      const now = performance.now();
      if (!force && now - lastProgressEmit < PROGRESS_THROTTLE) return;
      lastProgressEmit = now;

      const elapsed = (now - startTime) / 1000;
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

    let rrIndex = 0;  // round-robin 索引, 用于多 worker 漂移到同一批可用节点时做负载均衡
    const getAvailableNodeId = (prefer?: string): string | null => {
      if (prefer && !bannedNodes.has(prefer)) return prefer;
      // round-robin: 从上次分配位置开始轮询, 避免所有 worker 堆到第一个可用节点
      const len = rangeNodes.length;
      for (let i = 0; i < len; i++) {
        const n = rangeNodes[(rrIndex + i) % len]!;
        if (!bannedNodes.has(n.id)) {
          rrIndex = (rrIndex + i + 1) % len;
          return n.id;
        }
      }
      return null;
    };

    // ── 下载单个 segment ──
    const downloadSegment = async (seg: Segment): Promise<void> => {
      const node = nodeMap.get(seg.nodeId);
      if (!node) { seg.status = 'failed'; return; }

      const url = node.buildUrl(github, filePath);
      const ctrl = new AbortController();
      seg.controller = ctrl;
      seg.status = 'downloading';
      seg.lastProgressAt = 0;  // 0 表示还在连接中, 停滞检测会跳过

      const tid = setTimeout(() => ctrl.abort(), this.opts.segmentTimeout);

      try {
        const resp = await fetch(url, {
          mode: 'cors',
          signal: ctrl.signal,
          headers: {
            'Range': `bytes=${seg.start}-${seg.end}`,
            'Accept-Encoding': 'identity',  // 禁止压缩, 确保 Range 请求的字节范围与 probeFile 获取的 totalSize 一致
          },
        });
        clearTimeout(tid);

        if (!resp.ok && resp.status !== 206) {
          throw new Error(`HTTP ${resp.status}`);
        }
        if (resp.status === 200 && seg.start > 0) {
          throw new Error('Server returned 200 instead of 206 — Range not supported');
        }

        // 响应到达, 从现在开始计时停滞检测
        seg.lastProgressAt = performance.now();

        // 流式读取
        if (resp.body) {
          const reader = resp.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          // needBytes: 当前 segment 需要的字节数 (可能被劈半缩短)
          const needBytes = () => seg.end - seg.start + 1;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            seg.downloadedUpTo = seg.start + received;
            seg.lastProgressAt = performance.now();

            // 如果被劈半窃取缩短了 end, 我们可能已经收够了或超了
            // 注意: 原 Range 请求范围可能大于缩短后的范围, 服务器仍在发送超出部分
            if (seg.splitShrunk && received >= needBytes()) {
              // 收够了, 主动停止读取, abort 剩余传输
              try { reader.cancel(); } catch {}
              try { ctrl.abort(); } catch {}
              break;
            }
          }

          // 如果收到的比需要的多 (被劈半缩短), 截断到 needBytes
          const need = needBytes();
          const usable = Math.min(received, need);

          const buf = new Uint8Array(usable);
          let offset = 0;
          for (const c of chunks) {
            const remaining = usable - offset;
            if (remaining <= 0) break;
            const slice = remaining >= c.byteLength ? c : c.subarray(0, remaining);
            buf.set(slice, offset);
            offset += slice.byteLength;
          }
          seg.data = buf.buffer;
          seg.downloadedUpTo = seg.start + usable;
        } else {
          seg.data = await resp.arrayBuffer();
          // 同样处理被劈半缩短的情况
          const need = seg.end - seg.start + 1;
          if (seg.data.byteLength > need) {
            seg.data = seg.data.slice(0, need);
          }
          seg.downloadedUpTo = seg.start + seg.data.byteLength;
        }

        // ── 完整性: 校验收到的字节数是否等于当前需要的范围 ──
        // 注意: end 可能被劈半窃取缩短过, 所以用当前 end 而非原始请求范围
        const expectedSize = seg.end - seg.start + 1;
        const actualSize = seg.data!.byteLength;
        if (actualSize !== expectedSize) {
          throw new Error(`Size mismatch: expected ${expectedSize}, got ${actualSize}`);
        }

        seg.status = 'completed';
        completedBytes += actualSize;
        emitProgress(true);  // 段完成时强制触发进度
      } catch (err) {
        clearTimeout(tid);
        seg.controller = undefined;
        seg.retries++;

        const errMsg = err instanceof Error ? err.message : String(err);
        const isCorsOrNetwork = errMsg.includes('abort') || errMsg.includes('network')
          || errMsg.includes('CORS') || errMsg.includes('Failed to fetch') || !errMsg.includes('HTTP');

        if (isCorsOrNetwork) {
          // CORS / 网络错误 → 拉黑这个节点, 换其他节点
          console.warn(`[RangeDownloader] 节点 ${seg.nodeId} 请求失败 (${errMsg}), 拉黑`);
          bannedNodes.add(seg.nodeId);
        }

        if (seg.retries < this.opts.maxRetries) {
          seg.status = 'pending';
          seg.downloadedUpTo = seg.start;
          seg.data = undefined;
          const alt = getAvailableNodeId();
          if (alt) {
            seg.nodeId = alt;
          } else {
            seg.status = 'failed';
          }
        } else {
          seg.status = 'failed';
        }
      }
    };

    // ── 停滞检测: 定期扫描, 卡住的 segment abort + 拉黑节点 + 交给其他节点 ──
    const stallChecker = setInterval(() => {
      const now = performance.now();
      for (const seg of segments) {
        if (seg.status !== 'downloading') continue;
        if (seg.lastProgressAt === 0) continue;  // 还在连接/握手中, 由 fetch 的 segmentTimeout 兜底
        const stalled = now - seg.lastProgressAt;
        if (stalled > this.opts.stallTimeout) {
          console.warn(`[RangeDownloader] 节点 ${seg.nodeId} 停滞 ${(stalled / 1000).toFixed(1)}s, abort + 拉黑`);
          // abort 这个请求
          try { seg.controller?.abort(); } catch {}
          seg.controller = undefined;

          // 拉黑节点
          bannedNodes.add(seg.nodeId);

          // 将未完成部分作为新 pending segment 交给其他节点
          const remaining = seg.end - seg.downloadedUpTo;
          if (remaining > 0) {
            const altNode = getAvailableNodeId();
            if (altNode) {
              // 保留已下载部分
              if (seg.downloadedUpTo > seg.start) {
                const downloadedSize = seg.downloadedUpTo - seg.start;
                // 流式读取时 data 可能还没拼好, 需要截断
                if (seg.data && seg.data.byteLength >= downloadedSize) {
                  seg.data = seg.data.slice(0, downloadedSize);
                } else {
                  seg.data = new ArrayBuffer(0);
                }
                const origEnd = seg.end;
                seg.end = seg.downloadedUpTo - 1;
                seg.status = 'completed';
                completedBytes += seg.data.byteLength;
                emitProgress(true);

                // 新 segment: 接管剩余部分
                segments.push({
                  id: nextSegId++,
                  start: seg.downloadedUpTo,
                  end: origEnd,
                  nodeId: altNode,
                  status: 'pending',
                  downloadedUpTo: seg.downloadedUpTo,
                  lastProgressAt: 0,
                  retries: 0,
                });
              } else {
                // 完全没数据, 直接废弃重分配
                seg.status = 'completed';
                seg.data = new ArrayBuffer(0);
                const origEnd = seg.end;
                seg.end = seg.start - 1;

                segments.push({
                  id: nextSegId++,
                  start: seg.start,
                  end: origEnd,
                  nodeId: altNode,
                  status: 'pending',
                  downloadedUpTo: seg.start,
                  lastProgressAt: 0,
                  retries: 0,
                });
              }
            } else {
              // 所有节点都拉黑了, 标记失败
              seg.status = 'failed';
            }
          } else {
            // 剩余为 0, 算完成
            seg.status = 'completed';
            if (!seg.data) seg.data = new ArrayBuffer(0);
          }
        }
      }
    }, this.opts.stallCheckInterval);

    // ── 劈半窃取 ──
    // 空闲 worker 找到最大未完成 segment, 不 abort 原连接:
    //   原节点继续正常传输 (end 缩短到 splitPoint, 读到此处后自然结束)
    //   空闲节点接管后半段 (新 Range 请求)
    // 这比 abort + 重连快, 避免了重新 TLS 握手 + 等首字节
    const trySplitAndSteal = (freeNodeId: string): boolean => {
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

      if (!bestSeg) return false;

      const splitPoint = bestSeg.downloadedUpTo + Math.floor((bestSeg.end - bestSeg.downloadedUpTo) / 2);

      // 确保两半都不小于 minSplitSize
      const firstHalf = splitPoint - bestSeg.downloadedUpTo;
      const secondHalf = bestSeg.end - splitPoint;
      if (firstHalf < this.opts.minSplitSize || secondHalf < this.opts.minSplitSize) {
        return false;
      }

      // 不 abort 原连接! 只缩短 bestSeg 的 end,
      // downloadSegment 的流式读取会在 downloadedUpTo > newEnd 时截断
      const origEnd = bestSeg.end;
      bestSeg.end = splitPoint;
      // 标记被劈过, downloadSegment 在流式读取时需要知道何时提前停止
      bestSeg.splitShrunk = true;

      // 空闲节点: 后半段 (新 Range 请求)
      const stolenSeg: Segment = {
        id: nextSegId++,
        start: splitPoint + 1,
        end: origEnd,
        nodeId: freeNodeId,
        status: 'pending',
        downloadedUpTo: splitPoint + 1,
        lastProgressAt: 0,
        retries: 0,
      };

      segments.push(stolenSeg);
      return true;
    };

    // ── Worker 协程 ──
    // 每个 worker 是一个持久协程, 节点被拉黑后不退出而是切换到可用节点继续工作
    // 这样保持并行度: 即使拉黑了一半节点, 所有 worker 仍在运行
    const worker = async (initialNodeId: string): Promise<void> => {
      let nodeId = initialNodeId;

      while (true) {
        // 当前节点被拉黑 → 切换到可用节点, 而不是退出
        if (bannedNodes.has(nodeId)) {
          const alt = getAvailableNodeId();
          if (!alt) break;  // 所有节点都拉黑了, 才退出
          nodeId = alt;
        }

        // 找 pending segment: 优先找分配给自己的, 再找任意 pending
        let seg = segments.find((s) => s.status === 'pending' && s.nodeId === nodeId);
        if (!seg) seg = segments.find((s) => s.status === 'pending');

        if (seg) {
          // 确保 segment 用的是可用节点
          if (bannedNodes.has(seg.nodeId)) {
            const alt = getAvailableNodeId(nodeId);
            if (!alt) break;
            seg.nodeId = alt;
          } else {
            seg.nodeId = nodeId;
          }
          nodeId = seg.nodeId;  // worker 跟随 segment 使用的节点
          await downloadSegment(seg);
          continue;
        }

        // 尝试劈半窃取
        if (trySplitAndSteal(nodeId)) continue;

        // 没活干了, 检查是否还有 downloading 或 pending
        const hasActive = segments.some((s) => s.status === 'downloading' || s.status === 'pending');
        if (!hasActive) break;

        await new Promise((r) => setTimeout(r, 50));
      }
    };

    // 启动 worker: 每个节点一个, 被拉黑后自动漂移到可用节点
    const workers = rangeNodes.map((n) => worker(n.id));
    await Promise.all(workers);
    clearInterval(stallChecker);

    // ── 完整性校验 ──
    const failed = segments.filter((s) => s.status === 'failed');
    if (failed.length > 0) {
      throw new Error(`Range download failed: ${failed.length} segments failed`);
    }

    const sorted = segments
      .filter((s) => s.status === 'completed' && s.data && s.data.byteLength > 0)
      .sort((a, b) => a.start - b.start);

    // 校验: 覆盖范围连续且总大小匹配
    let expectedStart = 0;
    let actualTotal = 0;
    for (const seg of sorted) {
      if (seg.start !== expectedStart) {
        console.warn(`[RangeDownloader] 字节间隙: expected start=${expectedStart}, got ${seg.start}`);
      }
      actualTotal += seg.data!.byteLength;
      expectedStart = seg.end + 1;
    }

    if (actualTotal !== totalSize) {
      throw new Error(
        `[RangeDownloader] 总大小不匹配: expected ${totalSize}, got ${actualTotal}. ` +
        `文件可能未完整下载，请检查 CDN 节点是否正确支持 Range 请求。`
      );
    }

    const blob = new Blob(sorted.map((s) => s.data!), { type: contentType });

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
      // 优先使用 Accept-Encoding: identity 获取未压缩的 Content-Length
      // 但某些 CDN (如 cdn.jsdelivr.net) 对 identity 请求返回 404
      // 因此需要 fallback 到不带 Accept-Encoding 的请求
      let resp = await fetch(url, {
        method: 'HEAD',
        mode: 'cors',
        signal: ctrl.signal,
        headers: { 'Accept-Encoding': 'identity' },
      });

      if (!resp.ok) {
        // identity 请求失败 (例如 cdn.jsdelivr.net 返回 404)
        // fallback: 不带 Accept-Encoding, 但此时 Content-Length 可能是压缩后大小
        const ctrl2 = new AbortController();
        const tid2 = setTimeout(() => ctrl2.abort(), 10_000);
        resp = await fetch(url, {
          method: 'HEAD',
          mode: 'cors',
          signal: ctrl2.signal,
        });
        clearTimeout(tid2);
      }

      clearTimeout(tid);

      if (!resp.ok) {
        return { totalSize: 0, contentType: 'application/octet-stream', supportsRange: false };
      }

      const cl = resp.headers.get('Content-Length');
      const ct = resp.headers.get('Content-Type') ?? 'application/octet-stream';
      const ar = resp.headers.get('Accept-Ranges');
      const ce = resp.headers.get('Content-Encoding');
      const supportsRange = ar?.toLowerCase() === 'bytes';

      let totalSize = cl ? parseInt(cl, 10) : 0;

      // 如果响应带了 Content-Encoding (gzip/br), Content-Length 是压缩后大小
      // 这种情况下 totalSize 不可信, 返回 0 让调用方跳过此节点尝试下一个
      if (ce && ce !== 'identity' && totalSize > 0) {
        console.warn(`[RangeDownloader] probeFile: ${url} 返回了 Content-Encoding: ${ce}, Content-Length (${totalSize}) 是压缩后大小, 跳过`);
        totalSize = 0;
      }

      return { totalSize, contentType: ct, supportsRange };
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
