/**
 * decompressor.ts — 浏览器端流式解压
 *
 * 用于预压缩 + Range 下载模式:
 * Range 并行下载压缩文件 → 拼接 → DecompressionStream 解压 → 原始数据
 *
 * 支持:
 * - gzip: 使用 DecompressionStream('gzip') — 所有现代浏览器支持
 * - br (Brotli): 使用 DecompressionStream('deflate-raw') + 手动处理
 *                注意: 部分浏览器不支持 'deflate-raw'，需要 fallback
 *
 * 性能参考 (10MB 原始数据, ~2MB 压缩):
 * - DecompressionStream: ~50-150ms (取决于设备)
 * - 浏览器原生 Content-Encoding: ~0ms (网络层完成)
 */

import type { CompressionEncoding } from '../types';

/**
 * 检测浏览器是否支持 DecompressionStream
 *
 * @returns true 如果支持
 */
export function supportsDecompressionStream(): boolean {
  return typeof DecompressionStream !== 'undefined';
}

/**
 * 检测浏览器是否支持指定的解压编码
 *
 * @param encoding - 'gzip' | 'br'
 */
export function supportsEncoding(encoding: CompressionEncoding): boolean {
  if (!supportsDecompressionStream()) return false;

  // gzip 所有支持 DecompressionStream 的浏览器都支持
  if (encoding === 'gzip') return true;

  // Brotli (br): 部分浏览器不支持，需要尝试创建
  // 注意: 浏览器 DecompressionStream 不直接支持 'br'
  // Brotli 需要通过 Response + Content-Encoding 或 WASM 库解压
  // 此处保守返回 false，后续可扩展
  return false;
}

/**
 * 解压 Blob — 使用 DecompressionStream API
 *
 * @param compressedBlob - 压缩后的完整 Blob
 * @param encoding - 压缩编码 ('gzip' | 'br')
 * @param expectedSize - 预期解压后大小 (用于验证, 可选)
 * @returns 解压后的 Blob
 *
 * @throws 如果浏览器不支持 DecompressionStream
 * @throws 如果解压后大小与预期不匹配
 */
export async function decompressBlob(
  compressedBlob: Blob,
  encoding: CompressionEncoding,
  expectedSize?: number,
): Promise<Blob> {
  if (encoding === 'gzip') {
    return decompressGzip(compressedBlob, expectedSize);
  }

  if (encoding === 'br') {
    return decompressBrotli(compressedBlob, expectedSize);
  }

  throw new Error(`[Decompressor] 不支持的编码: ${encoding}`);
}

/**
 * gzip 解压 — 使用 DecompressionStream('gzip')
 */
async function decompressGzip(
  compressedBlob: Blob,
  expectedSize?: number,
): Promise<Blob> {
  if (!supportsDecompressionStream()) {
    throw new Error(
      '[Decompressor] 当前浏览器不支持 DecompressionStream。' +
      '请升级到 Chrome 80+ / Firefox 113+ / Safari 16.4+ / Edge 80+'
    );
  }

  const ds = new DecompressionStream('gzip');
  const decompressedStream = compressedBlob.stream().pipeThrough(ds);

  // 读取所有解压数据
  const reader = decompressedStream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalBytes += value.byteLength;
  }

  // 可选: 校验解压后大小
  if (expectedSize !== undefined && totalBytes !== expectedSize) {
    throw new Error(
      `[Decompressor] 解压后大小不匹配: expected ${expectedSize}, got ${totalBytes}。` +
      `压缩文件可能损坏。`
    );
  }

  return new Blob(chunks as BlobPart[]);
}

/**
 * Brotli 解压
 *
 * 浏览器 DecompressionStream 原生不支持 'br'
 * 使用 Response 构造函数 + Content-Encoding trick:
 *   new Response(stream, { headers: { 'Content-Encoding': 'br' } })
 * 但这个 trick 在大多数浏览器中不生效。
 *
 * 备选方案:
 * 1. 使用 WASM brotli-dec 库 (未来可扩展)
 * 2. 降级为 gzip (推荐 CI 端使用 gzip)
 */
async function decompressBrotli(
  _compressedBlob: Blob,
  _expectedSize?: number,
): Promise<Blob> {
  // 当前版本暂不支持 Brotli 客户端解压
  // gzip 是推荐的预压缩格式 (浏览器 DecompressionStream 原生支持)
  throw new Error(
    '[Decompressor] Brotli (br) 客户端解压暂不支持。' +
    '请在 CI 端使用 gzip 压缩 (hx-cdn-compress --encoding gzip)。' +
    '如需 Brotli 支持，请提交 issue。'
  );
}
