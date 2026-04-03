/**
 * fetcher.ts — 核心请求引擎
 *
 * 提供 reqByCDN() — 对使用者完全透明：
 * - 小文件 → 直接请求 CDN URL
 * - 大文件 (已切片) → 自动检测 info.yaml，并行下载分片后拼接
 *
 * 自动判断逻辑:
 * 1. 计算 splitStoragePath 下是否存在对应的 info.yaml
 * 2. 如果存在 → 按 info.yaml 描述的分片并行下载 → 拼接返回
 * 3. 如果不存在 → 直接下载原始文件
 */

import type {
  CDNNode,
  LatencyResult,
  SplitInfo,
  DownloadProgress,
  DownloadResult,
  ForgeConfig,
} from '../types';
import { normalizeConfig } from './config';
import { CDNTester, getSortedNodesWithLatency } from './cdnNodes';
import { parseInfoYaml } from './manifest';
import { ChunkedFetcher } from './chunkedFetcher';
import { RangeDownloader } from './rangeDownloader';

// ============================================================
// ForgeEngine — 核心引擎 (独立于 React，可在任何环境使用)
// ============================================================

export class ForgeEngine {
  private config: Required<ForgeConfig>;
  private tester: CDNTester;
  private fetcher: ChunkedFetcher;
  private rangeDownloader: RangeDownloader;
  private currentNodeId: string | null = null;
  private latencyResults: Map<string, LatencyResult> = new Map();
  private initialized = false;

  /**
   * "就绪" Promise — 第一个成功测速结果回来就 resolve
   * reqByCDN 等方法 await 这个而不是等全部测完
   */
  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void>;

  // info.yaml 缓存: filePath → SplitInfo | null
  private splitInfoCache = new Map<string, SplitInfo | null>();

  constructor(config: ForgeConfig) {
    this.config = normalizeConfig(config);
    this.tester = new CDNTester(this.config.testTimeout, this.config.testRetries);
    this.fetcher = new ChunkedFetcher({
      maxConcurrency: this.config.maxConcurrency,
      chunkTimeout: this.config.chunkTimeout,
      maxRetries: this.config.maxRetries,
      enableWorkStealing: this.config.enableWorkStealing,
      turboMode: this.config.turboMode,
      turboConcurrentCDNs: this.config.turboConcurrentCDNs,
    });
    this.rangeDownloader = new RangeDownloader({
      segmentTimeout: this.config.chunkTimeout * 3,
      maxRetries: this.config.maxRetries,
    });

    // 初始化就绪 Promise
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });

    // 恢复上次选择
    this.loadSelectedNode();

    // 默认节点
    if (!this.currentNodeId && this.config.defaultNodeId) {
      this.currentNodeId = this.config.defaultNodeId;
    }
    if (!this.currentNodeId) {
      const first = this.getNodes().find((n) => n.enabled !== false);
      if (first) this.currentNodeId = first.id;
    }
  }

  // ---- 初始化 ----

  /** 标记引擎已就绪 (第一个成功结果/不需要测速时) */
  private markReady(): void {
    if (!this.initialized) {
      this.initialized = true;
      this.readyResolve?.();
      this.readyResolve = null;
    }
  }

  /**
   * 等待引擎就绪 — 不等全部测完，只等第一个成功结果
   * reqByCDN / buildUrl 内部使用
   */
  waitReady(): Promise<void> {
    return this.readyPromise;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.config.autoTest) {
      await this.testAndSelectBest();
    }
    this.markReady();
  }

  /**
   * 流式初始化 — 每完成一个节点测速就回调
   * 第一个**成功**结果到达时立刻标记 initialized，不等超时节点
   * 剩余节点在后台继续测速
   *
   * @param onResult 每完成一个节点的回调
   * @param onReady  第一个成功结果到达时触发（可选）
   */
  async initializeStreaming(
    onResult: (r: LatencyResult) => void,
    onReady?: () => void,
  ): Promise<void> {
    if (this.initialized) return;
    if (this.config.autoTest) {
      await this.testAndSelectBest((r) => {
        onResult(r);
        // 第一个成功结果 → 立即就绪，不等剩余超时节点
        if (r.success && !this.initialized) {
          this.markReady();
          onReady?.();
        }
      });
    }
    // 全部测完后保底标记 (如果全部失败也要标记)
    this.markReady();
  }

  // ---- 节点管理 ----

  getNodes(): CDNNode[] {
    return this.config.nodes;
  }

  getCurrentNode(): CDNNode | null {
    return this.config.nodes.find((n) => n.id === this.currentNodeId) ?? null;
  }

  selectNode(nodeId: string): CDNNode | null {
    const node = this.config.nodes.find((n) => n.id === nodeId);
    if (node) {
      this.currentNodeId = nodeId;
      this.saveSelectedNode(nodeId);
      return node;
    }
    return null;
  }

  getSortedNodes() {
    return getSortedNodesWithLatency(this.config.nodes, this.latencyResults);
  }

  getLatencyResults(): Map<string, LatencyResult> {
    return new Map(this.latencyResults);
  }

  // ---- 测速 ----

  async testAndSelectBest(onResult?: (r: LatencyResult) => void): Promise<LatencyResult[]> {
    const results = onResult
      ? await this.testAllNodesStreaming((r) => {
          // 流式模式: 每完成一个节点就选出当前最优
          const bestId = this.tester.getBestNodeId([...this.latencyResults.values()]);
          if (bestId) this.selectNode(bestId);
          onResult(r);
        })
      : await this.testAllNodes();
    // 最终确定最优节点
    const bestId = this.tester.getBestNodeId(results);
    if (bestId) this.selectNode(bestId);
    return results;
  }

  async testAllNodes(): Promise<LatencyResult[]> {
    const results = await this.tester.testAll(this.config.nodes);
    this.latencyResults.clear();
    for (const r of results) this.latencyResults.set(r.nodeId, r);
    return results;
  }

  async testAllNodesStreaming(onResult: (r: LatencyResult) => void): Promise<LatencyResult[]> {
    this.latencyResults.clear();
    return this.tester.testAllStreaming(this.config.nodes, (r) => {
      this.latencyResults.set(r.nodeId, r);
      onResult(r);
    });
  }

  // ---- URL 构建 ----

  buildUrl(filePath: string): string {
    const node = this.getCurrentNode();
    if (!node) throw new Error('No CDN node selected');
    return node.buildUrl(this.config.github, filePath);
  }

  // ---- 核心: reqByCDN ----

  /**
   * 统一请求接口 — 对使用者完全透明
   *
   * @param filePath - GitHub 仓库中相对于根目录的文件路径
   * @param onProgress - 进度回调
   *
   * 内部会自动判断:
   * - 是否有切片版本 (在 splitStoragePath 下查找 info.yaml)
   * - 如果有 → 并行下载分片 → 拼接
   * - 如果没有 → 直接下载
   */
  async reqByCDN(
    filePath: string,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const startTime = performance.now();

    // 等待引擎就绪 — 只需第一个成功结果，不等全部测完
    if (!this.initialized) await this.waitReady();

    // 1. 尝试获取切片信息
    const splitInfo = await this.tryGetSplitInfo(filePath);

    if (splitInfo) {
      // 2A. 有切片 → 并行下载分片
      return this.downloadSplit(filePath, splitInfo, startTime, onProgress);
    }

    // 2B. 无切片 → 直接下载
    return this.downloadDirect(filePath, startTime, onProgress);
  }

  /**
   * 多 CDN 竞速下载 — 同一文件从所有可用节点同时请求, 最快的赢
   *
   * 适用场景: 非切片中小文件 (字体、配置等), 对延迟敏感
   * - 所有可用 CDN 节点同时 fetch, Promise.any 取第一个成功
   * - 其余请求立即 abort, 不浪费后续带宽
   * - 如果只有 1 个节点, 退化为普通 reqByCDN
   * - 有切片版本的文件仍走 reqByCDN 的切片并行逻辑
   *
   * @param filePath - GitHub 仓库中相对于根目录的文件路径
   * @param onProgress - 进度回调 (仅在退化到单节点时生效)
   */
  async reqByCDNRace(
    filePath: string,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const startTime = performance.now();

    if (!this.initialized) await this.waitReady();

    // 先检查是否有切片版本 — 有的话走切片并行 (比竞速更高效)
    const splitInfo = await this.tryGetSplitInfo(filePath);
    if (splitInfo) {
      return this.downloadSplit(filePath, splitInfo, startTime, onProgress);
    }

    // 无切片 → 多 CDN 竞速
    const enabledNodes = this.config.nodes.filter((n) => n.enabled !== false);
    if (enabledNodes.length <= 1) {
      return this.downloadDirect(filePath, startTime, onProgress);
    }

    return this.downloadRace(filePath, enabledNodes, startTime);
  }

  /**
   * IDM 模式下载 — HTTP Range 多节点分段并行 + 动态任务劈半窃取
   *
   * 适用场景: 中大文件 (字体、音频等)，利用所有节点的带宽
   * - 将文件等分给 N 个节点, 每个用 Range 请求下载自己的段
   * - 某节点完成后, 找当前最大的未完成段, 从中间劈半:
   *   原节点保留前半段 (与已下载部分连续), 空闲节点接管后半段
   * - 有切片版本的文件仍走 reqByCDN 的切片并行逻辑
   * - Content-Length 未知或文件太小时退化为单连接
   *
   * @param filePath - GitHub 仓库中相对于根目录的文件路径
   * @param onProgress - 进度回调
   */
  async reqByCDNRange(
    filePath: string,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const startTime = performance.now();

    if (!this.initialized) await this.waitReady();

    // 先检查切片 — 有的话走切片并行 (已预处理, 更高效)
    const splitInfo = await this.tryGetSplitInfo(filePath);
    if (splitInfo) {
      return this.downloadSplit(filePath, splitInfo, startTime, onProgress);
    }

    // 无切片 → IDM 模式 Range 分段下载
    const enabledNodes = this.config.nodes.filter((n) => n.enabled !== false);
    return this.rangeDownloader.download(enabledNodes, this.config.github, filePath, onProgress);
  }

  // ============================================================
  // 私有: 分片下载
  // ============================================================

  /** 尝试获取文件的切片信息 */
  private async tryGetSplitInfo(filePath: string): Promise<SplitInfo | null> {
    const { splitStoragePath, mappingPrefix } = this.config;

    // 没有配置切片存储路径，则不支持切片
    if (!splitStoragePath) return null;

    // 检查缓存
    if (this.splitInfoCache.has(filePath)) {
      return this.splitInfoCache.get(filePath)!;
    }

    // 计算 info.yaml 路径
    const mappedPath = this.mapFilePath(filePath, mappingPrefix);
    const infoPath = `${splitStoragePath}/${mappedPath}/info.yaml`;

    try {
      // 从最快的 CDN 节点获取 info.yaml
      const node = this.getCurrentNode() ?? this.getNodes()[0];
      if (!node) return null;

      const url = node.buildUrl(this.config.github, infoPath);
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10_000);

      const resp = await fetch(url, { mode: 'cors', signal: ctrl.signal });
      clearTimeout(tid);

      if (!resp.ok) {
        // 404 = 没有切片版本
        this.splitInfoCache.set(filePath, null);
        return null;
      }

      const text = await resp.text();
      const info = parseInfoYaml(text);

      this.splitInfoCache.set(filePath, info);
      return info;
    } catch {
      this.splitInfoCache.set(filePath, null);
      return null;
    }
  }

  /** 下载切片并拼接 */
  private async downloadSplit(
    filePath: string,
    splitInfo: SplitInfo,
    startTime: number,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const { splitStoragePath, mappingPrefix } = this.config;
    const mappedPath = this.mapFilePath(filePath, mappingPrefix);

    // 获取可用节点
    const enabledNodes = this.config.nodes.filter((n) => n.enabled !== false);
    if (enabledNodes.length === 0) throw new Error('No CDN nodes available');

    // 为每个分片构建各节点的 URL
    const chunkUrls: string[][] = splitInfo.chunks.map((chunk) => {
      const chunkPath = `${splitStoragePath}/${mappedPath}/${chunk.fileName}`;
      return enabledNodes.map((node) =>
        node.buildUrl(this.config.github, chunkPath),
      );
    });

    const chunkSizes = splitInfo.chunks.map((c) => c.size);

    const result = await this.fetcher.downloadChunks(
      chunkUrls,
      chunkSizes,
      splitInfo.totalSize,
      splitInfo.mimeType,
      enabledNodes,
      this.latencyResults,
      onProgress,
    );

    const blob = result.blob;

    return {
      blob,
      arrayBuffer: () => blob.arrayBuffer(),
      totalSize: result.totalSize,
      totalTime: performance.now() - startTime,
      contentType: result.contentType,
      usedSplitMode: true,
      usedParallelMode: result.usedParallelMode,
      nodeContributions: result.nodeContributions,
    };
  }

  /** 直接下载 (无切片) */
  private async downloadDirect(
    filePath: string,
    startTime: number,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const node = this.getCurrentNode();
    if (!node) throw new Error('No CDN node selected');

    const url = node.buildUrl(this.config.github, filePath);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), this.config.chunkTimeout * 3);

    try {
      const resp = await fetch(url, { mode: 'cors', signal: ctrl.signal });
      clearTimeout(tid);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

      // 如果有 content-length，支持进度回报
      const contentLength = parseInt(resp.headers.get('Content-Length') ?? '0', 10);
      const contentType = resp.headers.get('Content-Type') ?? 'application/octet-stream';

      let blob: Blob;

      if (contentLength > 0 && resp.body && onProgress) {
        // 流式读取以报告进度
        blob = await this.readStreamWithProgress(
          resp.body, contentLength, contentType, startTime, onProgress,
        );
      } else {
        blob = await resp.blob();
        onProgress?.({
          loaded: blob.size,
          total: blob.size,
          percentage: 100,
          speed: 0,
          eta: 0,
          completedChunks: 1,
          totalChunks: 1,
        });
      }

      return {
        blob,
        arrayBuffer: () => blob.arrayBuffer(),
        totalSize: blob.size,
        totalTime: performance.now() - startTime,
        contentType,
        usedSplitMode: false,
        usedParallelMode: false,
        nodeContributions: new Map([[node.id, { bytes: blob.size, chunks: 1, avgSpeed: 0 }]]),
      };
    } catch (err) {
      clearTimeout(tid);
      throw err;
    }
  }

  /** 多 CDN 竞速下载 (非切片文件) */
  private async downloadRace(
    filePath: string,
    nodes: CDNNode[],
    startTime: number,
  ): Promise<DownloadResult> {
    const controllers: AbortController[] = [];
    const timeout = this.config.chunkTimeout * 3;

    const promises = nodes.map(async (node) => {
      const ctrl = new AbortController();
      controllers.push(ctrl);
      const url = node.buildUrl(this.config.github, filePath);
      const tid = setTimeout(() => ctrl.abort(), timeout);

      try {
        const resp = await fetch(url, { mode: 'cors', signal: ctrl.signal });
        clearTimeout(tid);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        const blob = await resp.blob();
        const contentType = resp.headers.get('Content-Type') ?? 'application/octet-stream';

        return {
          blob,
          arrayBuffer: () => blob.arrayBuffer(),
          totalSize: blob.size,
          totalTime: performance.now() - startTime,
          contentType,
          usedSplitMode: false,
          usedParallelMode: false,
          nodeContributions: new Map([[node.id, { bytes: blob.size, chunks: 1, avgSpeed: 0 }]]),
        } as DownloadResult;
      } catch (err) {
        clearTimeout(tid);
        throw err;
      }
    });

    try {
      const result = await Promise.any(promises);
      // 取消所有其他请求
      for (const ctrl of controllers) {
        try { ctrl.abort(); } catch { /* ignore */ }
      }
      return result;
    } catch {
      throw new Error(`All ${nodes.length} CDN nodes failed for: ${filePath}`);
    }
  }

  /** 流式读取并报告进度 */
  private async readStreamWithProgress(
    body: ReadableStream<Uint8Array>,
    total: number,
    contentType: string,
    startTime: number,
    onProgress: (p: DownloadProgress) => void,
  ): Promise<Blob> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.byteLength;

      const elapsed = (performance.now() - startTime) / 1000;
      const speed = loaded / Math.max(elapsed, 0.001);

      // 当 CDN 启用 Content-Encoding (gzip/br) 时, Content-Length 是压缩后大小,
      // 但流式读取拿到的是解压后数据, loaded 会远超 total.
      // 用 Math.max 动态修正, 确保 percentage 不会超过 100%.
      const effectiveTotal = Math.max(total, loaded);

      onProgress({
        loaded,
        total: effectiveTotal,
        percentage: Math.min(Math.round((loaded / effectiveTotal) * 10000) / 100, 100),
        speed,
        eta: speed > 0 ? Math.max((effectiveTotal - loaded) / speed, 0) : Infinity,
        completedChunks: loaded >= effectiveTotal ? 1 : 0,
        totalChunks: 1,
      });
    }

    return new Blob(chunks as BlobPart[], { type: contentType });
  }

  // ============================================================
  // 私有: 路径映射
  // ============================================================

  /**
   * 映射文件路径
   * 例: filePath="static/ass/loli.ass", prefix="static"
   *   → "ass/loli.ass"
   */
  private mapFilePath(filePath: string, prefix: string): string {
    let p = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    if (prefix && p.startsWith(prefix)) {
      p = p.slice(prefix.length);
      if (p.startsWith('/')) p = p.slice(1);
    }
    return p;
  }

  // ============================================================
  // 私有: 持久化
  // ============================================================

  private loadSelectedNode(): void {
    if (typeof window === 'undefined') return;
    try {
      const id = localStorage.getItem(this.config.storageKey);
      if (id) {
        const node = this.config.nodes.find((n) => n.id === id);
        if (node) this.currentNodeId = id;
      }
    } catch { /* ignore */ }
  }

  private saveSelectedNode(nodeId: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.config.storageKey, nodeId);
    } catch { /* ignore */ }
  }

  // ============================================================
  // 公开: 配置
  // ============================================================

  getConfig(): Required<ForgeConfig> { return this.config; }
  isInitialized(): boolean { return this.initialized; }

  /** 清除 info.yaml 缓存 */
  clearSplitInfoCache(): void { this.splitInfoCache.clear(); }
}
