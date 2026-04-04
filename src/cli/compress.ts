/**
 * CLI 预压缩工具
 *
 * 将文本类文件（如 .ass, .json, .xml）预压缩为 .gz，
 * 生成 info-zip.yaml，配合 HX-CDN-Forge 的 reqByCDNAuto() 实现
 * 「预压缩 + Range 并行下载 + 客户端解压」。
 *
 * 用法:
 *   npx hx-cdn-compress --source static/music/loli.ass \
 *     --output static/cdn \
 *     --prefix static
 *
 * 或在 package.json scripts 中:
 *   "cdn:compress": "hx-cdn-compress --source ... --output ... --prefix ..."
 *
 * 工作流:
 * 1. 读取源文件
 * 2. 使用 gzip (level 9) 压缩 → 生成 .gz 文件
 * 3. 计算压缩后 SHA-256
 * 4. 生成 info-zip.yaml (与 info.yaml 同目录，独立文件)
 * 5. 生成 .cache.yaml (增量更新检测)
 *
 * 与 hx-cdn-split 区别:
 * - split: 原始切片 → 每个 chunk 独立 GET → CDN 自动 gzip → 浏览器原生解压
 * - compress: 整文件预压缩 → 对 .gz 文件 Range 并行 → 客户端 DecompressionStream 解压
 *
 * 适用场景:
 * - 文本文件 < splitThreshold (不需要切片)，但仍想享受并发 + 压缩的双重优势
 * - 文本文件 > splitThreshold 时，推荐使用 split (享受 CDN 压缩更高效)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { serializeInfoZipYaml, serializeCacheYaml, parseCacheYaml } from '../core/manifest';
import type { ZipInfo, SplitCache, CompressionEncoding } from '../types';

// ============================================================
// 配置
// ============================================================

interface CompressOptions {
  source: string;          // 源文件路径
  outputDir: string;       // 输出根目录
  mappingPrefix: string;   // 从 source 路径去除的前缀
  encoding: CompressionEncoding; // 压缩编码 ('gzip' | 'br')
  level: number;           // 压缩等级 (gzip: 1-9, 默认 9)
  force: boolean;          // 是否强制重新生成
}

// ============================================================
// 主函数
// ============================================================

export async function compressFile(opts: CompressOptions): Promise<void> {
  const { source, outputDir, mappingPrefix, encoding, level, force } = opts;

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
  console.log(`🔧 编码: ${encoding}, 等级: ${level}`);

  // 2. 计算映射路径
  const mappedPath = mapPath(source, mappingPrefix);
  const targetDir = path.join(outputDir, mappedPath);
  const cacheFile = path.join(targetDir, '.cache.yaml');
  const infoZipFile = path.join(targetDir, 'info-zip.yaml');

  console.log(`📂 输出目录: ${targetDir}`);
  console.log(`🗺️  映射路径: ${mappedPath}`);

  // 3. 检查增量更新
  const sourceHash = await computeFileHash(source);

  if (!force && fs.existsSync(cacheFile)) {
    try {
      const cacheText = fs.readFileSync(cacheFile, 'utf-8');
      const cache = parseCacheYaml(cacheText);
      // 检查 source 是否变化 + info-zip.yaml 是否已存在
      if (
        cache.sourceHash === sourceHash &&
        cache.sourceSize === stat.size &&
        fs.existsSync(infoZipFile)
      ) {
        console.log(`⏭️  源文件未变化，跳过 (hash: ${sourceHash.slice(0, 12)}...)`);
        return;
      }
      console.log(`🔄 源文件已变化，重新生成`);
    } catch {
      // cache 解析失败，重新生成
    }
  }

  // 4. 创建输出目录
  fs.mkdirSync(targetDir, { recursive: true });

  // 5. 压缩
  const originalData = fs.readFileSync(source);
  let compressedData: Buffer;

  if (encoding === 'gzip') {
    compressedData = zlib.gzipSync(originalData, { level });
  } else {
    // Brotli
    compressedData = zlib.brotliCompressSync(originalData, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: level,
      },
    });
  }

  const suffix = encoding === 'gzip' ? '.gz' : '.br';
  const fileName = path.basename(source);
  const compressedFileName = `${fileName}${suffix}`;
  const compressedFilePath = path.join(targetDir, compressedFileName);

  fs.writeFileSync(compressedFilePath, compressedData);

  const ratio = Math.round((compressedData.length / originalData.length) * 100) / 100;
  const compressedHash = crypto.createHash('sha256').update(compressedData).digest('hex');

  console.log(`📦 压缩: ${formatSize(originalData.length)} → ${formatSize(compressedData.length)} (ratio: ${ratio})`);

  // 6. 生成 info-zip.yaml
  const zipInfo: ZipInfo = {
    originalName: fileName,
    totalSize: originalData.length,
    mimeType: guessMimeType(fileName),
    encoding,
    compressedFile: compressedFileName,
    compressedSize: compressedData.length,
    compressedSha256: compressedHash,
    ratio,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(infoZipFile, serializeInfoZipYaml(zipInfo), 'utf-8');
  console.log(`📋 生成 info-zip.yaml`);

  // 7. 生成 .cache.yaml (如果 split 没有先生成的话)
  // 注意: 如果同一个文件既切片又压缩，.cache.yaml 会被覆盖
  // 但这个场景本身没意义 (有切片就不需要预压缩)
  if (!fs.existsSync(cacheFile)) {
    const cache: SplitCache = {
      sourcePath: source,
      sourceHash,
      sourceSize: stat.size,
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(cacheFile, serializeCacheYaml(cache), 'utf-8');
    console.log(`💾 生成 .cache.yaml`);
  }

  console.log(`\n✅ 完成! ${formatSize(originalData.length)} → ${formatSize(compressedData.length)} (${(ratio * 100).toFixed(0)}%)`);
  console.log(`\n前端配置:`);
  console.log(`  preCompressionStoragePath: '${outputDir}'  // ← 指定预压缩存储路径即可`);
  console.log(`  mappingPrefix: '${mappingPrefix}'`);
  console.log(`  # enablePreCompression 默认 true，无需额外设置`);
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

  const encodingArg = getArg(args, '--encoding', '-e') ?? 'gzip';
  const encoding: CompressionEncoding = encodingArg === 'br' ? 'br' : 'gzip';
  const defaultLevel = encoding === 'gzip' ? 9 : 11;

  const opts: CompressOptions = {
    source: getArg(args, '--source', '-s') ?? '',
    outputDir: getArg(args, '--output', '-o') ?? '',
    mappingPrefix: getArg(args, '--prefix', '-p') ?? '',
    encoding,
    level: parseInt(getArg(args, '--level', '-l') ?? `${defaultLevel}`, 10),
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

  compressFile(opts);
}

function printHelp(): void {
  console.log(`
hx-cdn-compress — HX-CDN-Forge 文件预压缩工具

将文本类文件预压缩为 .gz/.br，配合 reqByCDNAuto() 实现:
  预压缩 + Range 并行下载 + 客户端 DecompressionStream 解压

用法:
  hx-cdn-compress --source <路径> --output <目录> [选项]

必填:
  -s, --source <path>     源文件路径
  -o, --output <dir>      输出存储根目录

可选:
  -p, --prefix <prefix>   映射前缀 (从 source 路径去除)
  -e, --encoding <enc>    压缩编码: gzip (默认) | br
  -l, --level <n>         压缩等级 (gzip: 1-9 默认9, br: 1-11 默认11)
  -f, --force             强制重新生成 (忽略缓存)
  -h, --help              显示帮助

示例:
  # 预压缩 ASS 字幕文件 (gzip level 9)
  hx-cdn-compress -s static/music/loli.ass -o static/cdn -p static

  # 使用 Brotli 极致压缩
  hx-cdn-compress -s static/music/loli.ass -o static/cdn -p static -e br -l 11

  # 批量处理
  find static -name '*.ass' -exec hx-cdn-compress -s {} -o static/cdn -p static \\;

前端配置:
  const config = createForgeConfig(github, {
    // enablePreCompression 默认 true，无需额外设置
    preCompressionStoragePath: 'static/cdn',  // ← 指定预压缩存储路径
    mappingPrefix: 'static',
  });
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
    '.vtt': 'text/vtt',
    '.lrc': 'text/plain',
    '.json': 'application/json',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.svg': 'image/svg+xml',
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
