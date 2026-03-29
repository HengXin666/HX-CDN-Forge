/**
 * CLI 差分切片工具
 *
 * 用法:
 *   npx hx-cdn-split --source static/ass/loli.ass \
 *     --output static/cdn-black \
 *     --prefix static \
 *     --chunk-size 19MB
 *
 * 或在 package.json scripts 中:
 *   "cdn:split": "hx-cdn-split --source ... --output ... --prefix ..."
 *
 * 功能:
 * - 将大文件切片为多个 < threshold 的小文件
 * - 生成 info.yaml (切片清单)
 * - 生成 .cache.yaml (源文件哈希，用于增量更新检测)
 * - 支持增量更新: 源文件未变化时跳过
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { serializeInfoYaml, serializeCacheYaml, parseCacheYaml } from '../core/manifest';
import type { SplitInfo, SplitChunkInfo, SplitCache } from '../types';

// ============================================================
// 配置
// ============================================================

interface SplitOptions {
  source: string;       // 源文件路径 (相对或绝对)
  outputDir: string;    // 输出根目录
  mappingPrefix: string;// 从 source 路径去除的前缀
  chunkSize: number;    // 切片大小 (字节)
  force: boolean;       // 是否强制重新生成
}

const DEFAULT_CHUNK_SIZE = 19 * 1024 * 1024; // 19MB (留余量给 20MB 的 CDN 限制)

// ============================================================
// 主函数
// ============================================================

export async function splitFile(opts: SplitOptions): Promise<void> {
  const { source, outputDir, mappingPrefix, chunkSize, force } = opts;

  // 1. 验证源文件
  if (!fs.existsSync(source)) {
    console.error(`❌ 源文件不存在: ${source}`);
    process.exit(1);
  }

  const stat = fs.statSync(source);
  if (!stat.isFile()) {
    console.error(`❌ 不是文件: ${source}`);
    process.exit(1);
  }

  console.log(`📦 源文件: ${source} (${formatSize(stat.size)})`);

  if (stat.size <= chunkSize) {
    console.log(`✅ 文件小于切片阈值 (${formatSize(chunkSize)})，无需切片`);
    return;
  }

  // 2. 计算映射路径
  const mappedPath = mapPath(source, mappingPrefix);
  const targetDir = path.join(outputDir, mappedPath);
  const cacheFile = path.join(targetDir, '.cache.yaml');
  const infoFile = path.join(targetDir, 'info.yaml');

  console.log(`📂 输出目录: ${targetDir}`);
  console.log(`🗺️  映射路径: ${mappedPath}`);

  // 3. 检查增量更新
  const sourceHash = await computeFileHash(source);

  if (!force && fs.existsSync(cacheFile)) {
    try {
      const cacheText = fs.readFileSync(cacheFile, 'utf-8');
      const cache = parseCacheYaml(cacheText);
      if (cache.sourceHash === sourceHash && cache.sourceSize === stat.size) {
        console.log(`⏭️  源文件未变化，跳过 (hash: ${sourceHash.slice(0, 12)}...)`);
        return;
      }
      console.log(`🔄 源文件已变化，重新生成切片`);
    } catch {
      // cache 解析失败，重新生成
    }
  }

  // 4. 创建输出目录
  fs.mkdirSync(targetDir, { recursive: true });

  // 5. 切片
  const fileName = path.basename(source);
  const chunks: SplitChunkInfo[] = [];
  const fileBuffer = fs.readFileSync(source);
  let offset = 0;
  let index = 0;

  while (offset < fileBuffer.length) {
    const end = Math.min(offset + chunkSize, fileBuffer.length);
    const chunkData = fileBuffer.subarray(offset, end);
    const chunkFileName = `${index}-${fileName}`;
    const chunkPath = path.join(targetDir, chunkFileName);

    // 写入分片
    fs.writeFileSync(chunkPath, chunkData);

    // 计算分片哈希
    const chunkHash = crypto.createHash('sha256').update(chunkData).digest('hex');

    chunks.push({
      fileName: chunkFileName,
      index,
      size: chunkData.length,
      sha256: chunkHash,
    });

    console.log(`  ✂️  ${chunkFileName} (${formatSize(chunkData.length)})`);

    offset = end;
    index++;
  }

  // 6. 生成 info.yaml
  const info: SplitInfo = {
    originalName: fileName,
    totalSize: stat.size,
    mimeType: guessMimeType(fileName),
    chunkSize,
    createdAt: new Date().toISOString(),
    chunks,
  };

  fs.writeFileSync(infoFile, serializeInfoYaml(info), 'utf-8');
  console.log(`📋 生成 info.yaml`);

  // 7. 生成 .cache.yaml
  const cache: SplitCache = {
    sourcePath: source,
    sourceHash,
    sourceSize: stat.size,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(cacheFile, serializeCacheYaml(cache), 'utf-8');
  console.log(`💾 生成 .cache.yaml`);

  console.log(`\n✅ 完成! ${chunks.length} 个切片, 总计 ${formatSize(stat.size)}`);
}

// ============================================================
// CLI 入口
// ============================================================

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
    return;
  }

  const opts: SplitOptions = {
    source: getArg(args, '--source', '-s') ?? '',
    outputDir: getArg(args, '--output', '-o') ?? '',
    mappingPrefix: getArg(args, '--prefix', '-p') ?? '',
    chunkSize: parseSize(getArg(args, '--chunk-size', '-c') ?? `${DEFAULT_CHUNK_SIZE}`),
    force: args.includes('--force') || args.includes('-f'),
  };

  if (!opts.source) {
    console.error('❌ 缺少 --source 参数');
    process.exit(1);
  }
  if (!opts.outputDir) {
    console.error('❌ 缺少 --output 参数');
    process.exit(1);
  }

  splitFile(opts);
}

function printHelp(): void {
  console.log(`
hx-cdn-split — HX-CDN-Forge 大文件切片工具

用法:
  hx-cdn-split --source <路径> --output <目录> [选项]

必填:
  -s, --source <path>     源文件路径
  -o, --output <dir>      输出存储根目录

可选:
  -p, --prefix <prefix>   映射前缀 (从 source 路径去除)
  -c, --chunk-size <size> 切片大小 (默认 19MB)
                          支持 B/KB/MB 后缀, 如: 19MB, 10240KB
  -f, --force             强制重新生成 (忽略缓存)
  -h, --help              显示帮助

示例:
  # 将 25MB 的 ASS 文件切片
  hx-cdn-split -s static/ass/loli.ass -o static/cdn-black -p static

  # 使用自定义切片大小
  hx-cdn-split -s data/big.bin -o cdn-data -p data -c 10MB

  # 强制重新生成
  hx-cdn-split -s static/ass/loli.ass -o static/cdn-black -p static -f
`.trim());
}

// ============================================================
// 辅助函数
// ============================================================

function getArg(args: string[], long: string, short: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === long || args[i] === short) {
      return args[i + 1];
    }
  }
  return undefined;
}

function parseSize(str: string): number {
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) return parseInt(str, 10) || DEFAULT_CHUNK_SIZE;

  const num = parseFloat(match[1]!);
  const unit = (match[2] ?? 'B').toUpperCase();

  switch (unit) {
    case 'GB': return Math.floor(num * 1024 * 1024 * 1024);
    case 'MB': return Math.floor(num * 1024 * 1024);
    case 'KB': return Math.floor(num * 1024);
    default: return Math.floor(num);
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function mapPath(filePath: string, prefix: string): string {
  let p = filePath.replace(/\\/g, '/');
  if (prefix) {
    const normalizedPrefix = prefix.replace(/\\/g, '/');
    if (p.startsWith(normalizedPrefix)) {
      p = p.slice(normalizedPrefix.length);
    }
    if (p.startsWith('/')) p = p.slice(1);
  }
  return p;
}

async function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function guessMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.ass': 'text/x-ssa',
    '.srt': 'text/plain',
    '.json': 'application/json',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.txt': 'text/plain',
    '.bin': 'application/octet-stream',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wasm': 'application/wasm',
    '.pdf': 'application/pdf',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.ts': 'text/typescript',
    '.html': 'text/html',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

// 如果直接执行此文件
if (typeof require !== 'undefined' && require.main === module) {
  main();
}

export { main as cli };
