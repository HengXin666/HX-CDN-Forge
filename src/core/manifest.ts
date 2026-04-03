/**
 * manifest.ts — info.yaml / .cache.yaml 解析
 *
 * 使用简化的 YAML 解析器，避免引入外部依赖
 * info.yaml 和 .cache.yaml 结构简单固定，无需完整 YAML parser
 */

import type { SplitInfo, SplitChunkInfo, SplitCache, ZipInfo, CompressionEncoding } from '../types';

// ============================================================
// 简化 YAML 解析 (仅支持项目使用的子集)
// ============================================================

/**
 * 解析 info.yaml 文本为 SplitInfo
 *
 * 格式示例:
 * ```yaml
 * originalName: loli.ass
 * totalSize: 26214400
 * mimeType: application/octet-stream
 * chunkSize: 19922944
 * createdAt: "2026-03-29T12:00:00Z"
 * chunks:
 *   - fileName: 0-loli.ass
 *     index: 0
 *     size: 19922944
 *     sha256: abc123...
 *   - fileName: 1-loli.ass
 *     index: 1
 *     size: 6291456
 *     sha256: def456...
 * ```
 */
export function parseInfoYaml(text: string): SplitInfo {
  const lines = text.split('\n').map((l) => l.trimEnd());

  let originalName = '';
  let totalSize = 0;
  let mimeType = 'application/octet-stream';
  let chunkSize = 0;
  let createdAt = '';
  const chunks: SplitChunkInfo[] = [];

  let inChunks = false;
  let currentChunk: Partial<SplitChunkInfo> | null = null;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // 顶级字段
    if (!inChunks) {
      if (trimmed.startsWith('originalName:')) {
        originalName = extractValue(trimmed);
      } else if (trimmed.startsWith('totalSize:')) {
        totalSize = parseInt(extractValue(trimmed), 10);
      } else if (trimmed.startsWith('mimeType:')) {
        mimeType = extractValue(trimmed);
      } else if (trimmed.startsWith('chunkSize:')) {
        chunkSize = parseInt(extractValue(trimmed), 10);
      } else if (trimmed.startsWith('createdAt:')) {
        createdAt = extractValue(trimmed);
      } else if (trimmed.startsWith('chunks:')) {
        inChunks = true;
      }
      continue;
    }

    // chunks 列表
    if (trimmed.startsWith('- fileName:') || trimmed === '- fileName:') {
      // 保存上一个 chunk
      if (currentChunk && currentChunk.fileName) {
        chunks.push(currentChunk as SplitChunkInfo);
      }
      currentChunk = { fileName: extractValue(trimmed.replace(/^-\s*/, '')) };
    } else if (currentChunk) {
      if (trimmed.startsWith('index:')) {
        currentChunk.index = parseInt(extractValue(trimmed), 10);
      } else if (trimmed.startsWith('size:')) {
        currentChunk.size = parseInt(extractValue(trimmed), 10);
      } else if (trimmed.startsWith('sha256:')) {
        currentChunk.sha256 = extractValue(trimmed);
      }
    }
  }

  // 最后一个 chunk
  if (currentChunk && currentChunk.fileName) {
    chunks.push(currentChunk as SplitChunkInfo);
  }

  return { originalName, totalSize, mimeType, chunkSize, createdAt, chunks };
}

/**
 * 序列化 SplitInfo 为 YAML 文本
 */
export function serializeInfoYaml(info: SplitInfo): string {
  const lines: string[] = [
    `originalName: ${info.originalName}`,
    `totalSize: ${info.totalSize}`,
    `mimeType: ${info.mimeType}`,
    `chunkSize: ${info.chunkSize}`,
    `createdAt: "${info.createdAt}"`,
    'chunks:',
  ];

  for (const chunk of info.chunks) {
    lines.push(`  - fileName: ${chunk.fileName}`);
    lines.push(`    index: ${chunk.index}`);
    lines.push(`    size: ${chunk.size}`);
    lines.push(`    sha256: ${chunk.sha256}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * 解析 .cache.yaml
 *
 * 格式:
 * ```yaml
 * sourcePath: static/ass/loli.ass
 * sourceHash: abc123...
 * sourceSize: 26214400
 * generatedAt: "2026-03-29T12:00:00Z"
 * ```
 */
export function parseCacheYaml(text: string): SplitCache {
  const lines = text.split('\n');
  let sourcePath = '';
  let sourceHash = '';
  let sourceSize = 0;
  let generatedAt = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('sourcePath:')) sourcePath = extractValue(trimmed);
    else if (trimmed.startsWith('sourceHash:')) sourceHash = extractValue(trimmed);
    else if (trimmed.startsWith('sourceSize:')) sourceSize = parseInt(extractValue(trimmed), 10);
    else if (trimmed.startsWith('generatedAt:')) generatedAt = extractValue(trimmed);
  }

  return { sourcePath, sourceHash, sourceSize, generatedAt };
}

/**
 * 序列化 SplitCache 为 YAML 文本
 */
export function serializeCacheYaml(cache: SplitCache): string {
  return [
    `sourcePath: ${cache.sourcePath}`,
    `sourceHash: ${cache.sourceHash}`,
    `sourceSize: ${cache.sourceSize}`,
    `generatedAt: "${cache.generatedAt}"`,
    '',
  ].join('\n');
}

// ============================================================
// info-zip.yaml 解析 / 序列化 (预压缩版本)
// ============================================================

/**
 * 解析 info-zip.yaml 文本为 ZipInfo
 *
 * 格式示例:
 * ```yaml
 * originalName: loli.ass
 * totalSize: 10610165
 * mimeType: text/x-ssa
 * encoding: gzip
 * compressedFile: loli.ass.gz
 * compressedSize: 2453142
 * compressedSha256: abc123...
 * ratio: 0.23
 * createdAt: "2026-04-04T00:00:00Z"
 * ```
 */
export function parseInfoZipYaml(text: string): ZipInfo {
  const lines = text.split('\n').map((l) => l.trimEnd());

  let originalName = '';
  let totalSize = 0;
  let mimeType = 'application/octet-stream';
  let encoding: CompressionEncoding = 'gzip';
  let compressedFile = '';
  let compressedSize = 0;
  let compressedSha256 = '';
  let ratio = 0;
  let createdAt = '';

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('originalName:')) {
      originalName = extractValue(trimmed);
    } else if (trimmed.startsWith('totalSize:')) {
      totalSize = parseInt(extractValue(trimmed), 10);
    } else if (trimmed.startsWith('mimeType:')) {
      mimeType = extractValue(trimmed);
    } else if (trimmed.startsWith('encoding:')) {
      const v = extractValue(trimmed);
      encoding = (v === 'br' ? 'br' : 'gzip') as CompressionEncoding;
    } else if (trimmed.startsWith('compressedFile:')) {
      compressedFile = extractValue(trimmed);
    } else if (trimmed.startsWith('compressedSize:')) {
      compressedSize = parseInt(extractValue(trimmed), 10);
    } else if (trimmed.startsWith('compressedSha256:')) {
      compressedSha256 = extractValue(trimmed);
    } else if (trimmed.startsWith('ratio:')) {
      ratio = parseFloat(extractValue(trimmed));
    } else if (trimmed.startsWith('createdAt:')) {
      createdAt = extractValue(trimmed);
    }
  }

  return {
    originalName, totalSize, mimeType, encoding,
    compressedFile, compressedSize, compressedSha256, ratio, createdAt,
  };
}

/**
 * 序列化 ZipInfo 为 YAML 文本
 */
export function serializeInfoZipYaml(info: ZipInfo): string {
  return [
    `originalName: ${info.originalName}`,
    `totalSize: ${info.totalSize}`,
    `mimeType: ${info.mimeType}`,
    `encoding: ${info.encoding}`,
    `compressedFile: ${info.compressedFile}`,
    `compressedSize: ${info.compressedSize}`,
    `compressedSha256: ${info.compressedSha256}`,
    `ratio: ${info.ratio}`,
    `createdAt: "${info.createdAt}"`,
    '',
  ].join('\n');
}

// ============================================================
// 辅助
// ============================================================

/** 从 "key: value" 或 "key: \"value\"" 提取 value */
function extractValue(line: string): string {
  const idx = line.indexOf(':');
  if (idx < 0) return '';
  let val = line.slice(idx + 1).trim();
  // 去除引号
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  return val;
}
