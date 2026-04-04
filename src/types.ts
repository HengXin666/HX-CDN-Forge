/**
 * HX-CDN-Forge v2 — 类型定义
 * 专注 GitHub 文件 CDN 代理，支持大文件差分切片 + 多 CDN 并行加载
 */

// ============================================================
// 基础类型
// ============================================================

/** CDN 节点地区 */
export type CDNRegion = 'china' | 'asia' | 'global';

/**
 * 下载模式
 * - 'split'  — 切片并行 (文本等高压缩率文件最优, CDN 可 gzip/br 传输)
 * - 'range'  — IDM 风格 Range 分段并行 (已压缩/二进制文件最优)
 * - 'race'   — 多 CDN 竞速 (中小文件, 延迟敏感)
 * - 'direct' — 单节点直连 (兜底)
 */
export type DownloadMode = 'split' | 'range' | 'race' | 'direct';

/** 延迟状态 */
export type LatencyStatus = 'idle' | 'testing' | 'success' | 'failed';

// ============================================================
// CDN 节点
// ============================================================

/** CDN 节点配置 */
export interface CDNNode {
  /** 节点唯一标识 */
  id: string;
  /** 节点显示名称 */
  name: string;
  /** 基础 URL (模板，内含 {user}/{repo}/{ref}/{path} 占位) */
  baseUrl: string;
  /** 节点所在地区 */
  region: CDNRegion;
  /** 构建完整 URL */
  buildUrl: (ctx: GitHubContext, filePath: string) => string;
  /** 单文件大小限制 (字节), -1 = 无限制 */
  maxFileSize: number;
  /** 是否支持 Range 请求 */
  supportsRange: boolean;
  /** 测速资源路径 (相对于仓库根目录) */
  testPath?: string;
  /** 节点描述 */
  description?: string;
  /** 是否启用 (默认 true) */
  enabled?: boolean;
}

/** GitHub 仓库上下文 */
export interface GitHubContext {
  /** GitHub 用户名或组织名 */
  user: string;
  /** GitHub 仓库名 */
  repo: string;
  /**
   * 引用 — 可以是 branch, tag, commit hash
   * 推荐使用 tag (如 "bot-a1b2c3-20260329") 避免缓存失效
   */
  ref: string;
}

// ============================================================
// 全局配置
// ============================================================

/** HX-CDN-Forge 全局配置 */
export interface ForgeConfig {
  /** GitHub 仓库信息 */
  github: GitHubContext;

  /** CDN 节点列表 (不传则使用默认列表) */
  nodes?: CDNNode[];

  /** 默认节点 ID (不传则自动测速选择) */
  defaultNodeId?: string;

  /** 是否初始化时自动测速 (默认 true) */
  autoTest?: boolean;

  /** 测速超时 (毫秒, 默认 5000) */
  testTimeout?: number;

  /** 测速重试次数 (默认 2) */
  testRetries?: number;

  /**
   * 文件切片大小阈值 (字节)
   * 大于此值的文件需要预先切片
   * 默认 20 * 1024 * 1024 (20MB)
   */
  splitThreshold?: number;

  /**
   * 切片存储的映射根路径 (去除的前缀)
   * 例如仓库内路径为 "static/cdn-black/..."，映射前缀为 "static"
   * 则 "static/data/big.bin" 映射到 "cdn-black/data/big.bin/..."
   */
  mappingPrefix?: string;

  /**
   * 切片存储根路径
   * 例如 "static/cdn-black"
   */
  splitStoragePath?: string;

  /** localStorage 持久化键名 (默认 'hx-cdn-forge-node') */
  storageKey?: string;

  // ---- 并行下载配置 ----

  /** 单分片并发下载数 (默认 6) */
  maxConcurrency?: number;

  /** 单分片超时 (毫秒, 默认 30000) */
  chunkTimeout?: number;

  /** 单分片最大重试 (默认 3) */
  maxRetries?: number;

  /** 是否启用任务窃取 (默认 true) */
  enableWorkStealing?: boolean;

  // ---- 极速模式 ----

  /**
   * 极速模式: 同一分片从多个 CDN 同时请求，取最快响应
   * 牺牲带宽换取最低延迟
   * 默认 false
   */
  turboMode?: boolean;

  /**
   * 极速模式下同时请求的 CDN 数量
   * 默认 3 (即每个分片同时从最快的 3 个 CDN 请求)
   */
  turboConcurrentCDNs?: number;

  // ---- 自动模式选择 ----

  /**
   * 自定义扩展名 → 下载模式映射 (覆盖内置规则)
   *
   * key: 扩展名 (不含点, 小写), value: 下载模式
   * @example { 'fbx': 'range', 'custom-text': 'split' }
   */
  downloadModeOverrides?: Record<string, DownloadMode>;

  // ---- 预压缩 ----

  /**
   * 是否启用预压缩文件检测 (info-zip.yaml)
   *
   * 开启后，reqByCDNAuto 会**最先**检查 info-zip.yaml 是否存在预压缩版本：
   * - 有预压缩 → 对压缩文件走 Range 并行下载 → 客户端 DecompressionStream 解压
   * - 无预压缩 → 继续检查 info.yaml (切片) → 扩展名推断
   *
   * ★ 预压缩是最优下载策略 (优先级高于预切片):
   * - .gz 文件本身已压缩 → 传输量小
   * - Range 并行多节点加速 + 兼容 IDM
   * - vs 预切片 (info.yaml) 是裸数据，Range 下载时 identity 无法享受压缩
   *
   * 需要数据源（CI）配合：使用 hx-cdn-compress 预先生成 .gz/.br 文件 + info-zip.yaml
   *
   * 默认 true — 只要有 preCompressionStoragePath 配置就会尝试查找 info-zip.yaml
   * 设为 false 可跳过 info-zip.yaml 检测 (节省一次 404 请求)
   */
  enablePreCompression?: boolean;

  /**
   * 预压缩文件存储根路径 (info-zip.yaml + .gz/.br 文件)
   *
   * 如果不设置，默认与 splitStoragePath 相同 (切片和压缩共用目录)
   * 如果设置，则预压缩文件从此路径查找，切片文件从 splitStoragePath 查找
   *
   * @example
   * splitStoragePath: 'static/cdn/all',           // 切片 info.yaml
   * preCompressionStoragePath: 'static/cdn/gzip',  // 压缩 info-zip.yaml + .gz
   */
  preCompressionStoragePath?: string;
}

// ============================================================
// 差分切片相关 (info.yaml / .cache.yaml)
// ============================================================

/** info.yaml 结构 — 描述一个大文件的切片信息 */
export interface SplitInfo {
  /** 原始文件名 */
  originalName: string;
  /** 原始文件总大小 (字节) */
  totalSize: number;
  /** 原始文件 MIME 类型 */
  mimeType: string;
  /** 切片列表 */
  chunks: SplitChunkInfo[];
  /** 生成时间 (ISO 8601) */
  createdAt: string;
  /** 使用的切片大小 (字节) */
  chunkSize: number;
}

/** 单个切片的信息 */
export interface SplitChunkInfo {
  /** 切片文件名 (如 "0-loli.ass") */
  fileName: string;
  /** 切片索引 */
  index: number;
  /** 切片大小 (字节) */
  size: number;
  /** 切片 SHA-256 哈希 */
  sha256: string;
}

/** .cache.yaml 结构 — 用于增量更新检测 */
export interface SplitCache {
  /** 源文件在仓库中的路径 */
  sourcePath: string;
  /** 源文件 SHA-256 哈希 */
  sourceHash: string;
  /** 源文件大小 (字节) */
  sourceSize: number;
  /** 上次生成时间 */
  generatedAt: string;
}

// ============================================================
// 预压缩相关 (info-zip.yaml)
// ============================================================

/** 预压缩编码类型 */
export type CompressionEncoding = 'gzip' | 'br';

/**
 * info-zip.yaml 结构 — 描述一个文件的预压缩版本
 *
 * 与 info.yaml (切片) 独立存储，运行时先查 info.yaml → 再查 info-zip.yaml
 */
export interface ZipInfo {
  /** 原始文件名 */
  originalName: string;
  /** 原始文件大小 (字节) */
  totalSize: number;
  /** 原始文件 MIME 类型 */
  mimeType: string;
  /** 压缩编码 ('gzip' | 'br') */
  encoding: CompressionEncoding;
  /** 压缩后文件名 (如 "loli.ass.gz") */
  compressedFile: string;
  /** 压缩后文件大小 (字节) */
  compressedSize: number;
  /** 压缩后文件 SHA-256 */
  compressedSha256: string;
  /** 压缩比 (compressedSize / totalSize, 如 0.23) */
  ratio: number;
  /** 生成时间 (ISO 8601) */
  createdAt: string;
}

// ============================================================
// 延迟测速
// ============================================================

/** 单节点延迟测试结果 */
export interface LatencyResult {
  nodeId: string;
  latency: number; // ms, -1 = 失败
  success: boolean;
  timestamp: number;
  error?: string;
}

/** 带延迟信息的节点 */
export interface CDNNodeWithLatency extends CDNNode {
  latency?: number;
  latencyStatus?: LatencyStatus;
}

// ============================================================
// 下载进度 / 结果
// ============================================================

/** 下载进度 */
export interface DownloadProgress {
  /** 已下载字节 */
  loaded: number;
  /** 总字节 */
  total: number;
  /** 百分比 0-100 */
  percentage: number;
  /** 当前速度 (字节/秒) */
  speed: number;
  /** 预估剩余 (秒) */
  eta: number;
  /** 已完成分片数 */
  completedChunks: number;
  /** 总分片数 */
  totalChunks: number;
}

/** 下载结果 */
export interface DownloadResult {
  /** 完整文件数据 */
  blob: Blob;
  /** 也可作为 ArrayBuffer 获取 */
  arrayBuffer: () => Promise<ArrayBuffer>;
  /** 文件大小 */
  totalSize: number;
  /** 耗时 (毫秒) */
  totalTime: number;
  /** MIME 类型 */
  contentType: string;
  /** 是否使用了分片下载 */
  usedSplitMode: boolean;
  /** 是否使用了并行模式 */
  usedParallelMode: boolean;
  /** 是否使用了预压缩 + Range 下载 */
  usedPreCompression?: boolean;
  /** 预压缩编码 (使用预压缩时才有值) */
  compressionEncoding?: CompressionEncoding;
  /** 各节点贡献 */
  nodeContributions: Map<string, { bytes: number; chunks: number; avgSpeed: number }>;
}

// ============================================================
// React 相关
// ============================================================

/** CDN Provider Props */
export interface CDNProviderProps {
  config: ForgeConfig;
  children: React.ReactNode;
  onInitialized?: (currentNode: CDNNode | null) => void;
  onNodeChange?: (node: CDNNode) => void;
}

/** CDN Context 值 */
export interface CDNContextValue {
  config: ForgeConfig;
  currentNode: CDNNode | null;
  nodes: CDNNodeWithLatency[];
  isTesting: boolean;
  isInitialized: boolean;
  latencyResults: Map<string, LatencyResult>;
  selectNode: (nodeId: string) => void;
  testAllNodes: () => Promise<LatencyResult[]>;
  /** 核心请求方法 — 对使用者透明 */
  reqByCDN: (filePath: string, onProgress?: (p: DownloadProgress) => void) => Promise<DownloadResult>;
  /** 🚀 智能下载 — 根据文件扩展名自动选择最优下载策略 */
  reqByCDNAuto: (filePath: string, onProgress?: (p: DownloadProgress) => void) => Promise<DownloadResult>;
  /** 构建 CDN URL (小文件直接使用) */
  buildUrl: (filePath: string) => string;
  getSortedNodes: () => CDNNodeWithLatency[];
}

/** CDN 节点选择器 Props */
export interface CDNNodeSelectorProps {
  className?: string;
  style?: React.CSSProperties;
  showLatency?: boolean;
  showRegion?: boolean;
  title?: string;
  showRefreshButton?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onChange?: (node: CDNNode) => void;
  onTestComplete?: (results: LatencyResult[]) => void;
  renderTrigger?: (props: {
    currentNode: CDNNode | null;
    isOpen: boolean;
    isTesting: boolean;
  }) => React.ReactNode;
  renderNode?: (props: NodeRenderProps) => React.ReactNode;
  renderEmpty?: () => React.ReactNode;
  renderLoading?: () => React.ReactNode;
}

/** 节点渲染 Props */
export interface NodeRenderProps {
  node: CDNNodeWithLatency;
  isSelected: boolean;
  isDisabled: boolean;
  latencyText: string;
  latencyClassName: string;
  onSelect: () => void;
}

// ============================================================
// CLI 切片工具配置
// ============================================================

/** CLI 切片命令选项 */
export interface SplitCommandOptions {
  /** 源文件路径 (相对于仓库根目录) */
  source: string;
  /** 输出存储路径 */
  outputDir: string;
  /** 映射前缀 (从 source 路径去除的前缀) */
  mappingPrefix: string;
  /** 切片大小 (字节, 默认 19MB 留些余量) */
  chunkSize?: number;
  /** 是否强制重新生成 (忽略 .cache.yaml) */
  force?: boolean;
}
