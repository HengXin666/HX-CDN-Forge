/**
 * modeResolver.ts — 根据文件扩展名自动选择下载模式 (兜底策略)
 *
 * 注意: 此模块仅在 reqByCDNAuto() 中作为「无预压缩、无预切片」时的兜底策略。
 * 完整决策优先级:
 *   1. ★ 有预压缩 (info-zip.yaml) → Range 并行下载 .gz + DecompressionStream 解压
 *      最优策略: .gz 已压缩传输量小 + Range 并行加速 + 兼容 IDM
 *   2. 有预切片 (info.yaml) → split 并行
 *      注意: 切片是裸数据，Range 下载时 identity 无法享受压缩
 *   3. 本模块: 根据扩展名推断 (兜底)
 *
 * 扩展名推断规则:
 * - 文本类文件 (ass, json, xml, csv, html, css, js, ts, md, txt, yaml, svg 等)
 *   → direct: 标准 GET 享受 CDN gzip/br 压缩传输
 *   → 如需并行，建议使用 hx-cdn-compress 生成预压缩版本
 *
 * - 已压缩/二进制文件 (woff2, wasm, mp3, mp4, zip, png, jpg 等)
 *   → gzip 几乎无法再压缩, 两种模式传输量相同
 *   → Range 模式 (range) 更优: 无需预切片、无 info.yaml 开销、支持 seek
 *
 * - 未知或无扩展名 → 默认走 split (如果有预切片) 或 direct (兜底)
 */

import type { DownloadMode } from '../types';

// ============================================================
// 内置扩展名 → 模式映射表
// ============================================================

/**
 * 文本类 — 高压缩率, split 模式最优
 * 这些扩展名在 CDN 上通常会被 gzip/br 压缩 70-90%
 */
const TEXT_EXTENSIONS = new Set([
  // 字幕
  'ass', 'ssa', 'srt', 'vtt', 'sub', 'lrc',
  // 数据交换
  'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'csv', 'tsv',
  // Web
  'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts',
  // 文档
  'txt', 'md', 'markdown', 'rst', 'adoc', 'tex', 'log',
  // 矢量图/标记语言
  'svg', 'mathml',
  // 配置
  'conf', 'cfg', 'env', 'properties', 'gitignore', 'editorconfig',
  // 编程语言源码
  'py', 'rb', 'java', 'kt', 'scala', 'go', 'rs', 'c', 'cpp', 'h', 'hpp',
  'cs', 'swift', 'lua', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'sql', 'graphql', 'gql', 'proto',
  // 其他文本
  'plist', 'manifest',
]);

/**
 * 已压缩/二进制 — gzip 无效, range 模式更优
 * 这些文件本身已高度压缩, 不受 Accept-Encoding: identity 影响
 */
const BINARY_EXTENSIONS = new Set([
  // 字体
  'woff2', 'woff', 'ttf', 'otf', 'eot',
  // 图片 (已压缩)
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'ico', 'bmp', 'tiff', 'tif',
  // 音频
  'mp3', 'aac', 'ogg', 'opus', 'flac', 'm4a', 'wav',
  // 视频
  'mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'm3u8', 'ts',
  // 压缩包
  'zip', 'gz', 'bz2', 'xz', 'zst', '7z', 'rar', 'tar', 'lz4', 'br',
  // WebAssembly
  'wasm',
  // 二进制数据
  'bin', 'dat', 'db', 'sqlite', 'sqlite3',
  // 文档 (已压缩)
  'pdf', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'epub',
  // 可执行文件
  'exe', 'dll', 'so', 'dylib',
  // 3D / 游戏
  'glb', 'gltf', 'fbx', 'obj', 'stl',
  // 其他二进制
  'pak', 'unity3d', 'bundle',
]);

// ============================================================
// 公开 API
// ============================================================

/**
 * 从文件路径中提取扩展名 (小写, 不含点)
 *
 * @example
 * getExtension('static/music/天使の3P/loli.ass') → 'ass'
 * getExtension('path/to/file') → ''
 */
export function getExtension(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  const name = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx <= 0) return ''; // no extension or hidden file like ".gitignore"
  return name.slice(dotIdx + 1).toLowerCase();
}

/**
 * 判断文件扩展名是否为文本类 (高 gzip 压缩率)
 */
export function isTextFile(ext: string): boolean {
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * 判断文件扩展名是否为已压缩/二进制类 (gzip 无效)
 */
export function isBinaryFile(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * 根据文件路径自动推断最优下载模式
 *
 * 策略优先级:
 * 1. 用户自定义 overrides (精确匹配扩展名)
 * 2. 内置文本扩展名 → 'split'  (享受 CDN 压缩传输)
 * 3. 内置二进制扩展名 → 'range' (Range 分段并行, 无压缩差异)
 * 4. 未知扩展名 → 'split'  (保守策略: 万一是文本, split 不会差)
 *
 * 注意: 返回的 mode 是"推荐"模式。实际执行时:
 * - 如果文件有预切片 (info.yaml), 无论推荐什么都会走 split
 * - 如果推荐 'range' 但所有节点不支持 Range → 降级 direct
 *
 * @param filePath - 文件路径 (只需包含扩展名)
 * @param overrides - 用户自定义扩展名 → 模式映射
 * @returns 推荐的下载模式
 */
export function resolveDownloadMode(
  filePath: string,
  overrides?: Record<string, DownloadMode>,
): DownloadMode {
  const ext = getExtension(filePath);

  // 1. 用户自定义优先
  if (overrides && ext && ext in overrides) {
    return overrides[ext]!;
  }

  // 2. 文本 → split (享受 CDN gzip/br 压缩)
  if (ext && isTextFile(ext)) {
    return 'split';
  }

  // 3. 已压缩二进制 → range (Range 并行, 无压缩差异)
  if (ext && isBinaryFile(ext)) {
    return 'range';
  }

  // 4. 无扩展名或未知 → split (保守策略)
  return 'split';
}

/**
 * 获取扩展名对应的文件类型描述 (用于日志/调试)
 */
export function getFileTypeLabel(ext: string): string {
  if (!ext) return 'unknown';
  if (isTextFile(ext)) return 'text';
  if (isBinaryFile(ext)) return 'binary';
  return 'unknown';
}
